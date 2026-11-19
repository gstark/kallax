// The free packer: compartments are rectangles of any size on the tray floor.
//
// Each item gets a list of the smallest compartment shapes that hold it. A pile
// can be narrow and long, or wide and short. A rectangle packer (MaxRects) puts
// the compartments on the floor in many orders. Then each compartment grows into
// the free floor around it, the fullest compartment first. Of the layouts that
// pack, the one with the most even fill heights wins.
//
// Coordinates are mm from the front left corner of the inner floor, as the layout
// parameter of parts-tray.scad. The packer works in "inflated" space: each
// compartment takes its size plus one divider on its right side and its back side.

import type { Area, FitConstants, TrayInfo } from "../tray/tray";
import { fill, fits, needsReach, REACH, spread, type Item } from "./room";

interface Rect { x: number; y: number; w: number; l: number }
interface Comp extends Rect { piece: number }

interface Floor {
  W: number;
  L: number;
  depth: number;
  k: FitConstants;
  blocks: Rect[];   // the finger pockets, in inflated space
}

export interface FreePlan {
  layout: Area[];
  items: number[];   // the item in each compartment of the layout
  spread: number;
}

const STEP = 0.5;                    // size steps of the compartment shapes, mm
const CAPS = [1, 0.8, 0.6, 0.4];     // pile limits, as in the grid packer
const TRIES = 300;                   // random packing orders for each pile limit
const RULES = ["short", "area", "corner"] as const;
type Rule = (typeof RULES)[number];

function floorOf(info: TrayInfo, pull: boolean): Floor {
  const k = info.fit, d = k.divT;
  const W = info.width - 2 * k.wall, L = info.length - 2 * k.wall;
  // In a free layout, the pocket has the fixed width. A compartment can touch the pocket walls,
  // and a compartment end in line with the pocket stays cut mm from the end wall.
  const bx = W / 2 - k.pullW0 / 2 - k.wall, bw = k.pullW0 + 2 * k.wall;
  const blocks = pull ? [{ x: bx + d, y: 0, w: bw - d, l: k.cut }, { x: bx + d, y: L - k.cut + d, w: bw - d, l: k.cut }] : [];
  return { W, L, depth: info.depth, k, blocks };
}

const guided = (f: Floor, w: number, l: number) => f.k.guideP > 0 && w >= f.k.guideW && l >= f.k.minCell;
// The 0.02 mm is for the rounding of the layout to 0.01 mm
const least = (f: Floor, it: Item) => (needsReach(it) ? Math.max(f.k.minCell, REACH + 0.02) : f.k.minCell);
const ok = (f: Floor, it: Item, w: number, l: number, cap: number) =>
  w >= least(f, it) && l >= least(f, it) && fits(it, w, l, f.depth, guided(f, w, l), f.k, cap);

/** The smallest value from lo to hi that passes the test, in STEP steps, or null. The test must be monotonic. */
function smallest(lo: number, hi: number, test: (v: number) => boolean) {
  if (!test(hi)) return null;
  if (test(lo)) return lo;
  while (hi - lo > STEP) {
    const m = (lo + hi) / 2;
    if (test(m)) hi = m; else lo = m;
  }
  return Math.ceil(hi / STEP) * STEP;
}

const shapeCache = new Map<string, [number, number][]>();

/** The smallest compartment shapes for one item: each width with the shortest length that holds it. */
function shapes(f: Floor, it: Item, cap: number): [number, number][] {
  const id = JSON.stringify([it.w, it.l, it.h, it.count, it.loose, needsReach(it), f.W, f.L, f.depth, f.k, cap]);
  const cached = shapeCache.get(id);
  if (cached) return cached;
  const out: [number, number][] = [];
  for (let w = least(f, it); w < f.W + 1; w += 1) {
    const wide = Math.min(w, f.W);
    const l = smallest(least(f, it), f.L, (v) => ok(f, it, wide, v, cap));
    if (l === null || (out.length && l >= out[out.length - 1][1] - 0.01)) continue;
    // The narrowest width with this length
    out.push([smallest(least(f, it), wide, (v) => ok(f, it, v, l, cap)) ?? wide, l]);
  }
  shapeCache.set(id, out);
  return out;
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.l - 1e-6 && b.y < a.y + a.l - 1e-6;
const inside = (a: Rect, b: Rect) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.l <= b.y + b.l + 1e-6;

/** The free rectangles that are left after a rectangle is used. Each free rectangle is as large as possible. */
function cut(free: Rect[], used: Rect): Rect[] {
  const out: Rect[] = [];
  for (const f of free) {
    if (!overlap(f, used)) { out.push(f); continue; }
    if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, l: f.l });
    if (used.x + used.w < f.x + f.w) out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, l: f.l });
    if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, l: used.y - f.y });
    if (used.y + used.l < f.y + f.l) out.push({ x: f.x, y: used.y + used.l, w: f.w, l: f.y + f.l - used.y - used.l });
  }
  return out.filter((a, i) => !out.some((b, j) => j !== i && inside(a, b) && (!inside(b, a) || j < i)));
}

/** Put the pieces on the floor in this order. Return the compartments, or null if a piece has no room. */
function place(f: Floor, order: number[], options: [number, number][][], rule: Rule): Comp[] | null {
  const d = f.k.divT;
  let free: Rect[] = [{ x: 0, y: 0, w: f.W + d, l: f.L + d }];
  for (const b of f.blocks) free = cut(free, b);
  const comps: Comp[] = [];
  for (const p of order) {
    let best: { r: Rect; score: [number, number] } | null = null;
    for (const r of free) {
      for (const [w0, l0] of options[p]) {
        for (const [w, l] of [[w0, l0], [l0, w0]]) {
          if (w + d > r.w + 1e-6 || l + d > r.l + 1e-6) continue;
          const score: [number, number] = rule === "short" ? [Math.min(r.w - w, r.l - l), Math.max(r.w - w, r.l - l)]
            : rule === "area" ? [r.w * r.l - w * l, Math.min(r.w - w, r.l - l)]
            : [r.y, r.x];
          if (!best || score[0] < best.score[0] - 1e-9 || (Math.abs(score[0] - best.score[0]) < 1e-9 && score[1] < best.score[1])) {
            best = { r: { x: r.x, y: r.y, w, l }, score };
          }
        }
      }
    }
    if (!best) return null;
    comps.push({ ...best.r, piece: p });
    free = cut(free, { ...best.r, w: best.r.w + d, l: best.r.l + d });
  }
  return comps;
}

/** Grow the compartments into the free floor. The fullest compartment that can grow goes first. */
function grow(f: Floor, pieces: Item[], comps: Comp[]) {
  const d = f.k.divT;
  const box = (c: Rect): Rect => ({ x: c.x, y: c.y, w: c.w + d, l: c.l + d });
  // How far one side can move out before it meets another compartment, a pocket, or the wall.
  // Side 0 is right, 1 is left, 2 is back, 3 is front.
  const reach = (i: number, side: number) => {
    const c = box(comps[i]);
    const others = [...comps.filter((_, j) => j !== i).map(box), ...f.blocks];
    const acrossX = (o: Rect) => o.x < c.x + c.w - 1e-6 && c.x < o.x + o.w - 1e-6;
    const acrossY = (o: Rect) => o.y < c.y + c.l - 1e-6 && c.y < o.y + o.l - 1e-6;
    if (side === 0) return Math.min(f.W + d, ...others.filter((o) => acrossY(o) && o.x >= c.x + c.w - 1e-6).map((o) => o.x)) - (c.x + c.w);
    if (side === 1) return c.x - Math.max(0, ...others.filter((o) => acrossY(o) && o.x + o.w <= c.x + 1e-6).map((o) => o.x + o.w));
    if (side === 2) return Math.min(f.L + d, ...others.filter((o) => acrossX(o) && o.y >= c.y + c.l - 1e-6).map((o) => o.y)) - (c.y + c.l);
    return c.y - Math.max(0, ...others.filter((o) => acrossX(o) && o.y + o.l <= c.y + 1e-6).map((o) => o.y + o.l));
  };
  for (let n = 0; n < 50 * comps.length; n++) {
    let best: { i: number; side: number; r: number; gain: number; full: number } | null = null;
    for (const [i, c] of comps.entries()) {
      const full = fill(pieces[c.piece], c.w, c.l, f.depth);
      for (let side = 0; side < 4; side++) {
        const r = reach(i, side);
        if (r < 0.5) continue;
        const gain = r * (side < 2 ? c.l : c.w);
        if (!best || full > best.full + 1e-6 || (Math.abs(full - best.full) < 1e-6 && gain > best.gain)) best = { i, side, r, gain, full };
      }
    }
    if (!best) break;
    const c = comps[best.i];
    if (best.side === 0) c.w += best.r;
    else if (best.side === 1) { c.x -= best.r; c.w += best.r; }
    else if (best.side === 2) c.l += best.r;
    else { c.y -= best.r; c.l += best.r; }
  }
}

/** Round inward to 0.01 mm, so that the dividers stay at least div_t thick. */
function area(c: Rect): Area {
  const x = Math.ceil(c.x * 100) / 100, y = Math.ceil(c.y * 100) / 100;
  const size = (end: number, start: number) => Math.round((Math.floor(end * 100) / 100 - start) * 100) / 100;
  return [x, y, size(c.x + c.w, x), size(c.y + c.l, y)];
}

/**
 * A free layout for the items, or null. Each loose item is one compartment, and each other item
 * puts each of its count in a compartment of its own. With quick, the first layout that packs is
 * enough: it only shows that a layout exists.
 */
export function freePack(info: TrayInfo, items: Item[], pull: boolean, quick = false): FreePlan | null {
  const f = floorOf(info, pull);
  const owner = items.flatMap((it, i) => (it.loose ? [i] : Array.from({ length: it.count }, () => i)));
  const pieces = owner.map((i) => (items[i].loose ? items[i] : { ...items[i], count: 1 }));
  let best: { comps: Comp[]; spread: number } | null = null;
  for (const cap of quick ? [1] : CAPS) {
    const options = pieces.map((it) => shapes(f, it, cap));
    if (options.some((o) => !o.length)) break;
    const size = options.map((o) => Math.min(...o.map(([w, l]) => w * l)));
    const side = options.map((o) => Math.min(...o.map(([w, l]) => Math.max(w, l))));
    const all = pieces.map((_, i) => i);
    const orders = [
      [...all].sort((a, b) => size[b] - size[a]),
      [...all].sort((a, b) => side[b] - side[a]),
      [...all].sort((a, b) => side[b] * size[b] - side[a] * size[a]),
    ];
    // The same random orders each time, so that the same items give the same tray
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < TRIES; n++) {
      orders.push(all.map((i) => [i, size[i] * (0.5 + random())]).sort((a, b) => b[1] - a[1]).map(([i]) => i));
    }
    let packed = false;
    for (const order of orders) {
      for (const rule of RULES) {
        const comps = place(f, order, options, rule);
        if (!comps) continue;
        packed = true;
        if (quick) return { layout: comps.map(area), items: comps.map((c) => owner[c.piece]), spread: 0 };
        grow(f, pieces, comps);
        const s = spread(comps.map((c) => fill(pieces[c.piece], c.w, c.l, f.depth)));
        if (!best || s < best.spread) best = { comps, spread: s };
      }
    }
    if (!packed) break;
  }
  if (!best) return null;
  return { layout: best.comps.map(area), items: best.comps.map((c) => owner[c.piece]), spread: best.spread };
}
