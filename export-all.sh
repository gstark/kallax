#!/usr/bin/env bash
# Export one of every organizer-bin combination to STL.
#   ./export-all.sh          -> individual part STLs for every preset, into stl/
#   ./export-all.sh combined -> single stl/all-bins.stl with one set of everything
#
# The parent tray itself is already kallas-box.stl (from kallas-box.scad).
set -euo pipefail
cd "$(dirname "$0")"

OSCAD="${OPENSCAD:-openscad}"
SCAD=organizer-bins.scad
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
