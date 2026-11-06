export const F1 = 0.8;
export const CEILING_POWER = 0.25;
export const RAMP_FRAMES = 12;

export function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

export function smoothstep(x) {
  return x * x * (3 - 2 * x);
}

export function ceiling(f) {
  return F1 * (f / F1) ** CEILING_POWER;
}

export function blendFill(f, fV, w) {
  const base = f >= F1 ? f : Math.min(Math.max(fV, f), ceiling(f));
  return (1 - w) * base + w * f;
}

export function episodeWeights(coupled) {
  const count = coupled.length;
  const distance = new Float64Array(count);
  let previous = -Infinity;
  for (let j = 0; j < count; j += 1) {
    if (coupled[j]) previous = j;
    distance[j] = j - previous;
  }
  let next = Infinity;
  for (let j = count - 1; j >= 0; j -= 1) {
    if (coupled[j]) next = j;
    distance[j] = Math.min(distance[j], next - j);
  }
  return distance.map((d) => smoothstep(clamp(1 - d / (RAMP_FRAMES + 1), 0, 1)));
}
