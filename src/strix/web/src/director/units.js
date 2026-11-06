import { orbitalPeriodYears } from '../physics/kepler.js';

const SOLAR = { system: 'solar', time: 'Myr', length: 'R☉', mass: 'M☉', myr: 1, rsun: 1, msun: 1 };

export function unitsOf({ units, scale }) {
  if (units !== 'binary') return SOLAR;
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
