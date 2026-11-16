// Slide-in labels for the guides in parts-tray.scad.
// A label is a flat plate with raised text. It prints flat, with the text up.
//
// Run `just labels M3x8 100nF` to make a Bambu Studio project from this file.
// The text fit uses textmetrics(). In the OpenSCAD application, turn on the
// "textmetrics" feature in Preferences > Features.

include <box-params.scad>

/* ---------------------------------------------------------------------------
   Configuration
--------------------------------------------------------------------------- */
labels = ["M3x8", "M3x12", "100nF"];
part   = "all";    // all | base | text

text_size = 4.5;   // largest text size. Long text gets smaller to fit.
text_t    = 0.4;   // raised text height, 2 layers at 0.2 mm
text_w    = label_w - 2 * (label_edge + 0.6);   // text stays clear of the guide lips
per_row   = 6;     // labels per row on the plate
spacing   = 3;

module base() {
    color("White") cuboid([label_w, label_h, label_t], rounding=0.8, edges="Z", anchor=BOT);
}

module raised_text(txt) {
    natural = textmetrics(txt, size=text_size, font=label_font).size.x;
    size = text_size * min(1, text_w / natural);
    color("Black") up(label_t - 0.01) linear_extrude(text_t + 0.01)
        text(txt, size=size, font=label_font, halign="center", valign="center");
}

for (i = [0 : len(labels) - 1])
    translate([(i % per_row) * (label_w + spacing), -floor(i / per_row) * (label_h + spacing), 0]) {
        if (part != "text") base();
        if (part != "base") raised_text(labels[i]);
    }
