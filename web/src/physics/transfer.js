export const TRACK_STEPS = 256;

export function angularMomentum(md, ma, a) {
  return md * ma * Math.sqrt(a / (md + ma));
}

export function accretedFraction({ md0, ma0, md1, ma1 }) {
  const lost = md0 - md1;
  return lost > 0 ? Math.min(Math.max((ma1 - ma0) / lost, 0), 1) : 1;
}

export function textbookTrack({ md0, ma0, a0, md1, ma1 }, steps = TRACK_STEPS) {
  const beta = accretedFraction({ md0, ma0, md1, ma1 });
  const logs = new Float64Array(steps + 1);
  let md = md0;
  let ma = ma0;
  let j = angularMomentum(md0, ma0, a0);
  logs[0] = Math.log(j);
  const dm = (md1 - md0) / steps;
  for (let k = 1; k <= steps; k += 1) {
    const total = md + ma;
    const a = (j * j * total) / (md * md * ma * ma);
    j += (1 - beta) * dm * (md / total) ** 2 * Math.sqrt(total * a);
    md += dm;
    ma -= beta * dm;
    logs[k] = Math.log(j);
  }
  return logs;
}

export function transferTrack(ends, steps = TRACK_STEPS) {
  const { md0, ma0, md1, ma1, a1 } = ends;
  const logs = textbookTrack(ends, steps);
  const correction = Math.log(angularMomentum(md1, ma1, a1)) - logs[steps];
  return (x) => {
    const at = Math.min(Math.max(x, 0), 1) * steps;
    const k = Math.min(Math.floor(at), steps - 1);
    const logJ = logs[k] + (logs[k + 1] - logs[k]) * (at - k) + correction * (at / steps);
    const md = md0 + (md1 - md0) * (at / steps);
    const ma = ma0 + (ma1 - ma0) * (at / steps);
    const j = Math.exp(logJ);
    return (j * j * (md + ma)) / (md * md * ma * ma);
  };
}
