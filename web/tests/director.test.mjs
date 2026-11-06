import test from 'node:test';
import assert from 'node:assert/strict';
import { determineScale, logScaledRadius } from '../src/director/scaling.js';
import { TAU_SETTLE } from '../src/director/framing.js';
import { BLAST_SETTLE, FLOOR_LABEL, HERO_SHARE, makeDirector } from '../src/director/director.js';
import { paletteColour } from '../src/physics/light.js';
import { blackbodyPalette } from '../src/physics/blackbody.js';
import { eggleton, lagrangeL1, shapeLevel, sphereGrid, surfaceOnGrid } from '../src/physics/roche.js';
import { exampleDirector as cinematicFor, exampleScene as readTable } from './scenes.mjs';

const videoFrames = [1596, 1956, 1932];

function coupledOf({ columns }) {
  return Uint8Array.from(columns.stage, (name) => (name ? 1 : 0));
}

function modelledAt({ header }, n) {
  return header.events.some(({ during: [first, last] }) => n >= first - 1 && n <= last);
}

function overriddenAt({ header }, n) {
  return header.events.some(({ kind, during: [first, last] }) => kind !== 'transfer' && n >= first && n <= last);
}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

function assertRelative(actual, expected, tolerance, label) {
  assertNear(actual, expected, tolerance * Math.abs(expected), label);
}

function distance(p, q) {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function isBoundFrame(columns, n) {
  const a = columns.a[n];
  const e = columns.e[n];
  return a > 0 && e >= 0 && e < 1 && columns.m1[n] > 0 && columns.m2[n] > 0;
}

function rawExtent(state) {
  const rsun = state.rsunPerUnit;
  const [star1, star2] = state.stars;
  if (state.hud.disrupted) {
    const followed = state.stars[state.hud.disrupted.followed];
    return Math.max(3 * followed.trueRadius, 2 * Math.hypot(...followed.position) * rsun, 1);
  }
  const a = state.orbit.a * rsun;
  const e = state.orbit.e;
  const [m1, m2] = [star1.mass, star2.mass];
  const apocentre = a * (1 + e);
  const [r1, r2] = [star1.trueRadius, star2.trueRadius];
  const lobes = m1 > 0 && m2 > 0 ? [eggleton(m1 / m2) * a * (1 - e), eggleton(m2 / m1) * a * (1 - e)] : [];
  const total = m1 + m2;
  const shares = total > 0 ? [m2 / total, m1 / total] : [0.5, 0.5];
  return Math.max(
    apocentre,
    r1 + r2,
    3 * Math.max(r1, r2),
    ...lobes,
    1.1 * (shares[0] * apocentre + r1),
    1.1 * (shares[1] * apocentre + r2),
    1,
  );
}

for (const index of [0, 1, 2]) {
  for (const log of [false, true]) {
    const name = `example ${index} ${log ? 'log' : 'linear'}`;

    test(`${name}: video timing`, () => {
      const { samples: frameCount } = readTable(index);
      const cinematic = cinematicFor(index, log);
      assert.equal(cinematic.videoFrames, Math.round(cinematic.duration * 60));
      assert.ok(cinematic.duration >= (frameCount - 1) / 50 && cinematic.videoFrames >= videoFrames[index]);
      assert.ok(cinematic.uAtVideoFrame(cinematic.videoFrames - 1) <= frameCount - 1);
      let previous = -1;
      for (let j = 0; j < cinematic.videoFrames; j += 7) {
        const u = cinematic.uAtVideoFrame(j);
        assert.ok(u > previous, `video frame ${j} moves forward`);
        assert.ok(Math.abs(cinematic.timeAt(u) - j / 60) < 1e-9, `round trip at ${j}`);
        previous = u;
      }
    });

    test(`${name}: stateAt depends only on u`, () => {
      const { samples: frameCount } = readTable(index);
      const cinematic = cinematicFor(index, log);
      const probes = [0, 0.37, 120.5, 0.61 * frameCount, frameCount - 1];
      const before = probes.map((u) => cinematic.stateAt(u));
      for (let u = frameCount - 1; u >= 0; u -= 3.7) cinematic.stateAt(u);
      probes.forEach((u, k) => assert.deepEqual(cinematic.stateAt(u), before[k]));
      const fresh = makeDirector(readTable(index), { log });
      probes.forEach((u, k) => assert.deepEqual(fresh.stateAt(u), before[k]));
    });

    test(`${name}: interpolation`, () => {
      const scene = readTable(index);
      const { columns, samples: frameCount, header } = scene;
      const palette = header.palette ?? blackbodyPalette();
      const cinematic = cinematicFor(index, log);
      const teffs = [columns.teff1, columns.teff2];
      const types = [columns.type1, columns.type2];
      for (let n = 0; n < frameCount; n += 1) {
        if (overriddenAt(scene, n)) continue;
        const state = cinematic.stateAt(n);
        state.stars.forEach((star, k) => assert.deepEqual(star.rgb, paletteColour(palette, teffs[k][n])));
      }
      for (let i = 0; i < frameCount - 1; i += 7) {
        if (modelledAt(scene, i) || modelledAt(scene, i + 1)) continue;
        const state = cinematic.stateAt(i + 0.5);
        const mid = (values) => (values[i] + values[i + 1]) / 2;
        assert.equal(state.frame, i);
        assert.deepEqual(state.hud.types, [types[0][i], types[1][i]]);
        assert.equal(state.hud.event, columns.label[i]);
        const orbit = state.hud.escape === null ? [[state.hud.a, columns.a], [state.hud.e, columns.e]] : [];
        const pairs = [
          [state.hud.time, columns.time],
          ...orbit,
          [state.hud.m1, columns.m1],
          [state.hud.m2, columns.m2],
          [state.hud.r1, columns.r1],
          [state.hud.r2, columns.r2],
          [state.stars[0].teff, columns.teff1],
          [state.stars[1].teff, columns.teff2],
        ];
        for (const [actual, values] of pairs) {
          assertNear(actual, mid(values), 1e-12 * Math.max(1, Math.abs(mid(values))), `midpoint at ${i}`);
        }
        state.stars.forEach((star, k) => {
          assert.equal(star.type, types[k][i]);
          assert.deepEqual(star.rgb, paletteColour(palette, mid(teffs[k])));
        });
      }
    });

    test(`${name}: barycentre and sense of rotation`, () => {
      const { samples: frameCount } = readTable(index);
      const cinematic = cinematicFor(index, log);
      let turns = 0;
      for (let u = 0; u < frameCount - 1; u += 0.5) {
        const state = cinematic.stateAt(u);
        if (!state.orbit) continue;
        const [star1, star2] = state.stars;
        const [m1, m2] = [star1.mass, star2.mass];
        const separation = distance(star1.position, star2.position);
        if (m1 > 0 && m2 > 0 && separation > 0) {
          for (let c = 0; c < 3; c += 1) {
            const centre = (m1 * star1.position[c] + m2 * star2.position[c]) / (m1 + m2);
            assertNear(centre, state.orbit.centre[c], 1e-9 * separation, `barycentre at ${u}`);
          }
        }
        const next = cinematic.stateAt(u + 0.01);
        if (!next.orbit || next.orbit.e !== state.orbit.e) continue;
        const r = star2.position.map((x, c) => x - star1.position[c]);
        const s = next.stars[1].position.map((x, c) => x - next.stars[0].position[c]);
        assert.ok(r[2] * s[0] - r[0] * s[2] > 0, `clockwise at ${u}`);
        turns += 1;
      }
      assert.ok(turns > 0);
    });
  }

  test(`example ${index} linear: framing covers the hero at its share or the whole binary`, () => {
    const { samples: frameCount } = readTable(index);
    const cinematic = cinematicFor(index, false);
    for (let u = 0; u <= frameCount - 1; u += 0.37) {
      const state = cinematic.stateAt(u);
      if (state.camera.focus > 0 || state.explosion || (!state.orbit && !state.hud.disrupted)) continue;
      const focus = state.camera.scale.caption.match(/^at star (\d)$/);
      if (focus && state.stars[focus[1] - 1].kind !== 'star') continue;
      const shown = state.stars.filter((star) => star.visible && star.kind === 'star').map((star) => star.trueRadius);
      const floor = Math.min(rawExtent(state), Math.min(...shown) / HERO_SHARE);
      assert.ok(state.rsunPerUnit >= floor * (1 - 1e-9), `framing below ${floor} at ${u}`);
    }
  });

  test(`example ${index} log: drawn lobes, mass ratio and exact coupled radii`, () => {
    const table = readTable(index);
    const { columns, samples: frameCount } = table;
    const cinematic = cinematicFor(index, true);
    const scale = determineScale(columns, frameCount);
    const coupled = coupledOf(table);
    let checked = 0;
    for (let n = 0; n < frameCount; n += 1) {
      const state = cinematic.stateAt(n);
      const a = columns.a[n];
      const e = columns.e[n];
      if (!isBoundFrame(columns, n) || !state.orbit || state.orbit.e !== e) continue;
      if (Math.abs(state.orbit.a * state.rsunPerUnit - a) > 1e-9 * a) continue;
      const [star1, star2] = state.stars;
      const lambda = 400 / state.rsunPerUnit;
      assertRelative(lambda, (logScaledRadius(a) * (1 + star1.mass / star2.mass) * scale) / a, 1e-12, `lambda ${n}`);
      for (const star of state.stars) {
        if (!star.lobe) continue;
        const expected = (lambda * eggleton(star.lobe.q) * a * (1 - e)) / 400;
        assertRelative(star.lobe.unit * eggleton(star.lobe.q), expected, 1e-12, `lobe ${n}`);
        if (coupled[n] && star.label !== FLOOR_LABEL) assert.equal(star.shape.scale, 1);
      }
      const ratio = distance(star2.position, state.orbit.centre) / distance(star1.position, state.orbit.centre);
      assertRelative(ratio, star1.mass / star2.mass, 1e-12, `mass ratio ${n}`);
      checked += 1;
    }
    assert.ok(checked > 0);
  });

  test(`example ${index}: orbit slowing and pauses`, () => {
    const table = readTable(index);
    const { columns, samples: frameCount } = table;
    const cinematic = cinematicFor(index, false);
    const coupled = coupledOf(table);
    let pausedCoupled = 0;
    for (let i = 0; i < frameCount; i += 1) {
      const { hud } = cinematic.stateAt(i);
      const k = Math.min(i, frameCount - 2);
      assert.equal(hud.paused, columns.time[k + 1] <= columns.time[k]);
      assert.ok(hud.slowedBy === null || hud.slowedBy > 1);
      if (coupled[i] && hud.paused) pausedCoupled += 1;
    }
    assert.ok(pausedCoupled > 0);
  });
}

for (const log of [false, true]) {
  const mode = log ? 'log' : 'linear';

  test(`example 2 ${mode}: the supernova unbinds the orbit, then star 2 is followed`, () => {
    const { columns, samples: frameCount } = readTable(2);
    const cinematic = cinematicFor(2, log);
    const before = cinematic.stateAt(510 - 1e-7);
    const after = cinematic.stateAt(510);
    assert.ok(before.orbit && !after.orbit);
    assert.equal(after.hud.collapse.boundAfter, false);
    assert.ok(after.hud.collapse.kick > 0);
    assert.ok(distance(after.stars[1].position, before.stars[1].position) < 1e-4, 'star 2 at the collapse');
    let followed = null;
    for (let n = 510; n < frameCount; n += 1) {
      const state = cinematic.stateAt(n);
      assert.equal(state.orbit, null);
      if (state.hud.disrupted === null) {
        assert.ok(!log && followed === null, `escaping at ${n}`);
        continue;
      }
      followed ??= n;
      assert.deepEqual(state.hud.disrupted, { followed: 1, since: columns.time[510] });
      assert.equal(state.stars[0].visible, false);
      if (!state.explosion) assert.equal(state.stars[1].visible, true);
    }
    assert.ok(followed !== null && followed < 610);
    const leaving = cinematic.stateAt(followed - 1e-7).stars[1].position;
    const anchored = cinematic.stateAt(followed).stars[1].position;
    assert.ok(distance(leaving, anchored) < 1e-4);
  });

  test(`example 1 ${mode}: positions and L continuous through the common envelope`, () => {
    const cinematic = cinematicFor(1, log);
    const start = cinematic.timeAt(1100);
    const dt = 1 / 240;
    let previous = cinematic.stateAt(1100);
    for (let k = 1; cinematic.uAtTime(start + k * dt) < 1400; k += 1) {
      const state = cinematic.stateAt(cinematic.uAtTime(start + k * dt));
      state.stars.forEach((star, s) => {
        const jump = distance(star.position, previous.stars[s].position);
        assert.ok(jump < 0.01, `star ${s} jumps ${jump} at ${state.u}`);
      });
      if (!log) {
        const step = Math.abs(Math.log(state.rsunPerUnit / previous.rsunPerUnit));
        const bound = Math.max((1.1 * (state.u - previous.u)) / TAU_SETTLE, 1.1 * BLAST_SETTLE * dt);
        assert.ok(step <= bound + 1e-9, `L jumps ${step} at ${state.u}`);
      }
      previous = state;
    }
  });

  test(`example 0 ${mode}: lobe-filling star 1 has its cusp at L1`, () => {
    const state = cinematicFor(0, log).stateAt(120);
    const star = state.stars[0];
    assert.ok(star.shape && star.shape.fill >= 1 - 1e-9);
    const { q, fill, unit, scale } = star.shape;
    const { level, lobe } = shapeLevel(q, fill);
    assert.equal(lobe, true);
    const grid = sphereGrid(96, 128);
    const positions = new Float32Array(3 * grid.count);
    const normals = new Float32Array(3 * grid.count);
    surfaceOnGrid(q, level, grid, positions, normals);
    let vertex = 0;
    for (let n = 1; n < grid.count; n += 1) {
      if (grid.directions[3 * n] > grid.directions[3 * vertex]) vertex = n;
    }
    const reach = unit * scale * positions[3 * vertex];
    const tip = star.position.map((x, c) => x + star.toward[c] * reach);
    const l1 = star.position.map((x, c) => x + star.toward[c] * lagrangeL1(q) * unit);
    assert.ok(distance(tip, l1) <= 1e-4 * state.orbit.a, `cusp ${distance(tip, l1)}`);
  });
}
