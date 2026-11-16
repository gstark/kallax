// Shared parts of the 3D views: the colours, the bed on the mat, and the stage that
// holds the renderer, the scene, the camera, and the controls.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BED } from "../printer";

export const COLORS = {
  mat: "#2e5e4e", line: "#4a7f6f", major: "#6c9c89", edge: "#e6f0dc",
  body: "#f4f4ef", text: "#1f2724", item: "#f2c230",
};

/** The bed outline and its grid: a line every 10 mm and a stronger line every 50 mm. */
export function bedLines() {
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

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  draw(): void;
  /** Point the camera at a box from the front left, a little above. */
  frame(box: THREE.Box3): void;
  dispose(): void;
}

/** A renderer in `el` with the mat, the lights, and the bed. It draws only when the view changes. */
export function createStage(el: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.className = "block h-full w-full";
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.mat);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
  camera.up.set(0, 0, 1);   // OpenSCAD and the printer have z up
  scene.add(new THREE.HemisphereLight(0xffffff, 0x35584b, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(-120, -260, 380);
  scene.add(sun);
  scene.add(bedLines());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.49;   // stay above the bed

  let frame = 0;
  const draw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => renderer.render(scene, camera));
  };
  controls.addEventListener("change", draw);
  const resize = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = el;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  });
  resize.observe(el);

  return {
    scene, camera, renderer, controls, draw,
    frame(box) {
      const center = box.isEmpty() ? new THREE.Vector3(BED / 2, BED / 2, 0) : box.getCenter(new THREE.Vector3());
      const size = box.isEmpty() ? BED : box.getSize(new THREE.Vector3()).length();
      camera.position.set(center.x - size * 0.7, center.y - size * 1.6, center.z + size * 1.2);
      controls.target.copy(center);
      controls.update();
    },
    dispose() {
      cancelAnimationFrame(frame);
      renderer.setAnimationLoop(null);
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
    },
  };
}
