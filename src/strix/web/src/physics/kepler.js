import { RSUN_PER_AU } from './units.js';

const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);

export function eccentricAnomaly(meanAnomaly, e) {
  const ecc = clamp(e, 0, 0.999);
  const mean = Math.atan2(Math.sin(meanAnomaly), Math.cos(meanAnomaly));
  let lo = -Math.PI;
  let hi = Math.PI;
  let anomaly = clamp(mean + ecc * Math.sin(mean), lo, hi);
  for (let i = 0; i < 100; i++) {
    const residual = anomaly - ecc * Math.sin(anomaly) - mean;
    if (Math.abs(residual) < 1e-13) break;
    if (residual > 0) hi = anomaly;
    else lo = anomaly;
    const newton = anomaly - residual / (1 - ecc * Math.cos(anomaly));
    anomaly = newton > lo && newton < hi ? newton : 0.5 * (lo + hi);
  }
  return anomaly;
}

export function relativeOrbit(a, e, meanAnomaly) {
  const ecc = clamp(e, 0, 0.999);
  const anomaly = eccentricAnomaly(meanAnomaly, ecc);
  return {
    x: a * (Math.cos(anomaly) - ecc),
    y: a * Math.sqrt(1 - ecc * ecc) * Math.sin(anomaly),
  };
}

export function barycentric(x, y, m1, m2) {
  const total = m1 + m2;
  const share1 = total > 0 ? m2 / total : 0.5;
  const share2 = total > 0 ? m1 / total : 0.5;
  return [
    [-share1 * x, -share1 * y],
    [share2 * x, share2 * y],
  ];
}

export function orbitalPeriodYears(a, m) {
  return Math.sqrt((a / RSUN_PER_AU) ** 3 / m);
}
