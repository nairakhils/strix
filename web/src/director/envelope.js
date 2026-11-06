import { bulkRadius, bulkTime, commonEnvelope, timeAtSeparation } from '../physics/envelope.js';

export const RUNAWAY_SHARE = 0.24;
export const PLUNGE_SHARE = 0.36;
export const EJECTA_TAIL = 2;
export const BULK_SHARE = 0.2;

const pick = (state, key, k) => state[`${key}${k + 1}`];

export function envelopeEpisodes(events = []) {
  return events
    .filter((event) => event.kind === 'envelope')
    .map(({ donor, during, until, start, end }) => {
      const d = donor - 1;
      const other = 1 - d;
      const model = commonEnvelope({
        donor: pick(start, 'm', d),
        core: pick(end, 'm', d),
        accretor: pick(start, 'm', other),
        radius: pick(start, 'r', d),
        coreRadius: pick(end, 'r', d),
        a0: start.a,
        e0: start.e,
        aF: end.a,
        teff: pick(start, 'teff', d),
      });
      return { donor: d, first: during[0], last: during[1], until, before: start, after: end, model };
    })
    .sort((p, q) => p.first - q.first);
}

export function envelopeClock({ model }, span) {
  const { a0, entry, aF, finish, plateau } = model;
  const outer = Math.log(a0 / entry);
  const inner = Math.log(entry / aF);
  const runaway = outer > 1e-6 ? RUNAWAY_SHARE * span : 0;
  const plunge = PLUNGE_SHARE * span;
  const rest = span - runaway - plunge;
  const near = Math.log(bulkRadius(model, finish, BULK_SHARE));
  const far = Math.log(bulkRadius(model, finish + EJECTA_TAIL * plateau, BULK_SHARE));
  const clock = (tau) => {
    if (tau <= 0) return 0;
    if (tau < runaway) return timeAtSeparation(model, a0 * Math.exp((-outer * tau) / runaway));
    if (tau < runaway + plunge) return timeAtSeparation(model, entry * Math.exp((-inner * (tau - runaway)) / plunge));
    const x = Math.min((tau - runaway - plunge) / rest, 1);
    return Math.max(bulkTime(model, Math.exp(near + (far - near) * x), BULK_SHARE), finish);
  };
  return { clock, runaway, plunge, rest, engulf: runaway, release: runaway + plunge };
}
