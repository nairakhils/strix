import test from 'node:test';
import assert from 'node:assert/strict';
import { F1 } from '../src/director/blend.js';
import { CENTRE_CAPTION, lobeRimOpacity } from '../src/director/director.js';
import { exampleDirector, exampleScene } from './scenes.mjs';

function linearFor(index, camera = 'fixed') {
  return { table: exampleScene(index), cinematic: exampleDirector(index, false, camera) };
}

const ASPECT = 16 / 9;

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function direction(from, to) {
  const v = to.map((x, k) => x - from[k]);
  const length = Math.hypot(...v);
  return v.map((x) => x / length);
}

function distance(p, q) {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function inRsun(state) {
  const scaled = (point) => point.map((x) => x * state.rsunPerUnit);
  return {
    u: state.u,
    half: state.rsunPerUnit,
    target: scaled(state.camera.target),
    position: scaled(state.camera.position),
    stars: state.stars.map((star) => scaled(star.position)),
  };
}

function assertSmooth(before, after, share) {
  const motion = Math.max(...before.stars.map((p, k) => distance(p, after.stars[k])));
  const half = Math.min(before.half, after.half);
  const moved = distance(before.target, after.target);
  const flown = distance(before.position, after.position);
  assert.ok(moved <= motion + share * half, `target moves ${moved} (stars ${motion}, H ${half}) at ${after.u}`);
  assert.ok(flown <= motion + 2 * share * half, `camera moves ${flown} (stars ${motion}, H ${half}) at ${after.u}`);
}

function angularShare(camera, star) {
  return (2 * Math.asin(star.radius / distance(star.position, camera.position))) / camera.fov;
}

for (const [index, camera] of [0, 1, 2].flatMap((n) => [[n, 'fixed'], [n, 'follow']])) {
  test(`example ${index} linear, ${camera} camera: camera moves continuously, across events too`, () => {
    const { table, cinematic } = linearFor(index, camera);
    const { columns, samples: frameCount } = table;
    const dt = 1e-3;
    const steps = Math.floor(cinematic.duration / dt);
    let previous = inRsun(cinematic.stateAt(0));
    for (let k = 1; k <= steps; k += 1) {
      const next = inRsun(cinematic.stateAt(cinematic.uAtTime(k * dt)));
      assertSmooth(previous, next, 0.05);
      previous = next;
    }
    let changes = 0;
    for (let n = 1; n < frameCount; n += 1) {
      if (columns.label[n] === columns.label[n - 1]) continue;
      assertSmooth(inRsun(cinematic.stateAt(n - 1e-6)), inRsun(cinematic.stateAt(n)), 1e-3);
      changes += 1;
    }
    assert.ok(changes > 0);
  });
}

for (const index of [0, 1, 2]) {
  test(`example ${index} linear: camera is a function of u`, () => {
    const { table, cinematic } = linearFor(index);
    const last = table.samples - 1;
    const probes = [0, 300.4, 0.5 * last, last - 0.3, last];
    const before = probes.map((u) => cinematic.stateAt(u).camera);
    probes.forEach((u, k) => assert.deepEqual(cinematic.stateAt(u).camera, before[k]));
    for (let u = last; u >= 0; u -= 7.3) cinematic.stateAt(u);
    probes.forEach((u, k) => assert.deepEqual(cinematic.stateAt(u).camera, before[k]));
  });

  test(`example ${index} linear: scale bar measured at the hero or the orbit centre`, () => {
    const { table, cinematic } = linearFor(index);
    for (let u = 0; u <= table.samples - 1; u += 9.7) {
      const { camera, stars, orbit, explosion } = cinematic.stateAt(u);
      if (explosion) continue;
      if (camera.scale.caption === CENTRE_CAPTION) {
        if (orbit) assert.deepEqual(camera.scale.position, orbit.centre);
        continue;
      }
      const match = /^at star ([12])$/.exec(camera.scale.caption);
      assert.ok(match, `caption ${camera.scale.caption} at ${u}`);
      const star = stars[Number(match[1]) - 1];
      assert.equal(star.visible, true);
      assert.deepEqual(camera.scale.position, star.position);
    }
  });
}

function placement(camera, star) {
  const forward = direction(camera.position, camera.target);
  const right = direction([0, 0, 0], cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const v = star.position.map((x, k) => x - camera.position[k]);
  const depth = dot(v, forward);
  const radius = Math.asin(Math.min(1, star.radius / Math.hypot(...v)));
  const halfHeight = camera.fov / 2;
  const halfWidth = Math.atan(Math.tan(halfHeight) * ASPECT);
  const across = Math.abs(Math.atan2(dot(v, right), depth));
  const along = Math.abs(Math.atan2(dot(v, up), depth));
  return {
    radius,
    share: radius / halfHeight,
    centred: depth > 0 && across <= halfWidth && along <= halfHeight,
    inside: depth > 0 && across + radius <= halfWidth && along + radius <= halfHeight,
    outside: depth <= 0 || across - radius >= halfWidth || along - radius >= halfHeight,
  };
}

for (const index of [0, 1, 2]) {
  test(`example ${index} linear: no star is cut by the frame edge`, () => {
    const { table, cinematic } = linearFor(index);
    for (let u = 0; u < table.samples; u += 1) {
      const { camera, stars } = cinematic.stateAt(u);
      for (const [k, star] of stars.entries()) {
        if (!star.visible || star.kind !== 'star') continue;
        const place = placement(camera, star);
        if (place.share < 0.1) continue;
        assert.ok(place.inside || place.outside, `star ${k + 1} cut at ${u}`);
      }
    }
  });
}

test('example 1 linear: the giant reads large with its companion in frame in the detached phase', () => {
  const { camera, stars } = linearFor(1).cinematic.stateAt(300);
  const [giant, companion] = stars.map((star) => placement(camera, star));
  assert.ok(giant.inside && giant.share >= 0.12, `giant share ${giant.share}`);
  assert.ok(companion.inside, 'companion in frame');
});

test('example 1 linear: the supernova frames the exploding star and its companion', () => {
  const { cinematic } = linearFor(1);
  for (const u of [690, 700, 710, 720]) {
    const { camera, stars } = cinematic.stateAt(u);
    for (const [k, star] of stars.entries()) assert.ok(placement(camera, star).centred, `star ${k + 1} in frame at ${u}`);
  }
});

test('example 1 linear: star 2 is framed at a pleasing size in the wide orbit', () => {
  const { cinematic } = linearFor(1, 'follow');
  for (const u of [820, 850]) {
    const { camera, stars } = cinematic.stateAt(u);
    assert.equal(camera.scale.caption, 'at star 2', `caption at ${u}`);
    const share = angularShare(camera, stars[1]);
    assert.ok(share >= 0.15 && share <= 0.5, `star 2 share ${share} at ${u}`);
  }
});

test('lobeRimOpacity ramps smoothly from fill 0.5 to F1', () => {
  for (const fill of [0, 0.3, 0.5]) assert.equal(lobeRimOpacity(fill), 0);
  for (const fill of [F1, 0.9, 1, 3]) assert.equal(lobeRimOpacity(fill), 1);
  let previous = 0;
  for (let fill = 0.5; fill <= F1 + 1e-9; fill += 0.001) {
    const value = lobeRimOpacity(fill);
    assert.ok(value >= previous && value - previous <= 0.01, `ramp at ${fill}`);
    previous = value;
  }
});

test('during a transfer the camera holds an oblique view with both stars in frame', () => {
  const ranges = [[0, 875, 915], [1, 355, 395], [2, 205, 245]];
  for (const [index, from, to] of ranges) {
    const { cinematic } = linearFor(index, 'follow');
    for (let u = from; u <= to; u += 2) {
      const { camera, stars } = cinematic.stateAt(u);
      assert.ok(camera.focus > 0.9, `focus ${camera.focus} at ${u}`);
      const axis = [stars[1].position[0] - stars[0].position[0], stars[1].position[2] - stars[0].position[2]];
      const view = [camera.target[0] - camera.position[0], camera.target[2] - camera.position[2]];
      const angle = Math.acos(Math.abs(axis[0] * view[0] + axis[1] * view[1]) / Math.hypot(...axis) / Math.hypot(...view));
      assert.ok(angle > (40 * Math.PI) / 180, `example ${index} views the axis at ${(angle * 180) / Math.PI} degrees at ${u}`);
      for (const star of stars) {
        if (star.visible && star.kind === 'star') assert.ok(placement(camera, star).inside, `star in frame at ${u}`);
      }
    }
  }
});

test('the shutter matches the orbital phase swept in one video frame', () => {
  const { cinematic } = linearFor(2);
  for (const u of [100, 230, 800]) {
    const { shutter } = cinematic.stateAt(u);
    assert.ok(shutter > 0 && shutter < 0.05, `shutter ${shutter} at ${u}`);
  }
});
