import { SAMPLE_RATE } from '../scene.js';
import { clamp, smoothstep } from './blend.js';

export const TRANSFER_RATE = 20;
export const EASE_FRAMES = 6;
export const HOLD_FRAMES = 3;
export const PACE_STEPS = 8;

export function inside(u, from, to) {
  const rise = smoothstep(clamp((u - from + EASE_FRAMES) / EASE_FRAMES, 0, 1));
  const fall = smoothstep(clamp((to + EASE_FRAMES - u) / EASE_FRAMES, 0, 1));
  return Math.min(rise, fall);
}

function hold(u, at, seconds) {
  const x = (u - at) / HOLD_FRAMES;
  if (Math.abs(x) >= 0.5) return 0;
  return (seconds / HOLD_FRAMES) * (1 + Math.cos(2 * Math.PI * x));
}

export function makePace(frameCount, { rate = SAMPLE_RATE, windows = [], holds = [] } = {}) {
  const last = frameCount - 1;
  const base = 1 / rate;

  function paceAt(u) {
    const slowing = windows.reduce(
      (top, { from, to, rate = TRANSFER_RATE }) => Math.max(top, (1 / rate - base) * inside(u, from, to)),
      0,
    );
    return base + slowing + holds.reduce((sum, { at, seconds }) => sum + hold(u, at, seconds), 0);
  }

  const times = new Float64Array(PACE_STEPS * last + 1);
  for (let k = 0; k < PACE_STEPS * last; k += 1) {
    times[k + 1] = times[k] + (paceAt(k / PACE_STEPS) + paceAt((k + 1) / PACE_STEPS)) / (2 * PACE_STEPS);
  }

  function timeAt(u) {
    const x = clamp(u, 0, last) * PACE_STEPS;
    const k = Math.min(Math.floor(x), PACE_STEPS * last - 1);
    return times[k] + (times[k + 1] - times[k]) * (x - k);
  }

  function uAtTime(seconds) {
    const target = clamp(seconds, 0, times[times.length - 1]);
    let lo = 0;
    let hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = times[hi] - times[lo];
    return (lo + (span > 0 ? (target - times[lo]) / span : 0)) / PACE_STEPS;
  }

  return { paceAt, timeAt, uAtTime, duration: times[times.length - 1] };
}
