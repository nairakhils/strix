const LOBE_LOG_START = -4;
const LOBE_STEPS_PER_DEX = 40;
const LOBE_TABLE_SIZE = 321;

const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
const smoothstep = (t) => t * t * (3 - 2 * t);

function masses(q) {
  return [q / (1 + q), 1 / (1 + q)];
}

export function eggleton(q) {
  if (!(q > 0)) return 0;
  if (q === Infinity) return 0.49 / 0.6;
  const q3 = Math.cbrt(q);
  return (0.49 * q3 * q3) / (0.6 * q3 * q3 + Math.log(1 + q3));
}

function potential(ms, mo, x, y, z) {
  const ox = x - 1;
  const cx = x - mo;
  const rs = Math.sqrt(x * x + y * y + z * z);
  const ro = Math.sqrt(ox * ox + y * y + z * z);
  return -ms / rs - mo / ro - 0.5 * (cx * cx + y * y);
}

function gradient(ms, mo, x, y, z, out) {
  const ox = x - 1;
  const rs = Math.sqrt(x * x + y * y + z * z);
  const ro = Math.sqrt(ox * ox + y * y + z * z);
  const pull = ms / (rs * rs * rs);
  const push = mo / (ro * ro * ro);
  out[0] = pull * x + push * ox - x + mo;
  out[1] = (pull + push - 1) * y;
  out[2] = (pull + push) * z;
  return out;
}

function slopeAlong(ms, mo, r, dx, dy, dz) {
  const x = r * dx;
  const y = r * dy;
  const z = r * dz;
  const ox = x - 1;
  const ro = Math.sqrt(ox * ox + y * y + z * z);
  return ms / (r * r) + (mo * (r - dx)) / (ro * ro * ro) - (x - mo) * dx - y * dy;
}

export function rochePotential(q, x, y, z) {
  const [ms, mo] = masses(q);
  return potential(ms, mo, x, y, z);
}

export function rocheGradient(q, x, y, z, out) {
  const [ms, mo] = masses(q);
  return gradient(ms, mo, x, y, z, out);
}

function innerLagrange(ms, mo) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid <= lo || mid >= hi) break;
    const pull = ms / (mid * mid) - mo / ((1 - mid) * (1 - mid)) - mid + mo;
    if (pull === 0) return mid;
    if (pull > 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export function lagrangeL1(q) {
  const [ms, mo] = masses(q);
  return innerLagrange(ms, mo);
}

function pointGuess(ms, mo, level) {
  return ms / (-level - mo - 0.5 * mo * mo);
}

function solveRay(ms, mo, level, l1, dx, dy, dz, guess) {
  let lo = (0.5 * ms) / -level;
  let hi = l1;
  if (potential(ms, mo, hi * dx, hi * dy, hi * dz) <= level) return hi;
  const tolerance = 1e-12 * l1;
  let r = guess > lo && guess < hi ? guess : 0.5 * (lo + hi);
  for (let i = 0; i < 200; i++) {
    const value = potential(ms, mo, r * dx, r * dy, r * dz) - level;
    if (value === 0) return r;
    if (value < 0) lo = r;
    else hi = r;
    const newton = r - value / slopeAlong(ms, mo, r, dx, dy, dz);
    const next = newton > lo && newton < hi ? newton : 0.5 * (lo + hi);
    const step = next - r;
    r = next;
    if (Math.abs(step) < tolerance) return r;
  }
  return r;
}

export function surfaceRadius(q, level, dx, dy, dz) {
  const [ms, mo] = masses(q);
  return solveRay(ms, mo, level, innerLagrange(ms, mo), dx, dy, dz, pointGuess(ms, mo, level));
}

function gaussLegendre(n) {
  const nodes = new Float64Array(n);
  const weights = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let t = Math.cos((Math.PI * (k + 0.75)) / (n + 0.5));
    let slope = 1;
    for (let iteration = 0; iteration < 100; iteration++) {
      let previous = 1;
      let current = t;
      for (let j = 2; j <= n; j++) {
        const next = ((2 * j - 1) * t * current - (j - 1) * previous) / j;
        previous = current;
        current = next;
      }
      slope = (n * (t * current - previous)) / (t * t - 1);
      const step = current / slope;
      t -= step;
      if (Math.abs(step) <= 1e-15) break;
    }
    nodes[k] = t;
    weights[k] = 2 / ((1 - t * t) * slope * slope);
  }
  return { nodes, weights };
}

function quadratureRule(nTheta, nPhi) {
  const { nodes, weights } = gaussLegendre(nTheta);
  const count = nTheta * nPhi;
  const directions = new Float64Array(3 * count);
  const rayWeights = new Float64Array(count);
  for (let k = 0; k < nTheta; k++) {
    const theta = 0.5 * Math.PI * (nodes[k] + 1);
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    for (let i = 0; i < nPhi; i++) {
      const phi = (0.5 * Math.PI * (i + 0.5)) / nPhi;
      const n = k * nPhi + i;
      directions[3 * n] = cosine;
      directions[3 * n + 1] = sine * Math.cos(phi);
      directions[3 * n + 2] = sine * Math.sin(phi);
      rayWeights[n] = (Math.PI * weights[k] * sine) / (4 * nPhi);
    }
  }
  return { count, directions, weights: rayWeights };
}

const shapeRule = quadratureRule(32, 16);
const lobeRule = quadratureRule(64, 32);

function enclosedRadius(ms, mo, level, l1, rule, radii) {
  const { count, directions, weights } = rule;
  let cube = 0;
  let change = 0;
  for (let n = 0; n < count; n++) {
    const dx = directions[3 * n];
    const dy = directions[3 * n + 1];
    const dz = directions[3 * n + 2];
    const r = solveRay(ms, mo, level, l1, dx, dy, dz, radii[n]);
    radii[n] = r;
    cube += weights[n] * r * r * r;
    change += (weights[n] * r * r) / slopeAlong(ms, mo, r, dx, dy, dz);
  }
  const radius = Math.cbrt(cube);
  return { radius, rate: change / (radius * radius) };
}

export function volumeRadius(q, level, nTheta, nPhi) {
  const [ms, mo] = masses(q);
  const rule = quadratureRule(nTheta, nPhi);
  const radii = new Float64Array(rule.count).fill(pointGuess(ms, mo, level));
  return enclosedRadius(ms, mo, level, innerLagrange(ms, mo), rule, radii).radius;
}

function lobeRatio(q) {
  const [ms, mo] = masses(q);
  const l1 = innerLagrange(ms, mo);
  const fit = eggleton(q);
  const radii = new Float64Array(lobeRule.count).fill(fit);
  return enclosedRadius(ms, mo, potential(ms, mo, l1, 0, 0), l1, lobeRule, radii).radius / fit;
}

let lobeTable;

function lobeRatios() {
  lobeTable ??= Float64Array.from({ length: LOBE_TABLE_SIZE }, (_, k) =>
    lobeRatio(10 ** (LOBE_LOG_START + k / LOBE_STEPS_PER_DEX)),
  );
  return lobeTable;
}

export function lobeVolumeRadius(q) {
  if (!(q > 0)) return 0;
  const table = lobeRatios();
  const position = clamp((Math.log10(q) - LOBE_LOG_START) * LOBE_STEPS_PER_DEX, 0, LOBE_TABLE_SIZE - 1);
  const index = Math.min(Math.floor(position), LOBE_TABLE_SIZE - 2);
  const weight = position - index;
  return eggleton(q) * (table[index] + weight * (table[index + 1] - table[index]));
}

export function fillRadius(q, f) {
  const lobe = lobeVolumeRadius(q);
  if (f >= 1) return lobe;
  const fit = eggleton(q);
  const s = smoothstep(clamp((f - 0.8) / 0.2, 0, 1));
  return f * (fit + (lobe - fit) * s);
}

export function shapeLevel(q, f) {
  const [ms, mo] = masses(q);
  const l1 = innerLagrange(ms, mo);
  const lobeLevel = potential(ms, mo, l1, 0, 0);
  const radius = fillRadius(q, f);
  if (f >= 1 || radius >= lobeVolumeRadius(q)) return { level: lobeLevel, radius, lobe: true };
  let low = -ms / radius - mo / (1 - radius) - 0.5 * (radius + mo) ** 2;
  let high = Math.min(-ms / radius, lobeLevel);
  let level = clamp(-ms / radius - mo - 0.5 * mo * mo, low, high);
  const radii = new Float64Array(shapeRule.count).fill(radius);
  for (let iteration = 0; iteration < 100; iteration++) {
    const { radius: current, rate } = enclosedRadius(ms, mo, level, l1, shapeRule, radii);
    const error = current - radius;
    if (Math.abs(error) <= 1e-10 * radius) break;
    if (error < 0) low = level;
    else high = level;
    const newton = level - error / rate;
    level = newton > low && newton < high ? newton : 0.5 * (low + high);
    if (high - low <= 1e-15 * -low) break;
  }
  return { level, radius, lobe: false };
}

function store(target, vertex, x, y, z) {
  target[3 * vertex] = x;
  target[3 * vertex + 1] = y;
  target[3 * vertex + 2] = z;
}

function storeMirrored(target, rowStart, quarter, i, x, y, z) {
  store(target, rowStart + i, x, y, z);
  store(target, rowStart + 2 * quarter - i, x, -y, z);
  store(target, rowStart + 2 * quarter + i, x, -y, -z);
  store(target, rowStart + 4 * quarter - i, x, y, -z);
}

export function sphereGrid(nTheta, nPhi) {
  const quarter = nPhi / 4;
  const stride = nPhi + 1;
  const count = (nTheta + 1) * stride;
  const directions = new Float64Array(3 * count);
  for (let j = 0; j <= nTheta; j++) {
    const cosine = Math.cos((Math.PI * j) / nTheta);
    const sine = Math.sin((Math.PI * Math.min(j, nTheta - j)) / nTheta);
    for (let i = 0; i <= quarter; i++) {
      const across = Math.sin((2 * Math.PI * (quarter - i)) / nPhi);
      const up = Math.sin((2 * Math.PI * i) / nPhi);
      storeMirrored(directions, j * stride, quarter, i, cosine, sine * across, sine * up);
    }
  }
  const index = new Uint32Array(6 * nPhi * (nTheta - 1));
  let n = 0;
  for (let j = 0; j < nTheta; j++) {
    for (let i = 0; i < nPhi; i++) {
      const a = j * stride + i;
      const b = a + stride;
      if (j > 0) {
        index[n++] = a;
        index[n++] = b;
        index[n++] = a + 1;
      }
      if (j < nTheta - 1) {
        index[n++] = b;
        index[n++] = b + 1;
        index[n++] = a + 1;
      }
    }
  }
  const first = new Map();
  const twin = Uint32Array.from({ length: count }, (_, n) => {
    const key = [0, 1, 2].map((k) => Math.round(directions[3 * n + k] * 1e9)).join();
    if (!first.has(key)) first.set(key, n);
    return first.get(key);
  });
  return { nTheta, nPhi, count, directions, index, twin };
}

export function surfaceOnGrid(q, level, grid, positions, normals) {
  const [ms, mo] = masses(q);
  const l1 = innerLagrange(ms, mo);
  const { nTheta, nPhi, directions } = grid;
  const quarter = nPhi / 4;
  const stride = nPhi + 1;
  const normal = [0, 0, 0];
  let rowGuess = pointGuess(ms, mo, level);
  for (let j = 0; j <= nTheta; j++) {
    const rowStart = j * stride;
    let guess = rowGuess;
    for (let i = 0; i <= quarter; i++) {
      const k = 3 * (rowStart + i);
      const dx = directions[k];
      const dy = directions[k + 1];
      const dz = directions[k + 2];
      const r = solveRay(ms, mo, level, l1, dx, dy, dz, guess);
      if (i === 0) rowGuess = r;
      guess = r;
      storeMirrored(positions, rowStart, quarter, i, r * dx, r * dy, r * dz);
      gradient(ms, mo, r * dx, r * dy, r * dz, normal);
      const size = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
      if (size < 1e-12) storeMirrored(normals, rowStart, quarter, i, dx, dy, dz);
      else storeMirrored(normals, rowStart, quarter, i, normal[0] / size, normal[1] / size, normal[2] / size);
    }
  }
}
