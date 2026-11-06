const GRAVITY = 6.674e-8;
const BOLTZMANN = 1.380649e-16;
const HYDROGEN_MASS = 1.6735e-24;
const SUN_MASS = 1.989e33;
const SUN_RADIUS = 6.957e10;

export const MEAN_MOLECULAR_WEIGHT = 0.6;

export function isothermalScale(mass, length, mach) {
  return (MEAN_MOLECULAR_WEIGHT * HYDROGEN_MASS * GRAVITY * mass * SUN_MASS) / (BOLTZMANN * length * SUN_RADIUS * mach * mach);
}
