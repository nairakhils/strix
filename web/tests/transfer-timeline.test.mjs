import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleDirector, exampleScene } from './scenes.mjs';

function load(index) {
  return { table: exampleScene(index), cinematic: exampleDirector(index) };
}

const separation = (state) => state.orbit.a * state.rsunPerUnit;

test('example 2: the orbit follows the transfer track between its end states', () => {
  const { table, cinematic } = load(2);
  const { during: [first, last], start, end } = table.header.events.find(({ kind }) => kind === 'transfer');
  assert.ok(Math.abs(separation(cinematic.stateAt(first - 1)) / start.a - 1) < 1e-3);
  assert.ok(Math.abs(separation(cinematic.stateAt(last + 1)) / end.a - 1) < 1e-3);
  const dip = Math.min(...[205, 210, 215].map((u) => separation(cinematic.stateAt(u))));
  assert.ok(dip < start.a, `orbit shrinks near q = 1 first (${dip})`);
});

test('a lobe-filling donor keeps the luminosity the scene gives it', () => {
  for (const index of [0, 1, 2]) {
    const { table, cinematic } = load(index);
    for (const { donor, during: [first, last], start, end } of table.header.events.filter((e) => e.kind === 'transfer')) {
      const light = (r, teff) => r * r * (teff / 5772) ** 4;
      const bounds = [start, end].map((state) => light(state[`r${donor}`], state[`teff${donor}`]));
      for (let u = first; u <= last; u += 0.5) {
        const state = cinematic.stateAt(u);
        const shown = light(state.hud[`r${donor}`], state.stars[donor - 1].teff);
        assert.ok(shown > 0.99 * Math.min(...bounds) && shown < 1.01 * Math.max(...bounds), `example ${index} at ${u}: ${shown}`);
      }
    }
  }
});

test('example 2: the donor fills its lobe while it transfers', () => {
  const { cinematic } = load(2);
  for (let u = 204; u <= 246; u += 3) {
    const state = cinematic.stateAt(u);
    assert.ok(state.hud.fills[0] >= 0.999, `fill ${state.hud.fills[0]} at ${u}`);
    assert.equal(state.transfer.donor, 0);
    assert.equal(state.transfer.presence.stream, 1);
  }
});

test('example 2: the stream first strikes the accretor, then forms a disk as the orbit widens', () => {
  const { cinematic } = load(2);
  const early = cinematic.stateAt(210).transfer;
  const late = cinematic.stateAt(249).transfer;
  assert.equal(early.disk, null);
  assert.equal(early.spot.onDisk, false);
  assert.ok(early.minimum * separation(cinematic.stateAt(210)) < cinematic.stateAt(210).hud.r2);
  assert.ok(late.disk !== null && late.spot.onDisk);
});

test('example 2: the stream front travels from L1 and the hot spot lights when it arrives', () => {
  const { cinematic } = load(2);
  const start = cinematic.stateAt(200).transfer;
  assert.ok(Math.abs(start.stream.since) < 1e-9);
  assert.equal(start.spot.presence, 0);
  const early = cinematic.stateAt(200.5).transfer;
  assert.ok(early.stream.since > 0 && early.stream.since < early.stream.duration, `front still travelling: ${early.stream.since}`);
  const landed = cinematic.stateAt(202.5).transfer;
  assert.ok(landed.stream.since > landed.stream.duration && landed.spot.presence === 1);
  assert.ok(cinematic.timeAt(203) - cinematic.timeAt(200) > 2.5, 'the onset is held on screen');
});

test('example 2: the stream drains after the donor detaches and the disk fades over the padding', () => {
  const { cinematic } = load(2);
  const stopped = cinematic.stateAt(251).transfer;
  assert.ok(stopped.stream.after > 0, 'the donor has stopped feeding');
  let u = 251;
  const draining = (state) => state.transfer && state.transfer.stream.after < state.transfer.stream.duration + 0.2;
  while (draining(cinematic.stateAt(u))) u += 0.25;
  const drained = cinematic.stateAt(u).transfer;
  assert.equal(drained.spot?.presence ?? 0, 0);
  assert.ok(drained.presence.disk > 0);
  assert.equal(cinematic.stateAt(320).transfer, null);
});

test('example 2: the disk is born from the stream, built over an arc of the orbit, then spreads', () => {
  const { cinematic } = load(2);
  let u = 230;
  while (!cinematic.stateAt(u).transfer?.disk) u += 0.1;
  const first = cinematic.stateAt(u).transfer.disk;
  assert.ok(first.built < 0.2, `built ${first.built}`);
  assert.ok(first.outer < 1.2 * first.ring, 'starts as a ring');
  const later = cinematic.stateAt(249).transfer.disk;
  assert.equal(later.built, 1);
  assert.ok(later.outer > first.outer);
});

test('mass the accretor cannot keep swells it into an outflow photosphere inside its lobe', () => {
  for (const [index, accretor, frames] of [[0, 0, [880, 900, 915]], [1, 1, [360, 380]]]) {
    const { cinematic } = load(index);
    for (const u of frames) {
      const state = cinematic.stateAt(u);
      const fill = state.stars[accretor].shape?.fill;
      assert.equal(state.stars[accretor].kind, 'star', `example ${index} at ${u}`);
      assert.ok(Math.abs(fill - 0.9) < 0.01, `example ${index} at ${u}: fill ${fill}`);
      assert.deepEqual(state.hud.modelled, [0, 1]);
    }
  }
  for (const u of [880, 900, 915]) assert.ok(load(0).cinematic.stateAt(u).transfer.disk, `black-hole disk at ${u}`);
  const kept = load(2).cinematic.stateAt(225);
  assert.deepEqual(kept.hud.modelled, [0]);
  assert.ok(kept.stars[1].shape === null || kept.stars[1].shape.fill < 0.9);
});

test('detached frames carry no transfer', () => {
  const { cinematic } = load(1);
  for (const u of [0, 300, 900]) assert.equal(cinematic.stateAt(u).transfer, null);
});

test('during a transfer the HUD shows the drawn separation, marked as a model value', () => {
  const { table, cinematic } = load(2);
  const inside = cinematic.stateAt(225);
  assert.deepEqual(inside.hud.modelled, [0]);
  assert.ok(Math.abs(inside.hud.a / separation(inside) - 1) < 1e-9);
  assert.ok(Math.abs(inside.hud.a - table.columns.a[225]) > 10);
  assert.equal(inside.hud.flow.accreted, 1);
  const outside = cinematic.stateAt(150);
  assert.deepEqual(outside.hud.modelled, []);
  assert.equal(outside.hud.a, table.columns.a[150]);
});

test('a disk grows from the circularisation radius toward the tidal radius', () => {
  const { cinematic } = load(2);
  let u = 230;
  while (!cinematic.stateAt(u).transfer?.disk) u += 0.25;
  const fresh = cinematic.stateAt(u).transfer;
  const early = cinematic.stateAt(u + 1.25).transfer;
  const late = cinematic.stateAt(248).transfer;
  assert.ok(Math.abs(fresh.disk.outer - fresh.circularisation) < 1e-9);
  assert.ok(early.disk.outer >= early.circularisation - 1e-12);
  assert.ok(late.disk.outer > early.disk.outer);
});
