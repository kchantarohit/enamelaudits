// Local dev server that mimics Vercel: serves ./public and routes /api/<name> to ./api/<name>.js
// Usage: npm run dev   (reads .env if present)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };

async function toRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/\/$/, '');
      if (!/^[a-z0-9-]+$/.test(name)) { res.writeHead(404); return res.end('Not found'); }
      const mod = await import(pathToFileURL(join(root, 'api', `${name}.js`)).href).catch(() => null);
      const handler = mod?.[req.method];
      if (!handler) { res.writeHead(mod ? 405 : 404); return res.end(mod ? 'Method not allowed' : 'Not found'); }
      return send(res, await handler(await toRequest(req)));
    }
    let file = normalize(join(root, 'public', decodeURIComponent(url.pathname)));
    if (!file.startsWith(join(root, 'public'))) { res.writeHead(403); return res.end(); }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end('Server error');
  }
}).listen(PORT, () => console.log(`Enamel Audits dev server: http://localhost:${PORT}`));
