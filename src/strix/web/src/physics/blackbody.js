const PLANCK = 6.62607015e-34;
const LIGHT = 2.99792458e8;
const BOLTZMANN = 1.380649e-23;
const STEP_NM = 5;

const MATCHING = [
  [
    [1.056, 599.8, 37.9, 31.0],
    [0.362, 442.0, 16.0, 26.7],
    [-0.065, 501.1, 20.4, 26.2],
  ],
  [
    [0.821, 568.8, 46.9, 40.5],
    [0.286, 530.9, 16.3, 31.1],
  ],
  [
    [1.217, 437.0, 11.8, 36.0],
    [0.681, 459.0, 26.0, 13.8],
  ],
];

const TO_LINEAR_SRGB = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.204, 1.057],
];

function lobe([height, centre, below, above], nm) {
  const x = (nm - centre) / (nm < centre ? below : above);
  return height * Math.exp(-0.5 * x * x);
}

function planck(nm, temperature) {
  const metres = nm * 1e-9;
  const exponent = (PLANCK * LIGHT) / (metres * BOLTZMANN * temperature);
  if (exponent > 500) return 0;
  return (2 * PLANCK * LIGHT * LIGHT) / (metres ** 5 * Math.expm1(exponent));
}

export function blackbodyXyz(temperature) {
  const xyz = [0, 0, 0];
  for (let nm = 360; nm <= 830; nm += STEP_NM) {
    const radiance = planck(nm, temperature) * STEP_NM * 1e-9;
    MATCHING.forEach((lobes, c) => {
      xyz[c] += radiance * lobes.reduce((sum, part) => sum + lobe(part, nm), 0);
    });
  }
  return xyz;
}

function encode(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function blackbodyRgb(temperature) {
  const xyz = blackbodyXyz(temperature);
  const linear = TO_LINEAR_SRGB.map((row) => Math.max(row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2], 0));
  const top = Math.max(...linear);
  return linear.map((c) => Math.round(255 * encode(c / top)));
}

export function blackbodyPalette(size = 256, low = 1000, high = 2e6) {
  const temperature = Array.from({ length: size }, (_, k) => low * (high / low) ** (k / (size - 1)));
  return {
    temperature,
    rgb: temperature.map(blackbodyRgb),
    luminance: temperature.map((t) => blackbodyXyz(t)[1]),
  };
}
