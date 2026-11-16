#!/usr/bin/env bash
# Export one box + lid STL for every preset in small-boxes.scad, into stl/small-boxes/.
#   cli/export-small-boxes.sh            -> every preset
#   cli/export-small-boxes.sh tiny wide  -> only the named presets
set -euo pipefail
cd "$(dirname "$0")/.."   # the repo root: the models are in models/, the STLs go to stl/

OSCAD="${OPENSCAD:-openscad}"
SCAD=models/small-boxes.scad
OUT=stl/small-boxes
mkdir -p "$OUT"

if [[ $# -gt 0 ]]; then
  PRESETS=("$@")
else
  # Read preset names from the `presets = [ ... ];` table in the .scad file
  PRESETS=($(sed -n '/^presets = \[/,/^\];/p' "$SCAD" | grep -oE '^\s*\["[a-z0-9-]+"' | tr -d ' ["'))
fi

for p in "${PRESETS[@]}"; do
  f="$OUT/${p}.stl"
  echo "Rendering $f"
  "$OSCAD" -q -o "$f" -D 'part="pair"' -D "preset=\"$p\"" "$SCAD"
done

"$OSCAD" -q -o "$OUT/fit-test.stl" -D 'part="fit_test"' "$SCAD"
echo "Done. $(ls "$OUT"/*.stl | wc -l | tr -d ' ') STLs in $OUT/"
