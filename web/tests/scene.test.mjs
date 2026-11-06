import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScene } from '../src/scene.js';

function edited(change) {
  const bytes = readFileSync(new URL('./scenes/sailfish.strix', import.meta.url));
  const copy = new Uint8Array(bytes);
  const length = new DataView(copy.buffer).getUint32(0, true);
  const text = change(new TextDecoder().decode(copy.subarray(4, 4 + length)));
  copy.set(new TextEncoder().encode(text), 4);
  return copy.buffer;
}

test('a file that is not strix is refused', () => {
  assert.throws(() => parseScene(edited((text) => text.replace('"strix"', '"other"'))), /not a strix 2 file/);
});

test('a scene must play at a positive rate', () => {
  assert.throws(() => parseScene(edited((text) => text.replace(/"rate":([0-9.e-]+)/, (_, value) => `"rate":${'-1'.padEnd(value.length)}`))), /positive rate/);
});
