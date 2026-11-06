const GRAVITY = 6.674e-8;
const SUN_MASS = 1.989e33;
const SUN_RADIUS = 6.957e10;
const YEAR = 3.15576e7;
const THOMSON = 6.6524587e-25;
const PROTON_MASS = 1.67262e-24;

export const ELECTRON_MOLECULAR_WEIGHT = 1.2;
export const LAUNCH_SPEED = 0.01;
export const WIND_REACH = 8;
export const PROFILE_SAMPLES = 48;

const HOT_RATIO = 2.6;
const WOLF_RAYET_RATIO = 1;
const WARM_RATIO = 1.3;
const COOL_RATIO = 0.7;
const HOT_JUMP = 21000;
const COOL_JUMP = 10000;
const JUMP_WIDTH = 500;
const IONISED_FROM = 8000;
const IONISED_TO = 12000;
const PROFILE_STEPS = 2000;

const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
const smoothstep = (t) => t * t * (3 - 2 * t);
const logistic = (x) => 1 / (1 + Math.exp(-x));

export function terminalSpeedRatio(teff, regime = '') {
  if (regime === 'WR') return WOLF_RAYET_RATIO;
  const warm = logistic((teff - COOL_JUMP) / JUMP_WIDTH);
  const hot = logistic((teff - HOT_JUMP) / JUMP_WIDTH);
  return COOL_RATIO + (WARM_RATIO - COOL_RATIO) * warm + (HOT_RATIO - WARM_RATIO) * hot;
}

export function terminalSpeed(teff, mass, radius, regime = '') {
  return terminalSpeedRatio(teff, regime) * Math.sqrt((2 * GRAVITY * mass * SUN_MASS) / (radius * SUN_RADIUS));
}

export function windCrossings(seconds, teff, mass, radius, regime = '') {
  if (!(seconds > 0 && mass > 0 && radius > 0)) return 0;
  return (seconds * terminalSpeed(teff, mass, radius, regime)) / (radius * SUN_RADIUS);
}

export function ionisedFraction(teff) {
  return smoothstep(clamp((teff - IONISED_FROM) / (IONISED_TO - IONISED_FROM), 0, 1));
}

export function scatteringDepth(mdot, radius, speed) {
  const rate = (mdot * SUN_MASS) / YEAR;
  return (THOMSON * rate) / (4 * Math.PI * radius * SUN_RADIUS * speed * ELECTRON_MOLECULAR_WEIGHT * PROTON_MASS);
}

export function outflowDepth(mdot, mass, radius) {
  if (!(mdot > 0 && mass > 0 && radius > 0)) return 0;
  return scatteringDepth(mdot, radius, Math.sqrt((2 * GRAVITY * mass * SUN_MASS) / (radius * SUN_RADIUS)));
}

export function windDepth({ mdot, teff, mass, radius, regime = '' }) {
  if (!(mdot > 0 && mass > 0 && radius > 0)) return 0;
  return ionisedFraction(teff) * scatteringDepth(mdot, radius, terminalSpeed(teff, mass, radius, regime));
}

function dilution(x) {
  const inverse = 1 / (x * x);
  return (0.5 * inverse) / (1 + Math.sqrt(1 - inverse));
}

export function scatteringProfile(p) {
  const base = 1 - LAUNCH_SPEED;
  const step = Math.PI / 2 / PROFILE_STEPS;
  const integrand = (theta) => dilution(p / Math.cos(theta)) / (p - base * Math.cos(theta));
  let sum = integrand(0);
  for (let k = 1; k < PROFILE_STEPS; k += 1) sum += (k % 2 === 1 ? 4 : 2) * integrand(k * step);
  return (2 * step * sum) / 3;
}

export function profileTable(samples = PROFILE_SAMPLES, reach = WIND_REACH) {
  return Float32Array.from({ length: samples }, (_, k) => scatteringProfile(reach ** (k / (samples - 1))));
}

export function scatteredShare(table, reach = WIND_REACH, steps = 4096) {
  const last = table.length - 1;
  let sum = 0;
  for (let k = 0; k < steps; k += 1) {
    const x = (k + 0.5) / steps;
    const at = x * last;
    const i = Math.min(Math.floor(at), last - 1);
    sum += 2 * (table[i] + (table[i + 1] - table[i]) * (at - i)) * reach ** (2 * x);
  }
  return (sum * Math.log(reach)) / steps;
}
