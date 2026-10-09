import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../docs/design/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405).end(); return; }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4317');
    const path = await realpath(resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/preview.html' : url.pathname)));
    if (!path.startsWith(root + sep) || !types[extname(path)]) { response.writeHead(404).end(); return; }
    response.writeHead(200, {
      'Content-Type': types[extname(path)], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : await readFile(path));
  } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(4317, '127.0.0.1', () => console.log('Design preview: http://127.0.0.1:4317/ (development preview only; not an application backend)'));
