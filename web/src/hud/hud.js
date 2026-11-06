const DESIGN_HEIGHT = 1080;
const SCALE_TARGET = 220;
const LABEL_OFFSET = 10;
const LABEL_WIDTH = 260;
const LABEL_HEIGHT = 48;
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
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

function short3(x) {
  return String(Number(x.toPrecision(3)));
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

export function binaryText({ m1, m2, e, mach, units }) {
  return [
    `q = ${fixed2(m2 / m1)}   e = ${fixed2(e)}${mach ? `   Mach ${short3(mach)}` : ''}`,
    `a = ${short3(units.rsun)} R☉   M = ${short3(units.msun)} M☉`,
  ];
}

function clockNote(hud) {
  if (hud.paused) return 'source clock paused; orbit at display rate';
  if (!hud.slowedBy) return '';
  return `orbit slowed ×${slowdownText(hud.slowedBy)}`;
}

function niceValue(target) {
  const decade = 10 ** Math.floor(Math.log10(target));
  const distance = (value) => Math.abs(Math.log(value / target));
  return [1, 2, 5, 10]
    .map((m) => m * decade)
    .reduce((best, value) => (distance(value) < distance(best) ? value : best));
}

function scaleChoice(pxPerRsun, targetPx, units) {
  const value = niceValue(targetPx / pxPerRsun / units.rsun);
  return { text: `${Number(value.toPrecision(1))} ${units.length}`, pixels: value * units.rsun * pxPerRsun };
}

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
  for (const value of binaryText(hud)) {
    pen.text(value, left, y + line / 2);
    y += line;
  }
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

function drawScale(pen, state, overlay, width, bottom) {
  const unit = pen.unit();
  const pxPerRsun = overlay.pixelsPerUnit / state.rsunPerUnit;
  if (Number.isFinite(pxPerRsun) && pxPerRsun > 0) {
    drawBar(pen, scaleChoice(pxPerRsun, SCALE_TARGET * unit, state.hud.units), state.camera.scale.caption, width / 2, bottom - 36 * unit);
  }
}

function drawNotes(pen, hud, bottom) {
  const unit = pen.unit();
  const notes = [hud.badge, clockNote(hud)].filter(Boolean);
  pen.font(15);
  let y = bottom - 36 * unit;
  for (const value of notes.reverse()) {
    pen.text(value, 40 * unit, y - 9.75 * unit);
    y -= 22.5 * unit;
  }
}

function drawStarLabel(pen, name, star, place) {
  if (!place) return;
  const unit = pen.unit();
  const { context } = pen;
  const top = place.y - (44.2 * unit) / 2;
  pen.font(18, 600);
  pen.text(name, place.x, top + 11.7 * unit);
  context.globalAlpha = 0.85;
  pen.font(16);
  pen.text(star.label, place.x, top + 33.8 * unit);
  context.globalAlpha = 1;
}

export function makeHud({ tMax, inset = 0 }) {
  const pen = makePen();

  function draw(context, state, overlay) {
    const { width, height } = overlay;
    const bottom = height - inset;
    pen.use(context, height / DESIGN_HEIGHT);
    context.textBaseline = 'middle';
    drawReadout(pen, state.hud);
    drawTimeline(pen, state.hud.time, tMax, width, state.hud.units.time);
    drawScale(pen, state, overlay, width, bottom);
    drawNotes(pen, state.hud, bottom);
    const places = labelPlaces(state.stars, overlay.stars, pen.unit());
    ['M1', 'M2'].forEach((name, k) => drawStarLabel(pen, name, state.stars[k], places[k]));
  }

  return { draw };
}
