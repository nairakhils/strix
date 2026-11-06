import { barycentric, orbitalPeriodYears, relativeOrbit } from '../physics/kepler.js';
import {
  approximateLimbDarkening,
  granulation,
  linearColour,
  luminosity,
  makeLight,
  paletteColour,
  surfaceTemperature,
  unitLuminance,
} from '../physics/light.js';
import { blackbodyPalette } from '../physics/blackbody.js';
import { SAMPLE_RATE } from '../scene.js';
import { eggleton } from '../physics/roche.js';
import { isothermalScale, tidalRadius } from '../physics/disk.js';
import { windCrossings, windDepth } from '../physics/wind.js';
import { F1, blendFill, clamp, episodeWeights, smoothstep } from './blend.js';
import { framing, framingAt, gaussianSmooth } from './framing.js';
import { determineScale, logScaledRadius } from './scaling.js';
import {
  applyTransfers,
  episodeProgress,
  overflowDonor,
  steadyRate,
  transferEpisodes,
  transferGeometry,
} from './transfer.js';
import { EASE_FRAMES, HOLD_FRAMES, inside, makePace } from './pace.js';
import { applyCollapses, collapseEpisodes } from './collapse.js';
import {
  afterCollapse,
  escapeSpeed,
  hyperbolicPosition,
  orbitState,
  diffusionSeconds,
  plateauSeconds,
  rotate,
  shockTemperature,
} from '../physics/collapse.js';
import { BULK_SHARE, envelopeClock, envelopeEpisodes } from './envelope.js';
import {
  bulkRadius,
  donorMass,
  ejectedMass,
  frontAt,
  gasTemperature,
  outflowRate,
  physicalPhase,
  separationAt,
  wakeTemperature,
} from '../physics/envelope.js';
import { unitsOf } from './units.js';

export { TAU } from './framing.js';
export const VIDEO_FPS = 60;
export const STEPS = 8;
export const ONSET_SECONDS = 3;
export const FORMING_SECONDS = 2;
export const STOP_SECONDS = 2;
export const HOLD_GAP = 4;
export const LONGEST_FLIGHT = 3;
export const BUILD_PHASE = 1;
export const SPREAD_SECONDS = 3;
export const SPOT_RISE = 0.15;
export const SLOW_NOTE = 1.05;
export const COLLAPSE_SECONDS = 6;
export const FLASH_SECONDS = 1.2;
export const FLASH_DECAY = 0.35;
export const START_REACH = 0.05;
export const BLAST_ZOOM = 5;
export const EJECTA_EXIT = 3;
export const FADE_FROM = 0.6;
export const FADE_COOLING = 0.25;
export const EJECTA_LINGER = 1;
export const ESCAPE_REACH = 3.5;
export const BLAST_VIEW = 1.1;
export const BLAST_SETTLE = 2.5;
export const BLAST_KNEE = 6;
export const SHOCK_TEMPERATURE = 1e5;
export const FLASH_REACH = 1.5;
export const GLARE_SECONDS = 1;
export const GLARE_ADAPTATION = 1;
export const SHADOW_WIDEN = 1.4;
export const SHADOW_LIMIT = Math.PI / 3;
export const PLATEAU_TEMPERATURE = 5000;
export const STRIPPED_TEMPERATURE = 7000;
export const ENVELOPE_SECONDS = 18;
export const ENVELOPE_ORBIT_SECONDS = 2;
export const SWAP_SECONDS = 0.8;
export const ENVELOPE_HOLD = 3;
export const ENVELOPE_ZOOM = 3;
export const ENVELOPE_RAMP = 1;
export const EJECTA_TURN = 0.9;
export const EJECTA_FADE = 0.55;
export const OPEN_SECONDS = 1.5;
export const STREAM_FADE = 0.6;
export const COVER_SECONDS = 1.8;
export const PROFILE_REACH = 2.5;
export const EJECTA_MARGIN = 1.2;
export const WAKE_CONTRAST = 2;
export const WAKE_SIZE = 0.3;
export const WAKE_FADE = 0.5;
export const FIXED_ELEVATION = (18 * Math.PI) / 180;
export const FOCUS_FRAMES = 50;
export const PX_PER_UNIT = 400;
export const RADIUS_FLOOR = 10;
export const ORBIT_FRAMES = 500;
export const ORBIT_SECONDS = ORBIT_FRAMES / SAMPLE_RATE;
export const EXPOSURE_KEY = 0.8;
export const EXPOSURE_ADAPTATION = 0.5;
export const EXPOSURE_SIGMA = 25;
export const COMPACT_RADIANCE_MAX = 6;
export const SPIN_MAX = 0.9;
export const AZIMUTH0 = -0.6;
export const DRIFT = (2 * Math.PI) / 180;
export const ELEVATION = (25 * Math.PI) / 180;
export const FOV = (18 * Math.PI) / 180;
export const LINEAR_ELEVATION = (11 * Math.PI) / 180;
export const HERO_ELEVATION = (6 * Math.PI) / 180;
export const SIDE_ANGLE = (12 * Math.PI) / 180;
export const TRANSFER_VIEW = Math.PI / 3;
export const TRANSFER_SIGMA = 20;
export const TRANSFER_LEAD = 50;
export const TRANSFER_GAIN = 0.15;
export const TRANSFER_TURN = 0.04;
export const TRANSFER_ELEVATION = (20 * Math.PI) / 180;
export const FRAME_ASPECT = 16 / 9;
export const TRANSFER_SHARE = 0.55;
export const WIND_CLUMPS = 1.5;
export const WIND_PERIOD = 16;
export const YEAR_SECONDS = 3.15576e7;
export const FOLLOW_GAIN = 0.04;
export const MAX_TURN = 0.02;
export const FAR_START = 1;
export const FAR_END = 2;
export const LINEAR_FOV = (24 * Math.PI) / 180;
export const HERO_SHARE = 0.3;
export const HERO_SIGMA = 8;
export const HERO_MARGIN = Math.log(2);
export const PULL_BACK = 3;
export const PAN_SPEED = 0.7;
export const PAN_TAU = 6;
export const NOVA_LEAD = 60;
export const NOVA_TAIL = 30;
export const BLEND_SIGMA = 20;
export const PAIR_SPAN = 4;
export const KEEP = 0.9;
export const RIM_START = 0.5;
export const NEAR = 1e-3;
export const OVERFLOW_START = 0.98;
export const CENTRE_CAPTION = 'at orbit centre';
export const LOG_SCALE_CAPTION = 'local scale';
export const LINEAR_BADGE = 'LINEAR: true scale';
export const LOG_BADGE = 'LOG: log-compressed lengths; lobes exact, stars exact near overflow';
export const FLOOR_LABEL = 'radius floor, not to scale';
export const LOG_LABEL = 'log radius; true fill in HUD';
export const UNBOUND_LOG_LABEL = 'log radius, not to scale';
export const POINT_LABEL = 'point mass';
export const POINT_RADIANCE = 1;
export const FIELD_VIEW = 0.75;

const TIER = 1000;
const darkKinds = new Set(['BH', 'none']);
const novaKinds = new Set(['NS', 'BH']);
const WHITE = [1, 1, 1];

export function lobeRimOpacity(fill) {
  return smoothstep(clamp((fill - RIM_START) / (F1 - RIM_START), 0, 1));
}

const ell = (radius) => logScaledRadius(radius, 100);

function massShares([m1, m2]) {
  const total = m1 + m2;
  return total > 0 ? [m2 / total, m1 / total] : [0.5, 0.5];
}

function spinRatios(values, frameCount) {
  if (!values) return new Float64Array(frameCount);
  return Float64Array.from(values, (spin) => clamp(spin, 0, SPIN_MAX));
}

function stopFrame(episode, masses) {
  for (let n = episode.first; n <= episode.end; n += 1) {
    if (episodeProgress(episode, masses[episode.donor][n]) >= 1) return n;
  }
  return episode.end + 1;
}

function transferFrames(transfers, frameCount) {
  const frames = new Array(frameCount).fill(null);
  transfers.forEach((episode, index) => {
    for (let n = Math.max(episode.first - 1, 0); n <= Math.min(episode.end, frameCount - 1); n += 1) frames[n] = index;
  });
  return frames;
}

function emissionTable(palette, light, size = 256) {
  const lo = Math.log(palette.temperature[0]);
  const hi = Math.log(palette.temperature[palette.temperature.length - 1]);
  const data = new Float32Array(4 * size);
  for (let k = 0; k < size; k += 1) {
    const temperature = Math.exp(lo + ((hi - lo) * k) / (size - 1));
    const colour = unitLuminance(linearColour(paletteColour(palette, temperature)));
    const brightness = light.surfaceBrightness(temperature);
    colour.forEach((c, i) => {
      data[4 * k + i] = c * brightness;
    });
    data[4 * k + 3] = 1;
  }
  return { lo, hi, size, data };
}

function modelled(transfer) {
  const x = transfer?.flow.x;
  return x !== null && x !== undefined && x > 0 && x < 1;
}

function heldRadii(values, sequence) {
  let size = 0;
  return Float64Array.from(values, (r, n) => {
    if (sequence[n] === 'star') size = r;
    return size;
  });
}

function slew(values, steps) {
  const count = values.length;
  const ahead = Float64Array.from(values);
  const behind = Float64Array.from(values);
  for (let n = 1; n < count; n += 1) {
    ahead[n] = clamp(values[n], ahead[n - 1] - 2 * steps[n], ahead[n - 1] + 2 * steps[n]);
  }
  for (let n = count - 2; n >= 0; n -= 1) {
    behind[n] = clamp(values[n], behind[n + 1] - 2 * steps[n], behind[n + 1] + 2 * steps[n]);
  }
  return ahead.map((value, n) => (value + behind[n]) / 2);
}

function nearness(marks, steps) {
  const near = Float64Array.from(marks);
  for (let n = 1; n < near.length; n += 1) near[n] = Math.max(near[n], near[n - 1] - steps[n]);
  for (let n = near.length - 2; n >= 0; n -= 1) near[n] = Math.max(near[n], near[n + 1] - steps[n]);
  return near.map((value) => smoothstep(clamp(value, 0, 1)));
}

function radianceOf(kind, value) {
  if (kind === 'star') return value;
  if (kind === 'point') return POINT_RADIANCE;
  if (kind === 'NS' || kind === 'WD') return Math.min(value, COMPACT_RADIANCE_MAX);
  return 0;
}

function labelOf(kind, floor, flagged, unbound) {
  if (kind === 'point') return POINT_LABEL;
  if (kind !== 'star') return null;
  if (floor) return FLOOR_LABEL;
  if (unbound) return UNBOUND_LOG_LABEL;
  return flagged ? LOG_LABEL : null;
}

function towardOf(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length > 0 ? [dx / length, 0, (from[1] - to[1]) / length] : [1, 0, 0];
}

function toWorld([x, y], [fx, fy], unit) {
  return [(x - fx) / unit, 0, (fy - y) / unit];
}

function between([x1, y1], [x2, y2], t) {
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

function wrapAngle(angle) {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI));
}

function viewFrom(distance, azimuth, elevation) {
  const across = distance * Math.cos(elevation);
  return [across * Math.cos(azimuth), distance * Math.sin(elevation), across * Math.sin(azimuth)];
}

function logCamera(azimuth) {
  const position = viewFrom(1 / Math.tan(FOV / 2), azimuth, ELEVATION);
  const distance = Math.sqrt(position[0] * position[0] + position[1] * position[1] + position[2] * position[2]);
  return {
    position,
    target: [0, 0, 0],
    fov: FOV,
    near: 0.01 * distance,
    far: 10 * distance + 4,
    scale: { position: [0, 0, 0], caption: LOG_SCALE_CAPTION },
  };
}

function binaryStatus({ a, e, masses, radii }, frameCount) {
  const bound = Array.from(
    { length: frameCount },
    (_, n) => a[n] > 0 && e[n] >= 0 && e[n] < 1 && masses[0][n] > 0 && masses[1][n] > 0,
  );
  const status = bound.map((value) => (value ? 'bound' : 'disrupted'));
  const elemA = Float64Array.from(a);
  const elemE = Float64Array.from(e);
  const runOf = new Array(frameCount).fill(null);
  const runs = [];
  for (let start = 0; start < frameCount; start += 1) {
    if (bound[start] || (start > 0 && !bound[start - 1])) continue;
    let end = start;
    while (end + 1 < frameCount && !bound[end + 1]) end += 1;
    const run = { x: start, followed: radii[0][start] >= radii[1][start] ? 0 : 1, anchor: start === 0 ? [0, 0] : null };
    if (start > 0) {
      elemA.fill(a[start - 1], start, end + 1);
      elemE.fill(e[start - 1], start, end + 1);
    }
    runOf.fill(run, start, end + 1);
    runs.push(run);
  }
  return { status, elemA, elemE, runs, runOf };
}

function widened(values, reach) {
  return Float64Array.from(values, (_, n) => {
    let top = 0;
    for (let k = Math.max(0, n - reach); k <= Math.min(values.length - 1, n + reach); k += 1) top = Math.max(top, values[k]);
    return top;
  });
}

function fillNearest(values) {
  const known = [];
  values.forEach((value, n) => {
    if (value >= 0) known.push(n);
  });
  if (known.length === 0) return;
  let k = 0;
  for (let n = 0; n < values.length; n += 1) {
    while (k < known.length - 1 && known[k + 1] - n <= n - known[k]) k += 1;
    values[n] = values[known[k]];
  }
}

function stageMasks(stage, kinds, frameCount) {
  const mt = Uint8Array.from(stage, (name) => (name === 'transfer' ? 1 : 0));
  const ce = Uint8Array.from(stage, (name) => (name === 'envelope' ? 1 : 0));
  const nova = kinds.map((sequence) => {
    const mask = new Uint8Array(frameCount);
    for (let n = 1; n < frameCount; n += 1) {
      if (novaKinds.has(sequence[n]) && !novaKinds.has(sequence[n - 1])) {
        mask.fill(1, Math.max(0, n - NOVA_LEAD), n + NOVA_TAIL + 1);
      }
    }
    return mask;
  });
  return { mt, ce, nova };
}

function scaled(values, factor, frameCount) {
  return values ? Float64Array.from(values, (value) => value * factor) : new Float64Array(frameCount);
}

export function makeDirector(scene, { log: logScale = false, camera = 'fixed' } = {}) {
  const { header, samples: frameCount, columns } = scene;
  const units = unitsOf(header);
  const gas = header.fields ?? null;
  const log = logScale && units.system === 'solar' && !gas;
  const sampleRate = header.rate ?? SAMPLE_RATE;
  const last = frameCount - 1;
  const fixed = camera === 'fixed';
  const { time } = columns;
  const myr = scaled(time, units.myr);
  const a = scaled(columns.a, units.rsun);
  const e = Float64Array.from(columns.e);
  const masses = [scaled(columns.m1, units.msun), scaled(columns.m2, units.msun)];
  const radii = [scaled(columns.r1, units.rsun, frameCount), scaled(columns.r2, units.rsun, frameCount)];
  const teffs = [scaled(columns.teff1, 1, frameCount), scaled(columns.teff2, 1, frameCount)];
  const spins = [columns.spin1, columns.spin2].map((values) => spinRatios(values, frameCount));
  const winds = [columns.wind1 ?? null, columns.wind2 ?? null];
  const periods = [1, 2].map((k) => Float64Array.from(columns[`period${k}`] ?? new Float64Array(frameCount)));
  const fields = [1, 2].map((k) => Float64Array.from(columns[`field${k}`] ?? new Float64Array(frameCount)));
  const kinds = [columns.kind1, columns.kind2].map((values) => (values ? Array.from(values) : new Array(frameCount).fill('point')));
  const types = [Array.from(columns.type1 ?? kinds[0]), Array.from(columns.type2 ?? kinds[1])];
  const collapses = collapseEpisodes(header.events);
  applyCollapses(collapses, { masses, a, e, radii, teffs, kinds, types, periods, fields });
  const commons = envelopeEpisodes(header.events);
  const edges = new Uint8Array(frameCount);
  collapses.forEach(({ first }) => {
    if (first > 0) edges[first - 1] = 1;
  });
  const labels = columns.label ?? new Array(frameCount).fill('');
  const stage = columns.stage ?? new Array(frameCount).fill('');
  const palette = header.palette ?? blackbodyPalette();
  const light = makeLight(palette);
  const scale = log ? determineScale(columns, frameCount) : null;
  const weights = episodeWeights(Uint8Array.from(stage, (name) => (name ? 1 : 0)));
  const { status, elemA, elemE, runs, runOf } = binaryStatus({ a, e, masses, radii }, frameCount);
  const transfers = transferEpisodes(header.events);
  const swollen = applyTransfers(transfers, { masses, radii, teffs, kinds, elemA, status });
  const transferOf = transferFrames(transfers, frameCount);
  const stops = transfers.map((episode) => stopFrame(episode, masses));
  const masks = stageMasks(stage, kinds, frameCount);
  const envelopeStage = masks.ce;
  const emission = emissionTable(palette, light);

  const lerp = (values, i, t) => values[i] + (values[Math.min(i + 1, last)] - values[i]) * t;

  function geometryAtFrame(episode, n) {
    const d = episode.donor;
    const at = (values) => values[n];
    return transferGeometry({
      kinds: [kinds[0][n], kinds[1][n]],
      masses: masses.map(at),
      radii: radii.map(at),
      teffs: [0, 1].map((k) => (k === d ? episode.streamTeff : teffs[k][n])),
      a: elemA[n],
      donor: d,
      rate: episode.rate,
    });
  }

  function formingFrame(episode) {
    for (let n = episode.first; n <= episode.last; n += 1) {
      if (status[n] !== 'disrupted' && geometryAtFrame(episode, n).disk) return n;
    }
    return null;
  }

  const forming = transfers.map(formingFrame);
  const formations = transfers.map((episode, k) => (forming[k] === null ? 1 : episodeProgress(episode, masses[episode.donor][forming[k]])));
  const pace = makePace(frameCount, {
    rate: sampleRate,
    windows: [
      ...transfers.map((episode) => ({ from: episode.first, to: episode.end })),
      ...collapses.map((episode) => ({ from: episode.first, to: episode.last, rate: (episode.last - episode.first + 1) / COLLAPSE_SECONDS })),
      ...commons.map((episode) => ({ from: episode.first, to: episode.last, rate: (episode.last - episode.first + 1) / ENVELOPE_SECONDS })),
    ],
    holds: [
      ...transfers.flatMap((episode, k) => [
        { at: episode.first + HOLD_FRAMES / 2, seconds: ONSET_SECONDS },
        ...(forming[k] !== null && forming[k] - episode.first > HOLD_GAP ? [{ at: forming[k] + HOLD_FRAMES / 2, seconds: FORMING_SECONDS }] : []),
        ...(stops[k] <= episode.end ? [{ at: stops[k] + HOLD_FRAMES / 2, seconds: STOP_SECONDS }] : []),
      ]),
      ...collapses.map((episode) => ({ at: episode.first + HOLD_FRAMES / 2, seconds: FLASH_SECONDS })),
    ],
  });
  const blasts = collapses.map((episode) => {
    const before = Math.max(episode.first - 1, 0);
    const progenitor = radii[episode.star][before];
    const separation = episode.boundBefore ? elemA[before] : 0;
    const reach = Math.max(separation, progenitor, 1e-3);
    const start = pace.timeAt(episode.first);
    const span = pace.timeAt(episode.last + 1) - start;
    const photosphere = episode.type === 'II'
      ? plateauSeconds(episode.ejected, progenitor, episode.energy)
      : diffusionSeconds(episode.ejected, episode.energy);
    const frame = Math.max(separation * (1 + e[before]), 3 * Math.max(radii[0][before], radii[1][before]), progenitor);
    const widest = BLAST_ZOOM * frame;
    const end = Math.min(photosphere, Math.max(EJECTA_EXIT * widest - progenitor, 0) / episode.speed);
    const lead = episode.speed > 0 ? (START_REACH * reach) / episode.speed : 0;
    const growth = lead > 0 && end > 0 ? Math.log1p(end / lead) / span : 0;
    const period = episode.boundBefore
      ? orbitalPeriodYears(elemA[before], masses[0][before] + masses[1][before]) * YEAR_SECONDS
      : null;
    const slow = period ? period / ORBIT_SECONDS : growth * (lead + end);
    return { progenitor, separation, reach, widest, start, span, end, lead, growth, slow, turn: FADE_FROM * span };
  });

  const engulfments = commons.map((episode) => {
    const start = pace.timeAt(episode.first);
    const span = pace.timeAt(episode.last + 1) - start;
    const timing = envelopeClock(episode, span);
    const before = Math.max(episode.first - 1, 0);
    const { model } = episode;
    const frame = Math.max(model.a0 * (1 + model.e0), 3 * Math.max(radii[0][before], radii[1][before]), model.radius);
    return {
      ...timing,
      start,
      span,
      hot: episode.after[`teff${episode.donor + 1}`],
      companion: radii[1 - episode.donor][before],
      warm: teffs[1 - episode.donor][before],
      widest: ENVELOPE_ZOOM * frame,
      turn: timing.release + EJECTA_TURN * timing.rest,
    };
  });

  function commonAt(u) {
    const k = commons.findIndex((episode) => u >= episode.first && u <= episode.last + 1);
    return k < 0 ? null : k;
  }

  const commonSeconds = (k, u) => pace.timeAt(u) - engulfments[k].start;

  function commonState(k, u) {
    const { model, donor } = commons[k];
    const timing = engulfments[k];
    const tau = commonSeconds(k, u);
    const t = timing.clock(tau);
    const sep = separationAt(model, t);
    const ecc = model.a0 > model.aF ? model.e0 * Math.max((sep - model.aF) / (model.a0 - model.aF), 0) : 0;
    const held = donorMass(model, t);
    const swap = smoothstep(clamp((tau - timing.engulf) / SWAP_SECONDS, 0, 1));
    const size = model.radius * (model.coreRadius / model.radius) ** swap;
    const teff = model.teff * (timing.hot / model.teff) ** (swap ** 3);
    const pair = (mine, theirs) => (donor === 0 ? [mine, theirs] : [theirs, mine]);
    return {
      t,
      tau,
      swap,
      a: sep,
      e: ecc,
      mass: pair(held, model.accretor),
      radius: pair(size, timing.companion),
      teff: pair(teff, timing.warm),
    };
  }

  commons.forEach((episode, k) => {
    const stripped = types[episode.donor][Math.min(episode.last + 1, last)];
    for (let n = episode.first; n <= episode.last; n += 1) {
      const state = commonState(k, n);
      if (state.t >= episode.model.finish) types[episode.donor][n] = stripped;
      a[n] = state.a;
      elemA[n] = state.a;
      e[n] = state.e;
      elemE[n] = state.e;
      for (const j of [0, 1]) {
        masses[j][n] = state.mass[j];
        radii[j][n] = state.radius[j];
        teffs[j][n] = state.teff[j];
      }
    }
  });
  const lights = radii.map((values, k) => Float64Array.from(values, (r, n) => luminosity(r, teffs[k][n])));

  function commonTurn(k, u) {
    const { model } = commons[k];
    const { clock, span } = engulfments[k];
    const hi = clamp(commonSeconds(k, u) + 1e-3, 2e-3, span);
    const lo = hi - 2e-3;
    return ((physicalPhase(model, clock(hi)) - physicalPhase(model, clock(lo))) / (hi - lo)) * pace.paceAt(u);
  }

  function blastAt(u) {
    const k = collapses.findIndex((episode) => u >= episode.first - 1 && u <= episode.until + 1);
    return k < 0 ? null : { index: k, weight: u < collapses[k].first ? 0 : inside(u, collapses[k].first, collapses[k].last) };
  }

  function blastRate(k, u) {
    const { start, span, lead, growth, slow } = blasts[k];
    const tau = pace.timeAt(u) - start;
    return growth > 0 && tau >= 0 && tau <= span ? growth * lead * Math.exp(growth * tau) : slow;
  }

  function blastSeconds(k, u) {
    const { start, span, end, lead, growth, slow } = blasts[k];
    const tau = pace.timeAt(u) - start;
    if (growth <= 0 || tau <= 0) return tau * slow;
    if (tau <= span) return lead * Math.expm1(growth * tau);
    return end + (tau - span) * slow;
  }
  const maxRateAt = (u) => (2 * Math.PI * pace.paceAt(u)) / ORBIT_SECONDS;
  const frameSpan = (u) => 1 / (VIDEO_FPS * pace.paceAt(u));

  function naturalRate(i, t) {
    const step = myr[i + 1] - myr[i];
    if (!(step > 0) || status[i] === 'disrupted') return null;
    const period = orbitalPeriodYears(lerp(elemA, i, t), lerp(masses[0], i, t) + lerp(masses[1], i, t));
    return (2 * Math.PI * 1e6 * step) / period;
  }

  function rate(i, t) {
    const natural = naturalRate(i, t);
    const ceiling = maxRateAt(i + t);
    const usual = Number.isFinite(natural) ? Math.min(natural, ceiling) : ceiling;
    const near = commons.findIndex((episode) => i + t >= episode.first - EASE_FRAMES && i + t <= episode.last + EASE_FRAMES);
    if (near >= 0) {
      const weight = inside(i + t, commons[near].first, commons[near].last);
      const cap = (2 * Math.PI * pace.paceAt(i + t)) / ENVELOPE_ORBIT_SECONDS;
      return usual + (Math.min(commonTurn(near, i + t), cap) - usual) * weight;
    }
    const blast = blastAt(i + t);
    if (!blast || blast.weight <= 0 || status[i] === 'disrupted') return usual;
    const period = orbitalPeriodYears(elemA[i], masses[0][i] + masses[1][i]) * YEAR_SECONDS;
    const physical = Math.min((2 * Math.PI * blastRate(blast.index, i + t) * pace.paceAt(i + t)) / period, ceiling);
    return usual + (physical - usual) * blast.weight;
  }

  function integrate(f) {
    const values = new Float64Array(STEPS * last + 1);
    for (let k = 0; k < STEPS * last; k += 1) {
      const i = Math.floor(k / STEPS);
      const q = k - STEPS * i;
      values[k + 1] = values[k] + (f(i, q / STEPS) + f(i, (q + 1) / STEPS)) / (2 * STEPS);
    }
    return values;
  }

  function valueAt(values, u) {
    const x = clamp(u, 0, last) * STEPS;
    const k = Math.min(Math.floor(x), STEPS * last - 1);
    return values[k] + (values[k + 1] - values[k]) * (x - k);
  }

  const phases = integrate(rate);
  const phaseAt = (u) => valueAt(phases, u);

  const offsets = new Float64Array(frameCount);
  const apses = new Float64Array(frameCount);
  const outcomes = collapses.map((episode) => {
    const before = Math.max(episode.first - 1, 0);
    const k = episode.star;
    if (!episode.boundBefore || status[before] === 'disrupted') {
      const run = runOf[episode.first];
      return { kick: null, site: null, shift: [0, 0], drift: [0, 0], shadow: null, run };
    }
    const preMass = masses[0][before] + masses[1][before];
    const postMass = masses[0][episode.first] + masses[1][episode.first];
    const moment = phaseAt(episode.first);
    const state = orbitState(elemA[before], elemE[before], moment + offsets[before], preMass);
    const position = rotate(state.position, apses[before]);
    const velocity = rotate(state.velocity, apses[before]);
    const post = afterCollapse({ position, velocity, mass: postMass, a: episode.after.a, e: episode.after.e });
    const preShares = [masses[1][before] / preMass, masses[0][before] / preMass];
    const postShares = [masses[1][episode.first] / postMass, masses[0][episode.first] / postMass];
    const shift = position.map((x) => (postShares[0] - preShares[0]) * x);
    const sign = k === 0 ? -1 : 1;
    const share = preShares[k];
    const site = position.map((x) => sign * share * x);
    const remnant = masses[k][episode.first];
    const drift = [0, 1].map((n) => sign * (share * velocity[n] * preMass - remnant * (post.velocity[n] - velocity[n])) / postMass);
    const separation = Math.hypot(...position);
    const other = 1 - k;
    const shadow = kinds[other][before] === 'star'
      ? {
        axis: position.map((x) => (-sign * x) / separation),
        distance: separation,
        angle: Math.min(SHADOW_WIDEN * Math.asin(Math.min(radii[other][before] / separation, 1)), SHADOW_LIMIT),
      }
      : null;
    const next = collapses.find((other) => other.first > episode.first)?.first ?? frameCount;
    if (post.bound) {
      offsets.fill(post.anomaly - moment, episode.first, next);
      apses.fill(post.apse, episode.first, next);
      elemA.fill(post.a, episode.first, episode.last + 1);
      elemE.fill(post.e, episode.first, episode.last + 1);
    }
    return { kick: post.kick, site, shift, drift, shadow, post, mass: postMass, run: post.bound ? null : runOf[episode.first], separation };
  });

  function shiftAt(u) {
    for (let k = 0; k < collapses.length; k += 1) {
      const { first, last: end } = collapses[k];
      if (u >= first && u <= end + 1) {
        const fade = smoothstep(clamp((u - first) / (end + 1 - first), 0, 1));
        return outcomes[k].shift.map((x) => x * (1 - fade));
      }
    }
    return [0, 0];
  }

  outcomes.forEach((outcome, k) => {
    const { run, post, mass } = outcome;
    if (!run || !post || post.bound) return;
    const episode = collapses[k];
    run.escape = { k, a: post.a, e: post.e, apse: post.apse, anomaly: post.anomaly, motion: post.motion, speed: escapeSpeed(mass, post.a) };
    let end = episode.first;
    const runEnd = Math.min(runOf.lastIndexOf(run), episode.until);
    while (end < runEnd && Math.hypot(...escapeRelative(run.escape, end)) < ESCAPE_REACH * outcome.separation) end += 1;
    run.follow = end;
  });

  function escapeRelative(escape, u) {
    const seconds = blastSeconds(escape.k, u);
    return rotate(hyperbolicPosition(escape.a, escape.e, escape.anomaly + escape.motion * seconds), escape.apse);
  }

  function secondsPerFrame(i, t) {
    if (status[i] === 'disrupted') return Math.max(myr[i + 1] - myr[i], 0) * 1e6 * YEAR_SECONDS;
    const period = orbitalPeriodYears(lerp(elemA, i, t), lerp(masses[0], i, t) + lerp(masses[1], i, t));
    return (rate(i, t) * period * YEAR_SECONDS) / (2 * Math.PI);
  }

  const travels = [0, 1].map((k) => integrate((i, t) => (kinds[k][i] === 'star'
    ? windCrossings(secondsPerFrame(i, t), lerp(teffs[k], i, t), lerp(masses[k], i, t), lerp(radii[k], i, t))
    : 0)));

  function windClock(k, u) {
    const half = frameSpan(u) / 2;
    const flow = WIND_CLUMPS * valueAt(travels[k], u);
    const blur = WIND_CLUMPS * (valueAt(travels[k], u + half) - valueAt(travels[k], u - half));
    return { flow: ((flow % WIND_PERIOD) + WIND_PERIOD) % WIND_PERIOD, blur };
  }

  function uAtPhase(phase) {
    let lo = 0;
    let hi = phases.length - 1;
    if (phase >= phases[hi]) return last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (phases[mid] <= phase) lo = mid;
      else hi = mid;
    }
    const span = phases[hi] - phases[lo];
    return (lo + (span > 0 ? (phase - phases[lo]) / span : 0)) / STEPS;
  }

  const timings = transfers.map((episode, k) => {
    const start = phaseAt(episode.first);
    const stop = stops[k] <= episode.end ? phaseAt(stops[k]) : Infinity;
    if (forming[k] === null) return { start, stop, born: null, bornAt: null };
    const flight = geometryAtFrame(episode, forming[k]).stream.duration;
    const born = Math.max(phaseAt(forming[k]), start + flight);
    return { start, stop, born, bornAt: pace.timeAt(uAtPhase(born)) };
  });

  function sample(i, t) {
    const base = plainSample(i, t);
    const k = commonAt(i + t);
    if (k === null) return base;
    const state = commonState(k, i + t);
    return {
      ...base,
      a: state.a,
      e: state.e,
      elemA: state.a,
      elemE: state.e,
      mass: state.mass,
      radius: state.radius,
      teff: state.teff,
      common: k,
    };
  }

  function plainSample(i, t) {
    const at = (values) => lerp(values, i, edges[i] ? 0 : t);
    const radius = radii.map(at);
    return {
      i,
      j: Math.min(i + 1, last),
      t,
      u: i + t,
      status: status[i],
      kinds: [0, 1].map((k) => (swollen[k][i] ? 'star' : kinds[k][i])),
      time: at(time),
      a: at(a),
      e: at(e),
      elemA: at(elemA),
      elemE: at(elemE),
      phi: phaseAt(i + t),
      anomaly: phaseAt(i + t) + offsets[i],
      apse: apses[i],
      shift: edges[i] ? [0, 0] : shiftAt(i + t),
      weight: at(weights),
      mass: masses.map(at),
      radius,
      teff: radius.map((r, k) => (r > 0 ? surfaceTemperature(at(lights[k]), r) : at(teffs[k]))),
    };
  }

  function floored(s, natural) {
    const floors = natural.map((r, k) => log && s.kinds[k] === 'star' && r < RADIUS_FLOOR);
    return { radii: natural.map((r, k) => (floors[k] ? RADIUS_FLOOR : r)), floors };
  }

  function binaryGeometry(s) {
    const [m1, m2] = s.mass;
    const semi = log ? ell(s.elemA) * (1 + (m2 > 0 ? m1 / m2 : 1)) * scale : s.elemA;
    const lambda = semi / s.elemA;
    const orbit = relativeOrbit(semi, s.elemE, s.anomaly);
    const [rx, ry] = rotate([orbit.x, orbit.y], s.apse);
    const centre = s.shift.map((x) => x * lambda);
    const separation = s.elemA * (1 - s.elemE);
    const lobes = m1 > 0 && m2 > 0 ? [eggleton(m1 / m2) * separation, eggleton(m2 / m1) * separation] : null;
    const fills = lobes ? s.radius.map((r, k) => r / lobes[k]) : null;
    const heights = log && lobes
      ? fills.map((f, k) => blendFill(f, ell(s.radius[k]) / (lambda * lobes[k]), s.weight))
      : null;
    const natural = log ? s.radius.map((r, k) => (heights ? heights[k] * lambda * lobes[k] : ell(r))) : s.radius;
    return {
      positions: barycentric(rx, ry, m1, m2).map(([x, y]) => [x + centre[0], y + centre[1]]),
      focus: [0, 0],
      centre,
      semi,
      lambda,
      lobes,
      fills,
      heights,
      ...floored(s, natural),
      run: null,
    };
  }

  function escapeGeometry(s, run) {
    const relative = escapeRelative(run.escape, s.u);
    return {
      positions: barycentric(relative[0], relative[1], s.mass[0], s.mass[1]).map(([x, y]) => [x + s.shift[0], y + s.shift[1]]),
      focus: [0, 0],
      centre: s.shift,
      semi: null,
      lambda: null,
      lobes: null,
      fills: null,
      heights: null,
      ...floored(s, s.radius),
      run,
      escaping: true,
    };
  }

  function disruptedGeometry(s) {
    const run = runOf[s.i];
    if (run.escape && !log && s.u < run.follow) return escapeGeometry(s, run);
    const ease = smoothstep(clamp((s.u - (log ? run.x : run.follow ?? run.x)) / FOCUS_FRAMES, 0, 1));
    return {
      positions: [run.anchor, run.anchor],
      focus: [run.anchor[0] * ease, run.anchor[1] * ease],
      ease,
      centre: [0, 0],
      semi: null,
      lambda: null,
      lobes: null,
      fills: null,
      heights: null,
      ...floored(s, log ? s.radius.map(ell) : s.radius),
      run,
    };
  }

  const geometry = (s) => (s.status === 'disrupted' ? disruptedGeometry(s) : binaryGeometry(s));

  function blastLog(u) {
    const k = collapses.findLastIndex((episode) => episode.first <= u);
    if (k < 0 || !(collapses[k].speed > 0)) return -Infinity;
    const { progenitor, widest, start, span, lead, growth, turn } = blasts[k];
    const tau = pace.timeAt(u) - start;
    const lone = !collapses[k].boundBefore;
    const seconds = lead * Math.expm1(growth * clamp(tau, 0, lone ? span : turn));
    const size = BLAST_VIEW * (progenitor + collapses[k].speed * seconds);
    return lone ? Math.log(size) : Math.log(Math.min(size, widest)) - BLAST_SETTLE * Math.max(tau - turn, 0);
  }

  function envelopeLog(u) {
    const k = commons.findLastIndex((episode) => episode.first <= u);
    if (k < 0) return -Infinity;
    const { model } = commons[k];
    const timing = engulfments[k];
    const tau = commonSeconds(k, u);
    const held = Math.log(ENVELOPE_HOLD * model.radius);
    if (tau < 0) return -Infinity;
    if (tau < timing.release) return held;
    const wide = Math.log(Math.min(BLAST_VIEW * bulkRadius(model, timing.clock(Math.min(tau, timing.turn)), BULK_SHARE), timing.widest));
    const open = held + Math.max(wide - held, 0) * smoothstep(clamp((tau - timing.release) / OPEN_SECONDS, 0, 1));
    return open - BLAST_SETTLE * Math.max(tau - timing.turn, 0);
  }

  const cloudLog = (u) => blastLog(u);

  function coveredLog(u, usual) {
    const k = commons.findLastIndex((episode) => episode.first <= u);
    if (k < 0) return usual;
    const tau = commonSeconds(k, u);
    const { span } = engulfments[k];
    const cover = Math.min(smoothstep(clamp(tau / ENVELOPE_RAMP, 0, 1)), smoothstep(clamp((span + COVER_SECONDS - tau) / COVER_SECONDS, 0, 1)));
    return cover > 0 ? usual + (envelopeLog(u) - usual) * cover : usual;
  }

  function softMax(a, b) {
    if (!Number.isFinite(b)) return a;
    return Math.max(a, b) + Math.log1p(Math.exp(-BLAST_KNEE * Math.abs(a - b))) / BLAST_KNEE;
  }

  function extent(s, g) {
    if (g.escaping) {
      const [p, q] = g.positions;
      return Math.max(Math.hypot(p[0] - q[0], p[1] - q[1]), s.radius[0] + s.radius[1], 3 * Math.max(...s.radius), 1);
    }
    if (g.run) {
      const reach = Math.hypot(g.run.anchor[0] - g.focus[0], g.run.anchor[1] - g.focus[1]);
      return Math.max(3 * s.radius[g.run.followed], 2 * reach, (g.run.spread ?? 0) * (1 - g.ease), 1);
    }
    const apocentre = s.elemA * (1 + s.elemE);
    const [r1, r2] = s.radius;
    const [share1, share2] = massShares(s.mass);
    return Math.max(
      gas ? FIELD_VIEW * gas.extents[0] * units.rsun : 0,
      apocentre,
      r1 + r2,
      3 * Math.max(r1, r2),
      ...(g.lobes ?? []),
      1.1 * (share1 * apocentre + r1),
      1.1 * (share2 * apocentre + r2),
      1,
    );
  }

  function heroSizes(s, g, pair) {
    const any = eligible(0, s.i) || eligible(1, s.i);
    return [0, 1].map((k) => {
      const size = lerp(stellar[k], s.i, s.t);
      const shown = !g.run || g.escaping || g.run.followed === k;
      return Math.log(any && shown && size > 0 ? size / HERO_SHARE : pair);
    });
  }

  function heroLog(s, g, w, pair) {
    const [one, two] = heroSizes(s, g, pair);
    return one + (two - one) * w;
  }

  function framingLog(s, g, w, c, m = 0) {
    const pair = extent(s, g);
    const hero = heroLog(s, g, w, pair);
    const [x, y] = between(g.positions[0], g.positions[1], w);
    const offset = c * Math.hypot(x - g.focus[0], y - g.focus[1]);
    const radius = s.radius[0] + (s.radius[1] - s.radius[0]) * w;
    const usual = Math.max(hero + (Math.log(pair) - hero) * c, Math.log((offset + radius) / KEEP));
    const focus = m > 0 ? transferFocus(s, g) : null;
    return focus ? usual + (focus.log - usual) * m : usual;
  }

  function transferFocus(s, g) {
    const d = donors[s.i];
    if (d < 0 || g.run) return null;
    const [from, to] = [g.positions[d], g.positions[1 - d]];
    const separation = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const [ux, uy] = [(to[0] - from[0]) / separation, (to[1] - from[1]) / separation];
    const back = s.radius[d];
    const front = separation + Math.max(s.radius[1 - d], tidalRadius(s.mass[1 - d] / s.mass[d]) * separation);
    const shift = (front - back) / 2;
    const half = (front + back) / 2;
    return {
      centre: [from[0] + ux * shift, from[1] + uy * shift],
      log: Math.log(Math.max(half / FRAME_ASPECT / KEEP, Math.max(s.radius[0], s.radius[1]) / TRANSFER_SHARE)),
    };
  }

  const apart = ({ positions: [p, q] }) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  function panStep(s, g) {
    const size = Math.exp(Math.max(...heroSizes(s, g, extent(s, g))));
    return Math.min(1, (2 * PAN_SPEED * PULL_BACK * size) / (3 * apart(g)));
  }

  const panLog = (g, slope) => Math.log((apart(g) * slope) / PAN_SPEED);

  function hysteresisFlags() {
    const flags = [new Uint8Array(frameCount), new Uint8Array(frameCount)];
    if (!log) return flags;
    const on = [0, 0];
    for (let n = 0; n < frameCount; n += 1) {
      const { fills, heights } = geometry(sample(n, 0));
      for (const k of [0, 1]) {
        if (heights && heights[k] > 1.01 * fills[k]) on[k] = 1;
        else if (heights && heights[k] < 1.005 * fills[k]) on[k] = 0;
        flags[k][n] = on[k];
      }
    }
    return flags;
  }

  function exposureLog(n) {
    const k = commonAt(n);
    if (k !== null) {
      const gas = gasTemperature(commons[k].model, engulfments[k].clock(commonSeconds(k, n)));
      return -EXPOSURE_ADAPTATION * Math.log(light.surfaceBrightness(gas));
    }
    let brightest = 0;
    for (const k of [0, 1]) {
      const hidden = status[n] === 'disrupted' && runOf[n].followed !== k;
      if (hidden || kinds[k][n] !== 'star') continue;
      brightest = Math.max(brightest, light.surfaceBrightness(teffs[k][n]));
    }
    return brightest > 0 ? -EXPOSURE_ADAPTATION * Math.log(brightest) : 0;
  }

  for (const run of runs) {
    run.anchor ??= run.escape && !log
      ? escapeGeometry(sample(run.follow, 0), run).positions[run.followed]
      : binaryGeometry(run.x > 0 && edges[run.x - 1] ? sample(run.x - 1, 1) : sample(run.x, 0)).positions[run.followed];
    if (run.escape && !log) {
      const s = sample(run.follow, 0);
      run.spread = extent(s, escapeGeometry(s, run));
    }
  }

  const stellar = radii.map((values, k) => heldRadii(values, kinds[k]));

  function eligible(k, n) {
    const hidden = status[n] === 'disrupted' && runOf[n].followed !== k;
    return !hidden && (kinds[k][n] === 'star' || masks.nova[k][n] === 1);
  }

  function interest(k, n, g) {
    if (status[n] === 'disrupted' && runOf[n].followed !== k) return -Infinity;
    if (!eligible(k, n)) return 0;
    const star = kinds[k][n] === 'star';
    const donor = masks.mt[n] === 1 && g.fills !== null && g.fills[k] >= g.fills[1 - k];
    const event = masks.ce[n] === 1 || masks.nova[k][n] === 1 || donor;
    const brightness = star ? Math.log(radii[k][n] ** 2 * light.surfaceBrightness(teffs[k][n])) : 0;
    return TIER * ((event ? 2 : 0) + (star ? 1 : 0)) + brightness;
  }

  function heroWeights() {
    const raw = new Float64Array(frameCount);
    const steps = new Float64Array(frameCount);
    const marks = [new Float64Array(frameCount), new Float64Array(frameCount)];
    let hero = null;
    for (let n = 0; n < frameCount; n += 1) {
      const s = sample(n, 0);
      const g = geometry(s);
      const scores = [0, 1].map((k) => interest(k, n, g));
      if (hero === null) hero = scores[1] > scores[0] ? 1 : 0;
      else if (scores[1 - hero] > scores[hero] + HERO_MARGIN) hero = 1 - hero;
      raw[n] = hero;
      steps[n] = panStep(s, g);
      if (g.run) marks[g.run.followed][n] = 1;
    }
    const lower = nearness(marks[1], steps);
    const upper = nearness(marks[0], steps);
    return gaussianSmooth(slew(raw, steps), HERO_SIGMA)
      .map((value, n) => Math.min(Math.max(value, lower[n]), 1 - upper[n]));
  }

  function blendOf(n, w) {
    const s = sample(n, 0);
    const g = geometry(s);
    const pair = extent(s, g);
    const span = (Math.log(pair) - heroLog(s, g, w, pair)) / Math.log(PAIR_SPAN);
    const fill = g.fills ? lobeRimOpacity(Math.max(...g.fills)) : 0;
    const handover = smoothstep(clamp(6 * w * (1 - w), 0, 1));
    const nova = Math.max(masks.nova[0][n], masks.nova[1][n]);
    return Math.max(1 - smoothstep(clamp(span, 0, 1)), fill, masks.ce[n], nova, handover, showing[n]);
  }

  function presenceAt(s, g) {
    if (g.run || s.kinds[0] === 'none' || s.kinds[1] === 'none') return null;
    const index = transferOf[s.i];
    if (index !== null) {
      const episode = transfers[index];
      const timing = timings[index];
      const x = episodeProgress(episode, s.mass[episode.donor]);
      const since = s.phi - timing.start;
      const after = s.phi - timing.stop;
      const stopped = stops[index];
      const fade = s.u < stopped ? 1 : 1 - smoothstep(clamp((s.u - stopped) / Math.max(episode.end - stopped, 1), 0, 1));
      return {
        index,
        episode,
        donor: episode.donor,
        x,
        since,
        after: after > 0 ? after : null,
        stream: since >= 0 && after < LONGEST_FLIGHT ? 1 : 0,
        disk: timing.born !== null && s.phi >= timing.born ? fade : 0,
      };
    }
    const near = commons.findIndex((episode) => s.u >= episode.first - EASE_FRAMES && s.u <= episode.last + 1);
    if (near < 0 && envelopeStage[s.i]) return null;
    const donor = overflowDonor(g.fills);
    if (donor === null || s.kinds[donor] !== 'star') return null;
    const onset = smoothstep(clamp((g.fills[donor] - OVERFLOW_START) / (1 - OVERFLOW_START), 0, 1));
    if (near < 0) return { index: null, episode: null, donor, since: Infinity, after: null, stream: onset, disk: onset, rate: null };
    const { model } = commons[near];
    const timing = engulfments[near];
    const tau = Math.max(commonSeconds(near, s.u), 0);
    const left = smoothstep(clamp((timing.engulf - tau) / STREAM_FADE, 0, 1));
    if (left <= 0 || donor !== commons[near].donor) return null;
    const rate = outflowRate(model, timing.clock(tau)) * YEAR_SECONDS;
    return { index: null, episode: null, donor, since: Infinity, after: null, stream: onset * left, disk: onset * left, rate };
  }

  const donors = new Int8Array(frameCount).fill(-1);
  const showing = new Float64Array(frameCount);
  for (let n = 0; n < frameCount; n += 1) {
    const s = sample(n, 0);
    const presence = presenceAt(s, geometry(s));
    if (!presence) continue;
    showing[n] = Math.max(presence.stream, presence.disk);
    donors[n] = presence.donor;
  }
  fillNearest(donors);
  const shows = log || fixed ? new Float64Array(frameCount) : gaussianSmooth(widened(showing, TRANSFER_LEAD), TRANSFER_SIGMA);

  const smoothBlends = (f) => gaussianSmooth(Float64Array.from({ length: frameCount }, (_, n) => f(n)), BLEND_SIGMA);
  const heroes = log ? null : heroWeights();
  let blends = log ? null : smoothBlends((n) => blendOf(n, heroes[n]));
  const slopes = log ? null : heroes.map((value, n) => Math.max(
    Math.abs(value - heroes[Math.max(n - 1, 0)]),
    Math.abs(heroes[Math.min(n + 1, last)] - value),
  ));

  function rawFramingAt(i, t) {
    const s = sample(i, t);
    return framingLog(s, geometry(s), lerp(heroes, i, t), lerp(blends, i, t), lerp(shows, i, t));
  }

  function rawPanAt(i, t) {
    return panLog(geometry(sample(i, t)), lerp(slopes, i, t));
  }

  function bearing(n) {
    if (status[n] === 'disrupted') return null;
    const [p, q] = geometry(sample(n, 0)).positions;
    return Math.atan2(q[1] - p[1], p[0] - q[0]);
  }

  function obliqueTo(usual) {
    const sides = [TRANSFER_VIEW, Math.PI - TRANSFER_VIEW, Math.PI + TRANSFER_VIEW, 2 * Math.PI - TRANSFER_VIEW];
    return sides.reduce((best, side) => (Math.abs(wrapAngle(side - usual)) < Math.abs(wrapAngle(best - usual)) ? side : best));
  }

  function followAngles() {
    const angles = new Float64Array(frameCount);
    const courses = new Float64Array(frameCount);
    let previous = null;
    let turned = 0;
    let heading = AZIMUTH0;
    for (let n = 0; n < frameCount; n += 1) {
      const angle = bearing(n);
      if (angle !== null) {
        const expected = turned - phaseAt(n);
        heading = previous === null ? angle : heading + expected + wrapAngle(angle - previous - expected);
        previous = angle;
        turned = phaseAt(n);
      }
      courses[n] = heading;
      const usual = Math.PI * heroes[n] + SIDE_ANGLE;
      angles[n] = heading + usual + (obliqueTo(usual) - usual) * shows[n];
    }
    return { angles, courses };
  }

  function cameraHeadings() {
    const { angles: follow, courses } = followAngles();
    const reach = gaussianSmooth(
      Float64Array.from({ length: frameCount }, (_, n) => (status[n] === 'disrupted'
        ? 0
        : Math.max((1 - blends[n]) * (1 - farness(framed[n], n)), shows[n]))),
      BLEND_SIGMA,
    );
    const azimuths = new Float64Array(frameCount);
    azimuths[0] = AZIMUTH0 + reach[0] * wrapAngle(follow[0] - AZIMUTH0);
    for (let n = 1; n < frameCount; n += 1) {
      const seconds = pace.timeAt(n) - pace.timeAt(n - 1);
      const frames = seconds * SAMPLE_RATE;
      const turn = (1 - reach[n]) * DRIFT * seconds + reach[n] * (follow[n] - follow[n - 1]);
      const gain = 1 - (1 - (FOLLOW_GAIN + (TRANSFER_GAIN - FOLLOW_GAIN) * shows[n])) ** frames;
      const limit = (MAX_TURN + (TRANSFER_TURN - MAX_TURN) * shows[n]) * frames;
      const pull = reach[n] * gain * wrapAngle(follow[n] - azimuths[n - 1] - turn);
      azimuths[n] = azimuths[n - 1] + clamp(turn + pull, -limit, limit);
    }
    return { azimuths, reach, courses };
  }

  function farness(logUnit, n) {
    if (status[n] === 'disrupted') return 0;
    const distance = Math.exp(logUnit) / Math.tan(LINEAR_FOV / 2);
    const ratio = distance / apart(geometry(sample(n, 0)));
    return smoothstep(clamp((ratio - FAR_START) / (FAR_END - FAR_START), 0, 1));
  }

  function heroOnlyLog(n) {
    const s = sample(n, 0);
    return framingLog(s, geometry(s), heroes[n], 0);
  }

  if (!log) blends = smoothBlends((n) => Math.max(blendOf(n, heroes[n]), farness(heroOnlyLog(n), n)));
  if (!log && fixed) blends = new Float64Array(frameCount).fill(1);

  const framesOf = (f) => Float64Array.from({ length: frameCount }, (_, n) => (n > 0 ? Math.max(f(n, 0), f(n - 1, 1)) : f(0, 0)));
  const pans = log ? null : framing(framesOf(rawPanAt), PAN_TAU, PAN_TAU);
  const frameAll = () => framing(framesOf(rawFramingAt)).map((value, n) => Math.max(value, pans[n]));
  const framed = log ? null : frameAll();
  const headings = log ? null : cameraHeadings();
  const flags = hysteresisFlags();
  const exposures = gaussianSmooth(Float64Array.from({ length: frameCount }, (_, n) => exposureLog(n)), EXPOSURE_SIGMA)
    .map(Math.exp);
  const slowedBy = Array.from({ length: last }, (_, i) => {
    const ratio = naturalRate(i, 0) / maxRateAt(i);
    return ratio > 1 ? ratio : null;
  });
  const paused = Array.from({ length: last }, (_, i) => time[i + 1] <= time[i]);

  function rsunPerUnitOf(g, unit) {
    if (!log) return unit;
    return g.run ? null : PX_PER_UNIT / g.lambda;
  }

  function linearCamera(s, g, unit, w, c, m) {
    const usual = between(between(g.positions[0], g.positions[1], w), g.focus, c);
    const focus = m > 0 ? transferFocus(s, g) : null;
    const target = toWorld(focus ? between(usual, focus.centre, m) : usual, g.focus, unit);
    const distance = 1 / Math.tan(LINEAR_FOV / 2);
    const reach = lerp(headings.reach, s.i, s.t);
    const level = LINEAR_ELEVATION + (HERO_ELEVATION - LINEAR_ELEVATION) * reach;
    const elevation = level + (TRANSFER_ELEVATION - level) * m;
    const course = lerp(headings.courses, s.i, s.t);
    const [p, q] = g.positions;
    const drift = g.run ? 0 : wrapAngle(Math.atan2(q[1] - p[1], p[0] - q[0]) - course);
    const away = fixed
      ? viewFrom(distance, AZIMUTH0, FIXED_ELEVATION)
      : viewFrom(distance, lerp(headings.azimuths, s.i, s.t) + reach * drift, elevation);
    const k = g.run ? g.run.followed : Math.round(w);
    return {
      position: target.map((x, n) => x + away[n]),
      target,
      fov: LINEAR_FOV,
      focus: m,
      near: NEAR * distance,
      far: 10 * distance + 4 + (4 * Math.max(extent(s, g), Math.exp(cloudLog(s.u)), Math.exp(envelopeLog(s.u)))) / unit,
      scale: !g.run && c >= 0.5
        ? { position: toWorld(g.centre, g.focus, unit), caption: CENTRE_CAPTION }
        : { position: toWorld(g.positions[k], g.focus, unit), caption: `at star ${k + 1}` },
    };
  }

  function starState(k, s, g, unit, exposure) {
    const kind = s.kinds[k];
    const teff = s.teff[k];
    const fill = g.fills ? g.fills[k] : null;
    const shaped = kind === 'star' && fill !== null;
    const separation = shaped ? (g.lambda * s.elemA * (1 - s.elemE)) / unit : null;
    const q = shaped ? s.mass[k] / s.mass[1 - k] : null;
    const rgb = kind === 'point' ? WHITE : paletteColour(palette, teff);
    return {
      visible: !g.run || g.escaping || g.run.followed === k,
      kind,
      type: types[k][s.i],
      position: toWorld(g.positions[k], g.focus, unit),
      toward: g.run && !g.escaping ? [1, 0, 0] : towardOf(g.positions[k], g.positions[1 - k]),
      radius: g.radii[k] / unit,
      trueRadius: s.radius[k],
      mass: s.mass[k],
      teff,
      spin: kind === 'star' ? lerp(spins[k], s.i, s.t) : 0,
      wind: kind === 'star' && winds[k]
        ? windDepth({ mdot: lerp(winds[k], s.i, s.t), teff, mass: s.mass[k], radius: s.radius[k] })
        : 0,
      windClock: windClock(k, s.u),
      shape: shaped
        ? { q, fill, unit: separation, scale: log ? g.radii[k] / (fill * g.lambda * g.lobes[k]) : 1 }
        : null,
      lobe: shaped ? { q, unit: separation, opacity: lobeRimOpacity(fill) } : null,
      rgb,
      colour: darkKinds.has(kind) ? [0, 0, 0] : unitLuminance(linearColour(rgb)),
      radiance: radianceOf(kind, EXPOSURE_KEY * exposure * light.surfaceBrightness(teff)),
      limb: approximateLimbDarkening(teff),
      granulation: kind === 'star' ? granulation(teff, s.mass[k], s.radius[k]) : { cells: 2, amplitude: 0 },
      label: log || kind === 'point' ? labelOf(kind, g.floors[k], flags[k][s.i] === 1, g.run !== null) : null,
    };
  }

  function arrival(since, after, flight) {
    const reached = clamp((since - flight) / SPOT_RISE, 0, 1);
    const drained = after === null ? 1 : 1 - clamp((after - flight) / SPOT_RISE, 0, 1);
    return reached * drained;
  }

  function settled(geometry, timing, s) {
    if (!geometry.disk) return geometry;
    if (!timing || timing.born === null) return { ...geometry, disk: { ...geometry.disk, born: null, built: 1 } };
    return {
      ...geometry,
      disk: {
        ...geometry.disk,
        born: timing.born,
        build: BUILD_PHASE,
        built: clamp((s.phi - timing.born) / BUILD_PHASE, 0, 1),
      },
    };
  }

  function transferAt(s, g) {
    const presence = presenceAt(s, g);
    if (!presence || (presence.stream <= 0 && presence.disk <= 0)) return null;
    const { index, episode, x, since, after, stream, disk } = presence;
    const shared = { kinds: s.kinds, masses: s.mass, radii: s.radius, a: s.elemA };
    const timing = index === null ? null : timings[index];
    let geometry;
    let flow;
    if (episode) {
      const teffs = s.teff.map((t, k) => (k === episode.donor ? episode.streamTeff : t));
      const age = Math.max(x - formations[index], 0) * episode.years;
      const clock = timing.bornAt === null ? 0 : pace.timeAt(s.u) - timing.bornAt;
      const ease = 1 - Math.exp(-Math.max(clock, 0) / SPREAD_SECONDS);
      geometry = transferGeometry({ ...shared, donor: episode.donor, teffs, rate: episode.rate, age, ease });
      flow = { rate: episode.rate, accreted: episode.accreted, x };
    } else {
      const rate = presence.rate ?? steadyRate(columns.transfer, s.i);
      geometry = transferGeometry({ ...shared, donor: presence.donor, teffs: s.teff, rate });
      flow = { rate, accreted: null, x: null };
    }
    const reached = arrival(since, after, geometry.stream.duration);
    return {
      ...settled(geometry, timing, s),
      stream: { ...geometry.stream, since, after },
      spot: geometry.spot ? { ...geometry.spot, presence: reached } : null,
      presence: { stream, disk },
      phase: s.phi,
      flow,
    };
  }

  function explosionAt(s, g, unit) {
    const k = collapses.findIndex((episode) => episode.speed > 0 && s.u >= episode.first && s.u <= episode.until + 1);
    if (k < 0) return null;
    const episode = collapses[k];
    const blast = blasts[k];
    const outcome = outcomes[k];
    const seconds = blastSeconds(k, s.u);
    const radius = blast.progenitor + episode.speed * seconds;
    const since = pace.timeAt(s.u) - blast.start;
    const thinning = smoothstep(clamp((since / blast.span - FADE_FROM) / (1 - FADE_FROM), 0, 1));
    const left = smoothstep(clamp((pace.timeAt(episode.until + 1) - pace.timeAt(s.u)) / EJECTA_LINGER, 0, 1));
    const fade = Math.min(1 - thinning, left);
    const flash = Math.exp(-since / FLASH_DECAY);
    if (fade <= 0 && flash < 1e-3) return null;
    const site = outcome.site && !log
      ? outcome.site.map((x, n) => x - outcome.shift[n] + s.shift[n] + outcome.drift[n] * seconds)
      : g.positions[episode.star];
    const size = (value) => (log ? ell(value) : value) / unit;
    const { shadow } = outcome;
    const floor = episode.type === 'II' ? PLATEAU_TEMPERATURE : STRIPPED_TEMPERATURE;
    const shocked = clamp(shockTemperature(blast.progenitor, seconds), floor, SHOCK_TEMPERATURE);
    const temperature = shocked * (1 - FADE_COOLING * thinning);
    const glare = Math.max(light.surfaceBrightness(temperature), light.surfaceBrightness(SHOCK_TEMPERATURE) * Math.exp(-since / GLARE_SECONDS));
    return {
      star: episode.star,
      site: toWorld(site, g.focus, unit),
      radius: size(radius),
      temperature,
      glare: glare * fade,
      power: clamp(Math.log10(episode.energy / 1e48) / 3, 0.4, 1),
      fade,
      flash,
      flashSize: size(Math.max(FLASH_REACH * blast.progenitor, 0.15 * blast.reach)),
      flashTemperature: SHOCK_TEMPERATURE,
      shadow: shadow && !log
        ? { axis: [shadow.axis[0], 0, -shadow.axis[1]], start: shadow.distance / radius, cos: Math.cos(shadow.angle) }
        : null,
    };
  }

  function envelopeAt(s, g, unit) {
    if (log) return null;
    const k = commonAt(s.u);
    if (k === null) return null;
    const { model, donor } = commons[k];
    const timing = engulfments[k];
    const tau = commonSeconds(k, s.u);
    const thinning = smoothstep(clamp((tau - timing.release - EJECTA_FADE * timing.rest) / ((1 - EJECTA_FADE) * timing.rest), 0, 1));
    const fade = 1 - thinning;
    if (tau <= 0 || fade <= 0) return null;
    const t = timing.clock(tau);
    const swap = smoothstep(clamp((tau - timing.engulf) / SWAP_SECONDS, 0, 1));
    const companion = g.positions[1 - donor];
    const sep = s.elemA;
    const capture = (2 * model.accretor * sep) / (model.late.enclosed(sep) + model.accretor);
    const wake = swap * (1 - smoothstep(clamp((tau - timing.release) / WAKE_FADE, 0, 1)));
    return {
      model,
      t,
      centre: toWorld(g.centre, g.focus, unit),
      core: toWorld(g.positions[donor], g.focus, unit),
      scale: model.radius / unit,
      reach: Math.max(PROFILE_REACH * unit, EJECTA_MARGIN * bulkRadius(model, t, 0)) / model.radius,
      bound: { inner: model.coreRadius / model.radius, front: frontAt(model, t) / model.radius, weight: swap },
      temperature: gasTemperature(model, t),
      wake: wake > 0
        ? {
          centre: toWorld(companion, g.focus, unit),
          size: (WAKE_SIZE * Math.min(capture, sep)) / model.radius,
          density: wake * WAKE_CONTRAST * (model.radius / sep) ** 2,
          temperature: wakeTemperature(model, sep),
        }
        : null,
      fade,
    };
  }

  function envelopeNote(u) {
    const k = commonAt(u);
    if (k === null) return null;
    const { model, donor, first } = commons[k];
    const t = engulfments[k].clock(commonSeconds(k, u));
    return {
      donor,
      companion: kinds[1 - donor][first],
      stage: t < model.engulfed ? 'runaway' : t < model.finish ? 'plunge' : 'ejected',
      rate: outflowRate(model, t) * YEAR_SECONDS,
      lost: model.donor - donorMass(model, Math.min(t, model.engulfed)),
      ejected: ejectedMass(model, t),
      envelope: model.envelope,
      speed: model.speed * 695700,
      until: model.engulfed - t,
      since: t - model.engulfed,
      temperature: gasTemperature(model, t),
    };
  }

  function gasAt(s, g, unit) {
    if (!gas || g.run) return null;
    const [p, q] = g.positions;
    const separation = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const total = s.mass[0] + s.mass[1];
    return {
      ...gas,
      samples: [s.i, s.j],
      weight: s.t,
      centre: toWorld(g.centre, g.focus, unit),
      axis: [(q[0] - p[0]) / separation, (q[1] - p[1]) / separation],
      perWorld: unit / units.rsun,
      bodies: [
        { at: (-separation * s.mass[1]) / (total * units.rsun), mass: s.mass[0] / units.msun },
        { at: (separation * s.mass[0]) / (total * units.rsun), mass: s.mass[1] / units.msun },
      ],
      temperature: isothermalScale(units.msun, units.rsun, gas.mach),
    };
  }

  function glareExposure(explosion) {
    if (!explosion) return Infinity;
    return explosion.glare > 0 ? explosion.glare ** -GLARE_ADAPTATION : Infinity;
  }

  function collapseNote(u) {
    const k = collapses.findIndex((episode) => u >= episode.first && u <= episode.until);
    if (k < 0) return null;
    const episode = collapses[k];
    const outcome = outcomes[k];
    return {
      star: episode.star,
      ejected: episode.ejected,
      speed: episode.speed * 695700,
      failed: episode.failed,
      type: episode.type,
      kick: outcome.kick,
      boundBefore: episode.boundBefore,
      boundAfter: episode.boundAfter,
      e: episode.boundAfter ? (outcome.post?.e ?? episode.after.e) : null,
      remnant: kinds[episode.star][episode.first],
      since: Math.max(blastSeconds(k, u), 0),
    };
  }

  function stateAt(value) {
    const u = clamp(value, 0, last);
    const i = Math.floor(u);
    const s = sample(i, u - i);
    const g = geometry(s);
    const w = log ? 0 : lerp(heroes, i, s.t);
    const c = log ? 1 : lerp(blends, i, s.t);
    const m = log ? 0 : lerp(shows, i, s.t);
    const unit = log
      ? PX_PER_UNIT
      : Math.exp(coveredLog(u, softMax(framingAt(framed, u, Math.max(framingLog(s, g, w, c, m), panLog(g, lerp(slopes, i, s.t)))), cloudLog(u))));
    const azimuth = fixed ? AZIMUTH0 : AZIMUTH0 + DRIFT * pace.timeAt(u);
    const explosion = explosionAt(s, g, unit);
    const envelope = envelopeAt(s, g, unit);
    const commonNote = envelopeNote(u);
    const table = Math.min(lerp(exposures, i, s.t), glareExposure(explosion));
    const exposure = envelope
      ? table ** (1 - envelope.fade) * light.surfaceBrightness(envelope.temperature) ** (-EXPOSURE_ADAPTATION * envelope.fade)
      : table;
    const transfer = transferAt(s, g);
    const interval = Math.min(i, last - 1);
    const shares = massShares(s.mass);
    const stars = [0, 1].map((k) => starState(k, s, g, unit, exposure));
    return {
      u,
      frame: i,
      clock: pace.timeAt(u),
      shutter: phaseAt(u + frameSpan(u) / 2) - phaseAt(u - frameSpan(u) / 2),
      camera: log ? logCamera(azimuth) : linearCamera(s, g, unit, w, c, m),
      rsunPerUnit: rsunPerUnitOf(g, unit),
      log: log ? { scale, pxPerUnit: PX_PER_UNIT } : null,
      orbit: g.run
        ? null
        : {
          a: g.semi / unit,
          e: s.elemE,
          phi: s.anomaly,
          apse: s.apse,
          weights: [-shares[0], shares[1]],
          centre: toWorld(g.centre, g.focus, unit),
        },
      stars,
      transfer,
      explosion,
      envelope,
      gas: gasAt(s, g, unit),
      emissionScale: EXPOSURE_KEY * exposure,
      hud: {
        units,
        time: s.time,
        a: (g.run?.escape ? g.run.escape.a : modelled(transfer) ? s.elemA : s.a) / units.rsun,
        e: g.run?.escape ? g.run.escape.e : s.e,
        escape: g.run?.escape ? g.run.escape.speed : null,
        modelled: modelled(transfer) ? [0, 1].filter((k) => k === transfer.donor || swollen[k][s.i]) : [],
        flow: transfer && transfer.presence.stream > 0 && !commonNote ? transfer.flow : null,
        m1: s.mass[0] / units.msun,
        m2: s.mass[1] / units.msun,
        r1: columns.r1 ? s.radius[0] / units.rsun : null,
        r2: columns.r2 ? s.radius[1] / units.rsun : null,
        mach: gas?.mach ?? null,
        event: labels[i],
        types: [types[0][i], types[1][i]],
        fills: columns.r1 ? (g.fills ?? [null, null]) : [null, null],
        pulsars: [0, 1].map((k) => (s.kinds[k] === 'NS' && periods[k][s.i] > 0
          ? { period: lerp(periods[k], s.i, s.t), field: lerp(fields[k], s.i, s.t) }
          : null)),
        slowedBy: (blastAt(u)?.weight ?? 0) > 0 || commonAt(u) !== null ? null : slowedBy[interval],
        slowMotion: pace.paceAt(u) * sampleRate > SLOW_NOTE ? pace.paceAt(u) * sampleRate : null,
        paused: paused[interval],
        badge: log ? LOG_BADGE : LINEAR_BADGE,
        disrupted: g.run && !g.escaping ? { followed: g.run.followed, since: time[g.run.x] } : null,
        collapse: collapseNote(u),
        envelope: commonNote,
        tMax: time[last],
      },
    };
  }

  return {
    log,
    units,
    gas,
    frameCount,
    duration: pace.duration,
    tMax: time[last],
    videoFrames: Math.round(pace.duration * VIDEO_FPS),
    uAtVideoFrame: (j) => Math.min(pace.uAtTime(j / VIDEO_FPS), last),
    timeAt: pace.timeAt,
    uAtTime: pace.uAtTime,
    stateAt,
    emission,
  };
}
