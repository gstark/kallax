// Kallas Box - open top box
// Front: 100mm x 100mm, Depth: 250mm
// Open on top (along the 250mm length)

wall = 2; // wall thickness

width = 100;
height = 100;
depth = 250;

// Finger cutout parameters (on front 100x100 wall)
cutout_top_width = 60;    // width at the top edge
cutout_bottom_width = 40; // width at the bottom of the cutout
cutout_depth = 15;        // how far down from the top

difference() {
    cube([width, depth, height]);

    // Hollow interior (open top)
    translate([wall, wall, wall])
        cube([width - 2 * wall, depth - 2 * wall, height]);

    // Finger cutout - trapezoid on front wall (y=0 face)
    // Extrude through the wall along Y axis
    translate([width / 2, -1, 0])
        rotate([-90, 0, 0])
            linear_extrude(height = wall + 2)
                polygon([
                    [-cutout_top_width / 2, -(height)],
                    [cutout_top_width / 2, -(height)],
                    [cutout_bottom_width / 2, -(height - cutout_depth)],
                    [-cutout_bottom_width / 2, -(height - cutout_depth)]
                ]);
}
