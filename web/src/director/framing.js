export const TAU = 50;
export const TAU_SETTLE = 12;
export const EASE_SIGMA = 6;

export function envelope(rawLog, grow, settle) {
  const env = Float64Array.from(rawLog);
  for (let k = 1; k < env.length; k += 1) env[k] = Math.max(env[k], env[k - 1] - 1 / settle);
  for (let k = env.length - 2; k >= 0; k -= 1) env[k] = Math.max(env[k], env[k + 1] - 1 / grow);
  return env;
}

function dilate(values, reach) {
  const count = values.length;
  return Float64Array.from({ length: count }, (_, k) => {
    let top = -Infinity;
    for (let j = Math.max(0, k - reach); j <= Math.min(count - 1, k + reach); j += 1) top = Math.max(top, values[j]);
    return top;
  });
}

export function framing(rawLog, grow = TAU, settle = TAU_SETTLE) {
  const reach = Math.ceil(3 * EASE_SIGMA);
  const env = envelope(rawLog, grow, settle);
  return gaussianSmooth(dilate(env, reach + 1), EASE_SIGMA).map((value, k) => Math.max(value, env[k]));
}

export function framingAt(framed, u, rawLogAtU) {
  const last = framed.length - 1;
  const i = Math.max(0, Math.min(Math.floor(u), last - 1));
  const j = Math.min(i + 1, last);
  return Math.max(framed[i] + (framed[j] - framed[i]) * (u - i), rawLogAtU);
}

export function gaussianSmooth(values, sigma) {
  const count = values.length;
  const reach = Math.ceil(3 * sigma);
  const kernel = Array.from({ length: 2 * reach + 1 }, (_, k) => Math.exp(-0.5 * ((k - reach) / sigma) ** 2));
  const smoothed = new Float64Array(count);
  for (let j = 0; j < count; j += 1) {
    let sum = 0;
    let total = 0;
    for (let k = Math.max(0, j - reach); k <= Math.min(count - 1, j + reach); k += 1) {
      const weight = kernel[k - j + reach];
      sum += weight * values[k];
      total += weight;
    }
    smoothed[j] = sum / total;
  }
  return smoothed;
}
