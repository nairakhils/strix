import test from 'node:test';
import assert from 'node:assert/strict';
import { EASE_SIGMA, TAU, TAU_SETTLE, envelope, framing, framingAt, gaussianSmooth } from '../src/director/framing.js';

const raw = Float64Array.from(
  { length: 600 },
  (_, n) => 2 * Math.sin(0.37 * n) + 5 * Math.sin(0.051 * n) + (n % 97 === 0 ? 4 : 0),
);
const edge = Math.ceil(3 * EASE_SIGMA) + 1;

function rawAt(values, u) {
  const i = Math.min(Math.floor(u), values.length - 2);
  return values[i] + (values[i + 1] - values[i]) * (u - i);
}

function bruteEnvelope(values, u) {
  return Math.max(...Array.from(values, (value, k) => value - (k <= u ? (u - k) / TAU_SETTLE : (k - u) / TAU)));
}

function stepRaw(length, at, from, to) {
  return Float64Array.from({ length }, (_, n) => (n < at ? from : to));
}

test('envelope is the exact asymmetric max and never below the raw values', () => {
  const env = envelope(raw, TAU, TAU_SETTLE);
  raw.forEach((value, n) => {
    assert.ok(env[n] >= value);
    assert.ok(Math.abs(env[n] - bruteEnvelope(raw, n)) <= 1e-12, `exact at ${n}`);
  });
});

test('framed size is never below the raw size', () => {
  const framed = framing(raw);
  raw.forEach((value, n) => assert.ok(framed[n] >= value, `below raw at ${n}`));
  for (let u = 0; u <= raw.length - 1; u += 0.13) {
    assert.ok(framingAt(framed, u, -Infinity) >= rawAt(raw, u), `below raw at ${u}`);
    assert.ok(framingAt(framed, u, rawAt(raw, u)) >= rawAt(raw, u));
  }
});

test('framed size changes no faster than the settling rate', () => {
  const framed = framing(raw);
  const du = 0.13;
  for (let u = edge; u + du <= raw.length - 1 - edge; u += du) {
    const step = framingAt(framed, u + du, rawAt(raw, u + du)) - framingAt(framed, u, rawAt(raw, u));
    assert.ok(Math.abs(step) <= du / TAU_SETTLE + 1e-12, `step ${step} at ${u}`);
  }
});

test('settling after a fall is faster than the anticipation before a rise', () => {
  const size = 3;
  const fall = stepRaw(800, 400, size, 0);
  const rise = stepRaw(800, 400, 0, size);
  const fallen = framing(fall);
  const risen = framing(rise);
  let settled = fall.length - 1;
  while (settled > 400 && fallen[settled - 1] - fall[settled - 1] <= Math.log(1.1)) settled -= 1;
  let early = 0;
  while (risen[early] - rise[early] <= 0.01) early += 1;
  const settle = settled - 400;
  const lead = 400 - early;
  assert.ok(settle > 0 && settle < lead, `settle ${settle}, lead ${lead}`);
  assert.ok(risen[400 - 2 * TAU] >= 1 - 1e-12);
  for (const [framed, values] of [[fallen, fall], [risen, rise]]) {
    values.forEach((value, n) => assert.ok(framed[n] >= value, `below raw at ${n}`));
    for (let n = 1; n < values.length; n += 1) {
      assert.ok(Math.abs(framed[n] - framed[n - 1]) <= 1 / TAU_SETTLE + 1e-12, `jump at ${n}`);
    }
  }
});

test('gaussianSmooth preserves constants and interior ramps', () => {
  for (const length of [1, 10, 500]) {
    for (const sigma of [0.7, 25]) {
      const smoothed = gaussianSmooth(new Float64Array(length).fill(7.3), sigma);
      smoothed.forEach((value) => assert.ok(Math.abs(value - 7.3) <= 1e-12 * 7.3));
    }
  }
  const ramp = Float64Array.from({ length: 500 }, (_, n) => 0.5 * n - 3);
  const smoothed = gaussianSmooth(ramp, 25);
  for (let n = 75; n < 425; n += 1) assert.ok(Math.abs(smoothed[n] - ramp[n]) <= 1e-9);
});
