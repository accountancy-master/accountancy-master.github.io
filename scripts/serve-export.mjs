// Serves a static export the way GitHub Pages does (paths, 404 page and cache headers), with no dependencies:
//   node scripts/serve-export.mjs <folder> <port>
// A path is answered by the file of that name, else <path>.html, else <path>/index.html, else 404.html with
// status 404. The browser tests run against this, so what they prove holds for the deployed files.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 3100);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const isFile = (file) => existsSync(file) && statSync(file).isFile();

/** The file that answers a URL path, or null when there is none. Never outside the root. */
function resolve(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const base = path.join(root, clean);
  if (!base.startsWith(root)) return null;
  for (const candidate of [base, `${base}.html`, path.join(base, 'index.html')]) {
    if (isFile(candidate)) return candidate;
  }
  // A build made on Windows writes the router's prefetch files into nested folders (`__next.play/$d$levelId/
  // __PAGE__.txt`) although the browser asks for the dotted name (`__next.play.$d$levelId.__PAGE__.txt`): Next.js
  // only replaces forward slashes when it names them. A build made on Linux, which is what gets deployed, has the
  // dotted names, so this is only for testing an export on Windows.
  const name = path.basename(base);
  if (name.startsWith('__next.') && name.endsWith('.txt')) {
    const [first, ...rest] = name.slice('__next.'.length, -'.txt'.length).split('.');
    const nested = path.join(path.dirname(base), `__next.${first}`, ...rest) + '.txt';
    if (rest.length > 0 && isFile(nested)) return nested;
  }
  return null;
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  let file = resolve(pathname);
  let status = 200;
  if (!file) {
    file = path.join(root, '404.html');
    status = 404;
  }
  // As GitHub Pages does: every file may be kept ten minutes, and carries an ETag so a browser can ask whether it
  // changed (a 304 answers "no" without sending it again). The app's worker must ask, or a deploy shows late.
  const { size, mtimeMs } = statSync(file);
  const etag = `"${Math.floor(mtimeMs).toString(16)}-${size.toString(16)}"`;
  const headers = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: etag };
  if (status === 200 && req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(status, headers);
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
