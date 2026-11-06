export const SUN_TEFF = 5772;
export const LUMINANCE_CONTRAST = 0.5;

const APPROX_U1_BASE = 0.09;
const APPROX_U1_TAIL = [0.08, 4.25, 0.12];
const APPROX_U1_DROP = [0.46, 3.79, 0.075];
const APPROX_U1_BUMP = [0.08, 3.6, 0.07];
const APPROX_U2_BASE = 0.13;
const APPROX_U2_RISE = [0.12, 3.77, 0.06];
const APPROX_U2_PEAK = [0.152, 4, 0.286];

const GRAVITY = 6.674e-8;
const SUN_MASS = 1.989e33;
const SUN_RADIUS = 6.957e10;
const BOLTZMANN = 1.380649e-16;
const HYDROGEN_MASS = 1.6735e-24;
const MEAN_MOLECULAR_WEIGHT = 0.6;

const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
const smoothstep = (t) => t * t * (3 - 2 * t);
const logistic = (x) => 1 / (1 + Math.exp(-x));

function locate(nodes, value) {
  let lo = 0;
  let hi = nodes.length - 1;
  if (value <= nodes[lo]) return [lo, 0];
  if (value >= nodes[hi]) return [hi, 0];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid] <= value) lo = mid;
    else hi = mid;
  }
  return [lo, (value - nodes[lo]) / (nodes[lo + 1] - nodes[lo])];
}

export function luminosity(radius, teff) {
  return radius * radius * (teff / SUN_TEFF) ** 4;
}

export function surfaceTemperature(luminosity, radius) {
  return SUN_TEFF * Math.sqrt(Math.sqrt(luminosity) / radius);
}

export function paletteColour({ temperature, rgb }, teff) {
  const t = Math.log(teff);
  let k = 0;
  while (k < temperature.length - 2 && Math.log(temperature[k + 1]) < t) k += 1;
  const lo = Math.log(temperature[k]);
  const w = clamp((t - lo) / (Math.log(temperature[k + 1]) - lo), 0, 1);
  return rgb[k].map((c, i) => c + (rgb[k + 1][i] - c) * w);
}

export function makeLight(palette) {
  const logs = Array.from(palette.temperature, (temperature) => Math.log(temperature));
  const values = Array.from(palette.luminance);
  const luminance = (temperature) => {
    const [index, weight] = locate(logs, Math.log(temperature));
    return weight === 0 ? values[index] : values[index] * (values[index + 1] / values[index]) ** weight;
  };
  const reference = luminance(SUN_TEFF);
  return {
    luminance,
    surfaceBrightness: (temperature) => (luminance(temperature) / reference) ** LUMINANCE_CONTRAST,
  };
}

function decode(byte) {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearColour(rgb) {
  return Array.from(rgb, decode);
}

export function unitLuminance(linear) {
  const luma = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  if (luma === 0) return [1, 1, 1];
  return Array.from(linear, (c) => c / luma);
}

function falling([height, centre, width], t) {
  return height * logistic((centre - t) / width);
}

function rising([height, centre, width], t) {
  return height * logistic((t - centre) / width);
}

function bump([height, centre, width], t) {
  const x = (t - centre) / width;
  return height * Math.exp(-x * x);
}

export function approximateLimbDarkening(temperature) {
  const t = Math.log10(temperature);
  return [
    APPROX_U1_BASE + falling(APPROX_U1_TAIL, t) + falling(APPROX_U1_DROP, t) + bump(APPROX_U1_BUMP, t),
    APPROX_U2_BASE + rising(APPROX_U2_RISE, t) + bump(APPROX_U2_PEAK, t),
  ];
}

export function granulation(temperature, mass, radius) {
  const surface = radius * SUN_RADIUS;
  const gravity = (GRAVITY * mass * SUN_MASS) / (surface * surface);
  const scaleHeight = (BOLTZMANN * temperature) / (MEAN_MOLECULAR_WEIGHT * HYDROGEN_MASS * gravity);
  return {
    cells: clamp(surface / (5 * scaleHeight), 2, 400),
    amplitude: 0.12 * smoothstep(clamp((7000 - temperature) / 500, 0, 1)),
  };
}
