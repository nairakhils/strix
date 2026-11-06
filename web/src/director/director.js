import { barycentric, orbitalPeriodYears, relativeOrbit } from '../physics/kepler.js';
import { linearColour, makeLight, paletteColour, unitLuminance } from '../physics/light.js';
import { blackbodyPalette } from '../physics/blackbody.js';
import { SAMPLE_RATE } from '../scene.js';
import { isothermalScale } from '../physics/disk.js';
import { clamp } from './blend.js';
import { framing, framingAt } from './framing.js';
import { makePace } from './pace.js';
import { unitsOf } from './units.js';

export { TAU } from './framing.js';
export const VIDEO_FPS = 60;
export const STEPS = 8;
export const SLOW_NOTE = 1.05;
export const FIXED_ELEVATION = (18 * Math.PI) / 180;
export const ORBIT_FRAMES = 500;
export const ORBIT_SECONDS = ORBIT_FRAMES / SAMPLE_RATE;
export const EXPOSURE_KEY = 0.8;
export const AZIMUTH0 = -0.6;
export const LINEAR_FOV = (24 * Math.PI) / 180;
export const KEEP = 0.9;
export const NEAR = 1e-3;
export const CENTRE_CAPTION = 'at orbit centre';
export const LINEAR_BADGE = 'LINEAR: true scale';
export const POINT_LABEL = 'point mass';
export const POINT_RADIANCE = 1;
export const FIELD_VIEW = 0.75;

const WHITE = [1, 1, 1];

function massShares([m1, m2]) {
  const total = m1 + m2;
  return total > 0 ? [m2 / total, m1 / total] : [0.5, 0.5];
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

function towardOf(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length > 0 ? [dx / length, 0, (from[1] - to[1]) / length] : [1, 0, 0];
}

function toWorld([x, y], [fx, fy], unit) {
  return [(x - fx) / unit, 0, (fy - y) / unit];
}

function viewFrom(distance, azimuth, elevation) {
  const across = distance * Math.cos(elevation);
  return [across * Math.cos(azimuth), distance * Math.sin(elevation), across * Math.sin(azimuth)];
}

function scaled(values, factor) {
  return Float64Array.from(values, (value) => value * factor);
}

export function makeDirector(scene) {
  const { header, samples: frameCount, columns } = scene;
  const units = unitsOf(header);
  const gas = header.fields ?? null;
  const sampleRate = header.rate ?? SAMPLE_RATE;
  const last = frameCount - 1;
  const { time } = columns;
  const myr = scaled(time, units.myr);
  const a = scaled(columns.a, units.rsun);
  const e = Float64Array.from(columns.e);
  const masses = [scaled(columns.m1, units.msun), scaled(columns.m2, units.msun)];
  const palette = header.palette ?? blackbodyPalette();
  const light = makeLight(palette);
  const emission = emissionTable(palette, light);
  const pace = makePace(frameCount, { rate: sampleRate });

  const lerp = (values, i, t) => values[i] + (values[Math.min(i + 1, last)] - values[i]) * t;
  const maxRateAt = (u) => (2 * Math.PI * pace.paceAt(u)) / ORBIT_SECONDS;

  function naturalRate(i, t) {
    const step = myr[i + 1] - myr[i];
    if (!(step > 0)) return null;
    const period = orbitalPeriodYears(lerp(a, i, t), lerp(masses[0], i, t) + lerp(masses[1], i, t));
    return (2 * Math.PI * 1e6 * step) / period;
  }

  function rate(i, t) {
    const natural = naturalRate(i, t);
    const ceiling = maxRateAt(i + t);
    return Number.isFinite(natural) ? Math.min(natural, ceiling) : ceiling;
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

  function sample(i, t) {
    const at = (values) => lerp(values, i, t);
    return {
      i,
      j: Math.min(i + 1, last),
      t,
      u: i + t,
      time: at(time),
      a: at(a),
      e: at(e),
      anomaly: phaseAt(i + t),
      mass: masses.map(at),
    };
  }

  function geometry(s) {
    const [m1, m2] = s.mass;
    const orbit = relativeOrbit(s.a, s.e, s.anomaly);
    return { positions: barycentric(orbit.x, orbit.y, m1, m2), focus: [0, 0], centre: [0, 0] };
  }

  function extent(s) {
    const apocentre = s.a * (1 + s.e);
    const [share1, share2] = massShares(s.mass);
    return Math.max(
      gas ? FIELD_VIEW * gas.extents[0] * units.rsun : 0,
      apocentre,
      1.1 * share1 * apocentre,
      1.1 * share2 * apocentre,
      1,
    );
  }

  function framingLog(s, g) {
    const [x, y] = g.positions[0];
    return Math.max(Math.log(extent(s)), Math.log(Math.hypot(x - g.focus[0], y - g.focus[1]) / KEEP));
  }

  function rawFramingAt(i, t) {
    const s = sample(i, t);
    return framingLog(s, geometry(s));
  }

  const framed = framing(Float64Array.from({ length: frameCount }, (_, n) => (n > 0 ? Math.max(rawFramingAt(n, 0), rawFramingAt(n - 1, 1)) : rawFramingAt(0, 0))));
  const slowedBy = Array.from({ length: last }, (_, i) => {
    const ratio = naturalRate(i, 0) / maxRateAt(i);
    return ratio > 1 ? ratio : null;
  });
  const paused = Array.from({ length: last }, (_, i) => time[i + 1] <= time[i]);

  function camera(s, g, unit) {
    const target = toWorld(g.focus, g.focus, unit);
    const distance = 1 / Math.tan(LINEAR_FOV / 2);
    const away = viewFrom(distance, AZIMUTH0, FIXED_ELEVATION);
    return {
      position: target.map((x, n) => x + away[n]),
      target,
      fov: LINEAR_FOV,
      near: NEAR * distance,
      far: 10 * distance + 4 + (4 * extent(s)) / unit,
      scale: { position: toWorld(g.centre, g.focus, unit), caption: CENTRE_CAPTION },
    };
  }

  function pointState(k, s, g, unit) {
    return {
      visible: true,
      kind: 'point',
      position: toWorld(g.positions[k], g.focus, unit),
      toward: towardOf(g.positions[k], g.positions[1 - k]),
      radius: 0,
      trueRadius: 0,
      mass: s.mass[k],
      rgb: WHITE,
      colour: unitLuminance(linearColour(WHITE)),
      radiance: POINT_RADIANCE,
      label: POINT_LABEL,
    };
  }

  function gasAt(s, g, unit) {
    if (!gas) return null;
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

  function stateAt(value) {
    const u = clamp(value, 0, last);
    const i = Math.floor(u);
    const s = sample(i, u - i);
    const g = geometry(s);
    const unit = Math.exp(framingAt(framed, u, framingLog(s, g)));
    const interval = Math.min(i, last - 1);
    const shares = massShares(s.mass);
    return {
      u,
      frame: i,
      clock: pace.timeAt(u),
      camera: camera(s, g, unit),
      rsunPerUnit: unit,
      orbit: {
        a: s.a / unit,
        e: s.e,
        phi: s.anomaly,
        apse: 0,
        weights: [-shares[0], shares[1]],
        centre: toWorld(g.centre, g.focus, unit),
      },
      stars: [0, 1].map((k) => pointState(k, s, g, unit)),
      gas: gasAt(s, g, unit),
      emissionScale: EXPOSURE_KEY,
      hud: {
        units,
        time: s.time,
        a: s.a / units.rsun,
        e: s.e,
        m1: s.mass[0] / units.msun,
        m2: s.mass[1] / units.msun,
        mach: gas?.mach ?? null,
        slowedBy: slowedBy[interval],
        slowMotion: pace.paceAt(u) * sampleRate > SLOW_NOTE ? pace.paceAt(u) * sampleRate : null,
        paused: paused[interval],
        badge: LINEAR_BADGE,
        tMax: time[last],
      },
    };
  }

  return {
    log: false,
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
