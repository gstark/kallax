// The Kallas box: its spec, the size query, and the Bambu Studio project.
// All sizes come from kallas-box.scad.

import { BambuProject, readStl } from "../bambu3mf";
import { pool, render } from "../openscad";
import { BED, BODY_FILAMENT, PRINTER } from "../printer";

/**
 * The system process preset. The 1.12 mm floor is 4 layers of 0.28 mm.
 * "0.28mm Sandwich Wall @P1S" inherits from this preset.
 */
const PROCESS = "0.28mm Extra Draft @BBL X1C";

/**
 * Sandwich wall: one perimeter on each face with sparse infill between them.
 * A thicker hollow wall is stiffer than a thinner solid wall that uses the same plastic.
 * These are the settings that "0.28mm Sandwich Wall @P1S" changes from the system preset.
 */
const SANDWICH = { wall_loops: "1", sparse_infill_pattern: "gyroid", sparse_infill_density: "15%", bottom_shell_layers: "4" };

const GAP = 8;          // between two boxes on the plate
const KEEP_OUT_X = 19;  // the P1S bed_exclude_area is 18 x 28 mm at the front left

export interface BoxSpec {
  wall: number;
  height: number;
  cutoutTop: number;      // finger cutout width at the rim
  cutoutBottom: number;   // finger cutout width at its bottom
  cutoutDepth: number;    // 0 for no cutout
  sandwich: boolean;
  count: 1 | 2;           // boxes on the plate
}

export interface BoxInfo {
  width: number;
  depth: number;
  height: number;
  wall: number;
  floor: number;
  innerWidth: number;
  innerDepth: number;
  innerR: number;
  outerR: number;
  cutoutTop: number;
  cutoutBottom: number;
  cutoutDepth: number;
  cutoutR: number;
}

export const DEFAULT_BOX: BoxSpec = { wall: 3, height: 100, cutoutTop: 60, cutoutBottom: 40, cutoutDepth: 15, sandwich: true, count: 1 };

function defines(spec: BoxSpec, part: string): Record<string, string> {
  return {
    wall: String(spec.wall), height: String(spec.height), cutout_top_width: String(spec.cutoutTop),
    cutout_bottom_width: String(spec.cutoutBottom), cutout_depth: String(spec.cutoutDepth), part: JSON.stringify(part),
  };
}

/** Ask the model for the sizes of the box. It makes no geometry, so it is fast. */
export async function inspectBox(spec: BoxSpec): Promise<BoxInfo> {
  const result = await render(pool, { file: "kallas-box.scad", defines: defines(spec, "none"), output: "echo" });
  const d: number[] = JSON.parse(/^ECHO: box_data = (.*)$/m.exec(new TextDecoder().decode(result.data))![1]);
  return { width: d[0], depth: d[1], height: d[2], wall: d[3], floor: d[4], innerWidth: d[5], innerDepth: d[6],
           innerR: d[7], outerR: d[8], cutoutTop: d[9], cutoutBottom: d[10], cutoutDepth: d[11], cutoutR: d[12] };
}

export function boxName(spec: BoxSpec) {
  return `kallas-box-${spec.wall}mm-wall-${spec.height}mm${spec.sandwich ? "-sandwich" : ""}${spec.count === 2 ? "-x2" : ""}`;
}

/** Render the box and write the project. With the sandwich wall, each box carries its own print settings. */
export async function makeBoxProject(spec: BoxSpec): Promise<{ name: string; file: Uint8Array; seconds: number }> {
  const name = boxName(spec);
  const result = await render(pool, { file: "kallas-box.scad", defines: defines(spec, "box"), output: "stl" });
  const mesh = readStl("kallas-box", result.data);
  const project = new BambuProject({ bedSize: [BED, BED], printerSettingsId: PRINTER,
                                     printSettingsId: PROCESS, filaments: [BODY_FILAMENT] });
  const plate = project.addPlate(name);
  const w = mesh.max[0] - mesh.min[0], d = mesh.max[1] - mesh.min[1];
  // Keep clear of the P1S keep-out area in the front left corner of the bed
  const x0 = Math.max((BED - spec.count * w - (spec.count - 1) * GAP) / 2, KEEP_OUT_X), y0 = (BED - d) / 2;
  for (let i = 0; i < spec.count; i++) {
    plate.addMesh(mesh, { position: [x0 + i * (w + GAP), y0], settings: spec.sandwich ? SANDWICH : {} });
  }
  return { name, file: project.save(), seconds: result.ms.run / 1000 };
}
