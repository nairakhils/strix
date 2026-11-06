import test from 'node:test';
import assert from 'node:assert/strict';
import { blackbodyPalette, blackbodyRgb, blackbodyXyz } from '../src/physics/blackbody.js';
import { makeLight, paletteColour } from '../src/physics/light.js';

test('blackbody colours run from red through white to blue', () => {
  const [r3, g3, b3] = blackbodyRgb(3000);
  assert.ok(r3 === 255 && g3 < 200 && b3 < 150, `3000 K ${[r3, g3, b3]}`);
  const sun = blackbodyRgb(5772);
  assert.ok(Math.min(...sun) > 220, `sun ${sun}`);
  const [r30, g30, b30] = blackbodyRgb(30000);
  assert.ok(b30 === 255 && r30 < 200 && g30 < 230, `30000 K ${[r30, g30, b30]}`);
});

test('the luminous efficacy follows Wien at low temperature and Rayleigh-Jeans at high', () => {
  const y = (t) => blackbodyXyz(t)[1];
  assert.ok(y(2000) / y(1000) > 1000);
  const slope = Math.log(y(4e6) / y(2e6)) / Math.log(2);
  assert.ok(Math.abs(slope - 1) < 0.01, `slope ${slope}`);
});

test('the default palette drives the light model like any other palette', () => {
  const palette = blackbodyPalette();
  assert.equal(palette.temperature.length, 256);
  assert.deepEqual(paletteColour(palette, palette.temperature[10]), palette.rgb[10]);
  const light = makeLight(palette);
  assert.ok(Math.abs(light.surfaceBrightness(5772) - 1) < 1e-12);
  assert.ok(light.surfaceBrightness(20000) > light.surfaceBrightness(5772));
});
