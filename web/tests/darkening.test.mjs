import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeLevel, sphereGrid, surfaceOnGrid } from '../src/physics/roche.js';
import {
  gravityDarkeningExponent,
  rotationalDarkening,
  tidalDarkening,
} from '../src/physics/darkening.js';

const grid = sphereGrid(96, 128);
const areas = new Float64Array(grid.count);

function shaped(q, fill) {
  const positions = new Float32Array(3 * grid.count);
  const normals = new Float32Array(3 * grid.count);
  surfaceOnGrid(q, shapeLevel(q, fill).level, grid, positions, normals);
  return positions;
}

function triangleArea(p, a, b, c) {
  const u = [0, 1, 2].map((n) => p[3 * b + n] - p[3 * a + n]);
  const v = [0, 1, 2].map((n) => p[3 * c + n] - p[3 * a + n]);
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
}

function meanFourthPower(positions, ratios) {
  const { index } = grid;
  let sum = 0;
  let total = 0;
  for (let k = 0; k < index.length; k += 3) {
    const [a, b, c] = [index[k], index[k + 1], index[k + 2]];
    const area = triangleArea(positions, a, b, c);
    sum += (area * (ratios[a] ** 4 + ratios[b] ** 4 + ratios[c] ** 4)) / 3;
    total += area;
  }
  return sum / total;
}

function farthest(axis) {
  let vertex = 0;
  for (let n = 1; n < grid.count; n += 1) {
    if (grid.directions[3 * n + axis] > grid.directions[3 * vertex + axis]) vertex = n;
  }
  return vertex;
}

const l1 = farthest(0);
const equator = farthest(1);
const pole = farthest(2);

test('vertex patches add up to the mesh area', () => {
  const positions = shaped(0.5, 0.99);
  const { index } = grid;
  let total = 0;
  for (let k = 0; k < index.length; k += 3) total += triangleArea(positions, index[k], index[k + 1], index[k + 2]);
  const patches = new Float64Array(grid.count);
  tidalDarkening(0.5, grid, positions, 0.25, new Float32Array(grid.count), patches);
  const sum = patches.reduce((s, a) => s + a, 0);
  assert.ok(Math.abs(sum / total - 1) < 1e-9, `${sum} vs ${total}`);
});

test('the L1 cusp is a dim neck, not a dark dot', () => {
  const { index, twin } = grid;
  const ring = new Set();
  for (let k = 0; k < index.length; k += 3) {
    const face = [index[k], index[k + 1], index[k + 2]];
    if (face.some((n) => twin[n] === twin[l1])) face.filter((n) => twin[n] !== twin[l1]).forEach((n) => ring.add(n));
  }
  for (const q of [0.3, 1, 3]) {
    const positions = shaped(q, 1);
    for (const beta of [0.25, 0.08]) {
      const ratios = tidalDarkening(q, grid, positions, beta, new Float32Array(grid.count), areas);
      const next = Math.min(...[...ring].map((n) => ratios[n]));
      assert.ok(ratios[l1] > 0.8 * next, `q ${q} beta ${beta}: ${ratios[l1]} at L1 against ${next} beside it`);
      assert.ok(new Set(grid.directions.map((_, n) => n).filter((n) => twin[n] === twin[l1]).map((n) => ratios[n])).size === 1);
    }
  }
});

test('tidal darkening conserves flux and cools the L1 cusp', () => {
  for (const q of [0.5, 2]) {
    for (const fill of [0.99, 1]) {
      const positions = shaped(q, fill);
      for (const beta of [0.25, 0.08]) {
        const ratios = tidalDarkening(q, grid, positions, beta, new Float32Array(grid.count), areas);
        assert.ok(ratios.every((r) => Number.isFinite(r) && r >= 0), `q ${q} fill ${fill} beta ${beta}`);
        const mean = meanFourthPower(positions, ratios);
        assert.ok(Math.abs(mean - 1) < 1e-3, `q ${q} fill ${fill} beta ${beta}: ${mean}`);
        assert.ok(ratios[l1] < ratios[pole], `q ${q} fill ${fill} beta ${beta}: ${ratios[l1]} vs ${ratios[pole]}`);
      }
    }
  }
});

test('nearly spherical stars are evenly bright', () => {
  for (const q of [0.5, 2]) {
    const positions = shaped(q, 0.2);
    const ratios = tidalDarkening(q, grid, positions, 0.25, new Float32Array(grid.count), areas);
    assert.ok(ratios.every((r) => Math.abs(r - 1) < 1e-2), `q ${q}`);
  }
});

test('gravity darkening exponent', () => {
  assert.equal(gravityDarkeningExponent(3000), 0.08);
  assert.equal(gravityDarkeningExponent(5000), 0.08);
  assert.equal(gravityDarkeningExponent(10000), 0.25);
  assert.equal(gravityDarkeningExponent(40000), 0.25);
  let previous = gravityDarkeningExponent(3000);
  for (let t = 3001; t <= 12000; t += 1) {
    const beta = gravityDarkeningExponent(t);
    assert.ok(beta >= previous - 1e-15 && beta - previous <= 1e-3, `${t}: ${previous} -> ${beta}`);
    previous = beta;
  }
});

test('rotational darkening', () => {
  const positions = Float32Array.from(grid.directions);
  const still = rotationalDarkening(0, grid, positions, 0.25, new Float32Array(grid.count), areas);
  assert.ok(still.every((r) => r === 1));
  for (const beta of [0.25, 0.08]) {
    const ratios = rotationalDarkening(0.8, grid, positions, beta, new Float32Array(grid.count), areas);
    assert.ok(ratios[equator] < ratios[pole], `beta ${beta}: ${ratios[equator]} vs ${ratios[pole]}`);
    const mean = meanFourthPower(positions, ratios);
    assert.ok(Math.abs(mean - 1) < 1e-3, `beta ${beta}: ${mean}`);
  }
});
