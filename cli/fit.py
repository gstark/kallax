#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10,<3.14"
# dependencies = []
# ///
"""Find the smallest parts tray that holds a set of items.

  just fit 46x42x18@3 30x42x18@5
  just fit "2 jacks=46x42x18@3" "1 jack=30x42x18@5"
  just fit "WAGO 2=12.4x20.5x14.5@50,loose"

An item is WIDTHxLENGTHxHEIGHT in mm, with an optional @COUNT and an optional
NAME= in front. The name becomes the label of its compartments. Measure each
item at its largest point. An item can turn 90 degrees, but it stays flat.
Each item gets its own compartment.

Add ,loose after the count for small parts in a pile. All of them go into one
compartment. The compartment must hold their volume at the --fill fraction, and
one item must fit in it on its largest face.

The packer tries each tray size and grid, and merges grid units so that each
item gets its own compartment. An item that sits on the floor rides up the
floor fillets and the front scoop, so the packer adds that lift to its height.
Then the model checks the result. The best trays print with the command that
opens them in the tray editor.
"""

import argparse
import math
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from common import ModelError
from tray_model import HEIGHTS, LENGTHS, WIDTHS, Spec, inspect

TOP_GAP = 0.5        # between the top of an item and the lid, mm
NODE_LIMIT = 4000    # packer steps for one grid
MAX_GRID = 12        # most grid units in each direction that the packer tries
LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"


@dataclass
class Item:
    name: str
    w: float
    l: float
    h: float
    count: int
    loose: bool = False   # all of them in one compartment, in a pile
    fill: float = 0.5     # loose: the part of the compartment volume that the pile fills


@dataclass
class Plan:
    length: str
    width: str
    height: float
    cols: int
    rows: int
    places: list        # (item index, col, row, cols wide, rows long)
    volume: float

    def spec(self, items, pull, guides):
        merges = [(c, r, a, b) for _, c, r, a, b in self.places if a * b > 1]
        labels = {(c, r): items[i].name[:16] for i, c, r, _, _ in self.places if items[i].name}
        return Spec(length=self.length, width=self.width, height=self.height, cols=self.cols, rows=self.rows,
                    merges=merges, pull=pull, guides=guides, labels=labels)


def item_arg(text):
    m = re.fullmatch(r"(?:(.+)=)?([\d.]+)x([\d.]+)x([\d.]+)(?:@(\d+))?(,loose)?", text.strip())
    if not m:
        raise argparse.ArgumentTypeError("use [NAME=]WxLxH[@COUNT][,loose], for example 46x42x18@3 or 12x20x14@50,loose")
    name, w, l, h, n, loose = m.groups()
    return Item(name or "", float(w), float(l), float(h), int(n or 1), bool(loose))


def rise(gap, r):
    """Height of a floor fillet of radius r at this distance from its wall."""
    gap = max(gap, 0)
    return 0 if gap >= r else r - math.sqrt(r * r - (r - gap) ** 2)


def lift(w, l, room_w, room_l, depth, guided, k):
    """How far an item w x l sits above the floor in a compartment, or None if it does not fit.

    The compartment has rounded vertical corners and floor edges (r_cell) and
    a scoop at the front (scoop_r). Label guides take guide_p at the back.
    """
    back = k["guide_p"] if guided else 0
    free_w, free_l = room_w - w, room_l - back - l
    if free_w < 0 or free_l < 0:
        return None
    rc = min(k["r_cell"], room_w / 2 - 0.1, room_l / 2 - 0.1)
    sr = min(k["scoop_r"], room_l / 2, depth - k["groove_h"])
    side = free_w / 2

    def corner_ok(gap):   # the item corner clears the rounded vertical corner
        return side >= rc or gap >= rc or (rc - side) ** 2 + (rc - gap) ** 2 <= rc * rc

    best = None
    for step in range(41):   # where the item sits between the front and the back
        front = free_l * step / 40
        rear = free_l - front + back
        if corner_ok(front) and corner_ok(rear):
            up = max(rise(front, sr), rise(rear, rc), rise(side, rc))
            best = up if best is None else min(best, up)
    return best


class Grid:
    """The compartments of one tray grid. The formulas follow parts-tray.scad. The model checks the result."""

    def __init__(self, info, cols, rows, pull):
        k = self.k = info.fit
        self.info, self.cols, self.rows = info, cols, rows
        self.cw = (info.width - 2 * k["wall"] - (cols - 1) * k["div_t"]) / cols
        self.cd = (info.length - 2 * k["wall"] - (rows - 1) * k["div_t"]) / rows
        snap = self.cw + 2 * k["div_t"] - 2 * k["wall"]
        self.pw = 0 if not pull else snap if cols % 2 and 20 <= snap <= 32 else k["pull_w0"]
        self.pull = pull

    def valid(self):
        return min(self.cw, self.cd) >= self.k["min_cell"]

    def size(self, c, r, a, b):
        k = self.k
        x0 = -self.info.width / 2 + k["wall"] + c * (self.cw + k["div_t"])
        wide = a * self.cw + (a - 1) * k["div_t"]
        behind = self.pull and x0 < self.pw / 2 + k["wall"] - 0.01 and x0 + wide > -self.pw / 2 - k["wall"] + 0.01
        hits = behind * ((r == 0) + (r + b == self.rows))   # pockets in front of and behind this compartment
        return wide, b * self.cd + (b - 1) * k["div_t"] - hits * k["cut"], hits


def fits(item, room_w, room_l, depth, guided, k, clearance):
    """True if the item fits in either direction. For loose items, the pile must also fit."""
    if item.loose:
        # Volume under the lid, less the label guides and the front scoop
        sr = min(k["scoop_r"], room_l / 2, depth - k["groove_h"])
        room = room_w * ((room_l - (k["guide_p"] if guided else 0)) * (depth - TOP_GAP) - sr * sr * (1 - math.pi / 4))
        if room * item.fill < item.count * item.w * item.l * item.h:
            return False
        low, mid, high = sorted((item.w, item.l, item.h))
        item = Item(item.name, mid, high, low, 1)   # one item, on its largest face
    for w, l in ((item.w, item.l), (item.l, item.w)):
        up = lift(w + clearance, l + clearance, room_w, room_l, depth, guided, k)
        if up is not None and item.h + up + TOP_GAP <= depth:
            return True
    return False


def pack(items, grid, clearance):
    """Place each item in its own compartment on the grid. Return the places, or None."""
    k, depth, cols, rows = grid.k, grid.info.depth, grid.cols, grid.rows
    rooms, options = {}, {}

    def choices(i, c, r):
        """The smallest merges that hold item i with its front left unit at c, r."""
        if (i, c, r) not in options:
            found = []
            for a in range(1, cols - c + 1):
                for b in range(1, rows - r + 1):
                    if any(a2 <= a and b2 <= b for a2, b2 in found):
                        continue
                    wide, long, hit = grid.size(c, r, a, b)
                    if (i, a, b, hit) not in rooms:
                        guided = k["guide_p"] > 0 and wide >= k["guide_w"] and long >= k["min_cell"]
                        rooms[i, a, b, hit] = fits(items[i], wide, long, depth, guided, k, clearance)
                    if rooms[i, a, b, hit]:
                        found.append((a, b))
            options[i, c, r] = found
        return options[i, c, r]

    # Fewest units for each item anywhere on the grid: a lower bound for the search
    least = [min((a * b for c in range(cols) for r in range(rows) for a, b in choices(i, c, r)), default=None)
             for i in range(len(items))]
    if None in least:
        return None

    used = [[False] * rows for _ in range(cols)]
    left = [1 if it.loose else it.count for it in items]
    places, steps = [], [0]

    def free(c, r, a, b):
        return all(not used[x][y] for x in range(c, c + a) for y in range(r, r + b))

    def mark(c, r, a, b, value):
        for x in range(c, c + a):
            for y in range(r, r + b):
                used[x][y] = value

    def search(start):
        if not any(left):
            return True
        steps[0] += 1
        if steps[0] > NODE_LIMIT:
            return False
        if sum(not u for col in used for u in col) < sum(n * u for n, u in zip(left, least)):
            return False
        p = start
        while p < cols * rows and used[p % cols][p // cols]:
            p += 1
        if p == cols * rows:
            return False
        c, r = p % cols, p // cols
        for i in sorted(range(len(items)), key=lambda j: -least[j]):
            if not left[i]:
                continue
            for a, b in choices(i, c, r):
                if free(c, r, a, b):
                    mark(c, r, a, b, True)
                    left[i] -= 1
                    places.append((i, c, r, a, b))
                    if search(p + 1):
                        return True
                    places.pop()
                    left[i] += 1
                    mark(c, r, a, b, False)
        used[c][r] = True   # leave this unit empty
        done = search(p + 1)
        used[c][r] = False
        return done

    return list(places) if search(0) else None


def best_plan(info, length, width, items, pull, clearance):
    """The best grid for one tray size: fewest merges, then fewest grid units."""
    best = None
    for cols in range(1, MAX_GRID + 1):
        for rows in range(1, MAX_GRID + 1):
            grid = Grid(info, cols, rows, pull)
            if not grid.valid():
                continue
            places = pack(items, grid, clearance)
            if places is None:
                continue
            score = (sum(1 for p in places if p[3] * p[4] > 1), cols * rows)
            if best is None or score < best[0]:
                best = (score, Plan(length, width, info.height, cols, rows, places,
                                    info.width * info.length * info.height))
    return best and best[1]


def check(plan, items, pull, guides, clearance):
    """Ask the model for the real compartments. Return the spec, or None if an item does not fit."""
    spec = plan.spec(items, pull, guides)
    try:
        info = inspect(spec)
    except ModelError:
        return None
    spec.labels = {}
    for i, c, r, _, _ in plan.places:
        comp = next(k for k in info.comps if k.col <= c < k.col + k.cols and k.row <= r < k.row + k.rows)
        if not (comp.usable and fits(items[i], comp.width, comp.length, info.depth, comp.guided, info.fit,
                                      clearance)):
            return None
        if items[i].name:   # a short front unit can join the unit behind it
            spec.labels[comp.col, comp.row] = items[i].name[:16]
    return spec


def find(items, pull=True, guides=True, clearance=1.0, heights=HEIGHTS, show=3):
    """The smallest trays that hold the items, as (plan, spec) pairs. The model checked each one."""
    sizes = [(length, width, height) for length in LENGTHS for width in WIDTHS for height in heights]
    with ThreadPoolExecutor(8) as pool:
        infos = list(pool.map(lambda s: inspect(Spec(length=s[0], width=s[1], height=s[2], cols=1, rows=1,
                                                     pull=pull, guides=guides)), sizes))

    def plan_for(pair):
        (length, width, _), info = pair
        return best_plan(info, length, width, items, pull, clearance)

    with ThreadPoolExecutor(8) as pool:
        plans = [p for p in pool.map(plan_for, zip(sizes, infos)) if p]
    lowest = {}   # a taller tray of the same size is worse
    for p in sorted(plans, key=lambda p: p.height):
        lowest.setdefault((p.length, p.width), p)
    found = []
    for plan in sorted(lowest.values(), key=lambda p: p.volume):
        spec = check(plan, items, pull, guides, clearance)
        if spec is not None:
            found.append((plan, spec))
            if len(found) == show:
                break
    return found


def describe(item):
    return (f"{item.count} × {item.w:g} × {item.l:g} × {item.h:g} mm"
            f"{', loose in one compartment' if item.loose else ''}")


def title(plan, spec):
    return (f"{plan.length} length, {plan.width} width, {plan.height:g} mm high: "
            f"a {plan.cols} × {plan.rows} grid with {len(spec.merges)} merges")


def tray_map(plan):
    """The top view as lines of item letters, back row first."""
    grid = [["·"] * plan.cols for _ in range(plan.rows)]
    for i, c, r, a, b in plan.places:
        for x in range(c, c + a):
            for y in range(r, r + b):
                grid[y][x] = LETTERS[i]
    return ["back", *(" ".join(row) for row in reversed(grid)), "front"]


def main():
    ap = argparse.ArgumentParser(description="Find the smallest parts tray that holds a set of items, "
                                             "one item in each compartment.")
    ap.add_argument("items", nargs="+", type=item_arg, metavar="[NAME=]WxLxH[@COUNT]",
                    help="item size in mm at its largest point, for example 46x42x18@3. "
                         "Add ,loose to put all of them in one compartment")
    ap.add_argument("--clearance", type=float, default=1.0,
                    help="extra room for each item in width and in length, in mm (default: 1)")
    ap.add_argument("--pull", action=argparse.BooleanOptionalAction, default=True,
                    help="finger pockets in the front end and the back end (default: on)")
    ap.add_argument("--guides", action=argparse.BooleanOptionalAction, default=True,
                    help="label guides on the back wall of each compartment (default: on)")
    ap.add_argument("--fill", type=float, default=0.5,
                    help="loose items: the part of the compartment volume that a pile fills (default: 0.5)")
    ap.add_argument("--height", type=float, action="append", choices=HEIGHTS,
                    help="try only this tray height. You can use this option more than once (default: all)")
    ap.add_argument("--show", type=int, default=3, help="how many trays to show (default: 3)")
    args = ap.parse_args()
    items = args.items
    for it in items:
        it.fill = args.fill
    if len(items) > len(LETTERS):
        sys.exit(f"Error: use {len(LETTERS)} item sizes or fewer")

    found = find(items, args.pull, args.guides, args.clearance, args.height or HEIGHTS, args.show)
    print(f"{sum(it.count for it in items)} items in {len(items)} sizes:")
    for i, it in enumerate(items):
        print(f"  {LETTERS[i]}  {describe(it)}  {it.name}")
    print()
    for n, (plan, spec) in enumerate(found, 1):
        print(f"{n}. {title(plan, spec)}")
        for line in tray_map(plan):
            print(f"     {line}")
        print(f"   {spec.command().replace(' -y', '', 1)}")
        print()
    if not found:
        sys.exit("No single tray holds these items. Split them into two or more sets.")


if __name__ == "__main__":
    main()
