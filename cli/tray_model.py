"""Tray specification, OpenSCAD runs, and the Bambu Studio project for parts-tray.scad.

All sizes come from the model. This module holds no tray geometry.
"""

import hashlib
import json
import re
import shlex
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import labels_model
from common import BED, BODY_FILAMENT, MODELS, PRINTER, ROOT, TEXT_FILAMENT, ModelError, openscad

SCAD = MODELS / "parts-tray.scad"
OUT = ROOT / "3mf"
SPACING = 6      # gap between the body and the lid

LENGTHS = ("full", "half", "quarter")
WIDTHS = ("full", "half")
HEIGHTS = (24, 32, 48, 96)   # these stack to fill the Kallax Box
# Default grids. They give units of about 30 x 29 mm, or 21 mm wide in a half-width tray.
ROWS = {"full": 8, "half": 4, "quarter": 2}
COLS = {"full": 3, "half": 2}


@dataclass
class Spec:
    length: str = "half"
    width: str = "full"
    height: float = 24
    cols: int = 3
    rows: int = 4
    merges: list = field(default_factory=list)   # (col, row, cols wide, rows long), row 0 = front
    pull: bool = True
    guides: bool = True
    labels: dict = field(default_factory=dict)   # (col, row) of a compartment's front left unit -> text
    title: str = ""   # text on the outside of the lid
    name: str = ""

    def defines(self):
        return {
            "length": f'"{self.length}"', "width": f'"{self.width}"', "height": f"{self.height:g}",
            "cols": self.cols, "rows": self.rows, "merges": json.dumps([list(m) for m in self.merges]),
            "pull": str(self.pull).lower(), "label_guides": str(self.guides).lower(),
            "lid_labels": json.dumps([[c, r, text] for (c, r), text in sorted(self.labels.items())]),
            "lid_title": json.dumps(self.title),
        }

    def auto_name(self):
        merged = hashlib.sha1(repr(sorted(self.merges)).encode()).hexdigest()[:4] if self.merges else ""
        return (f"tray-{self.length}-{self.width}-{self.height:g}mm-{self.cols}x{self.rows}"
                f"{'-' + merged if merged else ''}{'' if self.pull else '-nopull'}{'' if self.guides else '-noguides'}")

    def command(self):
        """The command line that makes this tray with no editor."""
        merges = "".join(f" --merge {','.join(map(str, m))}" for m in self.merges)
        labels = "".join(f" --label {shlex.quote(f'{c},{r}={text}')}" for (c, r), text in sorted(self.labels.items()))
        return (f"just tray -y --length {self.length} --width {self.width} --height {self.height:g} "
                f"--cols {self.cols} --rows {self.rows}{merges} "
                f"{'--pull' if self.pull else '--no-pull'} {'--guides' if self.guides else '--no-guides'}"
                f"{labels}{f' --title {shlex.quote(self.title)}' if self.title else ''}"
                f"{f' --name {shlex.quote(self.name)}' if self.name else ''}")


@dataclass
class Comp:
    col: int
    row: int
    cols: int
    rows: int
    width: float    # mm, across the tray
    length: float   # mm, along the tray
    usable: bool    # False: too short behind the finger pocket, stays solid
    guided: bool    # has label guides


@dataclass
class Info:
    width: float
    length: float
    height: float
    depth: float      # inside a compartment
    pocket: float     # finger pocket width, 0 for none
    unit_w: float     # one grid unit, across the tray
    unit_l: float     # one grid unit, along the tray
    comps: list
    notes: list
    fit: dict       # constants for fit.py

    def labels(self, spec):
        """The slide-in label texts to print, in reading order on the top view: back row first."""
        comps = sorted(self.comps, key=lambda k: (-k.row, k.col))
        return [spec.labels[k.col, k.row] for k in comps if k.guided and spec.labels.get((k.col, k.row))]

    def lid_labels(self, spec):
        """The number of label texts on the lid map."""
        return sum(1 for k in self.comps if k.usable and spec.labels.get((k.col, k.row)))


def run(spec, part, out):
    """Run the model for one part. Return what the model reports."""
    args = ["--export-format", "binstl"] if Path(out).suffix == ".stl" else []
    for name, value in spec.defines().items():
        args += ["-D", f"{name}={value}"]
    text = openscad(out, "--enable=textmetrics", *args, "-D", f'part="{part}"', SCAD)
    data = json.loads(re.search(r"^ECHO: tray_data = (.*)$", text, re.M).group(1))
    fit = json.loads(re.search(r"^ECHO: fit_data = (.*)$", text, re.M).group(1))
    notes = re.findall(r'^ECHO: "(.*)"$', text, re.M)
    notes += [line for line in text.splitlines() if line.startswith("WARNING")]
    keys = ("wall", "div_t", "min_cell", "cut", "pull_w0", "r_cell", "scoop_r", "groove_h", "guide_p", "guide_w",
            "pull_d")
    return Info(*data[:7], comps=[Comp(*c) for c in data[7]], notes=notes, fit=dict(zip(keys, fit)))


def inspect(spec):
    """Ask the model for the sizes of this tray. Makes no geometry, so it is fast."""
    with tempfile.TemporaryDirectory() as tmp:
        return run(spec, "none", Path(tmp) / "tray.echo")


def export(spec, out=None, log=print):
    """Write the Bambu Studio project.

    Plate 1 has the body and the lid as two objects. If compartments have label
    texts, the inside of the lid has a map and plate 2 has the slide-in labels.
    A lid title goes on the outside of the lid. The lid text uses filament 2.
    """
    from bambu3mf import BambuProject

    name = spec.name or spec.auto_name()
    out = Path(out).resolve() if out else OUT / f"{name}.3mf"
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        box, lid = Path(tmp) / f"{name}-box.stl", Path(tmp) / f"{name}-lid.stl"
        log("Rendering the body")
        info = run(spec, "box", box)
        for note in info.notes:
            log(note)
        log("Rendering the lid")
        run(spec, "lid", lid)
        labels = info.labels(spec)
        lid_text = bool(spec.title or info.lid_labels(spec))
        if lid_text:
            log("Rendering the lid text")
            run(spec, "lid_text", Path(tmp) / f"{name}-lid-text.stl")

        project = BambuProject(printer_settings_id=PRINTER, bed_size=(BED, BED),
                               filaments=[BODY_FILAMENT, TEXT_FILAMENT] if labels or lid_text else [BODY_FILAMENT])
        # Body and lid side by side, centered on the bed
        x0, y0 = (BED - 2 * info.width - SPACING) / 2, (BED - info.length) / 2
        plate = project.add_plate(name=name)
        plate.add_stl(box, position=(x0, y0))
        lid_at = (x0 + info.width + SPACING, y0)
        if lid_text:
            plate.add_stl_group([(lid, 1), (Path(tmp) / f"{name}-lid-text.stl", 2)], position=lid_at)
        else:
            plate.add_stl(lid, position=lid_at)
        if labels:
            log(f"Rendering {len(labels)} labels for plate 2")
            labels_model.add_plate(project, tmp, labels)
        project.save(str(out))
    here = Path.cwd()
    log(f"Wrote {out.relative_to(here) if out.is_relative_to(here) else out}")
    log(f"Same tray again: {spec.command()}")
    return out
