// Shared grid and wall parameters for the boxes that go inside the Kallax Box.
// Included by small-boxes.scad and parts-tray.scad.
//
// The parent (kallax-box.scad) has a 96 wide x 246 deep interior with 3 mm
// walls and a 1.12 mm floor. The interior is about 98.9 tall; 98 is used here.
// The interior is a grid of 4 x 10 cells (24 x 24.6 mm).

include <BOSL2/std.scad>
include <BOSL2/rounding.scad>

$fa = $preview ? 12 : 2;
$fs = $preview ? 1  : 0.25;

/* ---------------------------------------------------------------------------
   Parent interior and grid
--------------------------------------------------------------------------- */
in_w = 96;               // interior width  (x)
in_d = 246;              // interior depth  (y)
in_h = 98;               // interior height (z), floor to rim
parent_wall = 3;         // kallax-box.scad `wall`
in_origin = [parent_wall, parent_wall, 1.12];   // interior corner in kallax-box coordinates

px  = in_w / 4;          // cell pitch x = 24
py  = in_d / 10;         // cell pitch y = 24.6
gap = 1.0;               // clearance per cell (0.5 mm each side)

/* ---------------------------------------------------------------------------
   Box and lid parameters
--------------------------------------------------------------------------- */
wall    = 1.6;   // box wall
floor_t = 1.2;   // box floor
lid_t   = 1.6;   // lid plate
skirt_h = 5;     // lid plug depth into the box
skirt_t = 1.2;   // lid plug wall
fit     = 0.10;  // plug clearance per side. Lower = tighter. Tune with part="fit_test".

r_vert  = 3.5;   // vertical corner radius (matches the parent's 4 mm inner corner)
// The parent has a 3 mm fillet where its floor meets the walls. A 1.5 mm
// bottom chamfer plus the 0.5 mm side gap clears it, so boxes sit flat
// against the walls. This is larger than the usual 0.5 mm on purpose.
c_bot   = 1.5;
c_rim   = 0.4;   // chamfer on the box rim and lid seam
c_lid   = 0.5;   // chamfer on the lid top edge (prints on the bed)
r_floor = 1.5;   // inside floor fillet, makes small parts easy to scoop

notch_r = 5;     // fingernail notch in the rim
notch_h = 2;     // notch depth below the rim

/* ---------------------------------------------------------------------------
   Slide-in label (guides in parts-tray.scad, labels in labels.scad)
--------------------------------------------------------------------------- */
label_w    = 18;   // label width
label_h    = 10;   // label height
label_t    = 1.2;  // label plate thickness
label_edge = 1.0;  // width of each side edge that a guide lip covers
label_font = "Liberation Sans:style=Bold";   // labels and the lid text

function box_w(nx) = nx * px - gap;
function box_d(ny) = ny * py - gap;
r_in = r_vert - wall;
