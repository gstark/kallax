"""Slide-in labels from labels.scad, as one plate of a Bambu Studio project."""

import json
from pathlib import Path

from common import ROOT, openscad

SCAD = ROOT / "labels.scad"


def add_plate(project, tmp, texts, name="Labels"):
    """Add a plate with one label for each text.

    The labels are one object with two parts: the plates use filament 1 and the
    raised text uses filament 2.
    """
    parts = {"base": Path(tmp) / "labels.stl", "text": Path(tmp) / "label-text.stl"}
    for part, path in parts.items():
        openscad(path, "--enable=textmetrics", "--export-format", "binstl",
                 "-D", f'part="{part}"', "-D", f"labels={json.dumps(texts)}", SCAD)
    project.add_plate(name=name).add_stl_group([(parts["base"], 1), (parts["text"], 2)])
