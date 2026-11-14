"""Printer settings and the OpenSCAD runner, shared by the tray and label scripts."""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent

BED = 256        # P1S bed, mm
PRINTER = "Bambu Lab P1S 0.4 nozzle"
BODY_FILAMENT = {"settings_id": "Bambu PLA Matte @BBL P1S 0.4 nozzle", "colour": "#FFFFFF"}
TEXT_FILAMENT = {"settings_id": "Bambu PLA Matte @BBL P1S 0.4 nozzle", "colour": "#000000"}


class ModelError(Exception):
    """OpenSCAD rejected the model."""


def openscad(out, *args):
    """Run OpenSCAD and write `out`. Return what the model printed."""
    out = Path(out)
    done = subprocess.run(["openscad", "-o", str(out), *map(str, args)], capture_output=True, text=True)
    text = done.stderr + (out.read_text() if out.suffix == ".echo" and out.exists() else "")
    failed = re.search(r'ERROR: Assertion .*? failed: "(.*?)"', text)
    if failed:
        raise ModelError(failed.group(1))
    if done.returncode:
        raise ModelError(done.stderr.strip())
    return text
