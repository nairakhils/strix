import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ELECTRON_MOLECULAR_WEIGHT,
  ionisedFraction,
  profileTable,
  scatteringDepth,
  scatteringProfile,
  terminalSpeed,
  terminalSpeedRatio,
  windCrossings,
  windDepth,
} from '../src/physics/wind.js';

test('terminal speed follows the Lamers et al. ratios away from the jumps', () => {
  assert.ok(Math.abs(terminalSpeedRatio(40000) - 2.6) < 1e-3);
  assert.ok(Math.abs(terminalSpeedRatio(15000) - 1.3) < 1e-3);
  assert.ok(Math.abs(terminalSpeedRatio(5000) - 0.7) < 1e-3);
  for (let t = 3000; t < 60000; t += 50) assert.ok(terminalSpeedRatio(t + 50) >= terminalSpeedRatio(t));
});

test('terminal speed of a 30 M_sun, 15 R_sun O star is about 2300 km/s', () => {
  const speed = terminalSpeed(35000, 30, 15) / 1e5;
  assert.ok(speed > 2200 && speed < 2350, `${speed} km/s`);
});

test('scattering depth matches sigma_T Mdot / (4 pi R v_inf mu_e m_p)', () => {
  const rate = (1e-6 * 1.989e33) / 3.15576e7;
  const expected = (6.6524587e-25 * rate) / (4 * Math.PI * 15 * 6.957e10 * 2e8 * ELECTRON_MOLECULAR_WEIGHT * 1.67262e-24);
  assert.ok(Math.abs(scatteringDepth(1e-6, 15, 2e8) / expected - 1) < 1e-12);
  assert.ok(Math.abs(scatteringDepth(2e-6, 15, 2e8) / scatteringDepth(1e-6, 15, 2e8) - 2) < 1e-12);
  assert.ok(Math.abs(scatteringDepth(1e-6, 30, 2e8) / scatteringDepth(1e-6, 15, 2e8) - 0.5) < 1e-12);
});

test('neutral winds of cool stars scatter nothing', () => {
  assert.equal(ionisedFraction(5000), 0);
  assert.equal(ionisedFraction(20000), 1);
  assert.equal(windDepth({ mdot: 1e-5, teff: 3600, mass: 15, radius: 1000 }), 0);
  assert.equal(windDepth({ mdot: 0, teff: 40000, mass: 30, radius: 15 }), 0);
});

test('the scattered-light profile falls monotonically to pi / (8 p^3)', () => {
  const table = profileTable();
  for (let k = 1; k < table.length; k += 1) assert.ok(table[k] < table[k - 1]);
  const far = 400;
  assert.ok(Math.abs((scatteringProfile(far) * far ** 3) / (Math.PI / 8) - 1) < 5e-3);
});

test('wind crossings count stellar radii travelled at the terminal speed', () => {
  const day = 86400;
  const crossings = windCrossings(day, 40000, 30, 10);
  assert.ok(Math.abs(crossings / ((day * terminalSpeed(40000, 30, 10)) / (10 * 6.957e10)) - 1) < 1e-12);
  assert.equal(windCrossings(0, 40000, 30, 10), 0);
  assert.equal(windCrossings(day, 40000, 0, 10), 0);
});
