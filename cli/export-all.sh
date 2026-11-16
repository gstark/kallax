#!/usr/bin/env bash
# Export one of every organizer-bin combination to STL.
#   cli/export-all.sh          -> individual part STLs for every preset, into stl/
#   cli/export-all.sh combined -> single stl/all-bins.stl with one set of everything
#
# The parent tray itself is already kallax-box.stl (from kallax-box.scad).
set -euo pipefail
cd "$(dirname "$0")/.."   # the repo root: the models are in models/, the STLs go to stl/

OSCAD="${OPENSCAD:-openscad}"
SCAD=models/organizer-bins.scad
OUT=stl
mkdir -p "$OUT"

PRESETS=(S M L wide XL tall)
PARTS=(base lid pin)

if [[ "${1:-}" == "combined" ]]; then
  echo "Rendering combined plate -> $OUT/all-bins.stl"
  "$OSCAD" -o "$OUT/all-bins.stl" -D 'part="all"' "$SCAD"
  echo "done"
  exit 0
fi

for p in "${PRESETS[@]}"; do
  for part in "${PARTS[@]}"; do
    f="$OUT/${p}-${part}.stl"
    echo "Rendering $f"
    "$OSCAD" -o "$f" -D "part=\"$part\"" -D "preset=\"$p\"" "$SCAD"
  done
done

echo "Done. $(ls "$OUT"/*.stl | wc -l | tr -d ' ') STLs in $OUT/"
