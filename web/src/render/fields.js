import * as THREE from 'three';
import { hidden, sharedUniforms } from './particles.js';

export const FIELD_GAIN = 0.6;
export const GAMMA = 2.2;
export const CACHE_SAMPLES = 8;

function arrayTexture(data, pixels, levels) {
  const texture = new THREE.DataArrayTexture(data, pixels, pixels, levels);
  texture.format = THREE.RedFormat;
  texture.type = THREE.HalfFloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function makeFieldCache({ pixels, levels, count, load, size = CACHE_SAMPLES, onLoad = () => {} }) {
  const cache = new Map();
  const ready = new Map();
  const area = pixels * pixels;

  function evict() {
    for (const sample of cache.keys()) {
      if (cache.size <= size) return;
      cache.delete(sample);
      ready.get(sample)?.dispose();
      ready.delete(sample);
    }
  }

  async function fetchSample(sample) {
    const buffers = await Promise.all(Array.from({ length: levels }, (_, level) => load(sample, level)));
    const data = new Uint16Array(levels * area);
    buffers.forEach((buffer, level) => {
      if (buffer.byteLength !== 2 * area) throw new Error(`field ${sample}_${level} is ${buffer.byteLength} bytes`);
      data.set(new Uint16Array(buffer), level * area);
    });
    return arrayTexture(data, pixels, levels);
  }

  function request(sample) {
    if (cache.has(sample)) {
      const pending = cache.get(sample);
      cache.delete(sample);
      cache.set(sample, pending);
      return pending;
    }
    const pending = fetchSample(sample).then((texture) => {
      if (cache.get(sample) !== pending) {
        texture.dispose();
        return null;
      }
      ready.set(sample, texture);
      onLoad();
      return texture;
    });
    cache.set(sample, pending);
    evict();
    return pending;
  }

  function want([first, second]) {
    if (second + 1 < count) request(second + 1);
    return Promise.all([request(first), request(second)]);
  }

  return { want, ready: (sample) => ready.get(sample) ?? null };
}

export function makeFields(stage, shaders, emission, { meta, count, load } = {}) {
  if (!meta) return { update: () => {}, prepare: async () => {}, onLoad: () => {} };
  const listeners = [];
  const levels = meta.extents.length;
  const textures = makeFieldCache({
    pixels: meta.pixels,
    levels,
    count,
    load,
    onLoad: () => listeners.forEach((listener) => listener()),
  });
  const shared = sharedUniforms(emission);
  const material = new THREE.ShaderMaterial({
    defines: { LEVELS: levels },
    vertexShader: shaders.cloudVertex,
    fragmentShader: `${shaders.emissionChunk}\n${shaders.fieldFragment}`,
    uniforms: {
      emission: shared.emission,
      emissionRange: shared.emissionRange,
      before: { value: null },
      after: { value: null },
      weight: { value: 0 },
      extents: { value: meta.extents },
      pixels: { value: meta.pixels },
      range: { value: new THREE.Vector2(...meta.range) },
      softening: { value: meta.softening },
      centre: { value: new THREE.Vector3() },
      axis: { value: new THREE.Vector2(1, 0) },
      perWorld: { value: 1 },
      bodies: { value: new THREE.Vector4() },
      temperature: { value: 0 },
      gamma: { value: GAMMA },
      gain: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gas = hidden(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  stage.gas.add(gas);

  function bind(field) {
    const [first, second] = field.samples;
    const before = textures.ready(first);
    const after = textures.ready(second);
    if (!before || !after) return Boolean(material.uniforms.before.value);
    material.uniforms.before.value = before;
    material.uniforms.after.value = after;
    material.uniforms.weight.value = field.weight;
    return true;
  }

  function update(state) {
    const { gas: field } = state;
    gas.visible = Boolean(field);
    if (!field) return;
    textures.want(field.samples);
    gas.visible = bind(field);
    const { uniforms } = material;
    const [one, two] = field.bodies;
    uniforms.centre.value.fromArray(field.centre);
    uniforms.axis.value.fromArray(field.axis);
    uniforms.perWorld.value = field.perWorld;
    uniforms.bodies.value.set(one.at, one.mass, two.at, two.mass);
    uniforms.temperature.value = field.temperature;
    uniforms.gain.value = FIELD_GAIN * state.emissionScale;
  }

  async function prepare(state) {
    if (state.gas) await textures.want(state.gas.samples);
  }

  return { update, prepare, onLoad: (listener) => listeners.push(listener) };
}
