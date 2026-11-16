#!/bin/sh
# Pack BOSL2 and the label font into public/ for the browser.
# These files are not in git. Run this once after a clone.
set -eu
cd "$(dirname "$0")/.."
BOSL2=${BOSL2:-$HOME/Documents/OpenSCAD/libraries/BOSL2}
FONT=${FONT:-/Applications/OpenSCAD.app/Contents/Resources/fonts/Liberation-2.00.1/ttf/LiberationSans-Bold.ttf}

mkdir -p public/fonts
rm -f public/BOSL2.zip
(cd "$BOSL2" && zip -q "$OLDPWD/public/BOSL2.zip" ./*.scad LICENSE)
cp "$FONT" public/fonts/
ls -l public/BOSL2.zip public/fonts
