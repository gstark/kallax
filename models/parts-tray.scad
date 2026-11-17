// Parts tray: a box with a grid of compartments and a friction-fit lid.
// It tiles inside the Kallax Box on the same grid as small-boxes.scad.
//
// The dividers go up to the rim. The lid rests on them and closes each
// compartment, so small parts stay in place when the tray tilts.
//
// The lid can have inlaid text in a second filament. The inside face gets a
// map: an outline of each compartment and its label text. The outside face
// gets a title. The text fit uses textmetrics(). In the OpenSCAD application,
// turn on the "textmetrics" feature in Preferences > Features.
//
// Run `just tray` to edit a tray and make a Bambu Studio project from this file.

include <box-params.scad>

/* ---------------------------------------------------------------------------
   Configuration
--------------------------------------------------------------------------- */
length = "half";   // full | half | quarter   (245, 122, 60.5 mm)
width  = "full";   // full | half             (95, 47 mm)
height = 24;       // total height with the lid. 24, 32, 48, and 96 stack to fill the parent
cols   = 3;        // grid units across the width
rows   = 4;        // grid units along the length
// Merged compartments as [col, row, cols wide, rows long] on the grid. Row 0
// is the front. Each grid unit outside a merge is one compartment.
merges = [];
pull   = true;     // finger pocket in the front end
label_guides = true;   // guides for a slide-in label on the back wall of each compartment
// Lid text. A label is [col, row, text] for the compartment whose front left
// unit is col, row. With labels, the inside of the lid gets the map.
lid_labels = [];
lid_title  = "";   // text on the outside of the lid
part   = "pair";   // pair | box | lid | lid_text

/* ---------------------------------------------------------------------------
   Tray parameters
--------------------------------------------------------------------------- */
div_t    = 1.2;    // divider thickness
r_cell   = 4;      // compartment corner and floor radius
scoop_r  = 10;     // floor radius on the front side of each compartment
min_cell = 8;      // smallest compartment side that is still usable
groove_w = fit + skirt_t + 0.3;   // channel inside the rim for the lid plug
groove_h = skirt_h + 0.3;

// Finger pull. A tray fills the parent with 0.5 mm of gap, so there is no
// other grip. A finger goes down the pocket and hooks under the lip.
pull_d   = 12;     // pocket depth at the rim
pull_u   = 3;      // extra depth below the lip
pull_lip = 6;      // lip height below the rim
pull_r   = 3;      // pocket corner radius
pull_w0  = 24;     // pocket width when it cannot line up with one column

// Label guides. Two L-shaped rails on the back wall of a compartment hold a
// label from labels.scad. The label slides down from the top.
label_clr  = 0.3;                    // slot clearance, in width and in thickness
lip_t      = 0.8;                    // guide lip thickness
guide_side = 2.4;                    // guide width beside the slot
slot_w     = label_w + label_clr;
slot_t     = label_t + label_clr;
guide_p    = slot_t + lip_t;         // how far a guide stands out from the wall

len_frac = length == "full" ? 1 : length == "half" ? 1/2 : length == "quarter" ? 1/4
         : assert(false, "length must be full, half, or quarter");
wid_frac = width == "full" ? 1 : width == "half" ? 1/2
         : assert(false, "width must be full or half");
assert(height >= 14 && height <= in_h, "height must be from 14 to 98 mm");

w  = in_w * wid_frac - gap;
d  = in_d * len_frac - gap;
bh = height - lid_t;                                  // body height
cw = (w - 2*wall - (cols - 1) * div_t) / cols;        // grid unit width
cd = (d - 2*wall - (rows - 1) * div_t) / rows;        // grid unit length
assert(cols >= 1 && cw >= min_cell, "too many cols for this width");
assert(rows >= 1 && cd >= min_cell, "too many rows for this length");

// With an odd number of columns, the pocket walls line up with the dividers
// of the middle column. If that pocket is too narrow or too wide for a
// finger, the pocket has a fixed width.
snap_w = cw + 2*div_t - 2*wall;
pw     = !pull ? 0 : (cols % 2 == 1 && snap_w >= 20 && snap_w <= 32) ? snap_w : pull_w0;
cut    = pull ? pull_d + pull_u : 0;   // how far the pocket goes into the tray

// Lid text. The text is inlaid flush, so the lid still rests flat on the dividers.
inlay_t    = 0.4;   // inlay depth, 2 layers at 0.2 mm
map_line   = 0.8;   // compartment outline width, 2 lines of a 0.4 mm nozzle
map_inset  = fit + skirt_t + 0.7;   // outline inset from the compartment walls: clear of the lid plug
map_size   = 5;     // largest map text size
title_size = 10;    // largest title text size
title_edge = 6;     // title clearance from the lid edges

// Label bottom, above the compartment floor. The label top stays below the lid plug.
label_z = bh - floor_t - groove_h - 0.5 - label_h;

function cell_x0(ix) = -w/2 + wall + ix * (cw + div_t);
// True if the span from x0 to x0 + wd is behind the pocket or its walls
function hit(x0, wd) = pull && x0 < pw/2 + wall - 0.01 && x0 + wd > -pw/2 - wall + 0.01;

for (m = merges)
    assert(m[0] >= 0 && m[1] >= 0 && m[2] >= 1 && m[3] >= 1 && m[0] + m[2] <= cols && m[1] + m[3] <= rows,
           str("merge ", m, " is outside the ", cols, " x ", rows, " grid"));
function merged(ix, iy) =
    len([for (m = merges) if (ix >= m[0] && ix < m[0] + m[2] && iy >= m[1] && iy < m[1] + m[3]) 1]) > 0;
// A front unit that is too short behind the pocket joins the unit behind it
function joins(ix) = cd - cut < min_cell && rows > 1 && hit(cell_x0(ix), cw) && !merged(ix, 0) && !merged(ix, 1);
units = [for (ix = [0 : cols - 1], iy = [0 : rows - 1])
            if (!merged(ix, iy) && !(joins(ix) && iy == 1)) [ix, iy, 1, joins(ix) && iy == 0 ? 2 : 1]];
comps = concat(merges, units);

// Compartment c = [col, row, cols wide, rows long]
function comp_w(c)  = c[2] * cw + (c[2] - 1) * div_t;
function comp_x0(c) = cell_x0(c[0]);
function comp_yb(c) = -d/2 + wall + (c[1] + c[3]) * (cd + div_t) - div_t;   // back wall
// A front compartment behind the pocket starts later
function comp_y0(c) = -d/2 + wall + c[1] * (cd + div_t) + (c[1] == 0 && hit(comp_x0(c), comp_w(c)) ? cut : 0);
function comp_l(c)  = comp_yb(c) - comp_y0(c);
// A compartment that is too short behind the pocket stays solid
function usable(c)  = comp_l(c) >= min_cell;
// Narrow or shallow compartments get no label guides
function guided(c)  = label_guides && usable(c) && label_z >= 1 && comp_w(c) >= slot_w + 2.4;

// Footprint, with the finger pocket at the front (-y) end
outline = !pull ? rect([w, d], rounding=r_vert) : round_corners(
    [[-w/2, -d/2], [-pw/2, -d/2], [-pw/2, -d/2 + pull_d], [pw/2, -d/2 + pull_d],
     [pw/2, -d/2], [w/2, -d/2], [w/2, d/2], [-w/2, d/2]],
    radius=[r_vert, 1, pull_r, pull_r, 1, r_vert, r_vert, r_vert]);

// For tray.py: sizes of the tray and of each compartment
echo(tray_data=[w, d, height, bh - floor_t, pw, cw, cd,
                [for (c = comps) [c[0], c[1], c[2], c[3], comp_w(c), comp_l(c), usable(c), guided(c)]]]);
// For fit.py: the constants that its packer uses to try grids without a model run
echo(fit_data=[wall, div_t, min_cell, cut, pull_w0, r_cell, scoop_r, groove_h,
               label_guides && label_z >= 1 ? guide_p : 0, slot_w + 2.4, pull_d]);
n_usable = len([for (c = comps) if (usable(c)) 1]);
n_guided = len([for (c = comps) if (guided(c)) 1]);
echo(str("Tray ", w, " x ", d, " x ", height, " mm, ", n_usable, " compartments on a ", cols, " x ", rows,
         " grid. One unit is ", round(cw * 10) / 10, " x ", round(cd * 10) / 10, " x ",
         round((bh - floor_t) * 10) / 10, " mm"));
if (n_usable < len(comps))
    echo(str(len(comps) - n_usable, " front compartments are too short behind the finger pocket. They stay solid."));
if (label_guides)
    echo(n_guided == 0 ? "No label guides: the compartments are too narrow or too shallow"
                       : str("Label guides in ", n_guided, " of ", n_usable, " compartments, for ",
                             label_w, " x ", label_h, " mm labels"));

/* ---------------------------------------------------------------------------
   One compartment cavity
--------------------------------------------------------------------------- */
module cell(c) {
    wd = comp_w(c);
    l  = comp_l(c);
    sr = min(scoop_r, l / 2, bh - floor_t - groove_h);
    translate([comp_x0(c) + wd/2, comp_y0(c) + l/2, floor_t])
        difference() {
            cuboid([wd, l, bh], rounding=min(r_cell, wd/2 - 0.1, l/2 - 0.1), except=TOP, anchor=BOT);
            // Scoop: keep a concave ramp on the front wall
            fwd(l/2)
                difference() {
                    cuboid([wd + 1, sr, sr], anchor=BOT+FWD);
                    translate([0, sr, sr]) xcyl(r=sr, h=wd + 2);
                }
        }
}

/* ---------------------------------------------------------------------------
   Label guides
   Local coordinates: back wall face at y = 0, compartment toward -y,
   compartment floor at z = 0.
--------------------------------------------------------------------------- */
module at_back_wall(c)
    translate([comp_x0(c) + comp_w(c)/2, comp_yb(c), floor_t]) children();

// wd = compartment width
module guide(wd) {
    s   = slot_w / 2;
    top = label_z + label_h;
    // Rail section: x across the wall, y out from the wall
    rail = round_corners(
        [[s, -0.2], [s + guide_side, -0.2], [s + guide_side, guide_p],
         [s - label_edge, guide_p], [s - label_edge, slot_t], [s, slot_t]],
        radius=[0, 0, 0, lip_t/2 - 0.01, lip_t/2 - 0.01, 0]);
    down(0.2) intersection() {
        union() {
            // Block under the label: the stop. It goes down to the floor, so nothing
            // overhangs. The sloped top edge keeps small parts off it.
            back(0.2)
                cuboid([slot_w + 0.2, guide_p + 0.2, label_z + 0.2], chamfer=lip_t, edges=TOP+FRONT, anchor=BOT+BACK);
            linear_extrude(top + 0.2) xflip_copy() yflip() polygon(rail);
        }
        // Rounded envelope: no sharp outside edges for a finger to hit
        cuboid([slot_w + 2*guide_side, 2*guide_p, top + 0.2], rounding=guide_p - 0.01, except=BOTTOM, anchor=BOT);
        // Stay inside this compartment and its walls
        cuboid([wd + div_t, 2*guide_p + 1, top + 1], anchor=BOT);
    }
}

/* ---------------------------------------------------------------------------
   Tray body (centered in x/y, sits on z = 0)
--------------------------------------------------------------------------- */
module tray() {
    zl = bh - pull_lip;   // underside of the pocket lip
    difference() {
        offset_sweep(outline, height=bh, bottom=os_chamfer(width=c_bot), top=os_chamfer(width=c_rim));

        for (c = comps)
            if (usable(c))
                cell(c);

        // Label slots. In a narrow compartment the slot cuts into the corner fillets.
        for (c = comps)
            if (guided(c))
                at_back_wall(c) up(label_z) cuboid([slot_w, slot_t, bh], anchor=BOT+BACK);

        // Channel inside the rim for the lid plug. It also notches the divider ends.
        up(bh - groove_h)
            linear_extrude(groove_h + 1)
                difference() {
                    polygon(offset(outline, r=-wall, closed=true));
                    polygon(offset(outline, r=-(wall + groove_w), closed=true));
                }

        // Undercut below the pocket lip. The 45 degree underside prints without support.
        if (pull)
            hull() {
                translate([0, -d/2, -1])
                    cuboid([pw, 2 * cut, zl - pull_u + 1], rounding=pull_r, edges="Z", anchor=BOT);
                translate([0, -d/2, zl - 0.01])
                    cuboid([pw, 2 * pull_d, 0.01], rounding=pull_r, edges="Z", anchor=BOT);
            }

        // Fingernail notch in the back rim: lets you lever the lid off
        translate([0, d/2 - wall/2, bh + notch_r - notch_h])
            cyl(r=notch_r, h=wall + 2, orient=FWD);
    }
    for (c = comps)
        if (guided(c))
            at_back_wall(c) guide(comp_w(c));
}

/* ---------------------------------------------------------------------------
   Lid text, in 2D. Lid print coordinates: the inside face is up.
--------------------------------------------------------------------------- */
// Text that fits in a box of max_w x max_h. Long text gets smaller. With turn,
// the text turns 90 degrees when that lets it be larger, as in a narrow compartment.
module fit_text(txt, size, max_w, max_h, turn=false) {
    m = textmetrics(txt, size=size, font=label_font).size;
    flat = min(1, max_w / m.x, max_h / m.y);
    turned = min(1, max_h / m.x, max_w / m.y);
    rotate(turn && turned > flat ? 90 : 0)
        text(txt, size=size * (turn ? max(flat, turned) : flat), font=label_font, halign="center", valign="center");
}

function comp_at(col, row) = [for (c = comps) if (c[0] == col && c[1] == row) c][0];
function has_label(lb) = let(c = comp_at(lb[0], lb[1])) !is_undef(c) && usable(c) && lb[2] != "";
lid_map_on = len([for (lb = lid_labels) if (has_label(lb)) 1]) > 0;

// The inside of the lid, seen from the top in print orientation, has the same
// layout as the tray seen from the top. Open the lid like a book page, to the
// left or to the right, and the map lies beside the tray in the same order.
module lid_map() {
    for (c = comps)
        if (usable(c)) {
            wd = comp_w(c) - 2*map_inset;
            l  = comp_l(c) - 2*map_inset;
            r  = max(0, min(r_cell, comp_w(c)/2 - 0.1, comp_l(c)/2 - 0.1) - map_inset);
            translate([comp_x0(c) + comp_w(c)/2, comp_y0(c) + comp_l(c)/2])
                difference() {
                    rect([wd, l], rounding=r);
                    rect([wd - 2*map_line, l - 2*map_line], rounding=max(0, r - map_line));
                }
        }
    for (lb = lid_labels) {
        c = comp_at(lb[0], lb[1]);
        if (has_label(lb))
            translate([comp_x0(c) + comp_w(c)/2, comp_y0(c) + comp_l(c)/2])
                fit_text(lb[2], map_size, comp_w(c) - 2*(map_inset + map_line + 1.5),
                         comp_l(c) - 2*(map_inset + map_line + 1.5), turn=true);
    }
}

// The outside of the lid faces the bed. On the tray, the lid is turned over
// about the y axis, so the text is mirrored in x here.
module lid_title_2d()
    xflip() fit_text(lid_title, title_size, w - 2*title_edge, d / 3);

// The inlay solids. They also cut the pockets in the lid plate.
module lid_inlays(extra=0) {
    if (lid_map_on)
        up(lid_t - inlay_t) linear_extrude(inlay_t + extra) lid_map();
    if (lid_title != "")
        down(extra) linear_extrude(inlay_t + extra) lid_title_2d();
}

/* ---------------------------------------------------------------------------
   Lid, modeled in print orientation: plate on the bed, plug pointing up
--------------------------------------------------------------------------- */
module tray_lid() {
    difference() {
        offset_sweep(outline, height=lid_t, bottom=os_chamfer(width=c_lid), top=os_chamfer(width=c_rim));
        lid_inlays(extra=0.01);
    }
    up(lid_t - 0.01)
        linear_extrude(skirt_h)
            difference() {
                polygon(offset(outline, r=-(wall + fit), closed=true));
                polygon(offset(outline, r=-(wall + fit + skirt_t), closed=true));
            }
}

if (part == "pair") {
    tray();
    right(w + 8) {
        tray_lid();
        color("Black") lid_inlays();
    }
} else if (part == "box") {
    tray();
} else if (part == "lid") {
    tray_lid();
} else if (part == "lid_text") {
    lid_inlays();
}
