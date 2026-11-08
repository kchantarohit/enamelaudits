// Tiny fixture web server used by the tests: two fake dental sites.
import http from 'node:http';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

export function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const [site, ...rest] = req.url.split('/').filter(Boolean);
    const path = '/' + rest.join('/');
    const good = site === 'good';
    // 'slow' site: home page is fine, but every other URL (robots, sitemap, links) hangs forever.
    if (site === 'slow' && path !== '/') return;
    if (path === '/') {
      const headers = { 'content-type': 'text/html' };
      if (good) Object.assign(headers, { 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'referrer-policy': 'strict-origin' });
      res.writeHead(200, headers);
      let html = read(good ? 'good-site.html' : 'bad-site.html');
      if (site === 'slow') html = html.replace('</body>', Array.from({ length: 12 }, (_, i) => `<a href="/hang-${i}">x${i}</a>`).join('') + '</body>');
      // make relative links site-scoped
      html = html.replace(/href="\/(?!\/)/g, `href="/${site}/`).replace(/src="\/(?!\/)/g, `src="/${site}/`);
      return res.end(html);
    }
    if (path === '/missing-page') { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });
  server.closeAllConnectionsOnClose = true;
  const close = server.close.bind(server);
  server.close = cb => { server.closeAllConnections?.(); return close(cb); };
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}
