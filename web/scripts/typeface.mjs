// Convert Barlow Condensed SemiBold to the three.js typeface format, for the 3D text
// in the preview. Only printable ASCII and "×" are kept, so the file stays small.
// The conversion follows TTFLoader in three/examples. Run: pnpm typeface
import { readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";

const SOURCE = "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff";
const OUT = "src/preview/barlow-condensed-600.typeface.json";
const KEEP = new Set([...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), "×"]);

const buffer = readFileSync(SOURCE);
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
const round = Math.round;
const glyphs = {};
for (const ch of KEEP) {
  const glyph = font.charToGlyph(ch);
  if (!glyph || glyph.index === 0) continue;
  let o = "";
  for (const c of glyph.path.commands) {
    o += (c.type.toLowerCase() === "c" ? "b" : c.type.toLowerCase()) + " ";
    if (c.x !== undefined) o += `${round(c.x * scale)} ${round(c.y * scale)} `;
    if (c.x1 !== undefined) o += `${round(c.x1 * scale)} ${round(c.y1 * scale)} `;
    if (c.x2 !== undefined) o += `${round(c.x2 * scale)} ${round(c.y2 * scale)} `;
  }
  const box = glyph.getBoundingBox();
  glyphs[ch] = { ha: round(glyph.advanceWidth * scale), x_min: round(box.x1 * scale), x_max: round(box.x2 * scale), o };
}
const head = font.tables.head;
writeFileSync(OUT, JSON.stringify({
  glyphs, familyName: "Barlow Condensed SemiBold",
  ascender: round(font.ascender * scale), descender: round(font.descender * scale),
  underlinePosition: font.tables.post.underlinePosition, underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { xMin: head.xMin, xMax: head.xMax, yMin: head.yMin, yMax: head.yMax }, resolution: 1000,
}));
console.log(`Wrote ${OUT}: ${Object.keys(glyphs).length} glyphs`);
