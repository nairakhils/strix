export function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

export function smoothstep(x) {
  return x * x * (3 - 2 * x);
}
