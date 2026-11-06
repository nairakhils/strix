import { logScaledRadius } from '../director/scaling.js';

const RSUN_PER_AU = 215.032;
const KM_PER_RSUN = 695700;
const DESIGN_HEIGHT = 1080;
const SCALE_TARGET = 220;
const LABEL_OFFSET = 10;
const LABEL_WIDTH = 260;
const LABEL_HEIGHT = 48;
const LOG_MAJOR = [0, 10, 100, 1000];
const LOG_FACTOR = 100;
const LEGEND_ROWS = 8;
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const CONTRAST_NOTE = 'luminance contrast compressed (Y^0.5)';
const FACE = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const INK = 'rgba(255, 255, 255, 0.92)';
const MARKER = '#ff5040';

export function fixed2(x) {
  if (Object.is(x, -0)) return '-0.00';
  const eighths = 8 * x;
  if (Number.isInteger(eighths) && Math.abs(eighths) % 2 === 1) {
    const lower = Math.floor(100 * x);
    const even = lower % 2 === 0 ? lower : lower + 1;
    return (even / 100).toFixed(2);
  }
  return x.toFixed(2);
}

export function timelineSteps(tMax) {
  if (tMax <= 10) return [Math.ceil(tMax), 1, 0.5];
  if (tMax <= 100) return [Math.ceil(tMax / 5) * 5, 5, 1];
  const span = Number(tMax.toPrecision(6));
  const decade = 10 ** Math.floor(Math.log10(span / 10));
  const major = [1, 2, 5, 10].map((m) => m * decade).find((step) => step >= span / 10);
  return [Math.ceil(span / major) * major, major, major / (major / decade === 2 ? 4 : 5)];
}

export function legendTypes(types, full, known) {
  if (full) return [...known];
  return [...new Set(types)].filter((type) => known.includes(type));
}

function significant3(x) {
  const text = x.toPrecision(3);
  return text.includes('e') ? String(Number(text)) : text;
}

function short3(x) {
  return String(Number(x.toPrecision(3)));
}

function radiusText(rsun) {
  return rsun < 0.01 ? `${significant3(rsun * KM_PER_RSUN)} km` : `${significant3(rsun)} R☉`;
}

function superscript(n) {
  return Array.from(String(n), (digit) => (digit === '-' ? '⁻' : SUPERSCRIPTS[digit])).join('');
}

function scientific(x) {
  const [mantissa, exponent] = x.toExponential(1).split('e');
  return `${mantissa} × 10${superscript(Number(exponent))}`;
}

function slowdownText(x) {
  return x < 1000 ? String(Math.round(x)) : scientific(x);
}

function rateText(rate) {
  return rate >= 0.01 && rate < 1000 ? rate.toPrecision(2) : scientific(rate);
}

export function flowText(flow) {
  if (!flow) return '';
  const rate = `transfer ${rateText(flow.rate)} M☉/yr`;
  if (flow.accreted === null) return rate;
  const kept = flow.accreted * 100;
  const share = kept >= 10 ? kept.toFixed(0) : kept.toPrecision(2);
  if (flow.accreted >= 1) return `${rate}; all accreted`;
  return `${rate}; ${share}% accreted, rest leaves the binary (isotropic re-emission)`;
}

const SPANS = [
  [365.25 * 86400, 'years'],
  [86400, 'days'],
  [3600, 'hours'],
  [60, 'minutes'],
];

export function elapsedText(seconds) {
  const found = SPANS.find(([size]) => seconds >= 2 * size);
  if (!found) return `${Math.round(seconds)} seconds`;
  const count = seconds / found[0];
  return `${count < 10 ? count.toFixed(1) : Math.round(count)} ${found[1]}`;
}

function speedText(speed) {
  return `${significant3(speed)} km/s`;
}

export function binaryText({ m1, m2, e, mach, units }) {
  return [
    `q = ${fixed2(m2 / m1)}   e = ${fixed2(e)}${mach ? `   Mach ${short3(mach)}` : ''}`,
    `a = ${short3(units.rsun)} R☉   M = ${short3(units.msun)} M☉`,
  ];
}

export function orbitText({ a, e, escape, modelled }) {
  if (escape) return `unbound: a = ${fixed2(a)} R☉   e = ${fixed2(e)}   v∞ = ${speedText(escape)}`;
  return `a = ${fixed2(a)} R☉${modelled === null ? '' : ' (model)'}   e = ${fixed2(e)}`;
}

export function collapseText(collapse) {
  if (!collapse) return [];
  const star = `star ${collapse.star + 1}`;
  const ejecta = `${fixed2(collapse.ejected)} M☉ ejected at ${speedText(collapse.speed)}`;
  const first = collapse.failed
    ? `${star} collapses to a ${collapse.remnant}; failed supernova, ${ejecta}`
    : `${star} explodes, leaving a ${collapse.remnant}; ${ejecta}`;
  const clock = `${elapsedText(collapse.since)} after core collapse`;
  if (!collapse.boundBefore) return [first, clock];
  const kick = collapse.kick > 1 ? `minimum kick ${speedText(collapse.kick)}` : 'mass loss alone, no kick';
  const orbit = collapse.boundAfter ? `orbit stays bound, e = ${fixed2(collapse.e)}` : 'binary unbound';
  return [first, `${kick}; ${orbit}`, clock];
}

const COMPANIONS = { BH: 'black hole', NS: 'neutron star', WD: 'white dwarf', star: 'companion' };

export function envelopeText(envelope) {
  if (!envelope) return [];
  const star = `star ${envelope.donor + 1}`;
  const companion = COMPANIONS[envelope.companion] ?? 'companion';
  if (envelope.stage === 'runaway') {
    return [
      `${star} overflows through L2: ${rateText(envelope.rate)} M☉/yr, ${fixed2(envelope.lost)} M☉ lost`,
      `unstable mass transfer; ${companion} engulfed in ${elapsedText(envelope.until)}`,
    ];
  }
  const clock = `${elapsedText(envelope.since)} since engulfment`;
  if (envelope.stage === 'plunge') {
    return [
      `common envelope: the ${companion} spirals into ${star}`,
      `${fixed2(envelope.ejected)} of ${fixed2(envelope.envelope)} M☉ envelope unbound`,
      clock,
    ];
  }
  return [
    `envelope ejected: ${fixed2(envelope.envelope)} M☉ at ${speedText(envelope.speed)}`,
    `ejecta ${Math.round(envelope.temperature / 100) * 100} K`,
    clock,
  ];
}

function clockNote(hud) {
  if (hud.paused) return 'source clock paused; orbit at display rate';
  if (!hud.slowedBy) return '';
  return `orbit slowed ×${slowdownText(hud.slowedBy)}`;
}

function slowNote(hud) {
  if (!hud.slowMotion || hud.collapse || hud.envelope) return '';
  return `transfer in slow motion ×${Math.round(hud.slowMotion)}`;
}

function unboundNote(hud) {
  if (!hud.disrupted) return '';
  const hidden = 1 - hud.disrupted.followed;
  return `unbound since ${fixed2(hud.disrupted.since)} ${hud.units.time}; star ${hidden + 1} (${hud.types[hidden]}) not shown`;
}

function niceValue(target) {
  const decade = 10 ** Math.floor(Math.log10(target));
  const distance = (value) => Math.abs(Math.log(value / target));
  return [1, 2, 5, 10]
    .map((m) => m * decade)
    .reduce((best, value) => (distance(value) < distance(best) ? value : best));
}

function scaleChoice(pxPerRsun, targetPx, units) {
  const target = targetPx / pxPerRsun;
  const choice = (value, unit, rsun) => ({
    text: `${Number(value.toPrecision(1))} ${unit}`,
    pixels: value * rsun * pxPerRsun,
  });
  if (units.system === 'binary') return choice(niceValue(target / units.rsun), units.length, units.rsun);
  const value = niceValue(target);
  if (value >= 100) return choice(niceValue(target / RSUN_PER_AU), 'AU', RSUN_PER_AU);
  if (value < 0.01) return choice(niceValue(target * KM_PER_RSUN), 'km', 1 / KM_PER_RSUN);
  return choice(value, 'R☉', 1);
}

function logTicks() {
  const minor = [];
  for (let k = 0; k < LOG_MAJOR.length - 1; k += 1) {
    const start = LOG_MAJOR[k];
    const end = LOG_MAJOR[k + 1];
    const decade = Math.floor(end / 10);
    for (const mult of [2, 4, 6, 8]) {
      if (start + mult * decade < end) minor.push(start + mult * decade);
    }
  }
  return [...new Set([...LOG_MAJOR, ...minor])].sort((p, q) => p - q);
}

const LOG_TICKS = logTicks();

export function labelPlaces(stars, drawn, unit) {
  const places = stars.map((star, k) => {
    const mark = drawn[k];
    if (!star.visible || !mark?.visible) return null;
    return { x: mark.x + mark.pixels + LABEL_OFFSET * unit, y: mark.y };
  });
  const [one, two] = places;
  if (!one || !two) return places;
  const gap = LABEL_HEIGHT * unit - Math.abs(one.y - two.y);
  if (gap <= 0 || Math.abs(one.x - two.x) >= LABEL_WIDTH * unit) return places;
  const [upper, lower] = one.y <= two.y ? [one, two] : [two, one];
  upper.y -= gap / 2;
  lower.y += gap / 2;
  return places;
}

function scaleNoteOf(star, drawn) {
  if (drawn.marked) return `marker; true R = ${radiusText(star.trueRadius)}`;
  if (drawn.notToScale) return `not to scale; R = ${radiusText(star.trueRadius)}`;
  return '';
}

function makePen() {
  let unit = 1;
  let context = null;

  function plain() {
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
  }

  function font(size, weight = 400) {
    context.font = `${weight} ${size * unit}px ${FACE}`;
  }

  function text(value, x, y, align = 'left') {
    if (!value) return;
    context.textAlign = align;
    context.fillStyle = INK;
    context.shadowColor = 'rgba(0, 0, 0, 0.85)';
    context.shadowBlur = 6 * unit;
    context.fillText(value, x, y);
    context.shadowColor = 'rgba(0, 0, 0, 0.9)';
    context.shadowBlur = 2 * unit;
    context.shadowOffsetY = unit;
    context.fillText(value, x, y);
    plain();
  }

  function rule(x, y, width, height, glow = true) {
    context.fillStyle = INK;
    if (glow) {
      context.shadowColor = 'rgba(0, 0, 0, 0.6)';
      context.shadowBlur = 4 * unit;
    }
    context.fillRect(x, y, width, height);
    plain();
  }

  function width(value) {
    return context.measureText(value).width;
  }

  function wrap(value, limit) {
    const lines = [];
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (line && width(next) > limit) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  return {
    get context() {
      return context;
    },
    use: (target, value) => {
      context = target;
      unit = value;
    },
    font,
    text,
    rule,
    width,
    wrap,
    plain,
    unit: () => unit,
  };
}

function drawReadout(pen, hud) {
  const unit = pen.unit();
  const left = 40 * unit;
  const line = 26 * unit;
  let y = 32 * unit;
  pen.font(30, 500);
  pen.text(`t = ${fixed2(hud.time)} ${hud.units.time}`, left, y + 18 * unit);
  y += 42 * unit;
  pen.font(20);
  const tag = (k) => (hud.modelled === k ? ' (model)' : '');
  const fills = hud.fills.filter((f) => f !== null && f !== undefined).map(fixed2);
  const binary = hud.units.system === 'binary';
  const blocks = [
    binary ? binaryText(hud) : [orbitText(hud)],
    binary ? [] : [`M1 = ${fixed2(hud.m1)} M☉   M2 = ${fixed2(hud.m2)} M☉`],
    hud.r1 === null ? [] : [`R1 = ${fixed2(hud.r1)} R☉${tag(0)}   R2 = ${fixed2(hud.r2)} R☉${tag(1)}`],
    pen.wrap(hud.event ?? '', 560 * unit),
    hud.flow ? pen.wrap(flowText(hud.flow), 560 * unit) : [],
    ...collapseText(hud.collapse).map((text) => pen.wrap(text, 560 * unit)),
    ...envelopeText(hud.envelope).map((text) => pen.wrap(text, 560 * unit)),
    [fills.length > 0 ? `Roche fill  ${fills.join(' · ')}` : ''],
  ];
  for (const value of blocks.flat()) {
    pen.text(value, left, y + line / 2);
    y += line;
  }
  return { left, top: y + 16 * unit };
}

function makeLegend(pen, entries) {
  const known = entries.map(([type]) => type);
  const named = new Map(entries);

  function chipWidth(text) {
    return Math.max(18 * pen.unit(), pen.width(text) + 6 * pen.unit());
  }

  function chip(text, x, y) {
    const unit = pen.unit();
    const { context } = pen;
    pen.font(14, 700);
    const width = chipWidth(text);
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.beginPath();
    context.roundRect(x, y - 9 * unit, width, 18 * unit, 9 * unit);
    context.fill();
    context.fillStyle = '#000';
    context.textAlign = 'center';
    context.fillText(text, x + width / 2, y);
  }

  function entryWidth(type, chips) {
    const unit = pen.unit();
    const { name, icon } = named.get(type);
    pen.font(16);
    let width = (icon ? 34 * unit : 0) + pen.width(name);
    pen.font(14, 700);
    for (const text of chips) width += 8 * unit + chipWidth(text);
    return width;
  }

  function drawEntry(type, chips, x, y) {
    const unit = pen.unit();
    const { name, icon } = named.get(type);
    const middle = y + 13 * unit;
    let at = x;
    if (icon) {
      pen.context.drawImage(icon, at, y, 26 * unit, 26 * unit);
      at += 34 * unit;
    }
    pen.font(16);
    pen.text(name, at, middle);
    at += pen.width(name);
    for (const text of chips) {
      pen.font(14, 700);
      chip(text, at + 8 * unit, middle);
      at += 8 * unit + chipWidth(text);
    }
  }

  return (types, full, { left, top }) => {
    const unit = pen.unit();
    const shown = legendTypes(types, full, known);
    const chipsOf = (type) => ['1', '2'].filter((_, k) => types[k] === type);
    const rows = full ? LEGEND_ROWS : Math.max(shown.length, 1);
    let x = left;
    for (let first = 0; first < shown.length; first += rows) {
      const column = shown.slice(first, first + rows);
      column.forEach((type, k) => drawEntry(type, chipsOf(type), x, top + 30 * unit * k));
      x += Math.max(...column.map((type) => entryWidth(type, chipsOf(type)))) + 22 * unit;
    }
  };
}

function drawTimeline(pen, time, tMax, width, label) {
  const unit = pen.unit();
  const [rounded, major, minor] = timelineSteps(tMax);
  const end = rounded > 0 ? rounded : major;
  const length = 620 * unit;
  const left = (width - length) / 2;
  const top = 44 * unit;
  pen.rule(left, top, length, 2 * unit);
  const count = Math.round(end / minor);
  const ratio = Math.round(major / minor);
  pen.font(18);
  for (let k = 0; k <= count; k += 1) {
    const x = left + (length * k) / count;
    const isMajor = k % ratio === 0;
    pen.rule(x - unit, top + (isMajor ? -6 : -3) * unit, 2 * unit, (isMajor ? 14 : 8) * unit, false);
    if (isMajor) pen.text(String((k / ratio) * major), x, top + 23.7 * unit, 'center');
  }
  pen.text(`Time [${label}]`, width / 2, top + 53.7 * unit, 'center');
  const { context } = pen;
  const fraction = Math.min(Math.max(time / end, 0), 1);
  context.fillStyle = MARKER;
  context.shadowColor = 'rgba(255, 80, 64, 0.8)';
  context.shadowBlur = 6 * unit;
  context.beginPath();
  context.arc(left + length * fraction, top + unit, 6 * unit, 0, 2 * Math.PI);
  context.fill();
  pen.plain();
}

function drawBar(pen, choice, caption, centre, bottom) {
  const unit = pen.unit();
  let y = bottom;
  if (caption) {
    pen.font(15);
    pen.text(caption, centre, y - 9.75 * unit, 'center');
    y -= 27.5 * unit;
  }
  const left = centre - choice.pixels / 2;
  pen.rule(left, y - 2 * unit, choice.pixels, 2 * unit);
  pen.rule(left, y - 7 * unit, 2 * unit, 12 * unit, false);
  pen.rule(left + choice.pixels - 2 * unit, y - 7 * unit, 2 * unit, 12 * unit, false);
  pen.font(18);
  pen.text(choice.text, centre, y - 21.7 * unit, 'center');
}

function drawLogRuler(pen, pixelsPerLogPx, scale, centre, bottom) {
  const unit = pen.unit();
  const at = (value) => logScaledRadius(value, LOG_FACTOR) * scale * pixelsPerLogPx;
  const length = at(LOG_MAJOR[LOG_MAJOR.length - 1]);
  const left = centre - length / 2;
  const top = bottom - 30 * unit;
  pen.rule(left, top, length, 2 * unit);
  pen.font(18);
  for (const value of LOG_TICKS) {
    const x = left + at(value);
    pen.rule(x - unit, top - 4 * unit, 2 * unit, 10 * unit, false);
    if (LOG_MAJOR.includes(value)) pen.text(String(value), x, top + 19.7 * unit, 'center');
  }
  pen.text('Distance Scaling in Solar Radii', centre, top - 19.7 * unit, 'center');
  return top - 31.4 * unit;
}

function drawScale(pen, state, overlay, width, bottom) {
  const unit = pen.unit();
  const centre = width / 2;
  let base = bottom - 36 * unit;
  if (state.log) {
    base = drawLogRuler(pen, overlay.pixelsPerUnit / state.log.pxPerUnit, state.log.scale, centre, base) - 18 * unit;
  }
  const pxPerRsun = state.rsunPerUnit ? overlay.pixelsPerUnit / state.rsunPerUnit : 0;
  if (Number.isFinite(pxPerRsun) && pxPerRsun > 0) {
    drawBar(pen, scaleChoice(pxPerRsun, SCALE_TARGET * unit, state.hud.units), state.camera.scale.caption, centre, base);
  }
}

function drawNotes(pen, hud, bottom) {
  const unit = pen.unit();
  const notes = [hud.badge ?? '', clockNote(hud), slowNote(hud), CONTRAST_NOTE, unboundNote(hud)].filter(Boolean);
  pen.font(15);
  let y = bottom - 36 * unit;
  for (const value of notes.reverse()) {
    pen.text(value, 40 * unit, y - 9.75 * unit);
    y -= 22.5 * unit;
  }
}

function drawStarLabel(pen, name, star, drawn, place) {
  if (!place) return;
  const unit = pen.unit();
  const { context } = pen;
  if (drawn.marked) {
    context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    context.lineWidth = 1.5 * unit;
    context.setLineDash([4.5 * unit, 3 * unit]);
    context.beginPath();
    context.arc(drawn.x, drawn.y, Math.max(drawn.pixels - 0.75 * unit, 0), 0, 2 * Math.PI);
    context.stroke();
    context.setLineDash([]);
  }
  const note = star.label ?? scaleNoteOf(star, drawn);
  const top = place.y - ((note ? 44.2 : 23.4) * unit) / 2;
  pen.font(18, 600);
  pen.text(name, place.x, top + 11.7 * unit);
  if (note) {
    context.globalAlpha = 0.85;
    pen.font(16);
    pen.text(note, place.x, top + 33.8 * unit);
    context.globalAlpha = 1;
  }
}

export function makeHud({ tMax, types = [], inset = 0 }) {
  const pen = makePen();
  const legend = makeLegend(pen, types);
  let full = false;

  function draw(context, state, overlay) {
    const { width, height } = overlay;
    const bottom = height - inset;
    pen.use(context, height / DESIGN_HEIGHT);
    context.textBaseline = 'middle';
    legend(state.hud.types, full, drawReadout(pen, state.hud));
    drawTimeline(pen, state.hud.time, tMax, width, state.hud.units.time);
    drawScale(pen, state, overlay, width, bottom);
    drawNotes(pen, state.hud, bottom);
    const places = labelPlaces(state.stars, overlay.stars, pen.unit());
    ['M1', 'M2'].forEach((name, k) => drawStarLabel(pen, name, state.stars[k], overlay.stars[k], places[k]));
  }

  return {
    draw,
    legend: () => full,
    setLegend: (on) => {
      full = on;
    },
  };
}
