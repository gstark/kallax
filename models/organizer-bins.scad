// Organizer Bins - lidded boxes that tile inside the Kallax Box
// Parent interior (usable): ~96 wide x 246 deep x ~98 tall
//
// Each bin: base + fold-over lid, joined by a separate-pin knuckle hinge
// at the back, and held shut by a snap detent at the front.
//
// Footprint (bl x bw) is the OVERALL tiling size: the hinge lives within
// this footprint so bins pack tightly with no external protrusions.

include <polyround.scad>

$fn = 48;

/* ---------------------------------------------------------------------------
   Global / material parameters
--------------------------------------------------------------------------- */
wt   = 1.6;   // wall thickness
lt   = 2.0;   // lid plate thickness
tol  = 0.35;  // general print clearance (fit gaps)

r_out = 3;    // outer vertical corner radius
r_bot = 2;    // bottom edge fillet
r_top = 0.8;  // top rim fillet

// Hinge (separate pin)
kr       = 2.6;   // knuckle radius (outer)
pin_d    = 3.0;   // pin diameter (3mm filament / printed rod)
knuckle_gap = 0.4;// axial gap between adjacent knuckles
seg_target  = 16; // aim for ~this many mm per knuckle segment

// Locating lip (plugs into the opening, positions the lid)
lip_h  = 6.0;
lip_wt = 1.4;

// Front snap detent: bead near the lip's free (lower) end for good flex
snap_r     = 0.8;             // bead radius
snap_inset = lip_h - 1.5;     // how far below the rim the bead sits

/* ---------------------------------------------------------------------------
   Helpers
--------------------------------------------------------------------------- */
function rrect(w, l, r) = [[0,0,r],[w,0,r],[w,l,r],[0,l,r]];

// Number of hinge segments across the width (odd -> base owns both ends)
function n_seg(bw) = max(3, 2*floor(bw/(2*seg_target)) + 1);

/* ---------------------------------------------------------------------------
   Derived geometry (functions of a bin's footprint)
   Back wall is pulled in so the hinge knuckle sits within the footprint.
--------------------------------------------------------------------------- */
function hinge_reserve() = 2*kr;                 // y-space the hinge eats
function pin_y(bl) = bl - kr;                     // pin axis (y)
function pin_z(bh) = bh + lt - kr;                // pin axis (z)
function back_wall_y(bl) = bl - hinge_reserve();  // outer face of back wall

/* ---------------------------------------------------------------------------
   Base
--------------------------------------------------------------------------- */
module base_body(bw, bl, bh) {
    by = back_wall_y(bl);
    inner_r = max(r_out - wt, 0.5);
    difference() {
        polyRoundExtrude(rrect(bw, by, r_out), bh, r1=r_top, r2=r_bot, fn=16);
        // hollow interior, open top
        translate([0,0,wt])
            polyRoundExtrude(
                [[wt, wt, inner_r],
                 [bw-wt, wt, inner_r],
                 [bw-wt, by-wt, inner_r],
                 [wt, by-wt, inner_r]],
                bh, r1=0, r2=r_bot, fn=16);
    }
    // front snap bead: half-round rib on the interior front wall face
    translate([bw/2, wt, bh - snap_inset])
        rotate([0,90,0])
            cylinder(h=bw*0.5, r=snap_r, center=true, $fn=24);
}

module knuckles(bw, bl, bh, owner) {   // owner = "base" or "lid"
    n  = n_seg(bw);
    seg = bw / n;
    py = pin_y(bl);
    pz = pin_z(bh);
    for (i = [0:n-1]) {
        is_base = (i % 2 == 0);
        if ((owner=="base") == is_base) {
            x0 = i*seg + knuckle_gap/2;
            w  = seg - knuckle_gap;
            translate([x0, py, pz])
                rotate([0,90,0])
                    difference() {
                        cylinder(h=w, r=kr, $fn=32);
                        translate([0,0,-1]) cylinder(h=w+2, r=pin_d/2 + tol/2, $fn=32);
                    }
        }
    }
}

// Gusset tying the base knuckles back to the box wall
module base_gussets(bw, bl, bh) {
    n = n_seg(bw); seg = bw/n;
    by = back_wall_y(bl); py = pin_y(bl); pz = pin_z(bh);
    for (i=[0:n-1]) if (i%2==0) {
        x0 = i*seg + knuckle_gap/2; w = seg - knuckle_gap;
        // fill the corner between back wall and knuckle, capped at the rim
        translate([x0, by, pz - kr])
            cube([w, py - by, bh - (pz - kr)]);
    }
}

module base(bw, bl, bh) {
    difference() {
        union() {
            base_body(bw, bl, bh);
            knuckles(bw, bl, bh, "base");
            base_gussets(bw, bl, bh);
        }
        pin_bore(bw, bl, bh);
    }
}

/* ---------------------------------------------------------------------------
   Lid (modeled in the CLOSED position, lying on top at z = bh)
--------------------------------------------------------------------------- */
module lid(bw, bl, bh) {
    py = pin_y(bl); pz = pin_z(bh);
    difference() {
        union() {
            // top plate
            translate([0,0,bh])
                polyRoundExtrude(rrect(bw, py, r_out), lt, r1=r_top, r2=0, fn=16);
            // lid knuckles
            knuckles(bw, bl, bh, "lid");
            // arms tying lid knuckles to the plate
            n=n_seg(bw); seg=bw/n;
            for (i=[0:n-1]) if (i%2==1) {
                x0=i*seg+knuckle_gap/2; w=seg-knuckle_gap;
                translate([x0, py-kr, pz-kr])
                    cube([w, kr, bh + lt - (pz-kr)]);
            }
            // locating lip
            lid_lip(bw, bl, bh);
        }
        pin_bore(bw, bl, bh);
        // snap detent groove on the front lip face (receives the wall bead)
        li = wt + tol;
        translate([li, li, bh - snap_inset]) rotate([0,90,0])
            cylinder(h=bw - 2*li, r=snap_r + 0.1, $fn=24);
    }
}

module lid_lip(bw, bl, bh) {
    py = pin_y(bl);
    li = wt + tol;                 // inset from outer to lip outer face
    // U-shaped lip: front bar + two side bars
    translate([li, li, bh-lip_h]) cube([bw-2*li, lip_wt, lip_h]);            // front
    translate([li, li, bh-lip_h]) cube([lip_wt, py-2*li, lip_h]);           // left
    translate([bw-li-lip_wt, li, bh-lip_h]) cube([lip_wt, py-2*li, lip_h]); // right
}

module pin_bore(bw, bl, bh) {
    py=pin_y(bl); pz=pin_z(bh);
    translate([-1, py, pz]) rotate([0,90,0])
        cylinder(h=bw+2, r=pin_d/2 + tol/2, $fn=32);
}

module pin(bw) {
    cylinder(h=bw - 1, r=pin_d/2, $fn=32);
}

/* ---------------------------------------------------------------------------
   Assembly / layout
--------------------------------------------------------------------------- */
// lid_angle: 0 = closed, ~110 = open
module bin(bw, bl, bh, lid_angle=0) {
    py=pin_y(bl); pz=pin_z(bh);
    base(bw, bl, bh);
    translate([0,py,pz]) rotate([lid_angle,0,0]) translate([0,-py,-pz])
        color("lightblue") lid(bw, bl, bh);
    // pin in place
    color("dimgray") translate([0.5, py, pz]) rotate([0,90,0]) pin(bw);
}

// Lid flipped plate-down for printing (smooth face on the bed, lip/knuckles up)
module lid_print(bw, bl, bh) {
    translate([0, bl, bh + lt]) rotate([180,0,0]) lid(bw, bl, bh);
}

// All three parts laid out flat on the bed, ready to slice
module print_layout(bw, bl, bh) {
    base(bw, bl, bh);
    translate([bw + 8, 0, 0]) lid_print(bw, bl, bh);
    translate([-6, 0, pin_d/2]) rotate([0,90,0]) pin(bw);
}

/* ---------------------------------------------------------------------------
   Presets — sizes that tile the ~96 x 246 interior (footprint = cell - gap)
     width  cells: full 94.5 | half 46.5 | third 30.5
     length cells: full 244.5 | half 121.5 | third 80.5 | quarter 60 | sixth 39.5
--------------------------------------------------------------------------- */
presets = [
    //  name       bw      bl     bh    description
    ["S",     [ 30.5,  39.5, 25]],  // 3-wide x 6-long grid, shallow — screws, beads
    ["M",     [ 46.5,  80.5, 40]],  // 2-wide x 3-long, medium — general small parts
    ["L",     [ 46.5, 121.5, 45]],  // 2-wide x 2-long, deep — cables, connectors
    ["wide",  [ 94.5,  80.5, 40]],  // full-width x 3-long tray
    ["XL",    [ 94.5, 121.5, 55]],  // full-width x 2-long, tall — bulky items
    ["tall",  [ 30.5,  60.0, 65]],  // narrow + tall — pens, drill bits, brushes
];
function pget(name) = presets[search([name], presets)[0]][1];

// One print-ready set (base + lid + pin) of every preset, one preset per row.
row_gap = 12;
function bl_of(i)  = presets[i][1][1];
function row_y(i)  = (i <= 0) ? 0 : row_y(i-1) + bl_of(i-1) + row_gap;
module layout_all() {
    for (i = [0:len(presets)-1]) {
        d = presets[i][1];
        translate([0, row_y(i), 0]) {
            base(d[0], d[1], d[2]);
            translate([d[0] + 8, 0, 0]) lid_print(d[0], d[1], d[2]);
            translate([2*d[0] + 16, 0, pin_d/2]) rotate([0,90,0]) pin(d[0]);
        }
    }
}

/* ---------------------------------------------------------------------------
   Output selector
--------------------------------------------------------------------------- */
part   = "preview";   // preview | print | all | base | lid | pin
preset = "M";         // S | M | L | wide | XL | tall | custom
custom = [46.5, 80.5, 40];  // used when preset == "custom"

lid_angle_ov = 100;   // preview lid angle (0 = closed); override with -D
section      = 0;     // 1 = cut x > bw/2 to inspect the snap/lip

dims = (preset == "custom") ? custom : pget(preset);
bw = dims[0]; bl = dims[1]; bh = dims[2];

if (part == "preview") {
    if (section)
        difference() {
            bin(bw, bl, bh, lid_angle=lid_angle_ov);
            translate([bw/2, -50, -50]) cube([bw, bl+100, bh+100]);
        }
    else bin(bw, bl, bh, lid_angle=lid_angle_ov);
} else if (part == "print") print_layout(bw, bl, bh);
else if (part == "all")      layout_all();
else if (part == "base")     base(bw, bl, bh);
else if (part == "lid")      lid_print(bw, bl, bh);
else if (part == "pin")      rotate([0,90,0]) pin(bw);
