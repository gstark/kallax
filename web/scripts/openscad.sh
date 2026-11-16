#!/bin/sh
# Replace the OpenSCAD WebAssembly build in public/openscad/. The files are in git.
# Usage: pnpm openscad 2026.11.16   (a snapshot from files.openscad.org/snapshots/)
set -eu
cd "$(dirname "$0")/.."
VERSION=${1:?give a snapshot version, for example 2026.11.16}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/openscad.zip" "https://files.openscad.org/snapshots/OpenSCAD-$VERSION-WebAssembly-web.zip"
unzip -oq "$tmp/openscad.zip" -d "$tmp/out"
mkdir -p public/openscad
cp "$tmp/out/openscad.js" "$tmp/out/openscad.wasm" public/openscad/
echo "$VERSION" > public/openscad/VERSION
ls -l public/openscad
