import { ejectaSpeed, explosionEnergy, FAILED_EJECTA } from '../physics/collapse.js';

const boundOrbit = ({ a, e }) => a > 0 && e >= 0 && e < 1;

export function collapseEpisodes(events = []) {
  return events
    .filter((event) => event.kind === 'collapse')
    .map(({ star, during, until, start, end }) => {
      const k = star - 1;
      const mass = (state) => (k === 0 ? state.m1 : state.m2);
      const ejected = Math.max(mass(start) - mass(end), 0);
      return {
        star: k,
        first: during[0],
        last: during[1],
        until,
        before: start,
        after: end,
        ejected,
        failed: ejected < FAILED_EJECTA,
        energy: explosionEnergy(ejected),
        speed: ejectaSpeed(ejected),
        boundBefore: boundOrbit(start),
        boundAfter: boundOrbit(end),
      };
    })
    .sort((p, q) => p.first - q.first);
}

export function applyCollapses(collapses, { masses, radii, teffs, kinds, types, a, e }) {
  const last = masses[0].length - 1;
  for (const episode of collapses) {
    const from = Math.min(episode.last + 1, last);
    const k = episode.star;
    for (let n = episode.first; n <= episode.last; n += 1) {
      masses[0][n] = episode.after.m1;
      masses[1][n] = episode.after.m2;
      radii[k][n] = radii[k][from];
      teffs[k][n] = teffs[k][from];
      kinds[k][n] = kinds[k][from];
      types[k][n] = types[k][from];
      a[n] = episode.after.a;
      e[n] = episode.after.e;
    }
  }
}
