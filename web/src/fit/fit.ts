// Find the smallest parts tray that holds a set of items. A port of fit.py, with a free layout added.
//
// For each tray size, the packer tries two approaches and keeps the better plan:
// a grid, where merged grid units give each item its own compartment, and a free
// layout of rectangles (free.ts). A loose item puts all of its count into one
// compartment. Then the model checks the result.

import {
  HEIGHTS, LENGTHS, WIDTHS, compAt, inspect, key,
  type Area, type Length, type TrayInfo, type TraySpec, type Width,
} from "../tray/tray";
import { freePack } from "./free";
import { CLEARANCE, FILL, fill, fits, spread, type Item } from "./room";

const NODE_LIMIT = 4000;   // packer steps for one grid
const MAX_GRID = 12;       // most grid units in each direction that the packer tries
export const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** An item in a compartment: item index, front left unit, and units wide and long. In a free layout, compartment i is col i, row 0. */
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
  layout: Area[];   // a free layout, or empty for a grid
  spread: number;   // of the fill heights
  volume: number;
}

export interface Found {
  plan: Plan;
  spec: TraySpec;
  info: TrayInfo;
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

  size(c: number, r: number, a: number, b: number): [number, number, number] {
    const k = this.info.fit;
    const x0 = -this.info.width / 2 + k.wall + c * (this.cw + k.divT);
    const wide = a * this.cw + (a - 1) * k.divT;
    const behind = this.pull && x0 < this.pw / 2 + k.wall - 0.01 && x0 + wide > -this.pw / 2 - k.wall + 0.01;
    // Pockets in front of and behind this compartment
    const hits = behind ? Number(r === 0) + Number(r + b === this.rows) : 0;
    return [wide, b * this.cd + (b - 1) * k.divT - hits * k.cut, hits];
  }
}

/** Place each item in its own compartment on the grid. Return the places, or null. */
function pack(items: Item[], grid: Grid, cap = 1): Place[] | null {
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
          const [wide, long, hits] = grid.size(c, r, a, b);
          const room = `${i},${a},${b},${hits}`;
          if (!rooms.has(room)) {
            const guided = k.guideP > 0 && wide >= k.guideW && long >= k.minCell;
            rooms.set(room, fits(items[i], wide, long, depth, guided, k, cap));
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

/** How full each compartment is, from the floor to the lid: 0 to 1. */
function fills(places: Place[], items: Item[], grid: Grid) {
  return places.map((p) => {
    const [wide, long] = grid.size(p.col, p.row, p.cols, p.rows);
    return fill(items[p.item], wide, long, grid.info.depth);
  });
}

const CAPS = [0.8, 0.6, 0.4];   // lower pile limits that the packer tries, to give large piles more room
const NEAR = 0.05;              // plans with a spread this close to the lowest count as equal

/**
 * The best grid for one tray size. In each grid, large piles take spare units until a lower
 * pile limit does not pack. Then the grids with the most equal fill heights compete: a low
 * compartment next to a full one wastes room. Of those, the fewest merges win, then the
 * widest units, so that fingers can reach into the compartments.
 */
function bestGrid(info: TrayInfo, length: Length, width: Width, items: Item[], pull: boolean): Plan | null {
  const plans: { plan: Plan; merges: number; reach: number }[] = [];
  for (let cols = 1; cols <= MAX_GRID; cols++) {
    for (let rows = 1; rows <= MAX_GRID; rows++) {
      const grid = new Grid(info, cols, rows, pull);
      if (!grid.valid()) continue;
      let places = pack(items, grid);
      if (!places) continue;
      for (const cap of CAPS) {
        const lower = pack(items, grid, cap);
        if (!lower) break;
        places = lower;
      }
      plans.push({
        plan: { length, width, height: info.height, cols, rows, places, layout: [], spread: spread(fills(places, items, grid)),
                volume: info.width * info.length * info.height },
        merges: places.filter((p) => p.cols * p.rows > 1).length,
        reach: Math.min(grid.cw, grid.cd),
      });
    }
  }
  if (!plans.length) return null;
  const lowest = Math.min(...plans.map((p) => p.plan.spread));
  return plans.filter((p) => p.plan.spread <= lowest + NEAR)
    .sort((a, b) => a.merges - b.merges || b.reach - a.reach)[0].plan;
}

/** The best plan for one tray size. A grid is tidier, so a free layout must have clearly more even fill heights. */
function bestPlan(info: TrayInfo, length: Length, width: Width, items: Item[], pull: boolean): Plan | null {
  const grid = bestGrid(info, length, width, items, pull);
  const free = freePack(info, items, pull);
  if (!free || (grid && grid.spread <= free.spread + NEAR)) return grid;
  return {
    length, width, height: info.height, cols: 1, rows: 1, layout: free.layout, spread: free.spread,
    places: free.items.map((item, i) => ({ item, col: i, row: 0, cols: 1, rows: 1 })),
    volume: info.width * info.length * info.height,
  };
}

function specFor(plan: Plan, pull: boolean, guides: boolean): TraySpec {
  return {
    length: plan.length, width: plan.width, height: plan.height, cols: plan.cols, rows: plan.rows,
    merges: plan.places.filter((p) => p.cols * p.rows > 1).map(({ col, row, cols, rows }) => ({ col, row, cols, rows })),
    layout: plan.layout, pull, guides, labels: {}, title: "", name: "",
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
    info = inspect({ length, width, height, cols: 1, rows: 1, merges: [], layout: [], pull, guides, labels: {}, title: "", name: "" });
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

/** True if some grid or free layout of the tray holds the items. It stops at the first one that packs. */
function holds(info: TrayInfo, items: Item[], pull: boolean) {
  for (let cols = 1; cols <= MAX_GRID; cols++) {
    for (let rows = 1; rows <= MAX_GRID; rows++) {
      const grid = new Grid(info, cols, rows, pull);
      if (grid.valid() && pack(items, grid)) return true;
    }
  }
  return freePack(info, items, pull, true) !== null;
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
