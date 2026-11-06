import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScene } from '../src/scene.js';
import { makeDirector } from '../src/director/director.js';
import { exampleScene } from './scenes.mjs';

test('an example scene decodes into numbers, labels and events', () => {
  const { header, samples, columns } = exampleScene(2);
  assert.equal(header.format, 'strix');
  assert.equal(samples, 1610);
  for (const name of ['time', 'a', 'e', 'm1', 'm2', 'r1', 'r2', 'teff1', 'teff2']) {
    assert.ok(columns[name] instanceof Float64Array, name);
    assert.equal(columns[name].length, samples);
  }
  assert.ok(columns.kind1.every((kind) => ['star', 'WD', 'NS', 'BH', 'none'].includes(kind)));
  assert.equal(columns.type1[0], 'MS');
  assert.deepEqual(header.events.map(({ kind, donor, star, during, until }) => [kind, donor ?? star, during, until]), [
    ['transfer', 1, [200, 249], 310],
    ['collapse', 1, [510, 559], 609],
    ['collapse', 2, [1460, 1509], 1559],
  ]);
});

test('a file that is not strix is refused', () => {
  const bytes = readFileSync(new URL('./scenes/example_0.strix', import.meta.url));
  const copy = new Uint8Array(bytes);
  const length = new DataView(copy.buffer).getUint32(0, true);
  const text = new TextDecoder().decode(copy.subarray(4, 4 + length)).replace('"strix"', '"other"');
  copy.set(new TextEncoder().encode(text), 4);
  assert.throws(() => parseScene(copy.buffer), /not a strix 2 file/);
});

function circularBinary(samples) {
  const filled = (value) => new Float64Array(samples).fill(value);
  return {
    header: { events: [], palette: null, types: null },
    samples,
    columns: {
      time: Float64Array.from({ length: samples }, (_, n) => n * 1e-3),
      a: filled(30),
      e: filled(0),
      m1: filled(12),
      m2: filled(8),
      r1: filled(5),
      r2: filled(3.5),
      teff1: filled(28000),
      teff2: filled(22000),
      kind1: new Array(samples).fill('star'),
      kind2: new Array(samples).fill('star'),
    },
  };
}

test('a scene with only the required columns plays with the default palette', () => {
  const director = makeDirector(circularBinary(400));
  for (const u of [0, 123.4, 399]) {
    const state = director.stateAt(u);
    assert.equal(state.transfer, null);
    assert.ok(state.stars.every((star) => star.visible && star.radiance > 0));
    assert.ok(Math.abs(state.orbit.a * state.rsunPerUnit - 30) < 1e-9);
    assert.deepEqual(state.hud.types, ['star', 'star']);
  }
  const [hot, cool] = director.stateAt(10).stars.map((star) => star.rgb);
  assert.ok(hot[2] >= cool[2] && hot[0] <= cool[0], 'the hotter star is bluer');
});
