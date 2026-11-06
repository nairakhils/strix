import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commonEnvelope,
  donorMass,
  ejectedMass,
  frontAt,
  L2_LEVER,
  lossLever,
  outflowProfile,
  outflowRate,
  overflowCoefficient,
  separationAt,
} from '../src/physics/envelope.js';
import { envelopeText } from '../src/hud/hud.js';
import { exampleDirector, exampleScene } from './scenes.mjs';

const YEAR = 3.15576e7;

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${label}: ${actual} vs ${expected}`);
}

function distance(p, q) {
  return Math.hypot(...p.map((x, k) => x - q[k]));
}

function exampleModel() {
  const event = exampleScene(1).header.events.find(({ kind }) => kind === 'envelope');
  const { start, end } = event;
  return commonEnvelope({
    donor: start.m2,
    core: end.m2,
    accretor: start.m1,
    radius: start.r2,
    coreRadius: end.r2,
    a0: start.a,
    e0: start.e,
    aF: end.a,
    teff: start.teff2,
  });
}

test('overflow and angular momentum loss follow the MacLeod & Loeb calibration', () => {
  near(overflowCoefficient(0.1), 0.62, 1e-12, 'alpha at q = 0.1');
  near(lossLever(10, 1), 11.56, 0.05, 'gamma at q = 0.1');
  near(lossLever(10, 3), 6.2, 0.06, 'gamma at q = 0.3');
});

test('the runaway sheds about a quarter of the accretor mass before engulfment', () => {
  const model = exampleModel();
  const share = model.lost / model.accretor;
  assert.ok(share > 0.2 && share < 0.4, `lost ${share} of the accretor mass`);
  let a = Infinity;
  let rate = 0;
  for (let k = 0; k <= 100; k += 1) {
    const t = (k / 100) * model.engulfed * 0.999;
    assert.ok(separationAt(model, t) <= a);
    assert.ok(outflowRate(model, t) >= rate);
    a = separationAt(model, t);
    rate = outflowRate(model, t);
  }
  near(separationAt(model, model.engulfed), model.radius, 1e-9, 'engulfed at the donor radius');
});

test('drag unbinds the envelope from the outside in and leaves the core', () => {
  const model = exampleModel();
  assert.ok(model.finish > model.engulfed);
  let front = Infinity;
  for (let k = 0; k <= 200; k += 1) {
    const t = model.engulfed + (k / 200) * (model.finish - model.engulfed);
    assert.ok(frontAt(model, t) <= front);
    front = frontAt(model, t);
  }
  near(ejectedMass(model, model.finish), model.envelope, 1e-6, 'all of the envelope');
  near(donorMass(model, model.finish), model.core, 1e-6, 'core mass');
  near(separationAt(model, model.finish), model.aF, 1e-9, 'final separation');
  model.shells.slice(1).forEach((shell, j) => assert.ok(shell.t >= model.shells[j].t, `shell ${j + 1} leaves before shell ${j}`));
});

test('the L2 outflow thins and cools away from the binary', () => {
  const model = exampleModel();
  const t = model.engulfed * 0.999;
  const radii = [1.1, 1.5, 2, 3].map((x) => x * L2_LEVER * separationAt(model, t));
  const profile = outflowProfile(model, t, radii);
  profile.slice(1).forEach((point, k) => {
    assert.ok(point.density > 0 && point.density < profile[k].density, `density at ${radii[k + 1]}`);
    assert.ok(point.temperature < profile[k].temperature, `temperature at ${radii[k + 1]}`);
  });
});

test('the L2 outflow has no hard edge where it stops at engulfment', () => {
  const model = exampleModel();
  const t = model.engulfed + 0.5 * (model.finish - model.engulfed);
  const inner = L2_LEVER * model.radius + model.outflow * (t - model.engulfed);
  const radii = Array.from({ length: 41 }, (_, k) => inner * (0.8 + (0.4 * k) / 40));
  const density = outflowProfile(model, t, radii).map(({ density }) => density);
  const peak = Math.max(...density);
  density.slice(1).forEach((value, k) => assert.ok(Math.abs(value - density[k]) < 0.2 * peak, `jump at ${radii[k + 1]}`));
});

test('example 1: the common envelope is continuous at both ends and ends on the given binary', () => {
  const cinematic = exampleDirector(1);
  const event = exampleScene(1).header.events.find(({ kind }) => kind === 'envelope');
  const [first, last] = event.during;
  const edge = (u) => [cinematic.stateAt(u - 1e-7), cinematic.stateAt(u)];
  for (const u of [first, last + 1]) {
    const [before, after] = edge(u);
    before.stars.forEach((star, k) => assert.ok(distance(star.position, after.stars[k].position) < 1e-3, `star ${k + 1} at ${u}`));
    near(after.hud.m2, before.hud.m2, 1e-6, `m2 at ${u}`);
  }
  const end = cinematic.stateAt(last + 1).hud;
  near(end.a, event.end.a, 1e-9, 'a');
  near(end.m2, event.end.m2, 1e-9, 'm2');
});

test('example 1: the HUD walks through runaway, plunge and ejection while the black hole stays shown', () => {
  const cinematic = exampleDirector(1);
  const [first, last] = exampleScene(1).header.events.find(({ kind }) => kind === 'envelope').during;
  const start = cinematic.timeAt(first);
  const stages = [];
  for (let clock = start; clock < cinematic.timeAt(last + 1); clock += 0.1) {
    const state = cinematic.stateAt(cinematic.uAtTime(clock));
    const stage = state.hud.envelope?.stage;
    if (stage && stage !== stages.at(-1)) stages.push(stage);
    assert.equal(state.stars[0].visible, true);
    assert.ok(Number.isFinite(state.emissionScale) && state.emissionScale > 0);
  }
  assert.deepEqual(stages, ['runaway', 'plunge', 'ejected']);
});

test('the envelope note names the outflow, the plunge and the ejecta', () => {
  const base = { donor: 1, companion: 'BH', rate: 0.28, lost: 1.28, ejected: 2.67, envelope: 18, speed: 121.7, temperature: 4560 };
  assert.deepEqual(envelopeText({ ...base, stage: 'runaway', until: 725 * 86400 }), [
    'star 2 overflows through L2: 0.28 M☉/yr, 1.28 M☉ lost',
    'unstable mass transfer; black hole engulfed in 725 days',
  ]);
  assert.deepEqual(envelopeText({ ...base, stage: 'plunge', since: 163 * 86400 }), [
    'common envelope: the black hole spirals into star 2',
    '2.67 of 18.00 M☉ envelope unbound',
    '163 days since engulfment',
  ]);
  assert.deepEqual(envelopeText({ ...base, stage: 'ejected', since: 2.7 * YEAR }), [
    'envelope ejected: 18.00 M☉ at 122 km/s',
    'ejecta 4600 K',
    '2.7 years since engulfment',
  ]);
  assert.deepEqual(envelopeText(null), []);
});
