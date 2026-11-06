import { eccentricAnomaly } from './kepler.js';

const GRAVITY = 6.674e-8;
const SUN_MASS = 1.989e33;
const SUN_RADIUS = 6.957e10;
const KM_PER_RSUN = 695700;
const LIGHT_SPEED = 2.998e10;

export const MU_SUN = (GRAVITY * SUN_MASS) / SUN_RADIUS ** 3;
export const SUPERNOVA_ENERGY = 1e51;
export const FAILED_ENERGY = 1e48;
export const FAILED_EJECTA = 0.5;
export const PLATEAU_DAYS = 99;
export const COOLING_TEMPERATURE = 2.5e4;
export const COOLING_SLOPE = 0.45;
export const OPACITY = 0.07;
export const ARNETT_BETA = 13.8;
export const HYDROGEN_RICH = 0.5;
export const HYDROGEN_TRACE = 0.01;
export const HELIUM_TRACE = 0.14;
const DAY = 86400;

export function explosionEnergy(ejected) {
  return ejected < FAILED_EJECTA ? FAILED_ENERGY : SUPERNOVA_ENERGY;
}

export function ejectaSpeed(ejected, energy = explosionEnergy(ejected)) {
  if (!(ejected > 0)) return 0;
  return Math.sqrt((10 * energy) / (3 * ejected * SUN_MASS)) / SUN_RADIUS;
}

export function plateauSeconds(ejected, radius, energy = explosionEnergy(ejected)) {
  if (!(ejected > 0)) return 0;
  return PLATEAU_DAYS * DAY * Math.sqrt(ejected / 10) * (radius / 500) ** (1 / 6) * (energy / 1e51) ** (-1 / 6);
}

export function diffusionSeconds(ejected, energy = explosionEnergy(ejected)) {
  if (!(ejected > 0)) return 0;
  const speed = ejectaSpeed(ejected, energy) * SUN_RADIUS;
  return Math.sqrt((2 * OPACITY * ejected * SUN_MASS) / (ARNETT_BETA * LIGHT_SPEED * speed));
}

export function supernovaType({ hydrogen, helium }) {
  if (hydrogen >= HYDROGEN_RICH) return 'II';
  if (hydrogen >= HYDROGEN_TRACE) return 'IIb';
  return helium >= HELIUM_TRACE ? 'Ib' : 'Ic';
}

export function shockTemperature(radius, seconds) {
  return COOLING_TEMPERATURE * (radius / 500) ** 0.25 * (Math.max(seconds, 1) / DAY) ** -COOLING_SLOPE;
}

export function rotate([x, y], angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * x - s * y, s * x + c * y];
}

export function orbitState(a, e, meanAnomaly, mass) {
  const motion = Math.sqrt((MU_SUN * mass) / (a * a * a));
  const anomaly = eccentricAnomaly(meanAnomaly, e);
  const c = Math.cos(anomaly);
  const s = Math.sin(anomaly);
  const minor = a * Math.sqrt(1 - e * e);
  const rate = motion / (1 - e * c);
  return { position: [a * (c - e), minor * s], velocity: [-a * s * rate, minor * c * rate] };
}

export function hyperbolicAnomaly(meanAnomaly, e) {
  let anomaly = Math.asinh(meanAnomaly / e);
  for (let i = 0; i < 100; i += 1) {
    const residual = e * Math.sinh(anomaly) - anomaly - meanAnomaly;
    if (Math.abs(residual) < 1e-12) break;
    anomaly -= residual / (e * Math.cosh(anomaly) - 1);
  }
  return anomaly;
}

export function hyperbolicPosition(a, e, meanAnomaly) {
  const anomaly = hyperbolicAnomaly(meanAnomaly, e);
  const scale = Math.abs(a);
  return [scale * (e - Math.cosh(anomaly)), scale * Math.sqrt(e * e - 1) * Math.sinh(anomaly)];
}

function elements(position, velocity, mu) {
  const r = Math.hypot(...position);
  const speed2 = velocity[0] ** 2 + velocity[1] ** 2;
  const radial = position[0] * velocity[0] + position[1] * velocity[1];
  const vector = [0, 1].map((k) => ((speed2 - mu / r) * position[k] - radial * velocity[k]) / mu);
  const e = Math.hypot(...vector);
  const a = 1 / (2 / r - speed2 / mu);
  const apse = e > 1e-9 ? Math.atan2(vector[1], vector[0]) : Math.atan2(position[1], position[0]);
  const truth = Math.atan2(position[1], position[0]) - apse;
  let anomaly;
  if (e < 1) {
    const eccentric = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(truth / 2));
    anomaly = eccentric - e * Math.sin(eccentric);
  } else {
    const hyperbolic = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(truth / 2));
    anomaly = e * Math.sinh(hyperbolic) - hyperbolic;
  }
  return { a, e, apse, anomaly, bound: e < 1, motion: Math.sqrt(mu / Math.abs(a) ** 3) };
}

export function escapeSpeed(mass, a) {
  return Math.sqrt((MU_SUN * mass) / Math.abs(a)) * KM_PER_RSUN;
}

export function ejectaDrift({ velocity, after, sign, share, preMass, postMass, remnant, ejected }) {
  if (!(ejected > 0)) return [0, 0];
  return [0, 1].map((n) => {
    const companion = -sign * (1 - share) * velocity[n];
    const star = companion + sign * velocity[n];
    const kept = companion + sign * after[n];
    return (preMass * ((remnant + ejected) * star - remnant * kept)) / (ejected * postMass);
  });
}

export function afterCollapse({ position, velocity, mass, a, e }) {
  const mu = MU_SUN * mass;
  const r = Math.hypot(...position);
  const bound = a > 0 && e < 1;
  const speed2 = Math.max(mu * (2 / r - 1 / a), 1e-30);
  const momentum = bound ? Math.sqrt(mu * a * (1 - e * e)) : Math.sqrt(mu * Math.abs(a) * (e * e - 1));
  const across = Math.min(momentum / r, Math.sqrt(speed2));
  const along = Math.sqrt(Math.max(speed2 - across * across, 0));
  const outward = position.map((x) => x / r);
  const forward = [-outward[1], outward[0]];
  const sense = Math.sign(position[0] * velocity[1] - position[1] * velocity[0]) || 1;
  const choices = [1, -1].map((sign) => [0, 1].map((k) => sense * across * forward[k] + sign * along * outward[k]));
  const kicks = choices.map((v) => [v[0] - velocity[0], v[1] - velocity[1]]);
  const pick = Math.hypot(...kicks[0]) <= Math.hypot(...kicks[1]) ? 0 : 1;
  return {
    ...elements(position, choices[pick], mu),
    velocity: choices[pick],
    kick: Math.hypot(...kicks[pick]) * KM_PER_RSUN,
  };
}
