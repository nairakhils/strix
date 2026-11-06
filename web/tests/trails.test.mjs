import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barycentric, eccentricAnomaly, relativeOrbit } from '../src/physics/kepler.js';
import { TRAIL_LEVEL, TRAIL_SEGMENTS, TRAIL_SPAN, trailFade, trailPoints } from '../src/render/guides.js';

const count = TRAIL_SEGMENTS + 1;

const cases = [
  { a: 1, e: 0, phi: 0, masses: [1, 1], centre: [0, 0, 0] },
  { a: 2.5, e: 0.3, phi: 1.2, masses: [10, 3], centre: [0.4, 0, -0.25] },
  { a: 0.7, e: 0.9, phi: -4, masses: [1.4, 20], centre: [-1.5, 0, 2] },
  { a: 4, e: 0.6, phi: 37.5, masses: [8, 8], centre: [0.01, 0, 0.02] },
  { a: 0.05, e: 0.97, phi: 3.1, masses: [30, 1.3], centre: [0, 0, 0.5] },
];

function orbitOf({ a, e, phi, masses: [m1, m2], centre }) {
  const total = m1 + m2;
  return { a, e, phi, weights: [-m2 / total, m1 / total], centre };
}

test('trail points are deterministic', () => {
  for (const item of cases) {
    const orbit = orbitOf(item);
    for (const k of [0, 1]) {
      const one = trailPoints(orbit, k, count, new Float32Array(3 * count));
      const two = trailPoints(orbit, k, count, new Float32Array(3 * count));
      assert.deepEqual(one, two);
    }
  }
});

test('trail starts at the star', () => {
  for (const item of cases) {
    const orbit = orbitOf(item);
    const { x, y } = relativeOrbit(item.a, item.e, item.phi);
    const positions = barycentric(x, y, ...item.masses);
    for (const k of [0, 1]) {
      const points = trailPoints(orbit, k, count, new Float64Array(3 * count));
      const [px, py] = positions[k];
      const expected = [item.centre[0] + px, item.centre[1], item.centre[2] - py];
      const size = item.a + Math.hypot(...item.centre);
      for (let c = 0; c < 3; c += 1) assert.ok(Math.abs(points[c] - expected[c]) <= 1e-12 * size);
    }
  }
});

test('trail lies on the barycentric ellipse', () => {
  for (const item of cases) {
    const orbit = orbitOf(item);
    const { a, e, phi, centre } = item;
    for (const k of [0, 1]) {
      const weight = orbit.weights[k];
      const points = trailPoints(orbit, k, count, new Float64Array(3 * count));
      for (let i = 0; i < count; i += 1) {
        const dx = points[3 * i] - centre[0];
        const dz = points[3 * i + 2] - centre[2];
        assert.equal(points[3 * i + 1], centre[1]);
        const anomaly = eccentricAnomaly(phi - (2 * Math.PI * TRAIL_SPAN * i) / TRAIL_SEGMENTS, e);
        const kepler = Math.abs(weight) * a * (1 - e * Math.cos(anomaly));
        const distance = Math.hypot(dx, dz);
        assert.ok(Math.abs(distance - kepler) <= 1e-9 * kepler);
        const r = distance / Math.abs(weight);
        const conic = r + (e * dx) / weight;
        assert.ok(Math.abs(conic - a * (1 - e * e)) <= 1e-9 * a);
      }
    }
  }
});

test('trail fades from the level to zero', () => {
  assert.equal(trailFade(0), TRAIL_LEVEL);
  assert.equal(trailFade(1), 0);
  const steps = 10000;
  let previous = trailFade(0);
  for (let i = 1; i <= steps; i += 1) {
    const value = trailFade(i / steps);
    assert.ok(value <= previous);
    assert.ok(value >= 0);
    previous = value;
  }
});
