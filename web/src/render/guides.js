import * as THREE from 'three';
import { relativeOrbit } from '../physics/kepler.js';

export const TRAIL_SEGMENTS = 96;
export const TRAIL_SPAN = 0.3;
export const TRAIL_LEVEL = 0.35;

const TRAIL_POINTS = TRAIL_SEGMENTS + 1;

export function trailFade(age) {
  return TRAIL_LEVEL * (1 - age) ** 2;
}

export function trailPoints({ a, e, phi, apse = 0, weights, centre }, k, count, out) {
  const weight = weights[k];
  const c = Math.cos(apse);
  const s = Math.sin(apse);
  for (let i = 0; i < count; i += 1) {
    const { x, y } = relativeOrbit(a, e, phi - (2 * Math.PI * TRAIL_SPAN * i) / (count - 1));
    out[3 * i] = centre[0] + weight * (c * x - s * y);
    out[3 * i + 1] = centre[1];
    out[3 * i + 2] = centre[2] - weight * (s * x + c * y);
  }
  return out;
}

const fades = Float32Array.from({ length: TRAIL_POINTS }, (_, i) => trailFade(i / TRAIL_SEGMENTS));

function makeTrails(stage) {
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trails = [0, 1].map(() => {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(3 * TRAIL_POINTS), 3);
    const colour = new THREE.BufferAttribute(new Float32Array(3 * TRAIL_POINTS), 3);
    geometry.setAttribute('position', position.setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', colour.setUsage(THREE.DynamicDrawUsage));
    const trail = new THREE.Line(geometry, material);
    trail.frustumCulled = false;
    trail.visible = false;
    return trail;
  });
  stage.scene.add(...trails);
  return trails;
}

function showTrail(trail, orbit, k, star) {
  trail.visible = orbit !== null && star.visible;
  if (!trail.visible) return;
  const { position, color } = trail.geometry.attributes;
  trailPoints(orbit, k, TRAIL_POINTS, position.array);
  const peak = Math.max(...star.colour);
  const tint = star.colour.map((c) => (peak > 0 ? c / peak : 1));
  for (let i = 0; i < TRAIL_POINTS; i += 1) {
    for (let c = 0; c < 3; c += 1) color.array[3 * i + c] = tint[c] * fades[i];
  }
  position.needsUpdate = true;
  color.needsUpdate = true;
}

export function makeGuides(stage) {
  const trails = makeTrails(stage);

  function update({ orbit, stars }) {
    for (let k = 0; k < 2; k += 1) showTrail(trails[k], orbit, k, stars[k]);
  }

  return { update };
}
