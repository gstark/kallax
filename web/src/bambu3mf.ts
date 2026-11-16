// A Bambu Studio project (3MF) writer. A port of github.com/gstark/bambu3mf.
//
// Bambu Studio notes from the Python library:
// - "Application" must match the installed Bambu Studio version, or Bambu Studio
//   shows a "Newer 3mf version" warning.
// - project_settings.config must have filament_colour when there are plates.
//   Without it, Bambu Studio crashes.
// - printer_settings_id and filament_settings_id must be system preset names.
// - Bambu Studio puts an object on a plate by its position, not by the plate
//   list in model_settings.config. Plates are on a grid with a gap of 1/5 of
//   the bed, and ceil(sqrt(plate count)) columns.

import { strToU8, zipSync } from "fflate";

const APPLICATION = "BambuStudio-02.05.00.66";
const PLATE_GAP_RATIO = 1 / 5;

export interface Filament {
  settingsId: string;
  colour?: string;
  type?: string;
  diameter?: string;
}

export interface Mesh {
  name: string;
  vertices: Float32Array;   // x, y, z for each vertex
  triangles: Uint32Array;   // three vertex indexes for each triangle
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Read a binary STL. Merge equal vertices and drop the triangles that then have
 * two equal corners, as lib3mf does. A 3MF reader rejects such triangles.
 */
export function readStl(name: string, data: Uint8Array): Mesh {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(80, true);
  if (data.byteLength < 84 + count * 50) throw new Error(`${name}: not a binary STL`);
  const index = new Map<string, number>();
  const vertices: number[] = [];
  const triangles: number[] = [];
  const corners = [0, 0, 0];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < count; t++) {
    for (let v = 0; v < 3; v++) {
      const at = 84 + t * 50 + 12 + v * 12;
      const p = [view.getFloat32(at, true), view.getFloat32(at + 4, true), view.getFloat32(at + 8, true)];
      const key = p.join(",");
      let i = index.get(key);
      if (i === undefined) {
        i = vertices.length / 3;
        index.set(key, i);
        vertices.push(...p);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], p[k]);
          max[k] = Math.max(max[k], p[k]);
        }
      }
      corners[v] = i;
    }
    if (corners[0] !== corners[1] && corners[1] !== corners[2] && corners[0] !== corners[2]) triangles.push(...corners);
  }
  return { name, vertices: new Float32Array(vertices), triangles: new Uint32Array(triangles), min, max };
}

interface Part {
  id: number;
  mesh: Mesh;
  extruder: number;
}

interface PlacedObject {
  id: number;            // the mesh object, or the components object of a group
  name: string;
  parts: Part[];         // one part for a plain mesh
  group: boolean;
  offset: [number, number];   // translation on the bed, without the plate grid offset
}

type Position = [number, number] | undefined;   // the bounding-box min corner on the bed. Undefined: center it.

export class Plate {
  objects: PlacedObject[] = [];

  constructor(private project: BambuProject, readonly id: number, readonly name: string) {}

  /** Add one mesh as an object. */
  addMesh(mesh: Mesh, { position, extruder = 1 }: { position?: Position; extruder?: number } = {}) {
    const id = this.project.newId();
    this.objects.push({ id, name: mesh.name, group: false, parts: [{ id, mesh, extruder }],
                        offset: this.offset([mesh], position) });
  }

  /** Add meshes as the parts of one object. Each part can use its own filament. */
  addGroup(entries: { mesh: Mesh; extruder: number }[], { position }: { position?: Position } = {}) {
    const parts = entries.map(({ mesh, extruder }) => ({ id: this.project.newId(), mesh, extruder }));
    this.objects.push({ id: this.project.newId(), name: entries[0]?.mesh.name ?? "group", group: true, parts,
                        offset: this.offset(entries.map((e) => e.mesh), position) });
  }

  private offset(meshes: Mesh[], position: Position): [number, number] {
    const [bedW, bedH] = this.project.bedSize;
    const minX = Math.min(...meshes.map((m) => m.min[0])), maxX = Math.max(...meshes.map((m) => m.max[0]));
    const minY = Math.min(...meshes.map((m) => m.min[1])), maxY = Math.max(...meshes.map((m) => m.max[1]));
    if (!position) return [bedW / 2 - (minX + maxX) / 2, bedH / 2 - (minY + maxY) / 2];
    const [x, y] = position;
    if (x < 0 || y < 0 || x + maxX - minX > bedW || y + maxY - minY > bedH) {
      throw new Error(`An object of ${(maxX - minX).toFixed(1)} x ${(maxY - minY).toFixed(1)} mm at (${x}, ${y}) ` +
                      `goes off the ${bedW} x ${bedH} mm bed`);
    }
    return [x - minX, y - minY];
  }
}

export class BambuProject {
  plates: Plate[] = [];
  private lastId = 0;

  constructor(readonly options: { bedSize: [number, number]; printerSettingsId: string; filaments: Filament[] }) {}

  get bedSize() {
    return this.options.bedSize;
  }

  newId() {
    return ++this.lastId;
  }

  addPlate(name?: string) {
    const plate = new Plate(this, this.plates.length + 1, name ?? `Plate ${this.plates.length + 1}`);
    this.plates.push(plate);
    return plate;
  }

  /** The 3MF file. */
  save(): Uint8Array {
    return zipSync({
      "3D/3dmodel.model": strToU8(this.model()),
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      "Metadata/project_settings.config": strToU8(this.projectSettings()),
      "Metadata/model_settings.config": strToU8(this.modelSettings()),
    }, { level: 6 });
  }

  /** The plate origin in world space. Matches PartPlateList in Bambu Studio. */
  private origin(plate: Plate): [number, number] {
    const root = Math.sqrt(this.plates.length);
    const cols = root > Math.round(root) ? Math.round(root) + 1 : Math.round(root);
    const [w, h] = this.bedSize;
    const index = plate.id - 1;
    return [(index % cols) * w * (1 + PLATE_GAP_RATIO), -Math.floor(index / cols) * h * (1 + PLATE_GAP_RATIO)];
  }

  private model(): string {
    const out: string[] = [
      '<?xml version="1.0" encoding="utf-8"?>\n',
      '<model xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" ',
      'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter" xml:lang="en-US" ',
      'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">\n',
      '\t<metadata name="BambuStudio:3mfVersion">1</metadata>\n',
      `\t<metadata name="Application">${escape(APPLICATION)}</metadata>\n`,
      "\t<resources>\n",
    ];
    const objects = this.plates.flatMap((p) => p.objects);
    for (const part of objects.flatMap((o) => o.parts)) {
      const { vertices: v, triangles: t } = part.mesh;
      out.push(`\t\t<object id="${part.id}" name="${escape(part.mesh.name)}" type="model" p:UUID="${uuid()}">\n`,
               "\t\t\t<mesh>\n\t\t\t\t<vertices>\n");
      for (let i = 0; i < v.length; i += 3) {
        out.push(`\t\t\t\t\t<vertex x="${num(v[i])}" y="${num(v[i + 1])}" z="${num(v[i + 2])}" />\n`);
      }
      out.push("\t\t\t\t</vertices>\n\t\t\t\t<triangles>\n");
      for (let i = 0; i < t.length; i += 3) {
        out.push(`\t\t\t\t\t<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}" />\n`);
      }
      out.push("\t\t\t\t</triangles>\n\t\t\t</mesh>\n\t\t</object>\n");
    }
    for (const obj of objects.filter((o) => o.group)) {
      out.push(`\t\t<object id="${obj.id}" type="model" p:UUID="${uuid()}">\n\t\t\t<components>\n`);
      for (const part of obj.parts) out.push(`\t\t\t\t<component objectid="${part.id}" p:UUID="${uuid()}"/>\n`);
      out.push("\t\t\t</components>\n\t\t</object>\n");
    }
    out.push(`\t</resources>\n\t<build p:UUID="${uuid()}">\n`);
    for (const plate of this.plates) {
      const [ox, oy] = this.origin(plate);
      for (const obj of plate.objects) {
        out.push(`\t\t<item objectid="${obj.id}" p:UUID="${uuid()}" ` +
                 `transform="1 0 0 0 1 0 0 0 1 ${num(obj.offset[0] + ox)} ${num(obj.offset[1] + oy)} 0"/>\n`);
      }
    }
    out.push("\t</build>\n</model>\n");
    return out.join("");
  }

  private projectSettings(): string {
    const [w, h] = this.bedSize;
    const f = this.options.filaments;
    return JSON.stringify({
      name: "project_settings",
      from: "project",
      printable_area: ["0x0", `${w}x0`, `${w}x${h}`, `0x${h}`],
      printer_settings_id: this.options.printerSettingsId,
      filament_settings_id: f.map((x) => x.settingsId),
      filament_diameter: f.map((x) => x.diameter ?? "1.75"),
      filament_colour: f.map((x) => x.colour ?? "#00AE42"),
      filament_type: f.map((x) => x.type ?? "PLA"),
    }, null, 4);
  }

  /** Objects come before plates: Bambu Studio reads the object metadata only after an object tag. */
  private modelSettings(): string {
    const meta = (key: string, value: string | number) => `<metadata key="${key}" value="${escape(String(value))}" />`;
    const out = ["<config>"];
    for (const plate of this.plates) {
      for (const obj of plate.objects) {
        out.push(`<object id="${obj.id}">`, meta("name", obj.name), meta("extruder", obj.group ? 1 : obj.parts[0].extruder));
        if (obj.group) {
          for (const part of obj.parts) {
            out.push(`<part id="${part.id}" subtype="normal_part">`, meta("name", part.mesh.name),
                     meta("extruder", part.extruder), "</part>");
          }
        }
        out.push("</object>");
      }
      out.push("<plate>", meta("plater_id", plate.id), meta("plater_name", plate.name));
      for (const obj of plate.objects) {
        out.push("<model_instance>", meta("object_id", obj.id), meta("instance_id", 0), meta("identify_id", obj.id),
                 "</model_instance>");
      }
      out.push("</plate>");
    }
    out.push("</config>");
    return out.join("");
  }
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
	<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
	<Default Extension="png" ContentType="image/png"/>
	<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
	<Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model" Id="rel0"/>
</Relationships>
`;

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(x: number) {
  return Number(x.toFixed(6)).toString();
}

function uuid() {
  return crypto.randomUUID();
}
