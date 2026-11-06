const decoder = new TextDecoder();

export const FORMAT = 'strix';
export const VERSION = 2;
export const SAMPLE_RATE = 50;
const ALIGNMENT = 8;

const aligned = (size) => Math.ceil(size / ALIGNMENT) * ALIGNMENT;

export function parseScene(buffer) {
  const length = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(decoder.decode(new Uint8Array(buffer, 4, length)));
  if (header.format !== FORMAT || header.version !== VERSION) {
    throw new Error(`not a ${FORMAT} ${VERSION} file: ${header.format} ${header.version}`);
  }
  if (!(header.rate > 0)) throw new Error(`samples must play at a positive rate, not ${header.rate}`);
  const start = aligned(4 + length);
  const columns = Object.fromEntries(
    header.columns.map((column) => [column.name, new Float64Array(buffer, start + column.offset, header.samples)]),
  );
  const assets = Object.fromEntries(
    header.assets.map(({ name, type, offset, length: size }) => [
      name,
      new Blob([new Uint8Array(buffer, start + offset, size)], { type }),
    ]),
  );
  return { header, samples: header.samples, columns, assets };
}

export async function loadField(scene, sample, level) {
  const response = await fetch(new URL(`${sample}_${level}.f16`, scene.folder));
  if (!response.ok) throw new Error(`field ${sample}_${level}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

export async function loadScene(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const scene = parseScene(await response.arrayBuffer());
  const address = new URL(url, location.href);
  return { ...scene, folder: new URL(address.pathname.replace(/\.strix$/, '.fields/'), address) };
}
