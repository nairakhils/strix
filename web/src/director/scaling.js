export const LOG_SCREEN = [1008, 800];

export function logScaledRadius(radius, pixelsAtRef = 100) {
  const clamped = Math.max(radius, 1e-6);
  return (Math.log10(clamped + 1.0) / Math.log10(100.0 + 1.0)) * pixelsAtRef;
}

export function linearScaledRadius(radius, pixelsAtRefLin = 300) {
  const clamped = Math.max(radius, 0.0);
  return (clamped / 100.0) * pixelsAtRefLin;
}

export function scaledRadius(radius, log) {
  return log ? logScaledRadius(radius, 100) : linearScaledRadius(radius, 100);
}

export function determineScale({ r1: radius1, r2: radius2, a: axis, e: eccentricity }, frameCount, log = true, screenSize = LOG_SCREEN) {
  let maxExtent = 1.0;
  for (let i = 0; i < frameCount; i += 1) {
    const largest = Math.max(radius1[i], radius2[i]);
    const apastron = axis[i] * (1 + eccentricity[i]);
    maxExtent = Math.max(maxExtent, largest * 4 + apastron);
  }
  let reference = scaledRadius(maxExtent, log);
  if (reference <= 0) reference = 100;
  return (0.6 * Math.min(...screenSize)) / 2.0 / reference;
}
