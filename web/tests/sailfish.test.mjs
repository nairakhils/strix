import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDirector, POINT_LABEL, POINT_RADIANCE } from '../src/director/director.js';
import { unitsOf } from '../src/director/units.js';
import { isothermalScale } from '../src/physics/disk.js';
import { makeFieldCache } from '../src/render/fields.js';
import { binaryText, timelineSteps } from '../src/hud/hud.js';
import { fieldBytes, sceneFile } from './scenes.mjs';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${actual} vs ${expected}`);

test('a Sailfish scene keeps its code units and its gas fields', () => {
  const scene = sceneFile('sailfish');
  const { header, columns } = scene;
  assert.equal(header.units, 'binary');
  assert.deepEqual(header.scale, { length: 30, mass: 1 });
  assert.deepEqual(header.fields.extents, [4, 20, 60]);
  assert.equal(header.fields.pixels, 64);
  assert.deepEqual(Array.from(columns.time, Math.round), [10, 120, 180]);
  assert.deepEqual(Object.keys(columns), ['time', 'a', 'e', 'm1', 'm2']);
});

test('one orbit is one period of the scaled binary', () => {
  const units = unitsOf({ units: 'binary', scale: { length: 215.032, mass: 1 } });
  close(units.myr, 1e-6);
  assert.deepEqual([units.time, units.length, units.mass], ['orbits', 'a', 'M']);
  assert.equal(unitsOf({ units: 'solar' }).myr, 1);
  assert.equal(unitsOf({}).system, 'solar');
});

test('the director plays a Sailfish run in code units', () => {
  const director = makeDirector(sceneFile('sailfish'), { log: true });
  assert.equal(director.log, false);
  close(director.duration, 30);
  const state = director.stateAt(1.5);
  const { hud, gas: field, stars } = state;
  close(hud.time, 150, 1e-3);
  close(hud.a, 1);
  close(hud.m1, 1 / 1.2);
  assert.equal(hud.r1, null);
  assert.equal(hud.mach, 10);
  assert.deepEqual(hud.fills, [null, null]);
  assert.deepEqual(field.samples, [1, 2]);
  close(field.weight, 0.5);
  close(field.bodies[1].at - field.bodies[0].at, 1);
  close(field.bodies[0].mass + field.bodies[1].mass, 1);
  close(field.temperature, isothermalScale(1, 30, 10));
  const [p, q] = stars.map((star) => star.position);
  close(Math.hypot(q[0] - p[0], q[2] - p[2]) * field.perWorld, 1);
  close(Math.hypot(...field.axis), 1);
  for (const star of stars) {
    assert.equal(star.kind, 'point');
    assert.equal(star.label, POINT_LABEL);
    assert.equal(star.radiance, POINT_RADIANCE);
  }
});

test('locally isothermal gas is cooler in wider, lighter and faster binaries', () => {
  close(isothermalScale(1, 30, 10), 4626, 1e-3);
  close(isothermalScale(1, 1, 1) / isothermalScale(2, 4, 10), 200);
});

test('field textures load in pairs and the oldest are let go', async () => {
  const loads = [];
  const cache = makeFieldCache({
    pixels: 64,
    levels: 3,
    count: 3,
    size: 2,
    load: async (sample, level) => {
      loads.push(`${sample}_${level}`);
      return fieldBytes(sample, level);
    },
  });
  const [before, after] = await cache.want([0, 1]);
  assert.equal(before.image.depth, 3);
  assert.equal(cache.ready(1), after);
  await cache.want([1, 2]);
  assert.equal(cache.ready(0), null);
  assert.ok(cache.ready(2));
  assert.equal(loads.filter((name) => name === '1_0').length, 1);
});

test('a truncated field is refused', async () => {
  const cache = makeFieldCache({ pixels: 64, levels: 1, count: 1, load: async () => new ArrayBuffer(10) });
  await assert.rejects(cache.want([0, 0]), /is 10 bytes/);
});

test('long runs get a readable timeline and a code-unit readout', () => {
  assert.deepEqual(timelineSteps(180), [180, 20, 5]);
  assert.deepEqual(timelineSteps(10000.003), [1e4, 1000, 200]);
  assert.deepEqual(timelineSteps(16.7), [20, 5, 1]);
  const units = unitsOf({ units: 'binary', scale: { length: 30, mass: 1 } });
  assert.deepEqual(binaryText({ m1: 1 / 1.2, m2: 0.2 / 1.2, e: 0, mach: 10, units }), [
    'q = 0.20   e = 0.00   Mach 10',
    'a = 30 R☉   M = 1 M☉',
  ]);
});
