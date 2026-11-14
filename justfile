# List the recipes
default:
    @just --list

# Open the tray editor. It writes a Bambu Studio project for one parts tray. `just tray --help` shows the options.
[positional-arguments]
tray *args:
    @./tray.py "$@"

# Write a Bambu Studio project with slide-in labels, one for each text. Example: just labels M3x8 100nF
[positional-arguments]
labels *args:
    @./export-labels.py "$@"
