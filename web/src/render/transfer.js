import * as THREE from 'three';
import { BUNDLE_SAMPLES, BUNDLE_STEP, BUNDLE_TRACKS, streamBundle } from '../physics/stream.js';
import { makeGaussian, makeRandom } from '../physics/random.js';
import { fitViewport, glowing, hidden, particles, quads, sharedUniforms } from './particles.js';

export const SPOT_SIZE = 0.8;
export const FLOW_PARTICLES = 24000;
export const DISC_PARTICLES = 26000;
export const FLOW_PERIOD = BUNDLE_SAMPLES * BUNDLE_STEP;
export const BUCKET = Math.log(1.05);
export const BUNDLE_CACHE = 48;
export const FLOW_SIZE = 0.05;
export const FLOW_GAIN = 0.045;
export const DISC_SIZE = 0.0028;
export const DISC_GAIN = 0.15;
export const DISC_ARMS = 0.5;
export const SHEET_GAIN = 0.06;
export const VISIBLE_INNER = 0.04;
export const RING_WIDTH = 0.06;
export const SEED = 11;

const TWO_PI = 2 * Math.PI;

function flowAttributes(count) {
  const random = makeRandom(SEED);
  const gaussian = makeGaussian(random);
  const track = new Float32Array(count);
  const offset = new Float32Array(count);
  const jitter = new Float32Array(2 * count);
  const shine = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    track[i] = i % BUNDLE_TRACKS;
    offset[i] = random();
    jitter[2 * i] = 0.5 * gaussian();
    jitter[2 * i + 1] = 0.5 * gaussian();
    shine[i] = 0.4 + 1.2 * random();
  }
  return [
    ['track', track, 1],
    ['offset', offset, 1],
    ['jitter', jitter, 2],
    ['shine', shine, 1],
  ];
}

function discSeeds(count) {
  const random = makeRandom(SEED + 1);
  const gaussian = makeGaussian(random);
  return {
    spread: Float64Array.from({ length: count }, () => Math.sqrt(random())),
    ring: Float64Array.from({ length: count }, () => gaussian()),
    start: Float64Array.from({ length: count }, () => TWO_PI * random()),
    height: Float32Array.from({ length: count }, () => gaussian()),
    shine: Float32Array.from({ length: count }, () => 0.3 + 1.4 * random()),
    rank: Float64Array.from({ length: count }, () => random()),
  };
}

function bundleTexture({ data, tracks, samples }) {
  const texture = new THREE.DataTexture(data, samples, tracks, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function makeBundles() {
  const cache = new Map();
  return (index) => {
    if (!cache.has(index)) {
      if (cache.size >= BUNDLE_CACHE) {
        const [oldest, entry] = cache.entries().next().value;
        entry.texture.dispose();
        cache.delete(oldest);
      }
      const bundle = streamBundle(Math.exp(index * BUCKET));
      cache.set(index, { texture: bundleTexture(bundle), lengths: Array.from(bundle.lengths) });
    }
    return cache.get(index);
  };
}

export function makeTransfer(stage, shaders, emission) {
  const shared = sharedUniforms(emission);
  const bundles = makeBundles();
  const flow = particles(stage, shaders, shaders.flowVertex, quads(FLOW_PARTICLES, flowAttributes(FLOW_PARTICLES)), {
    ...shared,
    bundleA: { value: null },
    bundleB: { value: null },
    lengthsA: { value: new Array(BUNDLE_TRACKS).fill(0) },
    lengthsB: { value: new Array(BUNDLE_TRACKS).fill(0) },
    mixB: { value: 0 },
    clock: { value: 0 },
    since: { value: 0 },
    after: { value: 0 },
    period: { value: FLOW_PERIOD },
    spacing: { value: BUNDLE_STEP },
    stop: { value: 0 },
    width: { value: 0 },
    size: { value: 0 },
    shutter: { value: 0 },
    temperature: { value: 0 },
    scale: { value: 0 },
  });
  const seeds = discSeeds(DISC_PARTICLES);
  const radius = new Float32Array(DISC_PARTICLES);
  const angle = new Float32Array(DISC_PARTICLES);
  const disc = particles(stage, shaders, shaders.discVertex, quads(DISC_PARTICLES, [
    ['radius', radius, 1, true],
    ['angle', angle, 1, true],
    ['height', seeds.height, 1],
    ['shine', seeds.shine, 1],
  ]), {
    ...shared,
    inner: { value: 0 },
    outer: { value: 1 },
    sphere: { value: 0 },
    core: { value: 0 },
    accretor: { value: 1 },
    aspect: { value: 0.03 },
    size: { value: 0 },
    shutter: { value: 0 },
    arms: { value: DISC_ARMS },
    scale: { value: 0 },
  });
  const sheet = hidden(new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), glowing(shaders, shaders.diskVertex, shaders.diskFragment, {
    ...shared,
    scale: { value: 0 },
    presence: { value: 0 },
    inner: { value: 0 },
    outer: { value: 1 },
    sphere: { value: 0 },
    core: { value: 0 },
    arms: { value: DISC_ARMS },
    gain: { value: SHEET_GAIN },
  })));
  sheet.matrixAutoUpdate = false;
  const spot = hidden(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glowing(shaders, shaders.billboardVertex, shaders.spotFragment, {
    ...shared,
    extent: { value: 1 },
    temperature: { value: 0 },
    presence: { value: 0 },
    scale: { value: 0 },
  })));
  [sheet, disc, flow, spot].forEach((mesh, k) => {
    mesh.renderOrder = k + 1;
  });
  stage.scene.add(sheet, spot);

  const origin = new THREE.Vector3();
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  const up = new THREE.Vector3();
  const frame = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const size = new THREE.Matrix4();
  const drawing = new THREE.Vector2();

  function frameBinary(state, transfer) {
    origin.fromArray(state.stars[transfer.donor].position);
    along.fromArray(state.stars[transfer.accretor].position).sub(origin);
    const separation = along.length();
    along.divideScalar(separation);
    across.set(along.z, 0, -along.x);
    frame.makeBasis(
      along.clone().multiplyScalar(separation),
      across.clone().multiplyScalar(separation),
      up.set(0, separation, 0),
    ).setPosition(origin);
    return separation;
  }

  function showFlow(state, transfer) {
    const { uniforms } = flow.material;
    const scaled = Math.log(transfer.q) / BUCKET;
    const index = Math.floor(scaled);
    const [low, high] = [bundles(index), bundles(index + 1)];
    uniforms.bundleA.value = low.texture;
    uniforms.bundleB.value = high.texture;
    uniforms.lengthsA.value = low.lengths;
    uniforms.lengthsB.value = high.lengths;
    uniforms.mixB.value = scaled - index;
    uniforms.clock.value = ((transfer.phase % FLOW_PERIOD) + FLOW_PERIOD) % FLOW_PERIOD;
    uniforms.since.value = Math.min(transfer.stream.since, 2 * FLOW_PERIOD);
    uniforms.after.value = transfer.stream.after === null ? -1 : transfer.stream.after;
    uniforms.stop.value = transfer.stream.stop;
    uniforms.width.value = transfer.stream.width;
    uniforms.size.value = FLOW_SIZE * transfer.stream.width;
    uniforms.shutter.value = state.shutter;
    uniforms.temperature.value = transfer.stream.temperature;
    const opacity = transfer.stream.opacity.reduce((sum, value) => sum + value, 0) / transfer.stream.opacity.length;
    uniforms.scale.value = FLOW_GAIN * state.emissionScale * transfer.presence.stream * opacity;
    flow.matrix.copy(frame);
    flow.matrixWorldNeedsUpdate = true;
  }

  function placeDisc(transfer) {
    const { inner, outer, ring, grown, born, build } = transfer.disk;
    const lowest = Math.max(inner, VISIBLE_INNER * outer);
    const share = 1 / (1 + transfer.q);
    const time = transfer.phase;
    const impact = transfer.spot ? Math.atan2(transfer.spot.y, transfer.spot.x - 1) : 0;
    for (let i = 0; i < DISC_PARTICLES; i += 1) {
      const birth = born === null ? null : born + seeds.rank[i] * build;
      if (birth !== null && time < birth) {
        radius[i] = 0;
        continue;
      }
      const full = lowest + seeds.spread[i] * (outer - lowest);
      const young = ring * Math.exp(RING_WIDTH * seeds.ring[i]);
      const r = Math.min(Math.exp(Math.log(young) + grown * (Math.log(full) - Math.log(young))), outer);
      const spin = Math.sqrt(share / (r * r * r)) - 1;
      radius[i] = r;
      angle[i] = birth === null ? (seeds.start[i] + spin * time) % TWO_PI : (impact + spin * (time - birth)) % TWO_PI;
    }
    disc.geometry.attributes.radius.needsUpdate = true;
    disc.geometry.attributes.angle.needsUpdate = true;
  }

  function showDisc(state, transfer) {
    placeDisc(transfer);
    const { uniforms } = disc.material;
    const { inner, outer, sphere, core, aspect } = transfer.disk;
    uniforms.inner.value = inner;
    uniforms.outer.value = outer;
    uniforms.sphere.value = sphere;
    uniforms.core.value = core;
    uniforms.accretor.value = 1 / (1 + transfer.q);
    uniforms.aspect.value = aspect;
    uniforms.size.value = DISC_SIZE * outer;
    uniforms.shutter.value = state.shutter;
    uniforms.scale.value = DISC_GAIN * state.emissionScale * transfer.presence.disk;
    disc.matrix.copy(frame);
    disc.matrixWorldNeedsUpdate = true;
  }

  function showSheet(state, transfer) {
    const { uniforms } = sheet.material;
    sheet.matrix.copy(frame).multiply(place.makeTranslation(1, 0, 0)).multiply(size.makeScale(transfer.disk.outer, transfer.disk.outer, 1));
    sheet.matrixWorldNeedsUpdate = true;
    uniforms.scale.value = state.emissionScale;
    uniforms.presence.value = transfer.presence.disk * transfer.disk.built;
    uniforms.inner.value = transfer.disk.inner;
    uniforms.outer.value = transfer.disk.outer;
    uniforms.sphere.value = transfer.disk.sphere;
    uniforms.core.value = transfer.disk.core;
  }

  function showSpot(state, transfer, separation) {
    const { uniforms } = spot.material;
    const [x, y] = [transfer.spot.x, transfer.spot.y];
    spot.position.copy(origin).addScaledVector(along, x * separation).addScaledVector(across, y * separation);
    uniforms.extent.value = SPOT_SIZE * transfer.stream.width * separation;
    uniforms.temperature.value = transfer.spot.temperature;
    uniforms.presence.value = transfer.presence.stream * transfer.spot.presence;
    uniforms.scale.value = state.emissionScale;
  }

  function update(state) {
    const { transfer } = state;
    flow.visible = Boolean(transfer) && transfer.presence.stream > 0;
    disc.visible = Boolean(transfer?.disk) && transfer.presence.disk > 0;
    sheet.visible = disc.visible;
    spot.visible = Boolean(transfer?.spot) && transfer.presence.stream > 0;
    if (!transfer) return;
    fitViewport(stage, shared, drawing);
    const separation = frameBinary(state, transfer);
    if (flow.visible) showFlow(state, transfer);
    if (disc.visible) {
      showDisc(state, transfer);
      showSheet(state, transfer);
    }
    if (spot.visible) showSpot(state, transfer, separation);
  }

  return { update };
}
