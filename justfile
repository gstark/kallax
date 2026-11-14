# List the recipes
default:
    @just --list

# Write a Bambu Studio project for one parts tray. `just tray --help` shows the options.
tray *args:
    @./export-tray.py {{args}}
