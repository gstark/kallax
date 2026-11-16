// One build plate in 3D: the parts as they print, on the 256 mm bed, on the cutting mat.
// Drag to turn the view, scroll to zoom, right-drag to move. It draws only when the view changes.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { placeOnBed } from "../bambu3mf";
import type { Plate } from "../build";
import { BED } from "../printer";
import { COLORS, createStage } from "./scene";

/** A see-through box in bed coordinates, for example an item in its compartment. */
export interface Block {
  center: [number, number, number];
  size: [number, number, number];
}

/** Give `blocks` a stable identity (useMemo), or the scene builds again on each render. */
export default function PlateView({ plate, blocks = [] }: { plate: Plate; blocks?: Block[] }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const stage = createStage(host.current);

    // The parts, placed as in the 3MF
    const box = new THREE.Box3();
    for (const o of plate.objects) {
      const [tx, ty] = placeOnBed(o.parts.map((p) => p.mesh), o.position, [BED, BED]);
      for (const part of o.parts) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(part.mesh.vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(part.mesh.triangles, 1));
        const text = part.extruder !== 1;
        const material = new THREE.MeshStandardMaterial({
          color: text ? COLORS.text : COLORS.body, flatShading: true, roughness: 0.9,
          // The text sits flush in the lid: push it forward so the faces do not flicker
          polygonOffset: text, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(tx, ty, 0);
        stage.scene.add(mesh);
        box.expandByObject(mesh);
      }
    }

    // The blocks: yellow, see-through, with dark edges
    for (const b of blocks) {
      const geometry = new THREE.BoxGeometry(...b.size);
      const solid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: COLORS.item, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.6,
      }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: COLORS.text }));
      solid.position.set(...b.center);
      edges.position.set(...b.center);
      solid.renderOrder = edges.renderOrder = 1;   // after the parts, so the parts show through
      stage.scene.add(solid, edges);
    }

    stage.frame(box);
    return () => stage.dispose();
  }, [plate, blocks]);

  return <div ref={host} className="h-full w-full" />;
}
