import { rocheGradient } from './roche.js';

export const CONVECTIVE_BETA = 0.08;
export const RADIATIVE_BETA = 0.25;
export const GRAVITY_FLOOR = 1e-12;

const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
const smoothstep = (t) => t * t * (3 - 2 * t);

export function gravityDarkeningExponent(teff) {
  const s = smoothstep(clamp((teff - 6500) / 1000, 0, 1));
  return CONVECTIVE_BETA * (1 - s) + RADIATIVE_BETA * s;
}

function patchFlux(grid, positions, beta, gravity, ratios, areas) {
  const { index, twin } = grid;
  const power = 4 * beta;
  ratios.fill(0);
  areas.fill(0);
  for (let k = 0; k < index.length; k += 3) {
    const a = 3 * index[k];
    const b = 3 * index[k + 1];
    const c = 3 * index[k + 2];
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const third = Math.sqrt(nx * nx + ny * ny + nz * nz) / 6;
    const x = (positions[a] + positions[b] + positions[c]) / 3;
    const y = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
    const z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
    const flux = Math.max(gravity(x, y, z), GRAVITY_FLOOR) ** power;
    for (let n = k; n < k + 3; n++) {
      ratios[twin[index[n]]] += third * flux;
      areas[twin[index[n]]] += third;
    }
  }
  let sum = 0;
  let total = 0;
  for (let n = 0; n < grid.count; n++) {
    sum += ratios[n];
    total += areas[n];
  }
  const mean = sum / total;
  for (let n = 0; n < grid.count; n++) {
    if (areas[n] > 0) ratios[n] = Math.sqrt(Math.sqrt(ratios[n] / areas[n] / mean));
  }
  for (let n = 0; n < grid.count; n++) ratios[n] = ratios[twin[n]];
  return ratios;
}

export function tidalDarkening(q, grid, positions, beta, ratios, areas) {
  const g = [0, 0, 0];
  return patchFlux(grid, positions, beta, (x, y, z) => {
    rocheGradient(q, x, y, z, g);
    return Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
  }, ratios, areas);
}

export function rotationalDarkening(spin, grid, positions, beta, ratios, areas) {
  if (!(spin > 0)) return ratios.fill(1);
  const spin2 = spin * spin;
  return patchFlux(grid, positions, beta, (x, y, z) => {
    const r2 = x * x + y * y + z * z;
    const pull = 1 / (r2 * Math.sqrt(r2));
    const sideways = (spin2 - pull) * (spin2 - pull) * (x * x + y * y);
    return Math.sqrt(sideways + pull * pull * z * z);
  }, ratios, areas);
}
