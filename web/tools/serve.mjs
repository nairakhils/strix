import http from 'node:http';
import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const webDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.strix': 'application/octet-stream',
  '.f16': 'application/octet-stream',
};

const FIELDS = '/scene.fields/';

function inside(folder, name) {
  const root = path.resolve(folder);
  const file = path.resolve(root, `.${name}`);
  return file.startsWith(root + path.sep) ? file : null;
}

function locate(url, scene) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname === '/scene.strix') return scene;
  if (pathname.startsWith(FIELDS)) return inside(scene.replace(/\.strix$/, '.fields'), pathname.slice(FIELDS.length - 1));
  return inside(webDir, pathname === '/' ? '/index.html' : pathname);
}

async function respond(request, response, scene) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  const file = locate(request.url, scene);
  const info = file && (await stat(file).catch(() => null));
  if (!info?.isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(file)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).on('error', () => response.destroy()).pipe(response);
}

export function serve({ scene, port = 0 }) {
  const server = http.createServer((request, response) => {
    respond(request, response, scene);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export function stop(server) {
  server.close();
  server.closeAllConnections();
}

export function addressOf(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function isMain() {
  return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const { values } = parseArgs({ options: { scene: { type: 'string' }, port: { type: 'string', default: '0' } } });
  if (!values.scene) throw new Error('missing --scene');
  const server = await serve({ scene: path.resolve(values.scene), port: Number(values.port) });
  console.log(addressOf(server));
}
