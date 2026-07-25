/**
 * Local-only preview server.
 *
 * Serves this static landing page and proxies the public, read-only Health OS
 * doctor API so local previews use the same approved data as production.
 * This is not used by the deployed site.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4174);
const apiOrigin = 'https://vyasa-os-backend.onrender.com';
const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/vyasa-api/')) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const upstream = await fetch(`${apiOrigin}${url.pathname.slice('/vyasa-api'.length)}${url.search}`, {
        method: req.method,
        headers: { 'content-type': req.headers['content-type'] || 'application/json' },
        body: body.length ? body : undefined,
      });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8' });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'The public doctor directory is temporarily unavailable.' }));
    }
    return;
  }

  const localRoutes = { '/doctors': '/doctors.html', '/labs': '/labs.html', '/pharmacy': '/pharmacy.html', '/resources': '/resources.html' };
  const pathname = url.pathname === '/' ? '/index.html' : (localRoutes[url.pathname] || url.pathname);
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Vyasa local preview: http://127.0.0.1:${port}`);
});
