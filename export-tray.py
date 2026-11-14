#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "bambu3mf @ git+https://github.com/gstark/bambu3mf",
#   "numpy-stl",
# ]
# ///
"""Write a Bambu Studio project for one parts tray from parts-tray.scad.

The project has one plate with the tray body and the lid as two objects.

  just tray
  just tray --length full --rows 6
  just tray --length quarter --width half --height 48 --cols 1 --rows 2

Compartments that are wide and deep enough get guides for a slide-in label.
Make the labels with `just labels`.
"""

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from bambu3mf import BambuProject
from stl import mesh

ROOT = Path(__file__).resolve().parent
SCAD = ROOT / "parts-tray.scad"
OUT = ROOT / "3mf"

BED = 256        # P1S bed, mm
SPACING = 6      # gap between the body and the lid
PRINTER = "Bambu Lab P1S 0.4 nozzle"
FILAMENT = {"settings_id": "Bambu PLA Matte @BBL P1S 0.4 nozzle", "colour": "#FFFFFF"}

# Default compartment counts. They give compartments of about 30 x 29 mm,
# or 21 mm wide in a half-width tray.
ROWS = {"full": 8, "half": 4, "quarter": 2}
COLS = {"full": 3, "half": 2}


def render(part, path, defines):
    """Render one part to STL. Return the ECHO and WARNING lines of the model."""
    cmd = ["openscad", "--export-format", "binstl", "-o", str(path), "-D", f'part="{part}"']
    for name, value in defines.items():
        cmd += ["-D", f"{name}={value}"]
    run = subprocess.run(cmd + [str(SCAD)], capture_output=True, text=True)
    if run.returncode:
        sys.exit(run.stderr.strip())
    lines = run.stderr.splitlines()
    return ([line[6:].strip('" ') for line in lines if line.startswith("ECHO:")]
            + [line for line in lines if line.startswith("WARNING")])


def footprint(path):
    m = mesh.Mesh.from_file(str(path))
    return m.x.max() - m.x.min(), m.y.max() - m.y.min()


def main():
    ap = argparse.ArgumentParser(description="Write a Bambu Studio project for one parts tray.")
    ap.add_argument("--length", choices=ROWS, default="half",
                    help="245, 122, or 60.5 mm (default: half)")
    ap.add_argument("--width", choices=COLS, default="full",
                    help="95 or 47 mm (default: full)")
    ap.add_argument("--height", type=float, default=24,
                    help="total height with the lid, in mm. 24, 32, 48, and 96 stack "
                         "to fill the Kallas Box (default: 24)")
    ap.add_argument("--cols", type=int, help="compartments across the width (default: 3, or 2 for half width)")
    ap.add_argument("--rows", type=int, help="compartments along the length (default: 8, 4, or 2)")
    ap.add_argument("--no-pull", action="store_true", help="leave out the finger pocket")
    ap.add_argument("--no-labels", action="store_true", help="leave out the label guides")
    ap.add_argument("-o", "--output", type=Path, help="output file (default: 3mf/tray-<options>.3mf)")
    args = ap.parse_args()

    cols = args.cols or COLS[args.width]
    rows = args.rows or ROWS[args.length]
    defines = {
        "length": f'"{args.length}"', "width": f'"{args.width}"', "height": f"{args.height:g}",
        "cols": cols, "rows": rows, "pull": "false" if args.no_pull else "true",
        "label_guides": "false" if args.no_labels else "true",
    }
    name = (f"tray-{args.length}-{args.width}-{args.height:g}mm-{cols}x{rows}"
            f"{'-nopull' if args.no_pull else ''}{'-nolabels' if args.no_labels else ''}")
    out = args.output or OUT / f"{name}.3mf"
    out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        box, lid = Path(tmp) / f"{name}-box.stl", Path(tmp) / f"{name}-lid.stl"
        print("\n".join(render("box", box, defines)))
        render("lid", lid, defines)

        # Body and lid side by side, centered on the bed
        (bw, bd), (lw, _) = footprint(box), footprint(lid)
        x0, y0 = (BED - bw - SPACING - lw) / 2, (BED - bd) / 2
        project = BambuProject(printer_settings_id=PRINTER, filaments=[FILAMENT], bed_size=(BED, BED))
        plate = project.add_plate(name=name)
        plate.add_stl(box, position=(x0, y0))
        plate.add_stl(lid, position=(x0 + bw + SPACING, y0))
        project.save(str(out))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
