import * as THREE from 'three';
import { ejectaProfile, outflowProfile } from '../physics/envelope.js';
import { hidden, sharedUniforms } from './particles.js';

export const BINS = 128;
export const ENVELOPE_GAIN = 0.1;
export const STRETCH = 6;
export const KNEE = 0.8;
export const TOE = 2.5;
export const COMPRESSION = 0.4;
export const BOUND_GLOW = 0.5;
export const SPREAD = 0.35;
export const FLOOR = 0.06;
export const THICKNESS = 0.14;
export const EMPTY = -60;

function average(f, count = 2048) {
  let sum = 0;
  for (let k = 0; k < count; k += 1) sum += f((k + 0.5) / count);
  return sum / count;
}

export const EJECTA_NORM = average((x) => FLOOR + Math.exp(-0.5 * ((2 * x - 1) / SPREAD) ** 2));
export const OUTFLOW_NORM = average((x) => Math.exp(-0.5 * ((2 * x - 1) / THICKNESS) ** 2));

function shellColumn(density, edges, b) {
  let sum = 0;
  for (let j = 0; j < density.length; j += 1) {
    const outer = edges[j + 1];
    if (outer <= b || !(density[j] > 0)) continue;
    const inner = Math.max(edges[j], b);
    sum += 2 * density[j] * (Math.sqrt(outer * outer - b * b) - Math.sqrt(inner * inner - b * b));
  }
  return sum;
}

export function typicalColumn(density, edges) {
  const columns = density.map((_, i) => shellColumn(density, edges, (edges[i] + edges[i + 1]) / 2));
  const masses = columns.map((column, i) => column * (edges[i + 1] ** 2 - edges[i] ** 2));
  const total = masses.reduce((sum, mass) => sum + mass, 0);
  if (!(total > 0)) return 0;
  let enclosed = 0;
  for (let i = 0; i < columns.length; i += 1) {
    enclosed += masses[i];
    if (enclosed >= total / 2) return columns[i];
  }
  return columns.at(-1);
}

function through(b, radius) {
  return b < radius ? Math.atan(Math.sqrt(radius * radius - b * b) / b) : 0;
}

export function boundColumn({ inner, front }, b) {
  if (!(front > b)) return 0;
  const outer = [0.4, 0.55, 0.7, 0.85, 1].reduce((sum, share) => sum + through(b, share * front), 0) / 5;
  return (2 * (outer - through(b, inner))) / b;
}

function profileTexture() {
  const texture = new THREE.DataTexture(new Uint16Array(BINS * 4), BINS, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function envelopeProfile(envelope) {
  const { model, t, reach } = envelope;
  const reference = model.late.slope / (4 * Math.PI * model.radius ** 2);
  const edges = Array.from({ length: BINS + 1 }, (_, j) => (j / BINS) * reach * model.radius);
  const middles = edges.slice(0, -1).map((r, j) => (r + edges[j + 1]) / 2);
  const ejecta = ejectaProfile(model, t, edges);
  const outflow = outflowProfile(model, t, middles);
  const values = new Float32Array(BINS * 4);
  const level = (density, norm) => (density > 0 ? Math.max(Math.log(density / (reference * norm)), EMPTY) : EMPTY);
  for (let j = 0; j < BINS; j += 1) {
    values.set([level(ejecta[j], EJECTA_NORM), level(outflow[j].density, OUTFLOW_NORM), Math.log(outflow[j].temperature), 0], 4 * j);
  }
  const units = edges.map((r) => r / model.radius);
  const peaks = [
    typicalColumn(Array.from(ejecta, (density) => density / reference), units),
    typicalColumn(outflow.map(({ density }) => density / reference), units),
    boundColumn(envelope.bound, envelope.bound.front / 2),
  ];
  return { values, peaks };
}

export function glowLevels(peaks, bound) {
  return peaks.map((peak, k) => (peak > 0 ? peak ** COMPRESSION * (k === 2 ? BOUND_GLOW * bound : 1) : 0));
}

export function makeEnvelope(stage, shaders, emission) {
  const shared = sharedUniforms(emission);
  const profile = profileTexture();
  const material = new THREE.ShaderMaterial({
    vertexShader: shaders.cloudVertex,
    fragmentShader: `${shaders.emissionChunk}\n${shaders.envelopeFragment}`,
    uniforms: {
      emission: shared.emission,
      emissionRange: shared.emissionRange,
      centre: { value: new THREE.Vector3() },
      core: { value: new THREE.Vector3() },
      scale: { value: 1 },
      reach: { value: 1 },
      inner: { value: 0 },
      front: { value: 0 },
      gasTemperature: { value: 0 },
      profile: { value: profile },
      wakeCentre: { value: new THREE.Vector3() },
      wakeSize: { value: 1 },
      wakeDensity: { value: 0 },
      wakeTemperature: { value: 0 },
      gain: { value: 0 },
      stretch: { value: STRETCH },
      spread: { value: SPREAD },
      floorShare: { value: FLOOR },
      thickness: { value: THICKNESS },
      knee: { value: KNEE },
      toe: { value: TOE },
      peaks: { value: new THREE.Vector3() },
      levels: { value: new THREE.Vector3() },
      wakeLevel: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cloud = hidden(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  stage.gas.add(cloud);

  function show(state, envelope) {
    const { uniforms } = material;
    const { values, peaks } = envelopeProfile(envelope);
    const target = profile.image.data;
    for (let k = 0; k < values.length; k += 1) target[k] = THREE.DataUtils.toHalfFloat(values[k]);
    profile.needsUpdate = true;
    uniforms.peaks.value.fromArray(peaks);
    uniforms.levels.value.fromArray(glowLevels(peaks, envelope.bound.weight));
    uniforms.wakeLevel.value = peaks[2] > 0 ? peaks[2] ** COMPRESSION : 0;
    uniforms.centre.value.fromArray(envelope.centre);
    uniforms.core.value.fromArray(envelope.core);
    uniforms.scale.value = envelope.scale;
    uniforms.reach.value = envelope.reach;
    uniforms.inner.value = envelope.bound.inner;
    uniforms.front.value = envelope.bound.front;
    uniforms.gasTemperature.value = envelope.temperature;
    const { wake } = envelope;
    uniforms.wakeDensity.value = wake ? wake.density : 0;
    if (wake) {
      uniforms.wakeCentre.value.fromArray(wake.centre);
      uniforms.wakeSize.value = wake.size;
      uniforms.wakeTemperature.value = wake.temperature;
    }
    uniforms.gain.value = ENVELOPE_GAIN * state.emissionScale * envelope.fade;
  }

  function update(state) {
    const { envelope } = state;
    cloud.visible = Boolean(envelope) && envelope.fade > 0;
    if (cloud.visible) show(state, envelope);
  }

  return { update };
}
