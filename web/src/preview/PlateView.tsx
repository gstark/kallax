// One build plate in 3D: the parts as they print, on the 256 mm bed, on the cutting mat.
// Drag to turn the view, scroll to zoom, right-drag to move. It draws only when the view changes.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { placeOnBed } from "../bambu3mf";
import type { Plate } from "../build";
import { BED } from "../printer";

const COLORS = { mat: "#2e5e4e", line: "#4a7f6f", major: "#6c9c89", edge: "#e6f0dc", body: "#f4f4ef", text: "#1f2724" };

/** The bed outline and its grid: a line every 10 mm and a stronger line every 50 mm. */
function bedLines() {
  const group = new THREE.Group();
  const lines = (step: number, color: string) => {
    const points: number[] = [];
    for (let v = step; v < BED; v += step) points.push(v, 0, 0, v, BED, 0, 0, v, 0, BED, v, 0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }));
  };
  group.add(lines(10, COLORS.line), lines(50, COLORS.major));
  const edge = new THREE.BufferGeometry();
  edge.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, BED, 0, 0, BED, BED, 0, 0, BED, 0, 0, 0, 0], 3));
  group.add(new THREE.Line(edge, new THREE.LineBasicMaterial({ color: COLORS.edge })));
  group.position.z = 0.05;
  return group;
}

export default function PlateView({ plate }: { plate: Plate }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.className = "block h-full w-full";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.mat);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
    camera.up.set(0, 0, 1);   // OpenSCAD and the printer have z up
    scene.add(new THREE.HemisphereLight(0xffffff, 0x35584b, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-120, -260, 380);
    scene.add(sun);
    scene.add(bedLines());

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
        scene.add(mesh);
        box.expandByObject(mesh);
      }
    }

    // Look at the parts from the front left, a little above
    const center = box.isEmpty() ? new THREE.Vector3(BED / 2, BED / 2, 0) : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? BED : box.getSize(new THREE.Vector3()).length();
    camera.position.set(center.x - size * 0.7, center.y - size * 1.6, center.z + size * 1.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.maxPolarAngle = Math.PI * 0.49;   // stay above the bed

    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => renderer.render(scene, camera));
    };
    controls.addEventListener("change", draw);
    controls.update();
    const resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    });
    resize.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
          node.geometry.dispose();
          (node.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [plate]);

  return <div ref={host} className="h-full w-full" />;
}
