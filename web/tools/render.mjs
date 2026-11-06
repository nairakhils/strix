import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { launch, openRecorder } from './browser.mjs';
import { addressOf, serve, stop } from './serve.mjs';

const BATCH = 120;

function readOptions() {
  const { values } = parseArgs({
    options: {
      scene: { type: 'string' },
      out: { type: 'string' },
      width: { type: 'string', default: '1920' },
      height: { type: 'string', default: '1080' },
    },
  });
  for (const name of ['scene', 'out']) {
    if (!values[name]) throw new Error(`missing --${name}`);
  }
  const width = Number(values.width);
  const height = Number(values.height);
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n % 2 === 0)) {
    throw new Error('--width and --height must be positive even integers');
  }
  return {
    scene: path.resolve(values.scene),
    out: path.resolve(values.out),
    width,
    height,
  };
}

function encoderFor(out, fps) {
  const ffmpeg = spawn(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'h264', '-r', String(fps), '-i', 'pipe:0', '-c', 'copy', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const finished = new Promise((resolve, reject) => {
    ffmpeg.on('error', (error) => reject(new Error(`ffmpeg: ${error.message}`)));
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  const write = (bytes) => new Promise((resolve) => {
    if (ffmpeg.stdin.write(bytes)) resolve();
    else ffmpeg.stdin.once('drain', resolve);
  });
  const close = () => {
    ffmpeg.stdin.end();
    return finished;
  };
  return { write, close };
}

function progress(done, total, started) {
  if (!process.stderr.isTTY) return;
  const rate = done / ((performance.now() - started) / 1000);
  process.stderr.write(`\rframe ${done} / ${total}  (${rate.toFixed(0)} fps)`);
  if (done === total) process.stderr.write('\n');
}

async function main() {
  const options = readOptions();
  const server = await serve({ scene: options.scene });
  const browser = await launch();
  try {
    const { page, guard, info } = await openRecorder(browser, addressOf(server), options);
    const encoder = encoderFor(options.out, info.fps);
    const started = performance.now();
    for (let first = 0; first < info.frames; first += BATCH) {
      const count = Math.min(BATCH, info.frames - first);
      const data = await guard(page.evaluate(([f, c]) => window.strix.encode(f, c), [first, count]));
      await encoder.write(Buffer.from(data, 'base64'));
      progress(first + count, info.frames, started);
    }
    await encoder.close();
    const seconds = (performance.now() - started) / 1000;
    console.log(`${options.out}: ${info.frames} frames in ${seconds.toFixed(1)} s`);
  } finally {
    stop(server);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);
