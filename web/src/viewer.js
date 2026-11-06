import { fixed2 } from './hud/hud.js';

export const CONTROLS_HEIGHT = 52;

function element(id) {
  return document.getElementById(id);
}

export function startViewer(view) {
  const play = element('play');
  const scrub = element('scrub');
  const frameLabel = element('frame-label');
  const follow = element('follow');
  scrub.min = '0';
  scrub.max = String(view.last);
  scrub.step = '0.01';
  let current = 0;
  let playing = false;
  let anchor = null;
  let stale = true;

  const clampU = (u) => Math.min(Math.max(u, 0), view.last);
  const refresh = () => {
    stale = true;
  };

  function seek(u) {
    current = clampU(u);
    anchor = null;
    refresh();
  }

  function toggle() {
    playing = !playing;
    anchor = null;
    play.textContent = playing ? 'Pause' : 'Play';
  }

  function refollow() {
    view.follow();
    refresh();
  }

  function sync(state) {
    const value = String(state.u);
    if (scrub.value !== value) scrub.value = value;
    const text = `frame ${state.u.toFixed(1)} / ${view.last + 1} · t = ${fixed2(state.hud.time)} ${state.hud.units.time}`;
    if (frameLabel.textContent !== text) frameLabel.textContent = text;
  }

  function tick(time) {
    if (playing) {
      anchor ??= { at: view.timeAt(current), time };
      current = view.uAtTime((anchor.at + (time - anchor.time) / 1000) % view.duration);
    }
    if (playing || stale) sync(view.renderAt(clampU(current)));
    stale = false;
    requestAnimationFrame(tick);
  }

  function onKey(event) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (event.code === 'Space') {
      event.preventDefault();
      toggle();
    } else if (event.key === 'ArrowRight') {
      seek(current + 1);
    } else if (event.key === 'ArrowLeft') {
      seek(current - 1);
    } else if (event.key === 'f') {
      refollow();
    }
  }

  function onClick(button, action) {
    button.addEventListener('click', () => {
      action();
      button.blur();
    });
  }

  onClick(play, toggle);
  onClick(follow, refollow);
  scrub.addEventListener('input', () => seek(scrub.valueAsNumber));
  addEventListener('keydown', onKey);
  addEventListener('resize', () => {
    view.resize(innerWidth, innerHeight);
    refresh();
  });
  view.onMove(refresh);
  requestAnimationFrame(tick);
}
