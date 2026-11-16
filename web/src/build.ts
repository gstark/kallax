// A build: the plates of a project and the objects on them. The 3MF writer and
// the 3D preview both read a build, so the preview shows what the file holds.

import { BambuProject, type Filament, type Mesh } from "./bambu3mf";
import { BED, PRINTER } from "./printer";

export interface Part {
  mesh: Mesh;
  extruder: number;   // 1-based filament slot
}

export interface BuildObject {
  parts: Part[];                       // more than one part makes a group, for example a lid and its text
  position?: [number, number];         // the bounding-box min corner on the bed. Undefined: centre it.
  settings?: Record<string, string>;   // print settings for this object only
}

export interface Plate {
  name: string;
  objects: BuildObject[];
}

export interface Build {
  name: string;
  plates: Plate[];
  filaments: Filament[];
  printSettingsId?: string;
  draft: boolean;   // rendered at coarse curves for the preview only
}

/** OpenSCAD values for a draft: coarse curves, so a tray renders in about a third of the time. */
export const DRAFT = { $fa: "12", $fs: "1" };

/** The Bambu Studio project for a build. */
export function toProject(build: Build): Uint8Array {
  const project = new BambuProject({ bedSize: [BED, BED], printerSettingsId: PRINTER,
                                     printSettingsId: build.printSettingsId, filaments: build.filaments });
  for (const p of build.plates) {
    const plate = project.addPlate(p.name);
    for (const o of p.objects) {
      if (o.parts.length === 1) {
        plate.addMesh(o.parts[0].mesh, { position: o.position, extruder: o.parts[0].extruder, settings: o.settings });
      } else {
        plate.addGroup(o.parts, { position: o.position });
      }
    }
  }
  return project.save();
}
