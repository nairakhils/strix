import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUN_TEFF,
  approximateLimbDarkening,
  granulation,
  linearColour,
  makeLight,
  unitLuminance,
} from '../src/physics/light.js';

const temperature = Array.from({ length: 81 }, (_, k) => 1000 * 10 ** (k / 40));
const luminance = temperature.map((t) => 1 / Math.expm1(25924 / t));
const light = makeLight({ temperature, luminance });

const limbTable = [
  [3000, 0.62, 0.18],
  [4000, 0.68, 0.12],
  [5000, 0.56, 0.2],
  [5772, 0.44, 0.26],
  [7000, 0.32, 0.32],
  [10000, 0.17, 0.4],
  [20000, 0.13, 0.3],
  [40000, 0.1, 0.25],
];

function srgb(byte) {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

test('sRGB decode', () => {
  const decoded = linearColour([0, 10, 128]);
  [0, 10, 128].forEach((byte, k) => assert.ok(Math.abs(decoded[k] - srgb(byte)) < 1e-15, `${byte}`));
  assert.equal(decoded[0], 0);
  assert.ok(Math.abs(decoded[1] - 10 / 255 / 12.92) < 1e-15);
  assert.ok(Math.abs(decoded[2] - 0.21586) < 1e-4);
  assert.equal(linearColour([255, 255, 255])[0], 1);
});

test('unit luminance', () => {
  const [r, g, b] = unitLuminance(linearColour([200, 120, 40]));
  assert.ok(Math.abs(0.2126 * r + 0.7152 * g + 0.0722 * b - 1) < 1e-12);
  assert.deepEqual(unitLuminance([0, 0, 0]), [1, 1, 1]);
});

test('luminance and surface brightness', () => {
  temperature.forEach((t, k) => assert.equal(light.luminance(t), luminance[k], `${t}`));
  assert.equal(light.luminance(500), luminance[0]);
  assert.equal(light.luminance(1e6), luminance[80]);
  assert.equal(light.surfaceBrightness(SUN_TEFF), 1);
  let previous = light.surfaceBrightness(1000);
  for (let t = 1010; t < 99000; t *= 1.01) {
    const brightness = light.surfaceBrightness(t);
    assert.ok(brightness > previous, `${t}`);
    previous = brightness;
  }
});

test('limb darkening stays positive and below centre', () => {
  for (const t of [2000, 3000, 4500, SUN_TEFF, 8000, 15000, 40000, 1e5, 2e5]) {
    const [u1, u2] = approximateLimbDarkening(t);
    for (let k = 0; k <= 100; k++) {
      const edge = 1 - k / 100;
      const intensity = 1 - u1 * edge - u2 * edge * edge;
      assert.ok(intensity > 0 && intensity <= 1, `${t} mu ${k / 100}: ${intensity}`);
    }
  }
});

test('limb darkening approximation follows the table', () => {
  for (const [t, u1, u2] of limbTable) {
    const [a, b] = approximateLimbDarkening(t);
    assert.ok(Math.abs(a - u1) <= 0.05, `${t} u1 ${a} vs ${u1}`);
    assert.ok(Math.abs(b - u2) <= 0.05, `${t} u2 ${b} vs ${u2}`);
  }
});

test('limb darkening approximation is continuous and keeps the profile positive and decreasing', () => {
  let previous = approximateLimbDarkening(2000);
  for (let t = 2000 * (1 + 1e-4); t <= 200000; t *= 1 + 1e-4) {
    const [u1, u2] = approximateLimbDarkening(t);
    assert.ok(Math.abs(u1 - previous[0]) <= 1e-3 && Math.abs(u2 - previous[1]) <= 1e-3, `jump at ${t}`);
    assert.ok(u1 + u2 < 1 && u1 + 2 * u2 > 0, `${t}: ${u1} ${u2}`);
    previous = [u1, u2];
  }
});

test('granulation', () => {
  const sun = granulation(SUN_TEFF, 1, 1);
  assert.equal(sun.cells, 400);
  assert.equal(sun.amplitude, 0.12);
  const supergiant = granulation(3500, 15, 1000);
  assert.ok(supergiant.cells > 8 && supergiant.cells < 16, `${supergiant.cells}`);
  assert.equal(granulation(8000, 2, 2).amplitude, 0);
});
