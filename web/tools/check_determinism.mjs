import path from 'node:path';
import { launch, openRecorder } from './browser.mjs';
import { addressOf, serve, stop } from './serve.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;
const SPOTS = [0.12, 0.45, 0.8];
const DARKEST = 1e-4;

async function hashes(browser, base, frames) {
  const { page, guard } = await openRecorder(browser, base, { width: WIDTH, height: HEIGHT });
  const result = [];
  for (const j of frames) result.push(await guard(page.evaluate((n) => window.strix.hash(n), j)));
  await page.close();
  return result;
}

async function levels(browser, base, frames) {
  const { page, guard } = await openRecorder(browser, base, { width: WIDTH, height: HEIGHT });
  const result = [];
  for (const j of frames) result.push(await guard(page.evaluate((n) => window.strix.level(n), j)));
  await page.close();
  return result;
}

async function check(browser, scene) {
  const server = await serve({ scene });
  const base = addressOf(server);
  try {
    const probe = await openRecorder(browser, base, { width: WIDTH, height: HEIGHT });
    const total = probe.info.frames;
    await probe.page.close();
    const targets = SPOTS.map((spot) => Math.round(spot * (total - 1)));
    const forward = await hashes(browser, base, targets);
    const backward = (await hashes(browser, base, [...targets].reverse())).reverse();
    const again = await hashes(browser, base, targets.flatMap((j) => [j, j]));
    const lit = await levels(browser, base, targets);
    return targets.map((j, k) => {
      const same = new Set([forward[k], backward[k], again[2 * k], again[2 * k + 1]]).size === 1;
      const drawn = lit[k] > DARKEST;
      console.log(`${path.basename(scene)} frame ${j} ${same ? 'identical' : 'DIFFERENT'}${drawn ? '' : ' BLACK'}`);
      return same && drawn;
    });
  } finally {
    stop(server);
  }
}

const scenes = process.argv.slice(2).map((file) => path.resolve(file));
if (scenes.length === 0) throw new Error('usage: node tools/check_determinism.mjs scene.strix ...');
const browser = await launch();
let failures = 0;
for (const scene of scenes) {
  failures += (await check(browser, scene)).filter((same) => !same).length;
}
process.exit(failures === 0 ? 0 : 1);
