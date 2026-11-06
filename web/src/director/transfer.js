import { eggleton } from '../physics/roche.js';
import { streamPath, closestApproach } from '../physics/stream.js';
import {
  diskTemperature,
  innerTemperature,
  orbitalSpeed,
  ratePerSecond,
  soundSpeed,
  spherisationRadius,
  spotTemperature,
  streamDepth,
  tidalRadius,
  viscousYears,
} from '../physics/disk.js';
import { luminosity, surfaceTemperature } from '../physics/light.js';
import { accretedFraction, transferTrack } from '../physics/transfer.js';
import { clamp, smoothstep } from './blend.js';

export const DETACH_FROM = 0.95;
export const ONSET = 0.04;
export const STREAM_FADE = 15;
export const OVERFLOW_FROM = 0.98;
export const ASSUMED_RATE = 1e-3;
export const MIN_LAUNCH = 1e-3;
export const ISCO_RADII = 3;
export const NS_RADIUS = 10 / 6.957e5;
export const COOLEST_DISK = 3000;
export const MIN_ASPECT = 0.01;
export const MAX_ASPECT = 0.2;

const compactKinds = new Set(['BH', 'NS', 'WD']);

export function transferEpisodes(events = []) {
  return events.filter((event) => event.kind === 'transfer').map(({ donor, during, until, start, end }) => {
    const other = 3 - donor;
    const ends = {
      md0: start[`m${donor}`],
      ma0: start[`m${other}`],
      a0: start.a,
      md1: end[`m${donor}`],
      ma1: end[`m${other}`],
      a1: end.a,
    };
    const years = (end.time - start.time) * 1e6;
    return {
      donor: donor - 1,
      first: during[0],
      last: during[1],
      end: until,
      rate: (ends.md0 - ends.md1) / Math.max(years, 1e-6),
      years,
      accreted: accretedFraction(ends),
      streamTeff: start[`teff${donor}`],
      light: [start, end].map((state) => Math.log(luminosity(state[`r${donor}`], state[`teff${donor}`]))),
      track: transferTrack(ends),
      ...ends,
    };
  });
}

export function episodeProgress(episode, donorMass) {
  return clamp((episode.md0 - donorMass) / (episode.md0 - episode.md1), 0, 1);
}

export function applyTransfers(episodes, { masses, radii, teffs, elemA, status }) {
  for (const episode of episodes) {
    const d = episode.donor;
    const [early, late] = episode.light;
    for (let n = episode.first; n <= episode.last; n += 1) {
      if (status[n] === 'disrupted') continue;
      const x = episodeProgress(episode, masses[d][n]);
      const a = episode.track(x);
      elemA[n] = a;
      const lobe = eggleton(masses[d][n] / masses[1 - d][n]) * a;
      const detach = smoothstep(clamp((x - DETACH_FROM) / (1 - DETACH_FROM), 0, 1));
      radii[d][n] = lobe + (radii[d][n] - lobe) * detach;
      teffs[d][n] = surfaceTemperature(Math.exp(early + (late - early) * x), radii[d][n]);
    }
  }
}

function accretorInner(kind, radius) {
  if (kind === 'BH') return ISCO_RADII * radius;
  if (kind === 'NS') return Math.max(radius, NS_RADIUS);
  return radius;
}

const pathCache = new Map();

function cachedPath(q, launch, stop) {
  const values = [q.toPrecision(4), launch.toPrecision(3), stop.toPrecision(4)];
  const key = values.join(':');
  if (!pathCache.has(key)) {
    if (pathCache.size > 2000) pathCache.clear();
    pathCache.set(key, streamPath(...values.map(Number)));
  }
  return pathCache.get(key);
}

const approachCache = new Map();

function cachedApproach(q, launch) {
  const values = [q.toPrecision(4), launch.toPrecision(3)];
  const key = values.join(':');
  if (!approachCache.has(key)) {
    if (approachCache.size > 2000) approachCache.clear();
    approachCache.set(key, closestApproach(...values.map(Number)));
  }
  return approachCache.get(key);
}

function impactSpeed([x, y, vx, vy], disk, q) {
  const dx = x - 1;
  const dy = y;
  const ux = vx - dy;
  const uy = vy + dx;
  if (!disk) return Math.hypot(ux, uy);
  const r = Math.hypot(dx, dy);
  const kepler = Math.sqrt(1 / (1 + q) / r);
  return Math.hypot(ux + (kepler * dy) / r, uy - (kepler * dx) / r);
}

export function transferGeometry({ donor, kinds, masses, radii, teffs, a, rate, age = Infinity, ease = 1 }) {
  const accretor = 1 - donor;
  const md = masses[donor];
  const ma = masses[accretor];
  const q = md / ma;
  const unitSpeed = orbitalSpeed(a, md + ma);
  const launch = Math.max(soundSpeed(teffs[donor]) / unitSpeed, MIN_LAUNCH);
  const compact = compactKinds.has(kinds[accretor]);
  const inner = accretorInner(kinds[accretor], radii[accretor]);
  const tidal = tidalRadius(ma / md);
  const approach = cachedApproach(q, launch);
  const formsDisk = compact || approach.minimum * a > radii[accretor];
  const hasDisk = formsDisk && tidal * a > inner;
  const grams = ratePerSecond(rate);
  const sphere = compact ? spherisationRadius(ma, grams) : 0;
  const ring = Math.min(Math.max(approach.circularisation, (1.5 * inner) / a), tidal);
  const edgeTemperature = diskTemperature(tidal * a, { mass: ma, rate: grams, inner, sphere });
  const spread = viscousYears(tidal * a, ma, Math.max(edgeTemperature, COOLEST_DISK));
  const grown = Math.min(1 - Math.exp(-age / spread), ease);
  const outer = ring + (tidal - ring) * grown;
  const stop = hasDisk ? outer : Math.max(radii[accretor] / a, 1e-4);
  const { path, impact, duration } = cachedPath(q, launch, stop);
  const width = launch * a;
  const opacity = new Float32Array(path.length / 5);
  for (let k = 0; k < opacity.length; k += 1) {
    const speed = Math.hypot(path[5 * k + 2], path[5 * k + 3]) * unitSpeed;
    opacity[k] = 1 - Math.exp(-streamDepth(grams, width, Math.max(speed, launch * unitSpeed)));
  }
  const spot = impact
    ? { x: impact[0], y: impact[1], onDisk: hasDisk, temperature: spotTemperature(grams, impactSpeed(impact, hasDisk, q) * unitSpeed, width) }
    : null;
  const rim = Math.max(diskTemperature(outer * a, { mass: ma, rate: grams, inner, sphere }), COOLEST_DISK);
  const disk = hasDisk
    ? {
      inner: inner / a,
      outer,
      ring,
      grown,
      sphere: sphere / a,
      spread,
      core: innerTemperature(ma, grams, inner),
      aspect: clamp(soundSpeed(rim) / orbitalSpeed(outer * a, ma), MIN_ASPECT, MAX_ASPECT),
    }
    : null;
  return {
    donor,
    accretor,
    q,
    launch,
    minimum: approach.minimum,
    circularisation: approach.circularisation,
    stream: { path, width: launch, opacity, temperature: teffs[donor], duration, stop },
    spot,
    disk,
  };
}

export function steadyRate(rates, n) {
  const rate = rates?.[n];
  return rate > 0 ? rate : ASSUMED_RATE;
}

export function overflowDonor(fills) {
  if (!fills) return null;
  const donor = fills[1] > fills[0] ? 1 : 0;
  return fills[donor] >= OVERFLOW_FROM ? donor : null;
}

export function streamPresence(x, sinceEnd) {
  if (x < 1) return smoothstep(clamp(x / ONSET, 0, 1));
  return 1 - smoothstep(clamp(sinceEnd / STREAM_FADE, 0, 1));
}

export function diskPresence(x, sinceEnd, fadeFrames) {
  if (x < 1) return smoothstep(clamp(x / ONSET, 0, 1));
  return 1 - smoothstep(clamp(sinceEnd / Math.max(fadeFrames, 1), 0, 1));
}
