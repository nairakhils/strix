import test from 'node:test';
import assert from 'node:assert/strict';
import { determineScale, logScaledRadius } from '../src/director/scaling.js';
import { eggleton } from '../src/physics/roche.js';
import {
  F1,
  RAMP_FRAMES,
  blendFill,
  ceiling,
  clamp,
  episodeWeights,
  smoothstep,
} from '../src/director/blend.js';
import { exampleScene } from './scenes.mjs';

const SAMPLES = 1e5;
const axes = [2, 10, 100, 1e3, 1e4];
const ratios = [0.1, 1, 10];
const eccentricities = [0, 0.5];
const weights = [0, 0.5, 1];
const fixtureScale = determineScale({ r1: [379], r2: [0], a: [1000], e: [0] }, 1);

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

function system(a, ratio, e, star) {
  const q = star === 0 ? ratio : 1 / ratio;
  return {
    a,
    ratio,
    e,
    star,
    lambda: (logScaledRadius(a) * (1 + ratio) * fixtureScale) / a,
    lobe: eggleton(q) * a * (1 - e),
  };
}

const grid = axes.flatMap((a) => ratios.flatMap((ratio) => eccentricities.flatMap(
  (e) => [0, 1].map((star) => system(a, ratio, e, star)),
)));

function radiusGrid(lobe) {
  const span = (1.5 * lobe) / 1e-3;
  return Float64Array.from({ length: SAMPLES }, (_, n) => 1e-3 * span ** (n / (SAMPLES - 1)));
}

function drawn(sys, radius, w) {
  const f = radius / sys.lobe;
  const fV = logScaledRadius(radius) / (sys.lambda * sys.lobe);
  const h = blendFill(f, fV, w);
  return { f, fV, h, px: h * sys.lambda * sys.lobe };
}

function describe(sys, radius, w) {
  return `a ${sys.a} ratio ${sys.ratio} e ${sys.e} star ${sys.star} R ${radius} w ${w}`;
}

function runsOf(mask) {
  const runs = [];
  mask.forEach((value, n) => {
    if (!value) return;
    if (n > 0 && mask[n - 1]) runs.at(-1)[1] = n;
    else runs.push([n, n]);
  });
  return runs;
}

function distances(mask) {
  const coupled = [];
  mask.forEach((value, n) => {
    if (value) coupled.push(n);
  });
  return Array.from(mask, (_, j) => Math.min(...coupled.map((c) => Math.abs(c - j))));
}

function checkRamp(mask, ramp) {
  const distance = distances(mask);
  const reference = distance.map((d) => smoothstep(clamp(1 - d / 13, 0, 1)));
  assert.deepEqual(Array.from(ramp), reference);
  distance.forEach((d, j) => {
    if (d === 0) assert.equal(ramp[j], 1);
    if (d >= 13) assert.equal(ramp[j], 0);
  });
  for (let j = 0; j + 1 < ramp.length; j += 1) assert.ok(Math.abs(ramp[j + 1] - ramp[j]) <= 0.12);
  const runs = runsOf(mask);
  if (runs.length === 0) return;
  const first = runs[0][0];
  const last = runs.at(-1)[1];
  for (let j = Math.max(0, first - 12); j < first; j += 1) assert.ok(ramp[j] < ramp[j + 1], `rise at ${j}`);
  for (let j = last; j < Math.min(ramp.length - 1, last + 12); j += 1) assert.ok(ramp[j + 1] < ramp[j], `fall at ${j}`);
  if (first >= 12) assertNear(ramp[first - 12], 0.0168, 5e-5, 'ramp start');
  if (last + 12 < ramp.length) assertNear(ramp[last + 12], 0.0168, 5e-5, 'ramp end');
}

test('log blend on the synthetic grid: exactness, VIMES look, no contact, monotonicity', () => {
  let looks = 0;
  for (const sys of grid) {
    const previous = weights.map(() => 0);
    for (const radius of radiusGrid(sys.lobe)) {
      const f = radius / sys.lobe;
      const vimesPx = logScaledRadius(radius);
      const fV = vimesPx / (sys.lambda * sys.lobe);
      for (let k = 0; k < weights.length; k += 1) {
        const w = weights[k];
        const h = blendFill(f, fV, w);
        const px = h * sys.lambda * sys.lobe;
        if ((f >= F1 || w === 1) && Math.abs(h - f) > 1e-12 * f) assert.fail(`exactness ${describe(sys, radius, w)}`);
        if (w === 0 && f < F1 && f <= fV && fV <= ceiling(f)) {
          looks += 1;
          if (Math.abs(px - vimesPx) > 1e-12 * vimesPx) assert.fail(`look ${describe(sys, radius, w)}`);
        }
        if (f < 1 && !(f <= h && h < 1)) assert.fail(`contact ${describe(sys, radius, w)}`);
        if (!(px > previous[k])) assert.fail(`monotonicity ${describe(sys, radius, w)}`);
        previous[k] = px;
      }
    }
  }
  assert.ok(looks > 0);
});

test('log-space interpolation fails the monotonicity check', () => {
  const failing = grid.some((sys) => {
    let previous = 0;
    for (const radius of radiusGrid(sys.lobe)) {
      const t = smoothstep(clamp(radius / sys.lobe, 0, 1));
      const px = logScaledRadius(radius) ** (1 - t) * (sys.lambda * radius) ** t;
      if (!(px > previous)) return true;
      previous = px;
    }
    return false;
  });
  assert.ok(failing);
});

test('4.1 fixture and donor table', () => {
  assertNear(fixtureScale, 1.414, 5e-4, 'S');
  const sys = system(1000, 1, 0, 0);
  assertNear(sys.lambda * sys.lobe, 160.5, 0.05, 'lambda RocheLobe');
  const small = drawn(sys, 10, 0);
  assertNear(small.f, 0.0264, 5e-5, 'f');
  assertNear(small.fV, 0.324, 5e-4, 'f_V');
  assertNear(ceiling(small.f), 0.341, 5e-4, 'H');
  assert.equal(small.h, small.fV);
  assertNear(small.px, 51.96, 5e-3, 'r_draw');
  const rows = [
    [0.5, 0.709, 0.709, 113.7],
    [0.6, 0.733, 0.733, 117.7],
    [0.7, 0.754, 0.754, 121.0],
    [0.8, 0.772, 0.8, 128.4],
    [0.9, 0.788, 0.9, 144.4],
    [1.0, 0.802, 1.0, 160.5],
  ];
  for (const [f, fV, h, px] of rows) {
    const row = drawn(sys, f * sys.lobe, 0);
    assertNear(row.fV, fV, 5e-4 + 1e-9, `f_V at ${f}`);
    assertNear(row.h, h, 5e-4 + 1e-9, `h at ${f}`);
    assertNear(row.px, px, 0.05 + 1e-9, `r_draw at ${f}`);
  }
});

test('M1/M2 = 0.1 fixture: the ceiling binds and the star stays inside its lobe', () => {
  const sys = system(1000, 0.1, 0, 0);
  assertNear(drawn(sys, F1 * sys.lobe, 0).fV, 2.3, 0.05, 'f_V(F1)');
  for (const f of [0.05, 0.1, 0.2, 0.4, 0.6, 0.79]) {
    const row = drawn(sys, f * sys.lobe, 0);
    assert.equal(row.h, ceiling(f));
    assert.ok(row.h < 1);
  }
});

test('continuity at F1 whichever bound binds', () => {
  const below = system(1000, 1, 0, 0);
  const above = system(1000, 0.1, 0, 0);
  assert.ok(drawn(below, F1 * below.lobe, 0).fV < F1);
  assert.ok(drawn(above, F1 * above.lobe, 0).fV >= F1);
  for (const sys of [below, above]) {
    for (const w of weights) {
      const step = drawn(sys, (F1 + 1e-9) * sys.lobe, w).h - drawn(sys, (F1 - 1e-9) * sys.lobe, w).h;
      assert.ok(Math.abs(step) < 1e-8, `step ${step}`);
    }
  }
});

test('episode ramp on synthetic masks', () => {
  assert.equal(RAMP_FRAMES, 12);
  assertNear(smoothstep(1 / 13), 0.0168, 5e-5, 'smoothstep(1/13)');
  const middle = new Uint8Array(100).fill(1, 40, 56);
  const truncated = new Uint8Array(30).fill(1, 0, 4).fill(1, 25, 30);
  const twin = new Uint8Array(120).fill(1, 20, 30).fill(1, 55, 70);
  const empty = new Uint8Array(50);
  for (const mask of [middle, truncated, twin, empty]) checkRamp(mask, episodeWeights(mask));
  assert.ok(episodeWeights(empty).every((w) => w === 0));
});

for (const index of [0, 1, 2]) {
  test(`episode ramp around the interacting samples of example ${index}`, () => {
    const coupled = Uint8Array.from(exampleScene(index).columns.stage, (name) => (name ? 1 : 0));
    assert.ok(coupled.some((value) => value === 1));
    checkRamp(coupled, episodeWeights(coupled));
  });
}
