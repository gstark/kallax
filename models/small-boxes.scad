// Small boxes with friction-fit lids that tile inside the Kallax Box.
//
// The grid and wall parameters are in box-params.scad. A box takes nx x ny
// cells. Box heights include the lid, so heights of 24 + 24 + 48
// (or 32 x 3, or 96) stack to fill the parent.

include <box-params.scad>

/* ---------------------------------------------------------------------------
   Box body (centered in x/y, sits on z = 0)
--------------------------------------------------------------------------- */
module box(nx, ny, h) {
    w  = box_w(nx);
    d  = box_d(ny);
    bh = h - lid_t;
    difference() {
        offset_sweep(rect([w, d], rounding=r_vert), height=bh,
                     bottom=os_chamfer(width=c_bot), top=os_chamfer(width=c_rim));
        up(floor_t)
            offset_sweep(rect([w - 2*wall, d - 2*wall], rounding=r_in),
                         height=bh, bottom=os_circle(r=r_floor));
        // Fingernail notch: lets you lever the lid off at the front
        translate([0, -d/2 + wall/2, bh + notch_r - notch_h])
            cyl(r=notch_r, h=wall + 2, orient=FWD);
    }
}

/* ---------------------------------------------------------------------------
   Lid, modeled in print orientation: plate on the bed, plug pointing up
--------------------------------------------------------------------------- */
module lid(nx, ny) {
    w  = box_w(nx);
    d  = box_d(ny);
    pw = w - 2*wall - 2*fit;
    pd = d - 2*wall - 2*fit;
    pr = max(r_in - fit, 0.5);
    union() {
        offset_sweep(rect([w, d], rounding=r_vert), height=lid_t,
                     bottom=os_chamfer(width=c_lid), top=os_chamfer(width=c_rim));
        up(lid_t - 0.01)
            difference() {
                offset_sweep(rect([pw, pd], rounding=pr), height=skirt_h,
                             top=os_chamfer(width=0.4));   // lead-in
                down(0.01)
                    offset_sweep(rect([pw - 2*skirt_t, pd - 2*skirt_t],
                                      rounding=max(pr - skirt_t, 0.3)),
                                 height=skirt_h + 1);
            }
    }
}

// Box with the lid closed on top
module closed_box(nx, ny, h) {
    box(nx, ny, h);
    up(h) zflip() lid(nx, ny);
}

/* ---------------------------------------------------------------------------
   Assortment: [name, nx, ny, total height incl. lid]
     Footprints in mm: 1 cell wide = 23, 2 = 47, 4 = 95
                       2 cells deep = 48.2, 4 = 97.4, 5 = 122, 10 = 245
--------------------------------------------------------------------------- */
presets = [
    ["tiny",        1,  2, 24],  // 23 x 48  x 24  screws, beads
    ["tall",        1,  2, 96],  // 23 x 48  x 96  drill bits, brushes
    ["strip",       1,  4, 24],  // 23 x 97  x 24  long thin parts
    ["strip-third", 1,  4, 32],  // 23 x 97  x 32
    ["pencil",      1, 10, 32],  // 23 x 245 x 32  pens, rulers, files
    ["square",      2,  2, 24],  // 47 x 48  x 24
    ["square-half", 2,  2, 48],  // 47 x 48  x 48
    ["medium",      2,  4, 48],  // 47 x 97  x 48  general parts
    ["deep",        2,  5, 96],  // 47 x 122 x 96  cables, bulky items
    ["wide",        4,  4, 48],  // 95 x 97  x 48  full-width tray
    ["tray",        4,  5, 24],  // 95 x 122 x 24  shallow full-width tray
];
function pget(name) = presets[search([name], presets)[0]];

/* ---------------------------------------------------------------------------
   Example arrangement: [preset, cell x, cell y, z offset]
   Fills the 4 x 10 x 98 interior, except one 1 x 2 cell at front left.
   The empty cell gives room for fingers, and you can slide a box into it.
--------------------------------------------------------------------------- */
layout = [
    // Front rows (y 0-1). Cell x 0 stays empty.
    ["tall",        1, 0,  0],
    ["square",      2, 0,  0],
    ["square",      2, 0, 24],
    ["square-half", 2, 0, 48],
    // Middle rows (y 2-5)
    ["medium",      0, 2,  0],
    ["medium",      0, 2, 48],
    ["strip",       2, 2,  0],
    ["strip",       2, 2, 24],
    ["strip",       2, 2, 48],
    ["strip",       2, 2, 72],
    ["strip-third", 3, 2,  0],
    ["strip-third", 3, 2, 32],
    ["strip-third", 3, 2, 64],
    // Back rows (y 6-9)
    ["wide",        0, 6,  0],
    ["wide",        0, 6, 48],
];

module place(p, ix, iy, z) {
    translate([in_origin.x + (ix + p[1]/2) * px,
               in_origin.y + (iy + p[2]/2) * py,
               in_origin.z + z])
        children();
}

/* ---------------------------------------------------------------------------
   Output selector
     layout   : example arrangement inside the parent (preview only)
     pair     : box + lid of `preset`, laid out for printing
     box, lid : one part of `preset`
     fit_test : short 2 x 2 box + lid to tune `fit` before a big print
--------------------------------------------------------------------------- */
part   = "layout";
preset = "medium";

p = pget(preset);

if (part == "layout") {
    // Ghost of the parent, so the preview does not need kallax-box.stl
    %difference() {
        cuboid([in_w + 2 * parent_wall, in_d + 2 * parent_wall, in_h + 2], rounding=4 + parent_wall, edges="Z", anchor=BOT+LEFT+FWD);
        translate(in_origin)
            cuboid([in_w, in_d, in_h + 1], rounding=4, edges="Z", anchor=BOT+LEFT+FWD);
    }
    for (i = [0 : len(layout) - 1]) {
        l = layout[i];
        q = pget(l[0]);
        color(i % 2 ? "SteelBlue" : "LightSteelBlue")
            place(q, l[1], l[2], l[3]) closed_box(q[1], q[2], q[3]);
    }
} else if (part == "pair") {
    box(p[1], p[2], p[3]);
    right(box_w(p[1]) + 8) lid(p[1], p[2]);
} else if (part == "box") {
    box(p[1], p[2], p[3]);
} else if (part == "lid") {
    lid(p[1], p[2]);
} else if (part == "fit_test") {
    box(2, 2, 12);
    right(box_w(2) + 8) lid(2, 2);
}
