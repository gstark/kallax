// Kallas Box - open top box
// Front: 100mm x 100mm, Depth: 250mm
// Open on top (along the 250mm length)

include <polyround.scad>

$fn = 48;

wall = 2; // wall thickness

width = 100;
height = 100;
depth = 250;

// Finger cutout parameters (on front 100x100 wall)
cutout_top_width = 60;    // width at the top edge
cutout_bottom_width = 40; // width at the bottom of the cutout
cutout_depth = 15;        // how far down from the top
cutout_corner_r = 5;      // rounding of the finger scoop corners
cutout_lip_r = -wall / 2; // rounding of the opening lip (negative = flares outward)

// Rounding parameters
round_vert = 6;   // radius of the four vertical edges
round_bottom = 3; // radius of the bottom edges
round_top = 1;    // radius of the top rim (outer edge)
round_fn = 16;    // arc subdivisions for the fillets

// Outer footprint with rounded vertical corners
outer = [
    [0,     0,     round_vert],
    [width, 0,     round_vert],
    [width, depth, round_vert],
    [0,     depth, round_vert]
];

// Inner footprint, inset by wall, concentric corner radius
inner_r = max(round_vert - wall, 0.5);
inner = [
    [wall,         wall,         inner_r],
    [width - wall, wall,         inner_r],
    [width - wall, depth - wall, inner_r],
    [wall,         depth - wall, inner_r]
];

difference() {
    // Outer solid: rounded vertical edges + rounded top/bottom edges
    polyRoundExtrude(outer, height, r1 = round_top, r2 = round_bottom, fn = round_fn);

    // Hollow interior (open top): cavity extends above the top to open it,
    // with a rounded fillet where the floor meets the walls
    translate([0, 0, wall])
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
