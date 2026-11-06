import test from 'node:test';
import assert from 'node:assert/strict';
import {
  barycentric,
  eccentricAnomaly,
  orbitalPeriodYears,
  relativeOrbit,
} from '../src/physics/kepler.js';
import { RSUN_PER_AU } from '../src/physics/units.js';

function wrapped(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function sweep(e, meanAnomaly, step) {
  const before = relativeOrbit(1, e, meanAnomaly - step);
  const after = relativeOrbit(1, e, meanAnomaly + step);
  return Math.atan2(before.x * after.y - before.y * after.x, before.x * after.x + before.y * after.y);
}

test('kepler residual below 1e-12', () => {
  for (const e of [0, 0.3, 0.5, 0.9, 0.99]) {
    for (let k = -400; k <= 400; k++) {
      const meanAnomaly = (k * Math.PI) / 100 + 1e-3 * k;
      const anomaly = eccentricAnomaly(meanAnomaly, e);
      const residual = wrapped(anomaly - e * Math.sin(anomaly) - meanAnomaly);
      assert.ok(Math.abs(residual) < 1e-12, `e ${e} M ${meanAnomaly}: ${residual}`);
      assert.ok(anomaly >= -Math.PI && anomaly <= Math.PI, `E ${anomaly}`);
    }
  }
});

test('barycentre stays fixed', () => {
  const [m1, m2] = [3, 1.7];
  for (let k = 0; k < 200; k++) {
    const { x, y } = relativeOrbit(2.5, 0.5, (2 * Math.PI * k) / 200);
    const [[x1, y1], [x2, y2]] = barycentric(x, y, m1, m2);
    assert.ok(Math.abs(m1 * x1 + m2 * x2) < 1e-12, `x at ${k}`);
    assert.ok(Math.abs(m1 * y1 + m2 * y2) < 1e-12, `y at ${k}`);
    assert.ok(Math.abs(x2 - x1 - x) < 1e-12 && Math.abs(y2 - y1 - y) < 1e-12, `separation at ${k}`);
  }
  assert.deepEqual(barycentric(2, 4, 0, 0), [[-1, -2], [1, 2]]);
});

test('pericentre on +x, counter-clockwise and faster', () => {
  const e = 0.5;
  const pericentre = relativeOrbit(1, e, 0);
  assert.ok(Math.abs(pericentre.x - (1 - e)) < 1e-15 && pericentre.y === 0);
  assert.ok(relativeOrbit(1, e, 1e-3).y > 0);
  const near = sweep(e, 0, 1e-4);
  const far = sweep(e, Math.PI, 1e-4);
  assert.ok(near > 0 && far > 0);
  const expected = (1 + e) ** 2 / (1 - e) ** 2;
  assert.ok(Math.abs(near / far / expected - 1) < 0.01, `${near / far}`);
});

test('orbital period of one AU around one solar mass', () => {
  assert.equal(orbitalPeriodYears(RSUN_PER_AU, 1), 1);
  assert.ok(Math.abs(orbitalPeriodYears(4 * RSUN_PER_AU, 4) - 4) < 1e-12);
});
