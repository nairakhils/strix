import { loadField, loadScene } from './scene.js';
import { makeDirector, VIDEO_FPS } from './director/director.js';
import { makeScene } from './render/scene.js';
import { makeHud } from './hud/hud.js';
import { CONTROLS_HEIGHT, startViewer } from './viewer.js';
import { makeRecorder } from './recorder.js';

const MAX_PIXEL_RATIO = 2;

const params = new URLSearchParams(location.search);
const options = {
  scene: params.get('scene') ?? 'scene.strix',
  record: params.has('record'),
  width: Number(params.get('width') ?? 1920),
  height: Number(params.get('height') ?? 1080),
};

function makeOverlay(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hud';
  container.append(canvas);
  const context = canvas.getContext('2d');
  let ratio = 1;

  function resize(width, height) {
    ratio = Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  function clear() {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  }

  resize(innerWidth, innerHeight);
  return { clear, resize };
}

async function record(director, view, hud, { width, height }) {
  window.strix = await makeRecorder({
    width,
    height,
    fps: VIDEO_FPS,
    frames: director.videoFrames,
    prepare: director.gas ? (j) => view.prepare(director.stateAt(director.uAtVideoFrame(j))) : null,
    compose: (context, j, labelled) => {
      const state = director.stateAt(director.uAtVideoFrame(j));
      const drawn = view.draw(state);
      context.drawImage(view.canvas, 0, 0, width, height);
      if (labelled) hud.draw(context, state, drawn);
    },
  });
}

function interact(director, view, hud, container) {
  const overlay = makeOverlay(container);
  startViewer({
    last: director.frameCount - 1,
    duration: director.duration,
    timeAt: director.timeAt,
    uAtTime: director.uAtTime,
    renderAt: (u) => {
      const state = director.stateAt(u);
      const drawn = view.draw(state);
      hud.draw(overlay.clear(), state, drawn);
      return state;
    },
    follow: view.follow,
    onMove: view.onMove,
    resize: (w, h) => {
      view.resize(w, h);
      overlay.resize(w, h);
    },
  });
}

async function start() {
  const scene = await loadScene(options.scene);
  const director = makeDirector(scene);
  const size = options.record ? options : { width: innerWidth, height: innerHeight };
  const container = document.getElementById('stage');
  document.body.classList.toggle('record', options.record);
  const [view] = await Promise.all([
    makeScene(container, {
      render: options.record,
      background: scene.assets[scene.header.sky] ?? null,
      width: size.width,
      height: size.height,
      emission: director.emission,
      fields: {
        meta: director.gas,
        count: scene.samples,
        load: (sample, level) => loadField(scene, sample, level),
      },
    }),
    document.fonts.ready,
  ]);
  const hud = makeHud({ tMax: director.tMax, inset: options.record ? 0 : CONTROLS_HEIGHT });
  if (options.record) await record(director, view, hud, size);
  else interact(director, view, hud, container);
}

start().catch((error) => {
  window.strixError = error.message;
  throw error;
});
