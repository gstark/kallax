#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "bambu3mf @ git+https://github.com/gstark/bambu3mf",
# ]
# ///
"""Write a Bambu Studio project with slide-in labels from labels.scad.

The labels are one object with two parts: the plates use filament 1 and the
raised text uses filament 2. For one color, set both parts to the same filament.

  just labels M3x8 M3x12 100nF
  just labels -o 3mf/labels-screws.3mf "M3 x 8" "M4 nut"
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from bambu3mf import BambuProject

ROOT = Path(__file__).resolve().parent
SCAD = ROOT / "labels.scad"

BED = 256        # P1S bed, mm
PRINTER = "Bambu Lab P1S 0.4 nozzle"
FILAMENTS = [
    {"settings_id": "Bambu PLA Matte @BBL P1S 0.4 nozzle", "colour": "#FFFFFF"},   # plates
    {"settings_id": "Bambu PLA Matte @BBL P1S 0.4 nozzle", "colour": "#000000"},   # text
]


def render(part, path, labels):
    cmd = ["openscad", "--enable=textmetrics", "--export-format", "binstl", "-o", str(path),
           "-D", f'part="{part}"', "-D", f"labels={json.dumps(labels)}", str(SCAD)]
    run = subprocess.run(cmd, capture_output=True, text=True)
    if run.returncode:
        sys.exit(run.stderr.strip())
    for line in run.stderr.splitlines():
        if line.startswith("WARNING"):
            print(line)


def main():
    ap = argparse.ArgumentParser(description="Write a Bambu Studio project with slide-in labels.")
    ap.add_argument("labels", nargs="+", metavar="TEXT", help="the text of one label")
    ap.add_argument("-o", "--output", type=Path, default=ROOT / "3mf" / "labels.3mf",
                    help="output file (default: 3mf/labels.3mf)")
    args = ap.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        base, text = Path(tmp) / "labels.stl", Path(tmp) / "label-text.stl"
        render("base", base, args.labels)
        render("text", text, args.labels)
        project = BambuProject(printer_settings_id=PRINTER, filaments=FILAMENTS, bed_size=(BED, BED))
        project.add_plate(name="Labels").add_stl_group([(base, 1), (text, 2)])
        project.save(str(args.output))
    print(f"Wrote {len(args.labels)} labels to {args.output}")


if __name__ == "__main__":
    main()
