import { orbitalPeriodYears } from '../physics/kepler.js';

export function unitsOf({ scale }) {
  return {
    system: 'binary',
    time: 'orbits',
    length: 'a',
    mass: 'M',
    myr: orbitalPeriodYears(scale.length, scale.mass) / 1e6,
    rsun: scale.length,
    msun: scale.mass,
  };
}
