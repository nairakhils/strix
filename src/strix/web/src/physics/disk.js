import { eggleton } from './roche.js';
import { BOLTZMANN, GRAVITY, HYDROGEN_MASS, LIGHT, STEFAN, SUN_LUMINOSITY, SUN_MASS, SUN_RADIUS, YEAR } from './units.js';

export const ELECTRON_OPACITY = 0.34;
export const MEAN_MOLECULAR_WEIGHT = 0.6;
export const RADIATIVE_EFFICIENCY = 0.1;
export const TRUNCATION = 0.9;
export const VISCOSITY_ALPHA = 0.1;

export function ratePerSecond(msunPerYear) {
  return (msunPerYear * SUN_MASS) / YEAR;
}

export function isothermalScale(mass, length, mach) {
  return (MEAN_MOLECULAR_WEIGHT * HYDROGEN_MASS * GRAVITY * mass * SUN_MASS) / (BOLTZMANN * length * SUN_RADIUS * mach * mach);
}

export function soundSpeed(temperature) {
  return Math.sqrt((BOLTZMANN * temperature) / (MEAN_MOLECULAR_WEIGHT * HYDROGEN_MASS));
}

export function orbitalSpeed(a, mass) {
  return Math.sqrt((GRAVITY * mass * SUN_MASS) / (a * SUN_RADIUS));
}

export function eddingtonRate(mass) {
  return (4 * Math.PI * GRAVITY * mass * SUN_MASS) / (ELECTRON_OPACITY * LIGHT * RADIATIVE_EFFICIENCY);
}

export function accretionLuminosity(mass, rate, radius) {
  const eddington = (4 * Math.PI * GRAVITY * mass * SUN_MASS * LIGHT) / ELECTRON_OPACITY;
  const share = (GRAVITY * mass * SUN_MASS * rate) / (radius * SUN_RADIUS) / eddington;
  return (eddington * (share > 1 ? 1 + Math.log(share) : share)) / SUN_LUMINOSITY;
}

export function spherisationRadius(mass, rate) {
  const schwarzschild = (2 * GRAVITY * mass * SUN_MASS) / (LIGHT * LIGHT) / SUN_RADIUS;
  return 6.75 * (rate / eddingtonRate(mass)) * schwarzschild;
}

export function tidalRadius(accretorOverDonor) {
  return TRUNCATION * eggleton(accretorOverDonor);
}

export function innerTemperature(mass, rate, inner) {
  const r = inner * SUN_RADIUS;
  return ((3 * GRAVITY * mass * SUN_MASS * rate) / (8 * Math.PI * STEFAN * r * r * r)) ** 0.25;
}

export function diskTemperature(radius, { mass, rate, inner, sphere = 0 }) {
  if (radius <= inner) return 0;
  const feed = radius < sphere ? radius / sphere : 1;
  const flux = (feed * (1 - Math.sqrt(inner / radius))) / (radius / inner) ** 3;
  return innerTemperature(mass, rate, inner) * flux ** 0.25;
}

export function viscousYears(radius, mass, temperature) {
  const r = radius * SUN_RADIUS;
  const omega = Math.sqrt((GRAVITY * mass * SUN_MASS) / (r * r * r));
  const sound = soundSpeed(temperature);
  return (r * r * omega) / (VISCOSITY_ALPHA * sound * sound) / YEAR;
}

export function spotTemperature(rate, speed, width) {
  const area = Math.PI * (0.5 * width * SUN_RADIUS) ** 2;
  return ((0.5 * rate * speed * speed) / (STEFAN * area)) ** 0.25;
}

export function streamDepth(rate, width, speed) {
  const w = width * SUN_RADIUS;
  const density = rate / (Math.PI * 0.25 * w * w * speed);
  return ELECTRON_OPACITY * density * w;
}
