// Shorts Atölyesi ara sunucusu (Cloudflare Worker).
// Tarayıcıdan doğrudan çağrılamayan API'lere (CORS) istekleri iletir.
// Kullanım: https://<worker-adınız>.workers.dev/<tam API adresi>
// Anahtarlar burada saklanmaz; uygulamanın gönderdiği başlıklar olduğu gibi iletilir.

// Sadece bu sitelerden gelen isteklere izin verilir. Kendi adresiniz farklıysa ekleyin.
const ALLOWED_ORIGINS = ['https://emreugurluhr.github.io', 'http://localhost:5000', 'http://127.0.0.1:5000'];

// Sadece bu servislere iletilir (açık proxy olmasın diye).
const ALLOWED_HOSTS = [
  'opencode.ai',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.elevenlabs.io',
];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
      'Access-Control-Expose-Headers': '*',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowed) return new Response('Bu site için izin yok.', { status: 403, headers: cors });

    const url = new URL(request.url);
    // "https://" bazen yolda "https:/" olarak gelir; düzelt
    const raw = (url.pathname.slice(1) + url.search).replace(/^(https?):\/(?!\/)/, '$1://');
    let target;
    try {
      target = new URL(raw);
    } catch (_) {
      return new Response('Geçersiz adres. Kullanım: /<tam API adresi>', { status: 400, headers: cors });
    }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.includes(target.hostname)) {
      return new Response(`İzin verilmeyen adres: ${target.hostname}`, { status: 403, headers: cors });
    }

    const headers = new Headers(request.headers);
    for (const h of [...headers.keys()]) {
      if (h === 'origin' || h === 'referer' || h === 'host' || h.startsWith('cf-') || h.startsWith('x-forwarded') || h === 'x-real-ip') headers.delete(h);
    }
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
    const out = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
