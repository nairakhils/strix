import { lagrangeL1, rocheGradient } from './roche.js';
import { makeGaussian, makeRandom } from './random.js';

export const STEP_FACTOR = 0.02;
export const MAX_STEP = 2e-3;
export const MAX_TIME = 10;
export const PATH_POINTS = 160;
export const BUNDLE_TRACKS = 32;
export const BUNDLE_SAMPLES = 256;
export const BUNDLE_STEP = 0.01;
export const BUNDLE_LAUNCH = 0.04;
export const BUNDLE_SPREAD = 0.25;
export const BUNDLE_SEED = 7;

function accretorDistance(x, y) {
  return Math.hypot(x - 1, y);
}

function derivative(q, [x, y, vx, vy], grad) {
  rocheGradient(q, x, y, 0, grad);
  return [vx, vy, 2 * vy - grad[0], -2 * vx - grad[1]];
}

function rk4(q, state, dt, grad) {
  const k1 = derivative(q, state, grad);
  const k2 = derivative(q, state.map((s, i) => s + 0.5 * dt * k1[i]), grad);
  const k3 = derivative(q, state.map((s, i) => s + 0.5 * dt * k2[i]), grad);
  const k4 = derivative(q, state.map((s, i) => s + dt * k3[i]), grad);
  return state.map((s, i) => s + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

function landing(q, state, dt, stop, grad) {
  let lo = 0;
  let hi = dt;
  for (let k = 0; k < 60; k += 1) {
    const mid = 0.5 * (lo + hi);
    const probe = rk4(q, state, mid, grad);
    if (accretorDistance(probe[0], probe[1]) > stop) lo = mid;
    else hi = mid;
  }
  return [rk4(q, state, hi, grad), hi];
}

export function jacobi(q, [x, y, vx, vy]) {
  const ms = q / (1 + q);
  const mo = 1 / (1 + q);
  const ox = x - 1;
  const cx = x - mo;
  const potential = -ms / Math.hypot(x, y) - mo / Math.hypot(ox, y) - 0.5 * (cx * cx + y * y);
  return -2 * potential - (vx * vx + vy * vy);
}

export function angularMomentumAbout([x, y, vx, vy]) {
  const dx = x - 1;
  const dy = y;
  return dx * (vy + dx) - dy * (vx - dy);
}

export function integrateStream(q, launch, stop = 0) {
  const grad = [0, 0, 0];
  let state = [lagrangeL1(q), 0, launch, 0];
  let time = 0;
  let distance = accretorDistance(state[0], state[1]);
  const samples = [[...state, time]];
  while (time < MAX_TIME) {
    const dt = Math.min(MAX_STEP, STEP_FACTOR * distance ** 1.5);
    const next = rk4(q, state, dt, grad);
    const nextDistance = accretorDistance(next[0], next[1]);
    if (stop > 0 && nextDistance <= stop) {
      const [hit, spent] = landing(q, state, dt, stop, grad);
      samples.push([...hit, time + spent]);
      return { samples, closest: hit, impact: hit };
    }
    if (stop === 0 && nextDistance > distance) return { samples, closest: state, impact: null };
    state = next;
    distance = nextDistance;
    time += dt;
    samples.push([...state, time]);
  }
  return { samples, closest: state, impact: null };
}

export function closestApproach(q, launch) {
  const { closest } = integrateStream(q, launch);
  const minimum = accretorDistance(closest[0], closest[1]);
  const h = angularMomentumAbout(closest);
  return { minimum, circularisation: h * h * (1 + q), state: closest };
}

function resample(samples, count) {
  const end = samples[samples.length - 1][4];
  const path = new Float64Array(5 * count);
  let j = 0;
  for (let k = 0; k < count; k += 1) {
    const time = (end * k) / (count - 1);
    while (j < samples.length - 2 && samples[j + 1][4] < time) j += 1;
    const [a, b] = [samples[j], samples[j + 1] ?? samples[j]];
    const span = b[4] - a[4];
    const share = span > 0 ? (time - a[4]) / span : 0;
    for (let i = 0; i < 5; i += 1) path[5 * k + i] = a[i] + (b[i] - a[i]) * share;
  }
  return path;
}

export function streamPath(q, launch, stop, count = PATH_POINTS) {
  const { samples, impact } = integrateStream(q, launch, stop);
  return { path: resample(samples, count), impact, duration: samples[samples.length - 1][4] };
}

function advance(q, state, span, grad) {
  let next = state;
  let spent = 0;
  while (spent < span) {
    const dt = Math.min(span - spent, STEP_FACTOR * accretorDistance(next[0], next[1]) ** 1.5);
    next = rk4(q, next, dt, grad);
    spent += dt;
  }
  return next;
}

function trackFrom(q, start, data, offset, grad) {
  let state = start;
  let distance = accretorDistance(state[0], state[1]);
  let falling = false;
  for (let n = 0; n < BUNDLE_SAMPLES; n += 1) {
    data.set(state, offset + 4 * n);
    const next = advance(q, state, BUNDLE_STEP, grad);
    const nextDistance = accretorDistance(next[0], next[1]);
    if (falling && nextDistance > distance) return n + 1;
    falling = nextDistance < distance;
    state = next;
    distance = nextDistance;
  }
  return BUNDLE_SAMPLES;
}

export function streamBundle(q, tracks = BUNDLE_TRACKS) {
  const gaussian = makeGaussian(makeRandom(BUNDLE_SEED));
  const grad = [0, 0, 0];
  const l1 = lagrangeL1(q);
  const data = new Float32Array(4 * tracks * BUNDLE_SAMPLES);
  const lengths = new Float32Array(tracks);
  for (let k = 0; k < tracks; k += 1) {
    const spread = BUNDLE_SPREAD * BUNDLE_LAUNCH;
    const start = [l1, spread * gaussian(), BUNDLE_LAUNCH * (1 + BUNDLE_SPREAD * Math.abs(gaussian())), spread * gaussian()];
    lengths[k] = trackFrom(q, start, data, 4 * k * BUNDLE_SAMPLES, grad);
  }
  return { data, lengths, tracks, samples: BUNDLE_SAMPLES, step: BUNDLE_STEP };
}
