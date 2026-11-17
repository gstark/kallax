// Find the smallest parts tray that holds a set of items. A port of fit.py.
//
// The packer tries each tray size and grid, and merges grid units so that each
// item gets its own compartment. A loose item puts all of its count into one
// compartment. An item that sits on the floor rides up the floor fillets and the
// front scoop, so the packer adds that lift to its height. Then the model checks
// the result.

import {
  HEIGHTS, LENGTHS, WIDTHS, compAt, inspect, key,
  type FitConstants, type Length, type TrayInfo, type TraySpec, type Width,
} from "../tray/tray";

const TOP_GAP = 0.5;       // between the top of an item and the lid, mm
const NODE_LIMIT = 4000;   // packer steps for one grid
const MAX_GRID = 12;       // most grid units in each direction that the packer tries
export const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const FILL = 0.5;   // loose items: the part of the compartment volume that a pile fills
export const CLEARANCE = 1;   // extra room for each item in width and in length, mm

export interface Item {
  name: string;
  w: number;
  l: number;
  h: number;
  count: number;
  loose: boolean;   // all of them in one compartment, in a pile
  off?: boolean;    // the user turned it off: the search leaves it out
}

/** An item in a compartment: item index, front left unit, and units wide and long. */
export interface Place {
  item: number;
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export interface Plan {
  length: Length;
  width: Width;
  height: number;
  cols: number;
  rows: number;
  places: Place[];
  volume: number;
}

export interface Found {
  plan: Plan;
  spec: TraySpec;
  info: TrayInfo;
}

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

/** True if the item fits in either direction. For a loose item, the pile must also fit. */
export function fits(item: Item, roomW: number, roomL: number, depth: number, guided: boolean, k: FitConstants) {
  let one = item;
  if (item.loose) {
    // Volume under the lid, less the label guides and the front scoop
    const sr = Math.min(k.scoopR, roomL / 2, depth - k.grooveH);
    const room = roomW * ((roomL - (guided ? k.guideP : 0)) * (depth - TOP_GAP) - sr * sr * (1 - Math.PI / 4));
    if (room * FILL < item.count * item.w * item.l * item.h) return false;
    const [low, mid, high] = [item.w, item.l, item.h].sort((a, b) => a - b);
    one = { ...item, w: mid, l: high, h: low, count: 1 };   // one item, on its largest face
  }
  for (const [w, l] of [[one.w, one.l], [one.l, one.w]]) {
    const up = lift(w + CLEARANCE, l + CLEARANCE, roomW, roomL, depth, guided, k);
    if (up !== null && one.h + up + TOP_GAP <= depth) return true;
  }
  return false;
}

/** The compartments of one tray grid. The formulas follow parts-tray.scad. The model checks the result. */
class Grid {
  readonly cw: number;
  readonly cd: number;
  private readonly pw: number;

  constructor(readonly info: TrayInfo, readonly cols: number, readonly rows: number, private readonly pull: boolean) {
    const k = info.fit;
    this.cw = (info.width - 2 * k.wall - (cols - 1) * k.divT) / cols;
    this.cd = (info.length - 2 * k.wall - (rows - 1) * k.divT) / rows;
    const snap = this.cw + 2 * k.divT - 2 * k.wall;
    this.pw = !pull ? 0 : cols % 2 && snap >= 20 && snap <= 32 ? snap : k.pullW0;
  }

  valid() {
    return Math.min(this.cw, this.cd) >= this.info.fit.minCell;
  }

  size(c: number, r: number, a: number, b: number): [number, number, boolean] {
    const k = this.info.fit;
    const x0 = -this.info.width / 2 + k.wall + c * (this.cw + k.divT);
    const wide = a * this.cw + (a - 1) * k.divT;
    const hit = this.pull && r === 0 && x0 < this.pw / 2 + k.wall - 0.01 && x0 + wide > -this.pw / 2 - k.wall + 0.01;
    return [wide, b * this.cd + (b - 1) * k.divT - (hit ? k.cut : 0), hit];
  }
}

/** Place each item in its own compartment on the grid. Return the places, or null. */
function pack(items: Item[], grid: Grid): Place[] | null {
  const { cols, rows } = grid;
  const k = grid.info.fit, depth = grid.info.depth;
  const rooms = new Map<string, boolean>();
  const options = new Map<string, [number, number][]>();

  // The smallest merges that hold item i with its front left unit at c, r
  const choices = (i: number, c: number, r: number) => {
    const id = `${i},${c},${r}`;
    let found = options.get(id);
    if (!found) {
      found = [];
      for (let a = 1; a <= cols - c; a++) {
        for (let b = 1; b <= rows - r; b++) {
          if (found.some(([a2, b2]) => a2 <= a && b2 <= b)) continue;
          const [wide, long, hit] = grid.size(c, r, a, b);
          const room = `${i},${a},${b},${hit}`;
          if (!rooms.has(room)) {
            const guided = k.guideP > 0 && wide >= k.guideW && long >= k.minCell;
            rooms.set(room, fits(items[i], wide, long, depth, guided, k));
          }
          if (rooms.get(room)) found.push([a, b]);
        }
      }
      options.set(id, found);
    }
    return found;
  };

  // Fewest units for each item anywhere on the grid: a lower bound for the search
  const least = items.map((_, i) => {
    let min = Infinity;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) for (const [a, b] of choices(i, c, r)) min = Math.min(min, a * b);
    return min;
  });
  if (least.some((n) => n === Infinity)) return null;

  const used = Array.from({ length: cols }, () => new Array<boolean>(rows).fill(false));
  const left = items.map((it) => (it.loose ? 1 : it.count));
  const order = items.map((_, i) => i).sort((a, b) => least[b] - least[a]);
  const places: Place[] = [];
  let steps = 0;
  let open = cols * rows;

  const free = (c: number, r: number, a: number, b: number) => {
    for (let x = c; x < c + a; x++) for (let y = r; y < r + b; y++) if (used[x][y]) return false;
    return true;
  };
  const mark = (c: number, r: number, a: number, b: number, value: boolean) => {
    for (let x = c; x < c + a; x++) for (let y = r; y < r + b; y++) used[x][y] = value;
    open += value ? -a * b : a * b;
  };

  const search = (start: number): boolean => {
    if (left.every((n) => n === 0)) return true;
    if (++steps > NODE_LIMIT) return false;
    if (open < left.reduce((sum, n, i) => sum + n * least[i], 0)) return false;
    let p = start;
    while (p < cols * rows && used[p % cols][Math.floor(p / cols)]) p++;
    if (p === cols * rows) return false;
    const c = p % cols, r = Math.floor(p / cols);
    for (const i of order) {
      if (!left[i]) continue;
      for (const [a, b] of choices(i, c, r)) {
        if (!free(c, r, a, b)) continue;
        mark(c, r, a, b, true);
        left[i]--;
        places.push({ item: i, col: c, row: r, cols: a, rows: b });
        if (search(p + 1)) return true;
        places.pop();
        left[i]++;
        mark(c, r, a, b, false);
      }
    }
    mark(c, r, 1, 1, true);   // leave this unit empty
    const done = search(p + 1);
    mark(c, r, 1, 1, false);
    return done;
  };

  return search(0) ? [...places] : null;
}

/** The best grid for one tray size: fewest merges, then fewest grid units. */
function bestPlan(info: TrayInfo, length: Length, width: Width, items: Item[], pull: boolean): Plan | null {
  let best: { score: [number, number]; plan: Plan } | null = null;
  for (let cols = 1; cols <= MAX_GRID; cols++) {
    for (let rows = 1; rows <= MAX_GRID; rows++) {
      const grid = new Grid(info, cols, rows, pull);
      if (!grid.valid()) continue;
      const places = pack(items, grid);
      if (!places) continue;
      const score: [number, number] = [places.filter((p) => p.cols * p.rows > 1).length, cols * rows];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
        best = { score, plan: { length, width, height: info.height, cols, rows, places,
                                volume: info.width * info.length * info.height } };
      }
    }
  }
  return best?.plan ?? null;
}

function specFor(plan: Plan, pull: boolean, guides: boolean): TraySpec {
  return {
    length: plan.length, width: plan.width, height: plan.height, cols: plan.cols, rows: plan.rows,
    merges: plan.places.filter((p) => p.cols * p.rows > 1).map(({ col, row, cols, rows }) => ({ col, row, cols, rows })),
    pull, guides, labels: {}, title: "", name: "",
  };
}

/** Ask the model for the real compartments. Return the result, or null if an item does not fit. */
async function check(plan: Plan, items: Item[], pull: boolean, guides: boolean): Promise<Found | null> {
  const spec = specFor(plan, pull, guides);
  let info: TrayInfo;
  try {
    info = await inspect(spec);
  } catch {
    return null;
  }
  for (const p of plan.places) {
    const comp = compAt(info, p.col, p.row);
    if (!comp?.usable || !fits(items[p.item], comp.width, comp.length, info.depth, comp.guided, info.fit)) return null;
    // A short front unit can join the unit behind it, so the label goes on the compartment
    if (items[p.item].name) spec.labels[key(comp.col, comp.row)] = items[p.item].name.slice(0, 16);
  }
  return { plan, spec, info };
}

const pause = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => setTimeout(() => {
  if (signal?.aborted) reject(signal.reason);
  else resolve();
}, 0));

// The model sizes of the empty trays. They do not change, so the page asks the model once for each.
const bases = new Map<string, Promise<TrayInfo>>();
function base(length: Length, width: Width, height: number, pull: boolean, guides: boolean): Promise<TrayInfo> {
  const id = `${length},${width},${height},${pull},${guides}`;
  let info = bases.get(id);
  if (!info) {
    info = inspect({ length, width, height, cols: 1, rows: 1, merges: [], pull, guides, labels: {}, title: "", name: "" });
    info.catch(() => bases.delete(id));
    bases.set(id, info);
  }
  return info;
}

interface Options {
  pull?: boolean;
  guides?: boolean;
  heights?: number[];
  show?: number;
  signal?: AbortSignal;
}

/** The smallest trays that hold the items, smallest first. The model checked each one. */
export async function find(items: Item[], { pull = true, guides = true, heights = HEIGHTS, show = 3, signal }: Options = {}): Promise<Found[]> {
  const sizes = LENGTHS.flatMap((length) => WIDTHS.flatMap((width) => heights.map((height) => ({ length, width, height }))));
  const infos = await Promise.all(sizes.map((s) => base(s.length, s.width, s.height, pull, guides)));
  const plans: Plan[] = [];
  for (const [i, s] of sizes.entries()) {
    const plan = bestPlan(infos[i], s.length, s.width, items, pull);
    if (plan) plans.push(plan);
    await pause(signal);   // keep the page responsive between tray sizes
  }
  // A taller tray of the same size is worse
  const lowest = new Map<string, Plan>();
  for (const p of [...plans].sort((a, b) => a.height - b.height)) {
    if (!lowest.has(`${p.length},${p.width}`)) lowest.set(`${p.length},${p.width}`, p);
  }
  const found: Found[] = [];
  for (const plan of [...lowest.values()].sort((a, b) => a.volume - b.volume)) {
    const result = await check(plan, items, pull, guides);
    signal?.throwIfAborted();
    if (result) found.push(result);
    if (found.length === show) break;
  }
  return found;
}

/** True if some grid of the tray holds the items. It stops at the first grid that packs. */
function holds(info: TrayInfo, items: Item[], pull: boolean) {
  for (let cols = 1; cols <= MAX_GRID; cols++) {
    for (let rows = 1; rows <= MAX_GRID; rows++) {
      const grid = new Grid(info, cols, rows, pull);
      if (grid.valid() && pack(items, grid)) return true;
    }
  }
  return false;
}

/** About how much floor an item needs, mm². It sets the order in which the best fit tries the items. */
function floorArea(item: Item, depth: number) {
  const [, mid, high] = [item.w, item.l, item.h].sort((a, b) => a - b);
  const one = (mid + CLEARANCE) * (high + CLEARANCE);
  return item.loose ? Math.max(one, (item.count * item.w * item.l * item.h) / FILL / depth) : item.count * one;
}

export interface Fit {
  picked: number[];   // indices of the items in the trays, in list order
  found: Found[];     // the smallest trays that hold the picked items, smallest first
  tooBig: number[];   // indices of the items that no tray holds, even alone
}

/**
 * The most items that one tray holds, and the smallest trays for them. Each item
 * goes in whole, with all of its count. The search adds the items from the
 * smallest to the largest, and keeps each one that still lets the largest tray
 * pack the set. Then it finds the smallest trays for the set.
 */
export async function bestFit(items: Item[], options: Options = {}): Promise<Fit> {
  const { pull = true, guides = true, heights = HEIGHTS, signal } = options;
  if (!items.length || !heights.length) return { picked: [], found: [], tooBig: [] };
  const largest = await base(LENGTHS[0], WIDTHS[0], Math.max(...heights), pull, guides);
  const pick = (list: number[]) => list.map((i) => items[i]);
  const all = items.map((_, i) => i);
  let picked: number[] = [];
  let tooBig: number[] = [];
  if (holds(largest, items, pull)) {
    picked = all;
  } else {
    tooBig = all.filter((i) => !holds(largest, [items[i]], pull));
    const order = all.filter((i) => !tooBig.includes(i)).sort((a, b) => floorArea(items[a], largest.depth) - floorArea(items[b], largest.depth));
    for (const i of order) {
      await pause(signal);
      if (holds(largest, pick([...picked, i]), pull)) picked.push(i);
    }
    picked.sort((a, b) => a - b);
  }
  // The model can reject the packer's trays. Then the largest item that went in last comes out again.
  while (picked.length) {
    const found = await find(pick(picked), options);
    if (found.length) return { picked, found, tooBig };
    const last = picked.reduce((a, b) => (floorArea(items[a], largest.depth) >= floorArea(items[b], largest.depth) ? a : b));
    picked = picked.filter((i) => i !== last);
  }
  return { picked, found: [], tooBig };
}
