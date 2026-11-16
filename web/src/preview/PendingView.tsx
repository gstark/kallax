// While a preview renders: the size of the part as raised letters, printed on the bed,
// with a smaller line under it. A yellow nozzle line passes over the letters, as the
// nozzle line passes over the top view. It stays still when the system asks for less motion.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { BED } from "../printer";
import typeface from "./barlow-condensed-600.typeface.json";
import { COLORS, createStage } from "./scene";

const font = new FontLoader().parse(typeface as unknown as Parameters<FontLoader["parse"]>[0]);

/** Text that lies flat on the bed, centred on x, with its baseline at y. */
function flatText(text: string, size: number, depth: number, color: string, y: number) {
  const geometry = new TextGeometry(text, { font, size, depth, curveSegments: 6, bevelEnabled: false });
  geometry.computeBoundingBox();
  const width = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
  geometry.translate(BED / 2 - width / 2 - geometry.boundingBox!.min.x, y, 0);
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }));
}

export default function PendingView({ title, detail }: { title: string; detail: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const stage = createStage(host.current);
    const titleMesh = flatText(title, 22, 5, COLORS.body, BED / 2 - 4);
    const detailMesh = flatText(detail, 9, 1.2, COLORS.edge, BED / 2 - 22);
    stage.scene.add(titleMesh, detailMesh);

    const box = new THREE.Box3().setFromObject(titleMesh).union(new THREE.Box3().setFromObject(detailMesh));
    stage.frame(box.clone().expandByScalar(2));

    // The nozzle line: a thin yellow bar across the letters, a little above them
    const width = box.max.x - box.min.x + 24;
    const nozzle = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: COLORS.item }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12), new THREE.MeshBasicMaterial({ color: COLORS.item }));
    head.position.x = width / 2;
    nozzle.add(bar, head);
    nozzle.position.set((box.min.x + box.max.x) / 2, box.min.y, 7);
    stage.scene.add(nozzle);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nozzle.visible = false;
      stage.draw();
    } else {
      const span = box.max.y - box.min.y;
      stage.renderer.setAnimationLoop((time) => {
        // Back and forth over the letters, slow at each end
        nozzle.position.y = box.min.y + span * (0.5 - 0.5 * Math.cos((time / 1200) * Math.PI));
        stage.renderer.render(stage.scene, stage.camera);
      });
    }
    return () => stage.dispose();
  }, [title, detail]);

  return <div ref={host} className="h-full w-full" />;
}
