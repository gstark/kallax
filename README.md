# Kallax box

**Use the web workbench at <https://gstark.com/kallax/>.** It runs in your browser.

Printable storage for one cube of an IKEA KALLAX shelf: a box that slides into the
cube, and parts trays and small boxes that fill the box. The models are OpenSCAD
files. The tools write Bambu Studio projects for a Bambu Lab P1S with a 0.4 mm nozzle.

KALLAX is a trademark of Inter IKEA Systems B.V. This project is not affiliated
with, sponsored by, or endorsed by IKEA.

## Layout

| Folder | What it holds |
|---|---|
| `models/` | The OpenSCAD models. The web workbench and the CLI both use them. |
| `web/` | The web workbench. |
| `cli/` | The command-line tools: Python and shell scripts. |
| `3mf/` | Bambu Studio projects that the CLI writes. |
| `stl/` | STL files that the CLI export scripts write. |

The `justfile` at the root runs the CLI tools.

## The parts

| File | Part |
|---|---|
| `models/kallax-box.scad` | The box. The inside is 96 × 246 mm, and the outside grows with the wall. It has a finger cutout in the front wall. |
| `models/parts-tray.scad` | A parts tray with a grid of compartments, merged compartments, a finger pocket at each end, label guides, and a friction-fit lid. The lid can have a compartment map and a title in a second color. |
| `models/labels.scad` | Slide-in labels for the tray label guides. |
| `models/small-boxes.scad` | Small boxes with friction-fit lids that tile inside the box. |
| `models/organizer-bins.scad` | Lidded bins with a pin hinge that tile inside the box. |
| `models/box-params.scad` | The grid and the wall sizes that the trays and the small boxes share. |
| `models/polyround.scad` | The round-anything library. The box and the organizer bins use it. |

Trays and small boxes use a grid of 4 × 10 cells of 24 × 24.6 mm. Heights of 24,
32, 48, and 96 mm with the lid stack to fill the 100 mm box.

## The web workbench

The workbench at <https://gstark.com/kallax/> runs fully in the browser. OpenSCAD runs as WebAssembly in
web workers, and the page writes the Bambu Studio project. It has three modes:

- **Box.** Set the wall, the height, and the finger cutout. The project uses the
  "0.28mm Extra Draft @BBL X1C" process. With the sandwich wall, each box also has
  object settings: 1 wall loop, 15% gyroid infill, and 4 bottom layers.
- **Edit a tray.** Set the size and the grid. Merge units into compartments, and
  type a label for each compartment. Make 3MF writes the tray, the lid, the lid
  text, and a plate of slide-in labels.
- **Find a tray for my items.** Answer questions about the items that you want to
  store. The packer finds the smallest trays that hold them, and the model checks
  each tray. Open a tray in the editor to change it or to make the 3MF.

Each mode has a 3D view and a top view on a cutting mat with a 10 mm grid.

### Set up

You need Node.js and pnpm. The setup also needs two local files that are not in git:

- BOSL2, in `~/Documents/OpenSCAD/libraries/BOSL2`. Set `BOSL2` to use another folder.
- Liberation Sans Bold, from the OpenSCAD app. Set `FONT` to use another file.

```sh
cd web
pnpm install
pnpm libs     # packs BOSL2 and the label font into public/
pnpm dev      # starts the workbench at http://localhost:5173
```

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the development server. |
| `pnpm build` | Checks the types and builds the site into `dist/`. |
| `pnpm typecheck` | Checks the types. |
| `pnpm libs` | Packs BOSL2 and the label font into `public/`. |
| `pnpm openscad <version>` | Replaces the OpenSCAD WebAssembly build with a snapshot from files.openscad.org. Update `public/openscad/NOTICE` after a change. |
| `pnpm typeface` | Converts Barlow Condensed SemiBold for the 3D text in the preview. |

### Deploy

The workflow in `.github/workflows/pages.yml` publishes the workbench on GitHub
Pages after each push to `main` that changes `web/` or `models/`. You can also start
it by hand on the Actions tab. It builds with the BOSL2 commit in `BOSL2_REF` and
with Liberation Sans from Ubuntu. Set `BASE_PATH` to build for a site under a path:

```sh
BASE_PATH=/kallax/ pnpm build
```

## The CLI

The tools in `cli/` do the same work in a terminal. You need OpenSCAD on the `PATH`
with BOSL2 in its library folder, [uv](https://docs.astral.sh/uv/), and
[just](https://just.systems). The scripts install their own Python packages.

| Command | What it does |
|---|---|
| `just tray` | Opens the tray editor in the terminal. `just tray --help` shows the options. |
| `just fit 42x38x17@4 "WAGO=12.4x20.5x14.5@50,loose"` | Finds the smallest trays for a set of items. |
| `just labels M3x8 M3x12` | Writes a project with slide-in labels. |
| `cli/export-3mf.py` | Writes projects for every small box preset. |
| `cli/export-small-boxes.sh` | Exports every small box and lid to STL. |
| `cli/export-all.sh` | Exports every organizer bin part to STL. |

Run the commands from the repo root. The projects go into `3mf/`, and the STL files
go into `stl/`.

## Printing

- The box uses a sandwich wall: one perimeter on each face with sparse infill
  between them. A thick hollow wall is stiffer than a thin solid wall of the same
  plastic. The 1.12 mm floor is 4 layers of 0.28 mm.
- The lid text and the labels use filament 2. For one color, set both filaments to
  the same color in Bambu Studio.
- Open each project in Bambu Studio and check the plates before you print.

## License

The code and the models are under the MIT license. See [LICENSE](LICENSE).

### Third-party files

These files keep their own licenses:

| Files | Project | License |
|---|---|---|
| `web/public/openscad/` | [OpenSCAD](https://github.com/openscad/openscad), WebAssembly build | GPL 2 or later. See `COPYING` and `NOTICE` in that folder. |
| `models/polyround.scad` | round-anything by IrevDev | MIT |
| `web/src/preview/barlow-condensed-600.typeface.json` | Converted from [Barlow](https://github.com/jpt/barlow) Condensed SemiBold | SIL Open Font License 1.1. See `barlow-condensed-600.OFL.txt`. |

The workbench also uses these packages and files, which are not in git:
[BOSL2](https://github.com/BelfrySCAD/BOSL2) (BSD 2-Clause), Liberation Sans
(SIL Open Font License 1.1), the Barlow fonts from Fontsource (SIL Open Font License
1.1), three.js, React, fflate, and Tailwind CSS (MIT).
