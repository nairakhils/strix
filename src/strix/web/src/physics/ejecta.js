export const CORE_BREAK = 0.75;
export const OUTER_SLOPE = 10;

export function ejectaDensity(f) {
  return f < CORE_BREAK ? 1 : (f / CORE_BREAK) ** -OUTER_SLOPE;
}
