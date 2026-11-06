import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eggleton,
  fillRadius,
  lagrangeL1,
  lobeVolumeRadius,
  rocheGradient,
  rochePotential,
  shapeLevel,
  sphereGrid,
  surfaceOnGrid,
  surfaceRadius,
  volumeRadius,
} from '../src/physics/roche.js';

const grid = sphereGrid(96, 128);

function surface(q, level) {
  const positions = new Float32Array(3 * grid.count);
  const normals = new Float32Array(3 * grid.count);
  surfaceOnGrid(q, level, grid, positions, normals);
  return { positions, normals };
}

function tripleProduct(p, a, b, c) {
  return (
    p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
    p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
    p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  );
}

function meshRadius(positions) {
  const { index } = grid;
  let sum = 0;
  for (let k = 0; k < index.length; k += 3) {
    sum += tripleProduct(positions, 3 * index[k], 3 * index[k + 1], 3 * index[k + 2]);
  }
  return Math.cbrt(sum / (8 * Math.PI));
}

function length(p, k) {
  return Math.hypot(p[k], p[k + 1], p[k + 2]);
}

test('eggleton and L1', () => {
  assert.equal(Math.round(eggleton(1) * 1e4) / 1e4, 0.3789);
  assert.equal(eggleton(0), 0);
  assert.equal(eggleton(Infinity), 0.49 / 0.6);
  assert.ok(Math.abs(lagrangeL1(1) - 0.5) < 1e-12);
  for (const q of [0.1, 0.3, 3, 10]) {
    const l1 = lagrangeL1(q);
    const gradient = rocheGradient(q, l1, 0, 0, [0, 0, 0]);
    assert.ok(l1 > 0 && l1 < 1, `q ${q}: ${l1}`);
    assert.ok(Math.hypot(...gradient) < 1e-10, `q ${q}: ${gradient}`);
  }
});

test('lobe table matches direct quadrature', () => {
  for (const q of [0.03, 0.1, 1, 3, 30]) {
    const level = rochePotential(q, lagrangeL1(q), 0, 0);
    const direct = volumeRadius(q, level, 128, 64);
    const table = lobeVolumeRadius(q);
    assert.ok(Math.abs(table / direct - 1) < 1e-5, `q ${q}: ${table} vs ${direct}`);
    assert.ok(Math.abs(table / eggleton(q) - 1) < 0.01, `q ${q}: eggleton ${eggleton(q)}`);
  }
});

test('sphere grid winds outward without degenerate triangles', () => {
  const { index, directions } = grid;
  assert.equal(index.length, 6 * grid.nPhi * (grid.nTheta - 1));
  for (let k = 0; k < index.length; k += 3) {
    const [a, b, c] = [3 * index[k], 3 * index[k + 1], 3 * index[k + 2]];
    const e1 = [0, 1, 2].map((n) => directions[b + n] - directions[a + n]);
    const e2 = [0, 1, 2].map((n) => directions[c + n] - directions[a + n]);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    assert.ok(Math.hypot(...cross) > 1e-9, `triangle ${k / 3}`);
    assert.ok(tripleProduct(directions, a, b, c) > 0, `winding ${k / 3}`);
  }
});

test('lobe-filling stars have their cusp at L1', () => {
  for (const q of [0.1, 1, 10]) {
    const l1 = lagrangeL1(q);
    for (const f of [1, 1.3]) {
      const shape = shapeLevel(q, f);
      assert.ok(shape.lobe);
      const { positions, normals } = surface(q, shape.level);
      assert.ok(Math.abs(positions[0] - l1) < 1e-4, `q ${q} f ${f}: ${positions[0]} vs ${l1}`);
      assert.ok(Math.abs(positions[1]) < 1e-6 && Math.abs(positions[2]) < 1e-6);
      for (let k = 0; k < positions.length; k += 3) {
        const outward = positions[k] * normals[k] + positions[k + 1] * normals[k + 1] + positions[k + 2] * normals[k + 2];
        assert.ok(Math.abs(length(normals, k) - 1) < 1e-5 && outward > 0, `normal at ${k / 3}`);
      }
    }
    assert.equal(surfaceRadius(q, rochePotential(q, l1, 0, 0), 1, 0, 0), l1);
  }
});

test('mesh volume matches the filled radius', () => {
  for (const q of [0.1, 1, 10]) {
    for (const f of [0.2, 0.5, 0.8]) {
      const shape = shapeLevel(q, f);
      assert.ok(!shape.lobe);
      const radius = meshRadius(surface(q, shape.level).positions);
      const expected = f * eggleton(q);
      assert.ok(Math.abs(radius / expected - 1) < 1e-3, `q ${q} f ${f}: ${radius} vs ${expected}`);
    }
  }
});

test('detached surfaces stay inside the lobe', () => {
  for (const q of [0.1, 1, 10]) {
    const lobe = surface(q, shapeLevel(q, 1).level).positions;
    for (const f of [0.5, 0.9, 0.99]) {
      const star = surface(q, shapeLevel(q, f).level).positions;
      for (let k = 0; k < star.length; k += 3) {
        assert.ok(length(star, k) <= length(lobe, k) * (1 + 1e-6), `q ${q} f ${f} vertex ${k / 3}`);
      }
    }
  }
});

test('fill radius increases and reaches the lobe', () => {
  for (const q of [0.03, 0.1, 1, 3, 30]) {
    let previous = 0;
    for (let k = 1; k < 10000; k++) {
      const radius = fillRadius(q, k / 10000);
      assert.ok(radius > previous, `q ${q} f ${k / 10000}`);
      previous = radius;
    }
    assert.ok(Math.abs(fillRadius(q, 0.5) / (0.5 * eggleton(q)) - 1) < 1e-15);
    assert.ok(Math.abs(fillRadius(q, 1 - 1e-9) / lobeVolumeRadius(q) - 1) < 1e-8);
    for (const f of [1, 1.2, 3]) assert.equal(fillRadius(q, f), lobeVolumeRadius(q));
  }
});
