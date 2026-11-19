// The items, and the test that an item fits in one compartment. The grid packer
// and the free packer both use it. The sizes follow parts-tray.scad.
//
// An item that sits on the floor rides up the floor fillets and the front scoop,
// so the test adds that lift to its height.

import type { FitConstants } from "../tray/tray";

const TOP_GAP = 0.5;          // between the top of an item and the lid, mm
export const FILL = 0.5;      // loose items: the part of the compartment volume that a pile fills
export const CLEARANCE = 1;   // extra room for each item in width and in length, mm
export const REACH = 30;      // shortest side of a compartment that fingers can reach into, mm

export interface Item {
  name: string;
  w: number;
  l: number;
  h: number;
  count: number;
  loose: boolean;   // all of them in one compartment, in a pile
  reach?: boolean;  // no compartment side shorter than REACH. Without a value, it is on.
  off?: boolean;    // the user turned it off: the search leaves it out
}

/** True if the compartments of this item need room for fingers. */
export const needsReach = (item: Item) => item.reach ?? true;

/** Height of a floor fillet of radius r at this distance from its wall. */
function rise(gap: number, r: number) {
  const g = Math.max(gap, 0);
  return g >= r ? 0 : r - Math.sqrt(r * r - (r - g) ** 2);
}

/** How far an item w x l sits above the floor in a compartment, or null if it does not fit. */
function lift(w: number, l: number, roomW: number, roomL: number, depth: number, guided: boolean, k: FitConstants) {
  const back = guided ? k.guideP : 0;
  const freeW = roomW - w, freeL = roomL - back - l;
  if (freeW < 0 || freeL < 0) return null;
  const rc = Math.min(k.rCell, roomW / 2 - 0.1, roomL / 2 - 0.1);
  const sr = Math.min(k.scoopR, roomL / 2, depth - k.grooveH);
  const side = freeW / 2;
  // The item corner clears the rounded vertical corner
  const cornerOk = (gap: number) => side >= rc || gap >= rc || (rc - side) ** 2 + (rc - gap) ** 2 <= rc * rc;
  let best: number | null = null;
  for (let step = 0; step <= 40; step++) {   // where the item sits between the front and the back
    const front = (freeL * step) / 40;
    const rear = freeL - front + back;
    if (cornerOk(front) && cornerOk(rear)) {
      const up = Math.max(rise(front, sr), rise(rear, rc), rise(side, rc));
      best = best === null ? up : Math.min(best, up);
    }
  }
  return best;
}

/** Height of a loose pile spread over a compartment w x l, mm. The 3 mm keeps the pile off the rounded walls. */
export function pileHeight(item: Item, w: number, l: number) {
  return (item.count * item.w * item.l * item.h) / FILL / ((w - 3) * (l - 3));
}

/** How full a compartment is, from the floor to the lid: 0 to 1. One item fills it to its own height. */
export function fill(item: Item, w: number, l: number, depth: number) {
  return Math.min(1, (item.loose ? pileHeight(item, w, l) : item.h) / depth);
}

/** Spread of fill heights: the standard deviation. 0 is a tray with all compartments filled to the same height. */
export function spread(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

/**
 * True if the item fits in either direction. For a loose item, the pile must also fit.
 * A cap below 1 lets a pile use only that part of the room. The packers use it to spread large piles.
 */
export function fits(item: Item, roomW: number, roomL: number, depth: number, guided: boolean, k: FitConstants, cap = 1) {
  if (needsReach(item) && Math.min(roomW, roomL) < REACH) return false;
  let one = item;
  if (item.loose) {
    // Volume under the lid, less the label guides and the front scoop
    const sr = Math.min(k.scoopR, roomL / 2, depth - k.grooveH);
    const room = roomW * ((roomL - (guided ? k.guideP : 0)) * (depth - TOP_GAP) - sr * sr * (1 - Math.PI / 4));
    if (room * FILL * cap < item.count * item.w * item.l * item.h) return false;
    const [low, mid, high] = [item.w, item.l, item.h].sort((a, b) => a - b);
    one = { ...item, w: mid, l: high, h: low, count: 1 };   // one item, on its largest face
  }
  for (const [w, l] of [[one.w, one.l], [one.l, one.w]]) {
    const up = lift(w + CLEARANCE, l + CLEARANCE, roomW, roomL, depth, guided, k);
    if (up !== null && one.h + up + TOP_GAP <= depth) return true;
  }
  return false;
}
