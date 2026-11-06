import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COOLING_TEMPERATURE,
  afterCollapse,
  ejectaSpeed,
  escapeSpeed,
  explosionEnergy,
  hyperbolicAnomaly,
  orbitState,
  plateauSeconds,
  shockTemperature,
} from '../src/physics/collapse.js';
import { CORE_BREAK, OUTER_SLOPE, ejectaDensity } from '../src/physics/ejecta.js';
import { AZIMUTH0, BLAST_ZOOM, FIXED_ELEVATION } from '../src/director/director.js';
import { collapseText, elapsedText, orbitText } from '../src/hud/hud.js';
import { exampleDirector, exampleScene } from './scenes.mjs';

const DAY = 86400;
const KM_PER_RSUN = 695700;

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${label}: ${actual} vs ${expected}`);
}

function distance(p, q) {
  return Math.hypot(...p.map((x, k) => x - q[k]));
}

function collapsesOf(index) {
  return exampleScene(index).header.events.filter((event) => event.kind === 'collapse');
}

test('ejecta move at the speed of a uniform sphere carrying the explosion energy', () => {
  near(ejectaSpeed(1, 1e51) * KM_PER_RSUN, Math.sqrt(10e51 / (3 * 1.989e33)) / 1e5, 1e-12, 'speed');
  assert.equal(explosionEnergy(0.2), 1e48);
  assert.equal(explosionEnergy(2), 1e51);
  assert.equal(ejectaSpeed(0), 0);
});

test('the photospheric phase follows the Popov scaling', () => {
  near(plateauSeconds(10, 500, 1e51), 99 * DAY, 1e-12, 'reference');
  near(plateauSeconds(40, 500, 1e51) / plateauSeconds(10, 500, 1e51), 2, 1e-12, 'mass');
  near(plateauSeconds(10, 500 * 64, 1e51) / plateauSeconds(10, 500, 1e51), 2, 1e-12, 'radius');
  near(plateauSeconds(10, 500, 64e51) / plateauSeconds(10, 500, 1e51), 0.5, 1e-12, 'energy');
});

test('shock cooling starts hot and falls with time', () => {
  near(shockTemperature(500, DAY), COOLING_TEMPERATURE, 1e-12, 'one day');
  let previous = Infinity;
  for (const days of [0.01, 0.1, 1, 10]) {
    const value = shockTemperature(500, days * DAY);
    assert.ok(value < previous);
    previous = value;
  }
  assert.ok(shockTemperature(1, DAY) < shockTemperature(1000, DAY));
});

test('mass loss alone from a circular orbit needs no kick and gives the Blaauw orbit', () => {
  const [a, before, after] = [100, 30, 25];
  const state = orbitState(a, 0, 1.3, before);
  const post = afterCollapse({ ...state, mass: after, a: (a * after) / (2 * after - before), e: (before - after) / after });
  assert.ok(post.bound);
  assert.ok(post.kick < 1e-6, `kick ${post.kick}`);
  near(post.e, (before - after) / after, 1e-9, 'e');
  near(post.a, (a * after) / (2 * after - before), 1e-9, 'a');
});

test('an orbit Blaauw cannot reach is met with the smallest kick', () => {
  const state = orbitState(100, 0, 0.4, 30);
  const post = afterCollapse({ ...state, mass: 25, a: 150, e: 0.5 });
  assert.ok(post.kick > 10);
  near(post.a, 150, 1e-9, 'a');
  near(post.e, 0.5, 1e-9, 'e');
  const unbound = afterCollapse({ ...state, mass: 12, a: -20, e: 4 });
  assert.equal(unbound.bound, false);
  near(unbound.e, 4, 1e-9, 'hyperbolic e');
});

test('the hyperbolic Kepler equation is solved', () => {
  for (const [mean, e] of [[0.1, 1.2], [5, 3], [-40, 20.6]]) {
    const anomaly = hyperbolicAnomaly(mean, e);
    near(e * Math.sinh(anomaly) - anomaly, mean, 1e-9, `M ${mean}`);
  }
});

test('the ejecta are a flat core with a steep outer fall', () => {
  assert.equal(ejectaDensity(0.2), 1);
  assert.equal(ejectaDensity(CORE_BREAK), 1);
  near(ejectaDensity(1), (1 / CORE_BREAK) ** -OUTER_SLOPE, 1e-12, 'edge');
});

for (const index of [0, 1, 2]) {
  test(`example ${index}: each collapse keeps the stars in place and swaps in the remnant`, () => {
    const cinematic = exampleDirector(index);
    for (const { star, during: [first, last], end } of collapsesOf(index)) {
      const before = cinematic.stateAt(first - 1e-7);
      const after = cinematic.stateAt(first);
      for (const k of [0, 1]) {
        if (!before.stars[k].visible || after.hud.disrupted) continue;
        assert.ok(distance(before.stars[k].position, after.stars[k].position) < 1e-4, `star ${k + 1} at ${first}`);
      }
      for (const u of [first, (first + last) / 2, last]) {
        const { hud } = cinematic.stateAt(u);
        near(hud.m1, end.m1, 1e-12, `m1 at ${u}`);
        near(hud.m2, end.m2, 1e-12, `m2 at ${u}`);
        assert.equal(hud.collapse.star, star - 1);
      }
    }
  });

  test(`example ${index}: the ejecta grow and cool, the binary shows through, the light fades by the end`, () => {
    const cinematic = exampleDirector(index);
    for (const { star, during: [first, last], start: before } of collapsesOf(index)) {
      const start = cinematic.timeAt(first);
      const end = cinematic.timeAt(last + 1);
      const framed = cinematic.stateAt(first - 1).rsunPerUnit;
      const bound = before.a > 0 && before.e < 1;
      let radius = 0;
      let temperature = Infinity;
      for (let clock = start; clock < end; clock += 0.05) {
        const state = cinematic.stateAt(cinematic.uAtTime(clock));
        const { explosion } = state;
        if (!explosion) continue;
        const size = explosion.radius * state.rsunPerUnit;
        assert.ok(size >= radius, `ejecta shrink at ${clock}`);
        assert.ok(explosion.temperature <= temperature, `ejecta heat up at ${clock}`);
        radius = size;
        temperature = explosion.temperature;
        if (!bound) continue;
        assert.ok(state.rsunPerUnit <= 1.1 * BLAST_ZOOM * framed, `zoomed out ${state.rsunPerUnit / framed} times at ${clock}`);
        const companion = state.stars[2 - star];
        if (companion.kind === 'star' && !state.hud.disrupted) assert.equal(companion.visible, true, `companion hidden at ${clock}`);
      }
      assert.ok(radius > 0);
      const done = cinematic.stateAt(last + 1).explosion;
      assert.ok(!done || done.fade < 1e-6, `light left at ${last + 1}`);
    }
  });
}

test('the failed collapse in example 0 needs no kick and keeps the orbit', () => {
  const [first] = collapsesOf(0)[0].during;
  const { collapse } = exampleDirector(0).stateAt(first + 1).hud;
  assert.equal(collapse.failed, true);
  assert.equal(collapse.boundAfter, true);
  assert.ok(collapse.kick < 1);
  near(collapse.speed, 960, 0.05, 'ejecta speed');
});

test('the unbound pair keeps the hyperbola it was given at the kick', () => {
  near(escapeSpeed(1, -1), Math.sqrt(6.674e-8 * 1.989e33 / 6.957e10) / 1e5, 1e-9, 'unit escape speed');
  const cinematic = exampleDirector(2);
  const event = collapsesOf(2).find(({ end }) => end.a < 0);
  const { end } = event;
  const expected = escapeSpeed(end.m1 + end.m2, end.a);
  for (let u = event.during[0]; u < cinematic.frameCount; u += 37) {
    const { hud } = cinematic.stateAt(u);
    near(hud.a, end.a, 1e-9, `a at ${u}`);
    near(hud.e, end.e, 1e-9, `e at ${u}`);
    near(hud.escape, expected, 1e-9, `escape speed at ${u}`);
  }
  assert.equal(orbitText({ a: -6.81, e: 20.58, escape: 901.2, modelled: null }), 'unbound: a = -6.81 R☉   e = 20.58   v∞ = 901 km/s');
  assert.equal(orbitText({ a: 142.9, e: 0, escape: null, modelled: null }), 'a = 142.90 R☉   e = 0.00');
});

test('the fixed camera keeps one bearing and elevation for the whole movie', () => {
  const cinematic = exampleDirector(1);
  for (let u = 0; u < cinematic.frameCount; u += 13.7) {
    const { camera } = cinematic.stateAt(u);
    const away = camera.position.map((x, k) => x - camera.target[k]);
    near(Math.atan2(away[1], Math.hypot(away[0], away[2])), FIXED_ELEVATION, 1e-9, `elevation at ${u}`);
    near(Math.atan2(away[2], away[0]), Math.atan2(Math.sin(AZIMUTH0), Math.cos(AZIMUTH0)), 1e-9, `bearing at ${u}`);
  }
});

test('the collapse note names the remnant, the ejecta and what happened to the orbit', () => {
  const note = {
    star: 0,
    ejected: 2.564,
    speed: 7712,
    failed: false,
    kick: 0,
    boundBefore: true,
    boundAfter: true,
    e: 0.056,
    remnant: 'NS',
    since: 3 * DAY,
  };
  assert.deepEqual(collapseText(note), [
    'star 1 explodes, leaving a NS; 2.56 M☉ ejected at 7710 km/s',
    'mass loss alone, no kick; orbit stays bound, e = 0.06',
    '3.0 days after core collapse',
  ]);
  assert.equal(collapseText({ ...note, kick: 753.4, boundAfter: false })[1], 'minimum kick 753 km/s; binary unbound');
  assert.equal(
    collapseText({ ...note, star: 1, failed: true, ejected: 0.18, speed: 960, remnant: 'BH' })[0],
    'star 2 collapses to a BH; failed supernova, 0.18 M☉ ejected at 960 km/s',
  );
  assert.equal(collapseText({ ...note, boundBefore: false }).length, 2);
  assert.deepEqual(collapseText(null), []);
});

test('time since collapse reads in the largest sensible unit', () => {
  assert.equal(elapsedText(30), '30 seconds');
  assert.equal(elapsedText(150), '2.5 minutes');
  assert.equal(elapsedText(5 * 3600), '5.0 hours');
  assert.equal(elapsedText(40 * DAY), '40 days');
  assert.equal(elapsedText(3 * 365.25 * DAY), '3.0 years');
});
