# List the recipes
default:
    @just --list

# Open the tray editor. It writes a Bambu Studio project for one parts tray. `just tray --help` shows the options.
[positional-arguments]
tray *args:
    @./cli/tray.py "$@"

# Write a Bambu Studio project with slide-in labels, one for each text. Example: just labels M3x8 100nF
[positional-arguments]
labels *args:
    @./cli/export-labels.py "$@"

# Find the smallest tray for a set of items, one item in each compartment. Example: just fit "2 jacks=42x38x17@4" 42x26x17@2
[positional-arguments]
fit *args:
    @./cli/fit.py "$@"
