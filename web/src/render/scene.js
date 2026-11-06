import { makeStage } from './stage.js';
import { makeCompact } from './compact.js';
import { makeGuides } from './guides.js';
import { makeSky } from './sky.js';
import { makeFields } from './fields.js';

const shaderFiles = {
  billboardVertex: 'billboard.vert.glsl',
  glowFragment: 'glow.frag.glsl',
  emissionChunk: 'emission.glsl',
  cloudVertex: 'cloud.vert.glsl',
  fieldFragment: 'field.frag.glsl',
  skyVertex: 'sky.vert.glsl',
  skyFragment: 'sky.frag.glsl',
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
  const guides = makeGuides(stage);
  const compact = makeCompact(stage, shaders);
  const gas = makeFields(stage, shaders, emission, fields);

  stage.warm();

  function draw(state) {
    stage.frame(state.camera);
    guides.update(state);
    gas.update(state);
    const { marks } = compact.update(state);
    sky.update();
    stage.render();
    const { width: canvasWidth, height: canvasHeight } = stage.size();
    return {
      width: canvasWidth,
      height: canvasHeight,
      pixelsPerUnit: stage.pixelsPerUnitAtDepth(state.camera.scale.position),
      stars: state.stars.map((star, k) => marks[k] ?? hiddenMark()),
    };
  }

  function onMove(listener) {
    stage.onMove(listener);
    gas.onLoad(listener);
  }

  return { draw, prepare: gas.prepare, follow: stage.follow, onMove, resize: stage.resize, canvas: stage.renderer.domElement };
}
