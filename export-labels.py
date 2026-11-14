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
The tray editor (`just tray`) can also put the labels of a tray on a second plate.

  just labels M3x8 M3x12 100nF
  just labels -o 3mf/labels-screws.3mf "M3 x 8" "M4 nut"
"""

import argparse
import sys
import tempfile
from pathlib import Path

from bambu3mf import BambuProject

from common import BED, BODY_FILAMENT, PRINTER, ROOT, TEXT_FILAMENT, ModelError
from labels_model import add_plate


def main():
    ap = argparse.ArgumentParser(description="Write a Bambu Studio project with slide-in labels.")
    ap.add_argument("labels", nargs="+", metavar="TEXT", help="the text of one label")
    ap.add_argument("-o", "--output", type=Path, default=ROOT / "3mf" / "labels.3mf",
                    help="output file (default: 3mf/labels.3mf)")
    args = ap.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    project = BambuProject(printer_settings_id=PRINTER, filaments=[BODY_FILAMENT, TEXT_FILAMENT],
                           bed_size=(BED, BED))
    with tempfile.TemporaryDirectory() as tmp:
        try:
            add_plate(project, tmp, args.labels)
        except ModelError as failed:
            sys.exit(f"Error: {failed}")
        project.save(str(args.output))
    print(f"Wrote {len(args.labels)} labels to {args.output}")


if __name__ == "__main__":
    main()
