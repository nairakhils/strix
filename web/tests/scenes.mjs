import { readFileSync } from 'node:fs';
import { parseScene } from '../src/scene.js';

const scenes = new Map();

export function sceneFile(name) {
  if (!scenes.has(name)) {
    const bytes = readFileSync(new URL(`./scenes/${name}.strix`, import.meta.url));
    scenes.set(name, parseScene(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  }
  return scenes.get(name);
}

export function fieldBytes(sample, level) {
  const bytes = readFileSync(new URL(`./scenes/sailfish.fields/${sample}_${level}.f16`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
