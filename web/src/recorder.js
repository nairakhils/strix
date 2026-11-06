export const KEYFRAME_SECONDS = 2;
export const QUANTIZER = 22;
export const BITS_PER_PIXEL = 0.1;
export const QUEUE_LIMIT = 6;

function codecFor(width, height) {
  return width * height > 1920 * 1088 ? 'avc1.640034' : 'avc1.640032';
}

function base64(parts) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob(parts));
  });
}

async function hexDigest(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeRecorder({ width, height, fps, frames, prepare, compose }) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: false });
  const base = { codec: codecFor(width, height), width, height, framerate: fps, latencyMode: 'quality', avc: { format: 'annexb' } };
  const quality = { ...base, bitrateMode: 'quantizer' };
  const steady = { ...base, bitrateMode: 'variable', bitrate: Math.round(BITS_PER_PIXEL * width * height * fps) };
  const supported = async (config) => (await VideoEncoder.isConfigSupported(config)).supported;
  const config = (await supported(quality)) ? quality : steady;
  if (!(await supported(config))) throw new Error(`this browser cannot encode ${base.codec} at ${width}x${height}`);
  const extra = config === quality ? { avc: { quantizer: QUANTIZER } } : {};
  let parts = [];
  let failure = null;
  let opened = false;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      parts.push(bytes);
    },
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure(config);

  async function paint(j, labelled = true) {
    if (prepare) await prepare(j);
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    compose(context, j, labelled);
  }

  function drained() {
    return new Promise((resolve) => {
      encoder.addEventListener('dequeue', resolve, { once: true });
    });
  }

  async function drain() {
    const done = parts;
    parts = [];
    return base64(done);
  }

  async function finish() {
    if (encoder.state === 'configured') {
      await encoder.flush();
      encoder.close();
    }
    if (failure) throw failure;
    return drain();
  }

  async function encode(first, count) {
    for (let j = first; j < first + count; j += 1) {
      await paint(j);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((j * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: !opened || j % (KEYFRAME_SECONDS * fps) === 0, ...extra });
      opened = true;
      frame.close();
      while (encoder.encodeQueueSize > QUEUE_LIMIT) await drained();
      if (failure) throw failure;
    }
    if (first + count >= frames) return finish();
    if (failure) throw failure;
    return drain();
  }

  async function hash(j) {
    await paint(j);
    return hexDigest(context.getImageData(0, 0, width, height).data);
  }

  async function level(j) {
    await paint(j, false);
    const { data } = context.getImageData(0, 0, width, height);
    let sum = 0;
    for (let k = 0; k < data.length; k += 4) sum += data[k] + data[k + 1] + data[k + 2];
    return sum / (3 * 255 * width * height);
  }

  return { info: { width, height, fps, frames, codec: config.codec, mode: config.bitrateMode }, encode, finish, hash, level };
}
