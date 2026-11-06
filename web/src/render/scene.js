import { makeStage } from './stage.js';
import { makeStars } from './stars.js';
import { makeCompact } from './compact.js';
import { makeGuides } from './guides.js';
import { makeSky } from './sky.js';
import { makeWinds } from './winds.js';
import { makeTransfer } from './transfer.js';
import { makeExplosion } from './explosion.js';
import { makeEnvelope } from './envelope.js';
import { makeFields } from './fields.js';

const shaderFiles = {
  starVertex: 'star.vert.glsl',
  starFragment: 'star.frag.glsl',
  billboardVertex: 'billboard.vert.glsl',
  glowFragment: 'glow.frag.glsl',
  windFragment: 'wind.frag.glsl',
  emissionChunk: 'emission.glsl',
  streakChunk: 'streak.glsl',
  flowVertex: 'flow.vert.glsl',
  discVertex: 'disc.vert.glsl',
  cloudVertex: 'cloud.vert.glsl',
  cloudFragment: 'cloud.frag.glsl',
  envelopeFragment: 'envelope.frag.glsl',
  fieldFragment: 'field.frag.glsl',
  particleFragment: 'particle.frag.glsl',
  diskVertex: 'disk.vert.glsl',
  diskFragment: 'disk.frag.glsl',
  spotFragment: 'spot.frag.glsl',
  flashFragment: 'flash.frag.glsl',
  skyVertex: 'sky.vert.glsl',
  skyFragment: 'sky.frag.glsl',
  lensVertex: 'sky.vert.glsl',
  lensFragment: 'lens.frag.glsl',
  lobeVertex: 'lobe.vert.glsl',
  lobeFragment: 'lobe.frag.glsl',
};

async function loadText(name) {
  const response = await fetch(new URL(`../../shaders/${name}`, import.meta.url));
  if (!response.ok) throw new Error(`cannot load ${name}`);
  return response.text();
}

async function loadShaders() {
  const entries = await Promise.all(
    Object.entries(shaderFiles).map(async ([key, name]) => [key, await loadText(name)]),
  );
  return Object.fromEntries(entries);
}

function hiddenMark() {
  return { visible: false, x: 0, y: 0, pixels: 0, notToScale: false };
}

export async function makeScene(container, { render, background, width, height, emission, fields }) {
  const stage = makeStage(container, { render, width, height });
  const shaders = await loadShaders();
  const sky = await makeSky(stage, shaders, background);
  const guides = makeGuides(stage, shaders);
  const stars = makeStars(stage, shaders);
  const compact = makeCompact(stage, shaders);
  const winds = makeWinds(stage, shaders);
  const transfer = makeTransfer(stage, shaders, emission);
  const explosion = makeExplosion(stage, shaders, emission);
  const envelope = makeEnvelope(stage, shaders, emission);
  const gas = makeFields(stage, shaders, emission, fields);

  stage.warm();

  function draw(state) {
    stage.frame(state.camera);
    guides.update(state);
    const shown = stars.update(state);
    winds.update(state);
    transfer.update(state);
    explosion.update(state);
    envelope.update(state);
    gas.update(state);
    const { marks, lenses } = compact.update(state);
    sky.update(lenses);
    stage.render();
    const { width: canvasWidth, height: canvasHeight } = stage.size();
    return {
      width: canvasWidth,
      height: canvasHeight,
      pixelsPerUnit: stage.pixelsPerUnitAtDepth(state.camera.scale.position),
      stars: state.stars.map((star, k) => shown[k] ?? marks[k] ?? hiddenMark()),
    };
  }

  function onMove(listener) {
    stage.onMove(listener);
    gas.onLoad(listener);
  }

  return { draw, prepare: gas.prepare, follow: stage.follow, onMove, resize: stage.resize, canvas: stage.renderer.domElement };
}
