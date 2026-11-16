// The parts tray: its spec, the model query, and the Bambu Studio project.
// This follows tray_model.py. All sizes come from parts-tray.scad.

import { readStl, type Mesh } from "../bambu3mf";
import { DRAFT, type Build, type Plate } from "../build";
import { ModelError, pool, render } from "../openscad";
import { BED, BODY_FILAMENT, TEXT_FILAMENT } from "../printer";

export const LENGTHS = ["full", "half", "quarter"] as const;
export const WIDTHS = ["full", "half"] as const;
export const HEIGHTS = [24, 32, 48, 96];   // these stack to fill the Kallas box
export const ROWS = { full: 8, half: 4, quarter: 2 } as const;
export const COLS = { full: 3, half: 2 } as const;
const SPACING = 6;   // between the body and the lid on the plate

export type Length = (typeof LENGTHS)[number];
export type Width = (typeof WIDTHS)[number];

/** A rectangle of grid units. Row 0 is the front. */
export interface Block {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export interface TraySpec {
  length: Length;
  width: Width;
  height: number;
  cols: number;
  rows: number;
  merges: Block[];
  pull: boolean;
  guides: boolean;
  labels: Record<string, string>;   // "col,row" of a compartment's front left unit -> text
  title: string;
  name: string;
}

export interface Comp extends Block {
  width: number;     // mm, across the tray
  length: number;    // mm, along the tray
  usable: boolean;   // false: too short behind the finger pocket, stays solid
  guided: boolean;   // has label guides
}

export interface TrayInfo {
  width: number;
  length: number;
  height: number;
  depth: number;      // inside a compartment
  pocket: number;     // finger pocket width, 0 for none
  unitW: number;
  unitL: number;
  comps: Comp[];
  notes: string[];
  wall: number;
  divider: number;
  pocketDepth: number;
  fit: FitConstants;
}

/** Model constants that the fit packer uses to try grids without a model run. See fit_data in parts-tray.scad. */
export interface FitConstants {
  wall: number;
  divT: number;
  minCell: number;
  cut: number;        // how far the finger pocket goes into the tray
  pullW0: number;     // pocket width when it cannot line up with one column
  rCell: number;      // compartment corner and floor radius
  scoopR: number;     // floor radius on the front side of each compartment
  grooveH: number;
  guideP: number;     // how far a label guide stands out from the back wall, 0 without guides
  guideW: number;     // smallest compartment width that gets label guides
  pullD: number;
}

export const DEFAULT_SPEC: TraySpec = {
  length: "half", width: "full", height: 24, cols: 3, rows: 4, merges: [], pull: true, guides: true,
  labels: {}, title: "", name: "",
};

export const key = (col: number, row: number) => `${col},${row}`;

export function autoName(spec: TraySpec): string {
  let hash = 0;
  for (const ch of JSON.stringify(spec.merges)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `tray-${spec.length}-${spec.width}-${spec.height}mm-${spec.cols}x${spec.rows}` +
         `${spec.merges.length ? `-${hash.toString(16).slice(0, 4)}` : ""}` +
         `${spec.pull ? "" : "-nopull"}${spec.guides ? "" : "-noguides"}`;
}

function defines(spec: TraySpec, part: string): Record<string, string> {
  const lidLabels = Object.entries(spec.labels).map(([k, text]) => [...k.split(",").map(Number), text]);
  return {
    length: JSON.stringify(spec.length), width: JSON.stringify(spec.width), height: String(spec.height),
    cols: String(spec.cols), rows: String(spec.rows),
    merges: JSON.stringify(spec.merges.map((m) => [m.col, m.row, m.cols, m.rows])),
    pull: String(spec.pull), label_guides: String(spec.guides), lid_labels: JSON.stringify(lidLabels),
    lid_title: JSON.stringify(spec.title), part: JSON.stringify(part),
  };
}

/** Ask the model for the sizes of the tray. It makes no geometry, so it is fast. */
export async function inspect(spec: TraySpec): Promise<TrayInfo> {
  const result = await render(pool, { file: "parts-tray.scad", defines: defines(spec, "none"), output: "echo" });
  const text = new TextDecoder().decode(result.data);
  const data = JSON.parse(/^ECHO: tray_data = (.*)$/m.exec(text)![1]);
  const fit = JSON.parse(/^ECHO: fit_data = (.*)$/m.exec(text)![1]);
  const notes = [...text.matchAll(/^ECHO: "(.*)"$/gm)].map((m) => m[1]);
  return {
    width: data[0], length: data[1], height: data[2], depth: data[3], pocket: data[4], unitW: data[5], unitL: data[6],
    comps: data[7].map((c: [number, number, number, number, number, number, boolean, boolean]) => ({
      col: c[0], row: c[1], cols: c[2], rows: c[3], width: c[4], length: c[5], usable: c[6], guided: c[7],
    })),
    notes, wall: fit[0], divider: fit[1], pocketDepth: fit[10],
    fit: { wall: fit[0], divT: fit[1], minCell: fit[2], cut: fit[3], pullW0: fit[4], rCell: fit[5], scoopR: fit[6],
           grooveH: fit[7], guideP: fit[8], guideW: fit[9], pullD: fit[10] },
  };
}

export function compAt(info: TrayInfo, col: number, row: number): Comp | undefined {
  return info.comps.find((k) => k.col <= col && col < k.col + k.cols && k.row <= row && row < k.row + k.rows);
}

const overlaps = (a: Block, b: Block) =>
  a.col < b.col + b.cols && b.col < a.col + a.cols && a.row < b.row + b.rows && b.row < a.row + a.rows;

/** Merge the selection into one compartment. Merges that overlap it go back to single units. */
export function merge(spec: TraySpec, block: Block): TraySpec {
  return { ...spec, merges: [...spec.merges.filter((m) => !overlaps(m, block)), block] };
}

/** Split the merge that holds this unit. */
export function split(spec: TraySpec, col: number, row: number): TraySpec {
  return { ...spec, merges: spec.merges.filter((m) => !overlaps(m, { col, row, cols: 1, rows: 1 })) };
}

/** Keep only the labels that still name the front left unit of a usable compartment. */
export function tidyLabels(spec: TraySpec, info: TrayInfo): TraySpec {
  const keep = Object.fromEntries(Object.entries(spec.labels).filter(([k]) =>
    info.comps.some((c) => c.usable && key(c.col, c.row) === k)));
  return Object.keys(keep).length === Object.keys(spec.labels).length ? spec : { ...spec, labels: keep };
}

/** The slide-in label texts to print, in reading order on the top view: back row first. */
function guidedLabels(spec: TraySpec, info: TrayInfo): string[] {
  return info.comps.filter((k) => k.guided && spec.labels[key(k.col, k.row)])
    .sort((a, b) => b.row - a.row || a.col - b.col).map((k) => spec.labels[key(k.col, k.row)]);
}

export type Progress = (step: { part: string; done: boolean; seconds?: number }) => void;

/**
 * Render every part and place it. Plate 1 has the body and the lid. The lid text
 * uses filament 2. Plate 2 has the slide-in labels. A draft has coarse curves.
 */
export async function buildTray(spec: TraySpec, { draft = false, progress = () => {} }: { draft?: boolean; progress?: Progress } = {}): Promise<Build> {
  const name = spec.name || autoName(spec);
  const info = await inspect(spec);
  const labels = guidedLabels(spec, info);
  const lidText = Boolean(spec.title) || info.comps.some((k) => k.usable && spec.labels[key(k.col, k.row)]);
  const quality = draft ? DRAFT : {};

  const jobs: [string, string, Record<string, string>][] = [
    ["body", "parts-tray.scad", { ...defines(spec, "box"), ...quality }],
    ["lid", "parts-tray.scad", { ...defines(spec, "lid"), ...quality }],
  ];
  if (lidText) jobs.push(["lid text", "parts-tray.scad", { ...defines(spec, "lid_text"), ...quality }]);
  if (labels.length) {
    for (const part of ["base", "text"]) {
      jobs.push([`labels ${part}`, "labels.scad", { part: JSON.stringify(part), labels: JSON.stringify(labels), ...quality }]);
    }
  }
  jobs.forEach(([part]) => progress({ part, done: false }));
  const meshes = new Map<string, Mesh>(await Promise.all(jobs.map(async ([part, file, d]) => {
    const result = await render(pool, { file, defines: d, output: "stl" });
    progress({ part, done: true, seconds: result.ms.run / 1000 });
    return [part, readStl(`${name}-${part.replace(" ", "-")}`, result.data)] as const;
  })));
  const mesh = (part: string) => {
    const m = meshes.get(part);
    if (!m) throw new ModelError(`The ${part} did not render`);
    return m;
  };

  const x0 = (BED - 2 * info.width - SPACING) / 2, y0 = (BED - info.length) / 2;
  const lidAt: [number, number] = [x0 + info.width + SPACING, y0];
  const plates: Plate[] = [{
    name,
    objects: [
      { parts: [{ mesh: mesh("body"), extruder: 1 }], position: [x0, y0] },
      { parts: lidText ? [{ mesh: mesh("lid"), extruder: 1 }, { mesh: mesh("lid text"), extruder: 2 }]
                       : [{ mesh: mesh("lid"), extruder: 1 }], position: lidAt },
    ],
  }];
  if (labels.length) {
    plates.push({ name: "Labels", objects: [{ parts: [{ mesh: mesh("labels base"), extruder: 1 },
                                                      { mesh: mesh("labels text"), extruder: 2 }] }] });
  }
  return { name, plates, draft, filaments: lidText || labels.length ? [BODY_FILAMENT, TEXT_FILAMENT] : [BODY_FILAMENT] };
}
