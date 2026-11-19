// Development static server for MARISOL BAY (Node 22+, standard library only).
// `node serve.ts` serves game/ at http://localhost:8080 (use --port N to change it) so the
// WebGL build can be played with no bundler and no network access beyond this machine.
// Requests are confined to game/: anything resolving outside it is refused.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const argv = process.argv.slice(2);
const flag = argv.indexOf('--port');
const candidate = flag === -1 ? 8080 : Number(argv[flag + 1]);
const port = Number.isInteger(candidate) && candidate > 0 && candidate < 65536 ? candidate : 8080;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const parsed = new URL(req.url ?? '/', 'http://localhost');
  let rel: string;
  try {
    rel = decodeURIComponent(parsed.pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';

  const file = resolve(join(gameRoot, normalize(rel)));
  if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  let bytes: number;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('not a file');
    bytes = info.size;
  } catch {
    res.writeHead(404).end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': bytes,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`serving game/ on http://localhost:${port}`);
});
