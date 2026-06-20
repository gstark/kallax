// Kallas Box - open top box
// Front: 100mm x 100mm, Depth: 250mm
// Open on top (along the 250mm length)

wall = 0.84; // wall thickness (2 perimeters x 0.42mm line width)
wall = 1.5;

width = 100;
height = 100;
depth = 250;

// Finger cutout parameters (on front 100x100 wall)
cutout_top_width = 60;    // width at the top edge
cutout_bottom_width = 40; // width at the bottom of the cutout
cutout_depth = 15;        // how far down from the top

// Lattice toggles
use_lattice = true;       // set to false to disable lattice
use_front_lattice = false; // set to false to disable front wall lattice (requires use_lattice)

// Lattice parameters
lattice_bar = 1;          // lattice bar width
lattice_spacing = 8;      // center-to-center spacing of lattice bars
lattice_margin = 6;      // solid border around lattice area
lattice_cell = lattice_spacing - lattice_bar; // opening size

// Generic lattice cutout: cuts a grid of holes through a wall
// w_size = wall width, h_size = wall height, thickness along X
module lattice_grid(w_size, h_size) {
    w_start = lattice_margin;
    w_end = w_size - lattice_margin;
    h_start = lattice_margin;
    h_end = h_size - lattice_margin;

    for (w = [w_start : lattice_spacing : w_end - lattice_cell]) {
        for (h = [h_start : lattice_spacing : h_end - lattice_cell]) {
            if (w + lattice_cell <= w_end && h + lattice_cell <= h_end) {
                translate([-1, w, h])
                    cube([wall + 2, lattice_cell, lattice_cell]);
            }
        }
    }
}

difference() {
    cube([width, depth, height]);

    // Hollow interior (open top)
    translate([wall, wall, wall])
        cube([width - 2 * wall, depth - 2 * wall, height]);

    // Finger cutout - trapezoid on front wall (y=0 face)
    translate([width / 2, -1, 0])
        rotate([-90, 0, 0])
            linear_extrude(height = wall + 2)
                polygon([
                    [-cutout_top_width / 2, -(height)],
                    [cutout_top_width / 2, -(height)],
                    [cutout_bottom_width / 2, -(height - cutout_depth)],
                    [-cutout_bottom_width / 2, -(height - cutout_depth)]
                ]);

    if (use_lattice) {
        // Lattice on left side wall (x=0, spans Y x Z)
        lattice_grid(depth, height - wall);

        // Lattice on right side wall (x=width-wall, spans Y x Z)
        translate([width - wall, 0, 0])
            lattice_grid(depth, height - wall);

        // Lattice on front wall (y=0, spans X x Z)
        // Cap height at cutout bottom so lattice doesn't overlap the finger cutout
        if (use_front_lattice)
            translate([0, 0, 0])
                rotate([0, 0, 90])
                    translate([0, -width, 0])
                        lattice_grid(width, height - cutout_depth - wall);

        // Lattice on back wall (y=depth-wall, spans X x Z)
        translate([0, depth - wall, 0])
            rotate([0, 0, 90])
                translate([0, -width, 0])
                    lattice_grid(width, height - wall);

        // Lattice on bottom wall (z=0, spans X x Y)
        translate([0, 0, 0])
            rotate([0, -90, 0])
                translate([0, 0, -width])
                    lattice_grid(depth, width);
    }
}
