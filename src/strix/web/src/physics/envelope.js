import { MU_SUN, plateauSeconds } from './collapse.js';
import { eggleton } from './roche.js';
import { RADIATION, SUN_MASS, SUN_RADIUS } from './units.js';

const DENSITY = SUN_MASS / SUN_RADIUS ** 3;

export const POLYTROPE = 1.5;
export const L2_LEVER = 1.2;
export const OUTFLOW_SPEED = 0.15;
export const EJECTA_SPEED = 1;
export const DRAG = 1;
export const RECOMBINATION = 4500;
export const DUST = 1500;
export const STEPS = 600;
export const SHELLS = 512;
export const SMOOTHING = 1.5;
export const OVERFLOW_FLOOR = 1e-3;
export const SHRINK_FLOOR = 0.05;
export const PARCELS = 1024;
export const SOONEST = 1e-7;
export const NOZZLE = 0.15;
export const SPEED_SPREAD = 0.25;
export const KERNEL_REACH = 3;

const lerp = (a, b, t) => a + (b - a) * t;

export function periodSeconds(a, mass) {
  return 2 * Math.PI * Math.sqrt(a ** 3 / (MU_SUN * mass));
}

export function overflowCoefficient(q) {
  return 0.62 * (q / 0.1) ** 0.68;
}

export function lossLever(donor, accretor) {
  const own = accretor / donor;
  const outer = (L2_LEVER * (donor + accretor)) ** 2 / (donor * accretor);
  return own + 0.66 * (accretor / donor / 0.1) ** 0.08 * (outer - own);
}

export function shrinkFactor(donor, accretor) {
  return Math.max((lossLever(donor, accretor) + 0.5) * (donor / (donor + accretor)) - 1, SHRINK_FLOOR);
}

export function overflowRate({ donor, accretor, radius, a, e }) {
  const lobe = eggleton(donor / accretor) * a * (1 - e);
  const over = Math.max((radius - lobe) / radius, OVERFLOW_FLOOR);
  return (overflowCoefficient(accretor / donor) * donor * over ** (POLYTROPE + 1.5)) / periodSeconds(a, donor + accretor);
}

function interpolate(xs, ys, x) {
  const n = xs.length - 1;
  const rising = xs[n] >= xs[0];
  if (rising ? x <= xs[0] : x >= xs[0]) return ys[0];
  if (rising ? x >= xs[n] : x <= xs[n]) return ys[n];
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rising ? xs[mid] <= x : xs[mid] >= x) lo = mid;
    else hi = mid;
  }
  return lerp(ys[lo], ys[hi], (x - xs[lo]) / (xs[hi] - xs[lo]));
}

function track(count) {
  return { log: new Float64Array(count), t: new Float64Array(count), phase: new Float64Array(count) };
}

function runaway({ donor, accretor, radius, a0, e0, aF, core }) {
  const start = Math.log(a0);
  const stop = Math.log(Math.min(a0, radius));
  const path = { ...track(STEPS + 1), donor: new Float64Array(STEPS + 1), rate: new Float64Array(STEPS + 1) };
  const step = (start - stop) / STEPS;
  const eccentricity = (x) => (a0 > aF ? e0 * Math.max((Math.exp(x) - aF) / (a0 - aF), 0) : 0);
  const slopes = (x, md) => {
    const a = Math.exp(x);
    const rate = overflowRate({ donor: md, accretor, radius, a, e: eccentricity(x) });
    const shrink = shrinkFactor(md, accretor);
    const time = md / (2 * shrink * rate);
    return { rate, lost: md / (2 * shrink), time, turn: (2 * Math.PI * time) / periodSeconds(a, md + accretor) };
  };
  let md = donor;
  for (let k = 0; k <= STEPS; k += 1) {
    const x = start - k * step;
    const here = slopes(x, md);
    path.log[k] = x;
    path.donor[k] = md;
    path.rate[k] = here.rate;
    if (k === STEPS) break;
    const mid = slopes(x - step / 2, Math.max(md - (here.lost * step) / 2, core));
    path.t[k + 1] = path.t[k] + mid.time * step;
    path.phase[k + 1] = path.phase[k] + mid.turn * step;
    md = Math.max(md - mid.lost * step, core);
  }
  return path;
}

export function bindingAbove(r, { core, coreRadius, radius, slope }) {
  const inner = core - slope * coreRadius;
  return slope * (inner * Math.log(radius / r) + slope * (radius - r));
}

function frontFor(share, profile) {
  const target = share * bindingAbove(profile.coreRadius, profile);
  let lo = Math.log(profile.coreRadius);
  let hi = Math.log(profile.radius);
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (bindingAbove(Math.exp(mid), profile) > target) lo = mid;
    else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

function plunge({ accretor, radius, coreRadius, core, aF }, entry, envelope) {
  const slope = envelope / Math.max(radius - coreRadius, 1e-9);
  const profile = { core, coreRadius, radius, slope };
  const inner = Math.max(core - slope * coreRadius, 1e-3 * core);
  const enclosed = (a) => core + slope * Math.max(Math.min(a, radius) - coreRadius, 0);
  const start = Math.log(entry);
  const stop = Math.log(Math.min(aF, entry));
  const path = { ...track(STEPS + 1), front: new Float64Array(STEPS + 1), drag: new Float64Array(STEPS + 1) };
  const step = (start - stop) / STEPS;
  const slopes = (x) => {
    const a = Math.exp(x);
    const mass = enclosed(a) + accretor;
    const speed2 = (MU_SUN * mass) / a;
    const capture = Math.min((2 * MU_SUN * accretor) / speed2, a);
    const density = slope / (4 * Math.PI * a * a);
    const power = DRAG * Math.PI * capture * capture * density * speed2 ** 1.5;
    const time = (MU_SUN * accretor * inner) / (2 * a * power);
    return { time, turn: time * Math.sqrt(speed2) / a, power, density, speed2 };
  };
  const energy = (a) => (MU_SUN * accretor * enclosed(a)) / (2 * a);
  const total = energy(Math.exp(stop)) - energy(entry);
  for (let k = 0; k <= STEPS; k += 1) {
    const x = start - k * step;
    path.log[k] = x;
    const share = total > 0 ? (energy(Math.exp(x)) - energy(entry)) / total : 1;
    path.front[k] = frontFor(Math.min(Math.max(share, 0), 1), profile);
    path.drag[k] = slopes(x).power;
    if (k === STEPS) break;
    const mid = slopes(x - step / 2);
    path.t[k + 1] = path.t[k] + mid.time * step;
    path.phase[k + 1] = path.phase[k] + mid.turn * step;
  }
  return { path, profile, slope, enclosed, local: (a) => slopes(Math.log(a)) };
}

export function commonEnvelope({ donor, core, accretor, radius, coreRadius, a0, e0, aF, teff }) {
  const outset = { donor, accretor, radius, a0, e0, aF, core };
  const early = runaway(outset);
  const last = early.log.length - 1;
  const entry = Math.exp(early.log[last]);
  const engulfed = early.t[last];
  const turned = early.phase[last];
  const kept = early.donor[last];
  const lost = donor - kept;
  const envelope = Math.max(kept - core, 0);
  const late = plunge({ accretor, radius, coreRadius, core, aF }, entry, envelope);
  const finish = engulfed + late.path.t[last];
  const speed = EJECTA_SPEED * Math.sqrt((2 * MU_SUN * (kept + accretor)) / radius);
  const outflow = OUTFLOW_SPEED * Math.sqrt((2 * MU_SUN * donor) / radius);
  const kinetic = 0.5 * envelope * SUN_MASS * (speed * SUN_RADIUS) ** 2;
  const plateau = plateauSeconds(envelope, radius, kinetic);
  const share = envelope / SHELLS;
  const shells = Array.from({ length: SHELLS }, (_, j) => {
    const from = radius - ((j + 0.5) * share) / late.slope;
    const k = late.path.front.findIndex((front) => front <= from);
    const at = k <= 0 ? 0 : k - 1 + (late.path.front[k - 1] - from) / (late.path.front[k - 1] - late.path.front[k]);
    const index = Math.min(Math.floor(at), last - 1);
    const t = engulfed + lerp(late.path.t[index], late.path.t[index + 1], at - index);
    return { from, t: k < 0 ? Infinity : t };
  });
  const model = {
    donor,
    core,
    accretor,
    radius,
    coreRadius,
    a0,
    e0,
    aF,
    teff,
    entry,
    engulfed,
    finish,
    lost,
    envelope,
    speed,
    outflow,
    kinetic,
    plateau,
    share,
    shells,
    early,
    late,
    turned,
  };
  model.parcels = launchParcels(model);
  return model;
}

function launchParcels(model) {
  const { engulfed } = model;
  const before = (k) => engulfed * SOONEST ** (k / PARCELS);
  return Array.from({ length: PARCELS }, (_, k) => {
    const from = engulfed - before(k);
    const to = k === PARCELS - 1 ? engulfed : engulfed - before(k + 1);
    const t = (from + to) / 2;
    return {
      t,
      mass: donorMass(model, from) - donorMass(model, to),
      lever: L2_LEVER * separationAt(model, t),
    };
  });
}

export function separationAt(model, t) {
  const { early, late, engulfed, finish, aF } = model;
  if (t <= engulfed) return Math.exp(interpolate(early.t, early.log, t));
  if (t >= finish) return aF;
  return Math.exp(interpolate(late.path.t, late.path.log, t - engulfed));
}

export function timeAtSeparation(model, a) {
  const { early, late, engulfed, entry } = model;
  if (a >= entry) return interpolate(early.log, early.t, Math.log(a));
  return engulfed + interpolate(late.path.log, late.path.t, Math.log(a));
}

export function physicalPhase(model, t) {
  const { early, late, engulfed, finish, turned, aF, core, accretor } = model;
  if (t <= engulfed) return interpolate(early.t, early.phase, t);
  if (t <= finish) return turned + interpolate(late.path.t, late.path.phase, t - engulfed);
  const end = turned + late.path.phase[late.path.phase.length - 1];
  return end + ((t - finish) * 2 * Math.PI) / periodSeconds(aF, core + accretor);
}

export function outflowRate(model, t) {
  if (t > model.engulfed || t < 0) return 0;
  return interpolate(model.early.t, model.early.rate, t);
}

export function frontAt(model, t) {
  const { late, engulfed, radius, coreRadius } = model;
  if (t <= engulfed) return radius;
  return Math.max(interpolate(late.path.t, late.path.front, t - engulfed), coreRadius);
}

export function ejectedMass(model, t) {
  return Math.min(model.late.slope * (model.radius - frontAt(model, t)), model.envelope);
}

export function donorMass(model, t) {
  const { early, engulfed, core, envelope } = model;
  if (t <= engulfed) return interpolate(early.t, early.donor, t);
  return core + envelope - ejectedMass(model, t);
}

export function wakeTemperature(model, a) {
  const { density, speed2 } = model.late.local(a);
  return ((18 / 7) * (density * DENSITY * speed2 * SUN_RADIUS ** 2) / RADIATION) ** 0.25;
}

export function gasTemperature(model, t) {
  const { engulfed, finish, plateau, teff } = model;
  const end = finish + plateau;
  if (t >= end) return Math.max(RECOMBINATION * ((t - finish) / plateau) ** -0.5, DUST);
  return lerp(teff, RECOMBINATION, Math.min(Math.max((t - engulfed) / (end - engulfed), 0), 1));
}

export function outflowTemperature(model, r, launch) {
  return Math.max(model.teff * Math.sqrt(launch / Math.max(r, launch)), DUST);
}

function firstAbove(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function outflowProfile(model, t, radii) {
  const { outflow } = model;
  const mass = new Float64Array(radii.length);
  const warmth = new Float64Array(radii.length);
  for (const parcel of model.parcels) {
    if (parcel.t >= t) break;
    const age = t - parcel.t;
    const centre = parcel.lever + outflow * age;
    const width = Math.hypot(NOZZLE * parcel.lever, SPEED_SPREAD * outflow * age);
    const last = firstAbove(radii, centre + KERNEL_REACH * width);
    const norm = parcel.mass / (width * Math.sqrt(2 * Math.PI));
    for (let k = firstAbove(radii, centre - KERNEL_REACH * width); k < last; k += 1) {
      const r = radii[k];
      const z = (r - centre) / width;
      const w = norm * Math.exp(-0.5 * z * z);
      mass[k] += w;
      warmth[k] += w * Math.log(outflowTemperature(model, r, parcel.lever));
    }
  }
  return radii.map((r, k) => {
    if (!(mass[k] > 0)) return { density: 0, temperature: DUST };
    return { density: mass[k] / (4 * Math.PI * r * r), temperature: Math.exp(warmth[k] / mass[k]) };
  });
}

export function bulkRadius(model, t, share) {
  const shell = model.shells[Math.min(Math.floor(share * model.shells.length), model.shells.length - 1)];
  return t > shell.t ? shell.from + model.speed * (t - shell.t) : shell.from;
}

export function bulkTime(model, radius, share) {
  const shell = model.shells[Math.min(Math.floor(share * model.shells.length), model.shells.length - 1)];
  return radius > shell.from ? shell.t + (radius - shell.from) / model.speed : shell.t;
}

export function ejectaPositions(model, t) {
  return model.shells.map(({ from, t: freed }) => (t > freed ? from + model.speed * (t - freed) : null));
}

function spread(values, middles, width) {
  const out = new Float64Array(values.length);
  middles.forEach((x, k) => {
    if (!(values[k] > 0)) return;
    const sigma = width(x);
    const first = firstAbove(middles, x - KERNEL_REACH * sigma);
    const last = firstAbove(middles, x + KERNEL_REACH * sigma);
    let total = 0;
    for (let i = first; i < last; i += 1) total += Math.exp(-0.5 * ((middles[i] - x) / sigma) ** 2);
    for (let i = first; i < last; i += 1) out[i] += (values[k] * Math.exp(-0.5 * ((middles[i] - x) / sigma) ** 2)) / total;
  });
  return out;
}

export function ejectaProfile(model, t, edges) {
  const count = edges.length - 1;
  const spacing = edges[1] - edges[0];
  const middles = edges.slice(0, -1).map((r) => r + spacing / 2);
  const mass = new Float64Array(count);
  ejectaPositions(model, t).forEach((x) => {
    if (x === null) return;
    const where = (x - edges[0]) / spacing - 0.5;
    const k = Math.floor(where);
    const w = where - k;
    if (k >= 0 && k < count) mass[k] += (1 - w) * model.share;
    if (k + 1 >= 0 && k + 1 < count) mass[k + 1] += w * model.share;
  });
  const held = spread(mass, middles, (r) => Math.hypot(SMOOTHING * spacing, SPEED_SPREAD * r));
  return Array.from(held, (m, k) => m / ((4 * Math.PI * (edges[k + 1] ** 3 - edges[k] ** 3)) / 3));
}
