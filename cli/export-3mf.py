#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = [
#   "bambu3mf @ git+https://github.com/gstark/bambu3mf",
#   "numpy-stl",
#   "rectpack",
# ]
# ///
"""Write Bambu Studio projects for every preset in small-boxes.scad.

  3mf/small-boxes-each.3mf    one plate per box type (box + lid)
  3mf/small-boxes-packed.3mf  every box and lid packed onto as few plates as possible

  cli/export-3mf.py
"""

import math
import re
import subprocess
import tempfile
from pathlib import Path

import rectpack
from bambu3mf import BambuProject
from stl import mesh

ROOT = Path(__file__).resolve().parent.parent
SCAD = ROOT / "models" / "small-boxes.scad"
OUT = ROOT / "3mf"

BED = 256        # P1S bed, mm
MARGIN = 3       # keep parts this far from the bed edge
SPACING = 4      # gap between parts on a packed plate (4 mm fits everything on 2 plates)
EXCLUDE = (18, 28)  # P1S bed_exclude_area: front-left corner (0,0)-(18,28)
PRINTER = "Bambu Lab P1S 0.4 nozzle"
FILAMENT = {"settings_id": "Bambu PLA Matte @BBL P1S 0.4 nozzle", "colour": "#FFFFFF"}


def presets():
    table = re.search(r"^presets = \[(.*?)^\];", SCAD.read_text(), re.S | re.M).group(1)
    return re.findall(r'^\s*\["([a-z0-9-]+)"', table, re.M)


def render(preset, part, path):
    print(f"Rendering {path.name}")
    subprocess.run(["openscad", "-q", "--export-format", "binstl", "-o", str(path),
                    "-D", f'part="{part}"', "-D", f'preset="{preset}"', str(SCAD)], check=True)


def footprint(path):
    m = mesh.Mesh.from_file(str(path))
    return m.x.max() - m.x.min(), m.y.max() - m.y.min()


def rotated_copy(path):
    m = mesh.Mesh.from_file(str(path))
    m.rotate([0, 0, 1], math.radians(90))
    out = path.with_name(path.stem + "-r90.stl")
    m.save(str(out))
    return out


def new_project():
    return BambuProject(printer_settings_id=PRINTER, filaments=[FILAMENT], bed_size=(BED, BED))


def write_each(names, tmp):
    project = new_project()
    for name in names:
        pair = tmp / f"{name}-pair.stl"
        render(name, "pair", pair)
        project.add_plate(name=name).add_stl(pair)
    project.save(str(OUT / "small-boxes-each.3mf"))


def plate_rects(placed, sizes):
    """Turn packer output into {plate: [(rid, x0, y0, x1, y1, turned)]} in bed mm."""
    plates = {}
    for b, x, y, w, h, rid in placed:
        x0, y0 = MARGIN + x, MARGIN + y
        plates.setdefault(b, []).append(
            (rid, x0, y0, x0 + w - SPACING, y0 + h - SPACING, (w, h) != sizes[rid]))
    return plates


def clear_exclusion(rects):
    """Mirror a plate's layout until no part is near the exclusion corner, or return None."""
    ex, ey = EXCLUDE[0] + SPACING, EXCLUDE[1] + SPACING
    for fx in (False, True):
        for fy in (False, True):
            out = []
            for rid, x0, y0, x1, y1, turned in rects:
                if fx:
                    x0, x1 = BED - x1, BED - x0
                if fy:
                    y0, y1 = BED - y1, BED - y0
                out.append((rid, x0, y0, x1, y1, turned))
            if all(x0 >= ex or y0 >= ey for _, x0, y0, _, _, _ in out):
                return out
    return None


def pack(sizes, usable):
    """Try several rectpack heuristics. Return the layout with the fewest plates."""
    best = None
    for algo in (rectpack.MaxRectsBl, rectpack.MaxRectsBssf, rectpack.MaxRectsBaf,
                 rectpack.MaxRectsBlsf, rectpack.SkylineBl, rectpack.SkylineMwf):
        for order in (rectpack.SORT_AREA, rectpack.SORT_PERI, rectpack.SORT_LSIDE,
                      rectpack.SORT_SSIDE, rectpack.SORT_DIFF, rectpack.SORT_RATIO):
            packer = rectpack.newPacker(mode=rectpack.PackingMode.Offline, pack_algo=algo,
                                        sort_algo=order, rotation=True)
            packer.add_bin(usable, usable, count=float("inf"))
            for rid, (w, h) in sizes.items():
                packer.add_rect(w, h, rid=rid)
            packer.pack()
            placed = packer.rect_list()
            if len(placed) != len(sizes) or (best and len(packer) >= len(best)):
                continue
            plates = [clear_exclusion(r) for _, r in sorted(plate_rects(placed, sizes).items())]
            if all(plates):
                best = plates
    if best is None:
        raise SystemExit("No layout fits the bed and keeps the exclusion area clear")
    return best


def write_packed(names, tmp):
    parts = {}
    for name in names:
        for part in ("box", "lid"):
            path = tmp / f"{name}-{part}.stl"
            render(name, part, path)
            parts[f"{name}-{part}"] = path

    # Pack each footprint plus SPACING, so neighbours sit SPACING apart.
    sizes = {rid: tuple(math.ceil(v) + SPACING for v in footprint(path))
             for rid, path in parts.items()}
    layout = pack(sizes, BED - 2 * MARGIN + SPACING)

    project = new_project()
    for i, rects in enumerate(layout, 1):
        plate = project.add_plate(name=f"Packed {i}")
        for rid, x0, y0, _, _, turned in rects:
            path = rotated_copy(parts[rid]) if turned else parts[rid]
            plate.add_stl(path, position=(x0, y0))
    project.save(str(OUT / "small-boxes-packed.3mf"))
    print(f"Packed {len(parts)} parts onto {len(layout)} plates")


def main():
    OUT.mkdir(exist_ok=True)
    names = presets()
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        write_each(names, tmp)
        write_packed(names, tmp)
    print(f"Done. Wrote {OUT}/small-boxes-each.3mf and small-boxes-packed.3mf")


if __name__ == "__main__":
    main()
