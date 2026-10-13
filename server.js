// Shorts Atölyesi yerel sunucusu: uygulamayı http://localhost:5000 adresinde açar ve
// tarayıcıdan doğrudan çağrılamayan API'lere (CORS) istekleri bu bilgisayar üzerinden iletir.
// Kullanım: node server.js   (Node.js 18 ya da üstü; ek paket gerekmez)
// Port değiştirmek için: PORT=8080 node server.js

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 5000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Sadece bu servislere iletilir (açık proxy olmasın diye).
const ALLOWED_HOSTS = [
  'opencode.ai',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.elevenlabs.io',
  ...(process.env.PROXY_EXTRA_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean),
];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

// İstemciden gelip karşı tarafa iletilmeyecek başlıklar
const DROP_REQUEST = new Set(['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding', 'cookie', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest']);
// fetch yanıtı zaten açtığı için bu başlıklar artık doğru değil
const DROP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxy(req, res) {
  const raw = req.url.slice('/proxy/'.length).replace(/^(https?):\/(?!\/)/, '$1://');
  let target;
  try {
    target = new URL(raw);
  } catch (_) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Geçersiz adres.');
  }
  const local = target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname);
  if ((target.protocol !== 'https:' && !local) || !ALLOWED_HOSTS.includes(target.hostname)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(`İzin verilmeyen adres: ${target.hostname}`);
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!DROP_REQUEST.has(k)) headers[k] = v;
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req),
    });
    const out = {};
    upstream.headers.forEach((v, k) => {
      if (!DROP_RESPONSE.has(k)) out[k] = v;
    });
    res.writeHead(upstream.status, out);
    if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (e) {
    console.error('Ara sunucu hatası:', target.host, e.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: `Bu bilgisayardan ${target.host} adresine bağlanılamadı: ${e.cause?.code || e.message}` } }));
  }
}

function serveFile(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) || path.basename(file).startsWith('.')) {
    res.writeHead(404);
    return res.end('Bulunamadı');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadı');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/__shorts_proxy') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":true}');
  }
  if (req.url.startsWith('/proxy/')) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  serveFile(req, res);
});

// Sadece bu bilgisayardan erişilebilir (ağdaki başka cihazlar ara sunucuyu kullanamaz).
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Shorts Atölyesi hazır: http://localhost:${PORT}`);
  console.log('Kapatmak için Ctrl+C');
});
