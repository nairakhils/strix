import test from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLE_LAUNCH, closestApproach, integrateStream, jacobi, streamBundle, streamPath } from '../src/physics/stream.js';
import { lagrangeL1 } from '../src/physics/roche.js';
import {
  accretionLuminosity,
  diskTemperature,
  eddingtonRate,
  ratePerSecond,
  spherisationRadius,
  spotTemperature,
  viscousYears,
} from '../src/physics/disk.js';
import { outflowDepth, scatteringDepth } from '../src/physics/wind.js';
import { outflowPhotosphere } from '../src/director/transfer.js';
import { accretedFraction, textbookTrack, transferTrack } from '../src/physics/transfer.js';

const close = (value, expected, tolerance) => Math.abs(value / expected - 1) <= tolerance;

test('the ballistic stream matches the Lubow & Shu fits for 0.2 <= q <= 1', () => {
  for (const q of [0.2, 0.3, 0.5, 0.7, 1]) {
    const { minimum, circularisation } = closestApproach(q, 0.01);
    assert.ok(close(minimum, 0.0488 * q ** -0.464, 0.03), `r_min ${minimum} at q ${q}`);
    assert.ok(close(circularisation, 0.0859 * q ** -0.426, 0.02), `r_circ ${circularisation} at q ${q}`);
  }
});

test('the stream conserves the Jacobi constant', () => {
  for (const q of [0.1, 1, 3]) {
    const { samples } = integrateStream(q, 0.01);
    const start = jacobi(q, samples[0]);
    const end = jacobi(q, samples[samples.length - 1]);
    assert.ok(Math.abs(end / start - 1) < 1e-7, `drift at q ${q}`);
  }
});

test('a stream stopped at a radius ends on that radius', () => {
  const { path, impact } = streamPath(0.5, 0.01, 0.1);
  assert.ok(Math.abs(Math.hypot(impact[0] - 1, impact[1]) - 0.1) < 1e-9);
  const last = path.length - 5;
  assert.ok(Math.abs(Math.hypot(path[last] - 1, path[last + 1]) - 0.1) < 1e-9);
});

const exampleTwo = { md0: 16.96, ma0: 14.98, a0: 43.1, md1: 4.44, ma1: 27.5, a1: 141.8 };

test('the orbit track is exact at both endpoints', () => {
  const a = transferTrack(exampleTwo);
  assert.ok(close(a(0), 43.1, 1e-12));
  assert.ok(close(a(1), 141.8, 1e-12));
});

test('conservative transfer reproduces a proportional to (Md Ma)^-2', () => {
  const logs = textbookTrack(exampleTwo);
  const { md0, ma0, a0, md1, ma1 } = exampleTwo;
  const a1 = (Math.exp(2 * logs[logs.length - 1]) * (md1 + ma1)) / (md1 * md1 * ma1 * ma1);
  assert.equal(accretedFraction(exampleTwo), 1);
  assert.ok(close(a1, a0 * ((md0 * ma0) / (md1 * ma1)) ** 2, 1e-9));
});

test('the accreted fraction follows the masses', () => {
  const beta = accretedFraction({ md0: 46.07, ma0: 52.03, md1: 24.76, ma1: 52.39 });
  assert.ok(close(beta, 0.36 / 21.31, 1e-9));
});

test('the disk follows Shakura & Sunyaev, peaking at 49/36 of the inner radius', () => {
  const disk = { mass: 27, rate: ratePerSecond(1.35e-2), inner: 7 };
  assert.equal(diskTemperature(7, disk), 0);
  const peak = diskTemperature((49 / 36) * 7, disk);
  for (const r of [8, 9.2, 10, 12]) assert.ok(diskTemperature(r, disk) <= peak + 1e-9);
  const far = diskTemperature(700000, disk) / diskTemperature(350000, disk);
  assert.ok(close(far, 2 ** -0.75, 1e-3));
});

test('inside the spherisation radius the disk temperature falls as r^-1/2', () => {
  const rate = ratePerSecond(0.78);
  const disk = { mass: 18, rate, inner: 2.3e-4, sphere: spherisationRadius(18, rate) };
  assert.ok(disk.sphere > 100);
  assert.ok(close(diskTemperature(40, disk) / diskTemperature(10, disk), 4 ** -0.5, 1e-3));
});

test('the hot spot temperature scales as (Mdot v^2)^(1/4)', () => {
  const base = spotTemperature(1e23, 5e7, 2);
  assert.ok(close(spotTemperature(1.6e24, 5e7, 2) / base, 2, 1e-12));
  assert.ok(close(spotTemperature(1e23, 2e8, 2) / base, 2, 1e-12));
});

test('the viscous time follows r^2 Omega / (alpha c_s^2)', () => {
  const years = viscousYears(20, 27, 25000);
  const r = 20 * 6.957e10;
  const omega = Math.sqrt((6.674e-8 * 27 * 1.989e33) / r ** 3);
  const sound2 = (1.380649e-16 * 25000) / (0.6 * 1.6735e-24);
  assert.ok(close(years, (r * r * omega) / (0.1 * sound2) / 3.15576e7, 1e-12));
  assert.ok(years > 3 && years < 30, `${years} yr`);
});

test('the stream bundle leaves L1 and reaches the Lubow & Shu closest approach', () => {
  for (const q of [0.3, 1, 3]) {
    const bundle = streamBundle(q);
    const { minimum } = closestApproach(q, BUNDLE_LAUNCH);
    const closest = Array.from(bundle.lengths, (n, k) => {
      const o = 4 * (k * bundle.samples + n - 1);
      return Math.hypot(bundle.data[o] - 1, bundle.data[o + 1]);
    });
    for (let k = 0; k < bundle.tracks; k += 1) {
      assert.ok(Math.abs(bundle.data[4 * k * bundle.samples] - lagrangeL1(q)) < 1e-6, `track ${k} starts at L1`);
      assert.ok(bundle.lengths[k] < bundle.samples, `track ${k} reaches its closest approach`);
    }
    const mean = closest.reduce((sum, r) => sum + r, 0) / closest.length;
    assert.ok(close(mean, minimum, 0.15), `mean closest ${mean} vs ${minimum} at q ${q}`);
  }
});

test('the stream bundle is the same every time it is built', () => {
  const [one, two] = [streamBundle(0.7), streamBundle(0.7)];
  assert.deepEqual(one.lengths, two.lengths);
  assert.deepEqual(one.data, two.data);
});

test('accretion releases GM Mdot / R up to the Eddington limit and only logarithmically above it', () => {
  const eddington = (4 * Math.PI * 6.674e-8 * 10 * 1.989e33 * 2.99792458e10) / 0.34;
  const rate = (eddington * 0.01 * 6.957e10) / (6.674e-8 * 10 * 1.989e33);
  const limit = accretionLuminosity(10, rate, 0.01);
  assert.ok(Math.abs(limit / (eddington / 3.828e33) - 1) < 1e-12, `${limit} L_sun`);
  assert.ok(Math.abs(accretionLuminosity(10, 0.5 * rate, 0.01) / limit - 0.5) < 1e-12);
  assert.ok(Math.abs(accretionLuminosity(10, Math.E * rate, 0.01) / limit - 2) < 1e-12);
});

test('a white dwarf swells no smaller than itself and shines with what it accretes', () => {
  const dwarf = { kind: 'WD', mass: 0.8, radius: 0.012, teff: 20000, lobe: 0.5 };
  const shell = outflowPhotosphere({ rate: 1e-6, accreted: 0.1 }, dwarf);
  assert.ok(shell.radius >= dwarf.radius && shell.radius <= 0.9 * dwarf.lobe, `${shell.radius}`);
  const released = (6.674e-8 * 0.8 * 1.989e33 * ratePerSecond(1e-6)) / (2 * 0.012 * 6.957e10) / 3.828e33;
  assert.ok(Math.abs(shell.light / released - 1) < 1e-9, `${shell.light} L_sun`);
  assert.equal(outflowPhotosphere({ rate: 1e-6, accreted: 1 }, dwarf), null);
});

test('the re-emitted outflow leaves at the escape speed from where it is launched', () => {
  const escape = Math.sqrt((2 * 6.674e-8 * 10 * 1.989e33) / (5 * 6.957e10));
  assert.ok(Math.abs(outflowDepth(1e-3, 10, 5) / scatteringDepth(1e-3, 5, escape) - 1) < 1e-12);
  assert.equal(outflowDepth(0, 10, 5), 0);
});
