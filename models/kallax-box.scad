// Kallax Box - open top box
// Interior: 96mm x 246mm. The outside grows with the wall thickness
// (102mm x 252mm x 100mm with 3mm walls).
// Open on top (along the long side)

include <polyround.scad>

$fn = 48;

// Sandwich wall: the slicer prints one perimeter on each face with sparse
// infill between them (wall_loops = 1, gyroid). A thicker hollow wall is
// stiffer than a thinner solid wall that uses the same plastic.
wall = 3;          // wall thickness
floor_thick = 1.12; // floor thickness, 4 layers at 0.28 mm; the shelf supports the floor

// small-boxes.scad and organizer-bins.scad are sized to this interior
interior_width = 96;
interior_depth = 246;
interior_corner_r = 4; // radius of the inside vertical corners

width = interior_width + 2 * wall;
height = 100;
depth = interior_depth + 2 * wall;

// Finger cutout parameters (on front 100x100 wall)
cutout_top_width = 60;    // width at the top edge
cutout_bottom_width = 40; // width at the bottom of the cutout
cutout_depth = 15;        // how far down from the top
cutout_corner_r = 5;      // rounding of the finger scoop corners
cutout_lip_r = -wall / 2; // rounding of the opening lip (negative = flares outward)

// Rounding parameters
round_vert = interior_corner_r + wall; // radius of the four vertical edges
round_bottom = 3; // radius of the bottom edges
round_top = 1;    // radius of the top rim (outer edge)
round_fn = 16;    // arc subdivisions for the fillets

part = "box";     // box | none (sizes only, for the web workbench)

assert(wall >= 1.2 && wall <= 8, "wall must be from 1.2 to 8 mm");
assert(height >= 20 && height <= 250, "height must be from 20 to 250 mm");
assert(cutout_depth == 0 || (cutout_bottom_width >= 2 * cutout_corner_r + 2
       && cutout_bottom_width <= cutout_top_width && cutout_top_width <= interior_width - 2 * interior_corner_r),
       "the finger cutout must be narrower at the bottom than at the top, and fit between the inside corners");
assert(cutout_depth >= 0 && cutout_depth <= height / 2, "cutout depth must be from 0 to half the height");

// For the web workbench: the sizes of the box
echo(box_data=[width, depth, height, wall, floor_thick, interior_width, interior_depth, interior_corner_r,
               round_vert, cutout_top_width, cutout_bottom_width, cutout_depth, cutout_corner_r]);

// Outer footprint with rounded vertical corners
outer = [
    [0,     0,     round_vert],
    [width, 0,     round_vert],
    [width, depth, round_vert],
    [0,     depth, round_vert]
];

// Inner footprint, inset by wall, concentric corner radius
inner_r = interior_corner_r;
inner = [
    [wall,         wall,         inner_r],
    [width - wall, wall,         inner_r],
    [width - wall, depth - wall, inner_r],
    [wall,         depth - wall, inner_r]
];

if (part == "box") difference() {
    // Outer solid: rounded vertical edges + rounded top/bottom edges
    polyRoundExtrude(outer, height, r1 = round_top, r2 = round_bottom, fn = round_fn);

    // Hollow interior (open top): cavity extends above the top to open it,
    // with a rounded fillet where the floor meets the walls
    translate([0, 0, floor_thick])
        polyRoundExtrude(inner, height, r1 = 0, r2 = round_bottom, fn = round_fn);

    // Finger cutout - rounded trapezoid on front wall (y=0 face)
    // polyRoundExtrude rounds both the in-plane scoop corners and the
    // through-wall lip (bullnose on the front and inner edges)
    translate([width / 2, 0, 0])
        rotate([-90, 0, 0])
            polyRoundExtrude([
                // Top points extend above the rim so the opening cuts cleanly
                [-cutout_top_width / 2,    -(height + 10),          0],
                [ cutout_top_width / 2,    -(height + 10),          0],
                [ cutout_bottom_width / 2, -(height - cutout_depth), cutout_corner_r],
                [-cutout_bottom_width / 2, -(height - cutout_depth), cutout_corner_r]
            ], wall + 2, r1 = cutout_lip_r, r2 = cutout_lip_r, fn = round_fn);
}
