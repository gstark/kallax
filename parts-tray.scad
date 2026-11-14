// Parts tray: a box with a grid of compartments and a friction-fit lid.
// It tiles inside the Kallas Box on the same grid as small-boxes.scad.
//
// The dividers go up to the rim. The lid rests on them and closes each
// compartment, so small parts stay in place when the tray tilts.
//
// Run `just tray --help` to make a Bambu Studio project from this file.

include <box-params.scad>

/* ---------------------------------------------------------------------------
   Configuration
--------------------------------------------------------------------------- */
length = "half";   // full | half | quarter   (245, 122, 60.5 mm)
width  = "full";   // full | half             (95, 47 mm)
height = 24;       // total height with the lid. 24, 32, 48, and 96 stack to fill the parent
cols   = 3;        // compartments across the width
rows   = 4;        // compartments along the length
pull   = true;     // finger pocket in the front end
label_guides = true;   // guides for a slide-in label on the back wall of each compartment
part   = "pair";   // pair | box | lid

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
cw = (w - 2*wall - (cols - 1) * div_t) / cols;        // compartment width
cd = (d - 2*wall - (rows - 1) * div_t) / rows;        // compartment length
assert(cols >= 1 && cw >= min_cell, "too many cols for this width");
assert(rows >= 1 && cd >= min_cell, "too many rows for this length");

// With an odd number of columns, the pocket walls line up with the dividers
// of the middle column. If that pocket is too narrow or too wide for a
// finger, the pocket has a fixed width.
snap_w = cw + 2*div_t - 2*wall;
pw     = !pull ? 0 : (cols % 2 == 1 && snap_w >= 20 && snap_w <= 32) ? snap_w : pull_w0;
cut    = pull ? pull_d + pull_u : 0;   // how far the pocket goes into the tray
// A front compartment that is too short joins the compartment behind it
merge  = cd - cut < min_cell;

// Label bottom, above the compartment floor. The label top stays below the lid plug.
label_z    = bh - floor_t - groove_h - 0.5 - label_h;
// Narrow or shallow compartments get no guides
has_guides = label_guides && cw >= slot_w + 2.4 && label_z >= 1;

function cell_x0(ix) = -w/2 + wall + ix * (cw + div_t);
// True if the column is behind the pocket or its walls
function hit(ix) = pull && cell_x0(ix) < pw/2 + wall - 0.01 && cell_x0(ix) + cw > -pw/2 - wall + 0.01;
// False for a front compartment that joined the compartment behind it
function has_cell(ix, iy) = !(hit(ix) && merge && iy == 0);

// Footprint, with the finger pocket at the front (-y) end
outline = !pull ? rect([w, d], rounding=r_vert) : round_corners(
    [[-w/2, -d/2], [-pw/2, -d/2], [-pw/2, -d/2 + pull_d], [pw/2, -d/2 + pull_d],
     [pw/2, -d/2], [w/2, -d/2], [w/2, d/2], [-w/2, d/2]],
    radius=[r_vert, 1, pull_r, pull_r, 1, r_vert, r_vert, r_vert]);

echo(str("Tray ", w, " x ", d, " x ", height, " mm, ", cols, " x ", rows, " compartments of ",
         round(cw * 10) / 10, " x ", round(cd * 10) / 10, " x ", round((bh - floor_t) * 10) / 10, " mm"));
if (label_guides)
    echo(has_guides ? str("Label guides for ", label_w, " x ", label_h, " mm labels")
                    : "No label guides: the compartments are too narrow or too shallow");

/* ---------------------------------------------------------------------------
   One compartment cavity
--------------------------------------------------------------------------- */
module cell(ix, iy) {
    front = hit(ix) && (iy == 0 || (merge && iy == 1));   // starts behind the pocket
    y0 = -d/2 + wall + (front ? cut : iy * (cd + div_t));
    l  = front ? (iy + 1) * cd + iy * div_t - cut : cd;
    sr = min(scoop_r, l / 2, bh - floor_t - groove_h);
    translate([cell_x0(ix) + cw/2, y0 + l/2, floor_t])
        difference() {
            cuboid([cw, l, bh], rounding=min(r_cell, cw/2 - 0.1, l/2 - 0.1), except=TOP, anchor=BOT);
            // Scoop: keep a concave ramp on the front wall
            fwd(l/2)
                difference() {
                    cuboid([cw + 1, sr, sr], anchor=BOT+FWD);
                    translate([0, sr, sr]) xcyl(r=sr, h=cw + 2);
                }
        }
}

/* ---------------------------------------------------------------------------
   Label guides
   Local coordinates: back wall face at y = 0, compartment toward -y,
   compartment floor at z = 0.
--------------------------------------------------------------------------- */
module at_back_wall(ix, iy)
    translate([cell_x0(ix) + cw/2, -d/2 + wall + iy * (cd + div_t) + cd, floor_t]) children();

module guide() {
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
        cuboid([cw + div_t, 2*guide_p + 1, top + 1], anchor=BOT);
    }
}

/* ---------------------------------------------------------------------------
   Tray body (centered in x/y, sits on z = 0)
--------------------------------------------------------------------------- */
module tray() {
    zl = bh - pull_lip;   // underside of the pocket lip
    difference() {
        offset_sweep(outline, height=bh, bottom=os_chamfer(width=c_bot), top=os_chamfer(width=c_rim));

        for (ix = [0 : cols - 1], iy = [0 : rows - 1])
            if (has_cell(ix, iy))
                cell(ix, iy);

        // Label slots. In a narrow compartment the slot cuts into the corner fillets.
        if (has_guides)
            for (ix = [0 : cols - 1], iy = [0 : rows - 1])
                if (has_cell(ix, iy))
                    at_back_wall(ix, iy) up(label_z) cuboid([slot_w, slot_t, bh], anchor=BOT+BACK);

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
    if (has_guides)
        for (ix = [0 : cols - 1], iy = [0 : rows - 1])
            if (has_cell(ix, iy))
                at_back_wall(ix, iy) guide();
}

/* ---------------------------------------------------------------------------
   Lid, modeled in print orientation: plate on the bed, plug pointing up
--------------------------------------------------------------------------- */
module tray_lid() {
    offset_sweep(outline, height=lid_t, bottom=os_chamfer(width=c_lid), top=os_chamfer(width=c_rim));
    up(lid_t - 0.01)
        linear_extrude(skirt_h)
            difference() {
                polygon(offset(outline, r=-(wall + fit), closed=true));
                polygon(offset(outline, r=-(wall + fit + skirt_t), closed=true));
            }
}

if (part == "pair") {
    tray();
    right(w + 8) tray_lid();
} else if (part == "box") {
    tray();
} else if (part == "lid") {
    tray_lid();
}
