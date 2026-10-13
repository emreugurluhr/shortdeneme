// Sahne dekorları: konuya özel hareketli arka planlar ve "manzara" öğeleri.
// BACKGROUNDS[name](ctx, t, theme) tüm tuvali (1080x1920, dönüşümsüz) boyar.
// DRAWERS[type](ctx, el, env, p) motorun öğe sözleşmesine uyar: ctx öğenin
// merkezine taşınmıştır, p = { lt, inRaw, until }.
// Her şey belirlenimcidir (Math.random yok): aynı t her zaman aynı kareyi verir.

const W = 1080;
const H = 1920;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- yardımcılar
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
// Hızlı, tohumlu sözde rastgele (yalnızca önbelleğe alınan statik katmanlar için).
function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i + seed * 17.31), b = hash(i + 1 + seed * 17.31);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
function fbm(x, seed, oct = 5) {
  let s = 0, amp = 0.5, fr = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    s += amp * vnoise(x * fr, seed + o * 7.13);
    tot += amp;
    amp *= 0.5;
    fr *= 2.03;
  }
  return s / tot;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ---- renkler: '#hex', rgb()/rgba(), adlı renkler ve tema anahtarları
let normCtx = null;
const RGB = new Map();
function parseRGB(s) {
  s = String(s).trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) return [parts[0], parts[1], parts[2], parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1];
  }
  return null;
}
function rgbOf(c) {
  if (Array.isArray(c)) return c;
  const key = String(c);
  let v = RGB.get(key);
  if (v) return v;
  v = parseRGB(key);
  if (!v) {
    try {
      if (!normCtx) normCtx = makeCanvas(1, 1).getContext('2d');
      normCtx.fillStyle = '#ffffff';
      normCtx.fillStyle = key;
      v = parseRGB(normCtx.fillStyle);
    } catch (_) { /* yok say */ }
    v = v || [255, 255, 255, 1];
  }
  RGB.set(key, v);
  return v;
}
// css(renk, alfa) -> 'rgba(...)'
function css(c, a = 1) {
  const [r, g, b, ca] = rgbOf(c);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+(clamp(a * ca)).toFixed(4)})`;
}
function mix(c1, c2, k) {
  const a = rgbOf(c1), b = rgbOf(c2);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
}
const lighten = (c, k) => mix(c, '#ffffff', k);
const darken = (c, k) => mix(c, '#000000', k);
function col(v, theme, d) {
  if (!v || v === true) return d;
  if (v === 'accent') return theme.accent;
  if (v === 'accent2') return theme.accent2;
  if (v === 'text') return theme.text;
  if (v === 'bg') return theme.bg;
  if (v === 'bg2') return theme.bg2;
  return v;
}

// ---- katman önbelleği (tema + ad başına bir kez çizilir)
const LAYERS = new Map();
function layer(key, w, h, paint) {
  let c = LAYERS.get(key);
  if (c) {
    LAYERS.delete(key);
    LAYERS.set(key, c);
    return c;
  }
  c = makeCanvas(w, h);
  const g = c.getContext('2d');
  paint(g, w, h);
  LAYERS.set(key, c);
  while (LAYERS.size > 12) LAYERS.delete(LAYERS.keys().next().value);
  return c;
}
const tkey = (th) => [th.bg, th.bg2, th.accent, th.accent2, th.grid].join('|');
const fontsReady = () => (typeof document !== 'undefined' && document.fonts && document.fonts.status === 'loaded' ? 1 : 0);

// Yumuşak ışık lekesi (radyal gradyan) – drawImage ile ucuzca kullanılır.
function glowSprite(c = '#ffffff') {
  const key = 'spr|' + c;
  return layer(key, 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, css(c, 1));
    gr.addColorStop(0.18, css(c, 0.55));
    gr.addColorStop(0.45, css(c, 0.14));
    gr.addColorStop(1, css(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
// Kırınım haçlı parlak yıldız.
function flareSprite() {
  return layer('flare', 128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.15, 'rgba(225,235,255,0.6)');
    gr.addColorStop(1, 'rgba(160,190,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const line = (x0, y0, x1, y1) => {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(200,220,255,0)');
      lg.addColorStop(0.5, 'rgba(235,242,255,0.85)');
      lg.addColorStop(1, 'rgba(200,220,255,0)');
      g.strokeStyle = lg;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };
    line(4, 64, 124, 64);
    line(64, 4, 64, 124);
  });
}

function paintVignette(g, strength, cx = W / 2, cy = H / 2, tint = '#000000') {
  const v = g.createRadialGradient(cx, cy, H * 0.28, cx, cy, H * 0.74);
  v.addColorStop(0, css(tint, 0));
  v.addColorStop(1, css(tint, strength));
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}
// Altyazı bandını (y≈1300-1500) hafifçe koyulaştırır.
function paintCaptionShade(g, a, top = 1150, bottom = 1680) {
  const lg = g.createLinearGradient(0, top, 0, bottom);
  lg.addColorStop(0, 'rgba(0,0,0,0)');
  lg.addColorStop(0.3, `rgba(0,0,0,${a})`);
  lg.addColorStop(0.7, `rgba(0,0,0,${a})`);
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg;
  g.fillRect(0, top, W, bottom - top);
}
function paintStars(g, n, seed, opts = {}) {
  const r = rng(seed);
  const y0 = opts.y0 ?? 0, y1 = opts.y1 ?? H;
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    let y = y0 + r() * (y1 - y0);
    if (opts.bias) y = y0 + Math.pow(r(), opts.bias) * (y1 - y0);
    const b = r();
    const size = b > 0.992 ? 2.4 : b > 0.93 ? 1.7 : b > 0.6 ? 1.2 : 0.9;
    const fade = opts.fade ? opts.fade(y) : 1;
    const a = (0.18 + 0.7 * Math.pow(r(), 2)) * fade;
    const tint = r();
    const c = tint < 0.14 ? [255, 214, 170] : tint < 0.36 ? [175, 200, 255] : [255, 255, 255];
    g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
    if (size > 1.5) {
      g.beginPath();
      g.arc(x, y, size * 0.75, 0, TAU);
      g.fill();
    } else g.fillRect(x, y, size, size);
  }
}

// ================================================================= ARKA PLANLAR

// ---- grid: mevcut lacivert ızgara (varsayılan)
function bgGrid(ctx, t, theme) {
  const base = layer('grid|' + tkey(theme), W, H, (g) => {
    const gr = g.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.5, H * 0.75);
    gr.addColorStop(0, theme.bg2);
    gr.addColorStop(1, theme.bg);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  });
  const vig = layer('grid-vig', W, H, (g) => paintVignette(g, 0.55));
  ctx.save();
  ctx.drawImage(base, 0, 0);
  const step = 72;
  const off = (t * 6) % step;
  ctx.strokeStyle = theme.grid || 'rgba(140,170,255,0.07)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = -step + off; x < W + step; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = -step + off; y < H + step; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.drawImage(vig, 0, 0);
  ctx.restore();
}

// ---- space: derin yıldız alanı + bulutsu
function paintSpace(g, theme) {
  const deep = mix(theme.bg, '#03040b', 0.7);
  const lg = g.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, css(darken(deep, 0.15)));
  lg.addColorStop(0.42, css(mix(theme.bg2, '#0b0d22', 0.62)));
  lg.addColorStop(0.75, css(mix(theme.bg, '#070918', 0.55)));
  lg.addColorStop(1, css(darken(deep, 0.35)));
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);

  // bulutsu: küçük tuvalde çizilip büyütülür (yumuşak, ucuz)
  const sw = 216, sh = 384;
  const n = makeCanvas(sw, sh);
  const ng = n.getContext('2d');
  ng.globalCompositeOperation = 'lighter';
  const hues = [theme.bg2, '#5b3fd6', theme.accent2, '#2a7fd8', theme.accent, '#7a2f9a'];
  const r = rng(7);
  const blob = (x, y, rad, c, a) => {
    const gr = ng.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, css(c, a));
    gr.addColorStop(0.45, css(c, a * 0.45));
    gr.addColorStop(1, css(c, 0));
    ng.fillStyle = gr;
    ng.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  // çapraz bir "samanyolu" bandı: sol üstten sağ ortaya
  for (let i = 0; i < 80; i++) {
    const s = r();
    const x = lerp(-0.15, 1.15, s) * sw + (r() - 0.5) * 30;
    const y = lerp(0.04, 0.6, s) * sh + (r() - 0.5) * 70;
    const hue = hues[Math.floor(r() * hues.length)];
    const weight = hue === theme.accent ? 0.5 : hue === theme.accent2 ? 0.6 : 1;
    blob(x, y, lerp(10, 48, r()), hue, lerp(0.04, 0.13, r()) * weight);
  }
  // alt köşede ikinci, sönük bulut
  for (let i = 0; i < 26; i++) {
    const x = lerp(0.55, 1.1, r()) * sw, y = lerp(0.8, 1.02, r()) * sh;
    blob(x, y, lerp(12, 40, r()), hues[i % 3 === 0 ? 3 : 1], lerp(0.03, 0.08, r()));
  }
  // toz şeritleri
  ng.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 24; i++) {
    const s = r();
    const x = lerp(-0.1, 1.1, s) * sw + (r() - 0.5) * 20;
    const y = lerp(0.06, 0.58, s) * sh + (r() - 0.5) * 30;
    const rad = lerp(5, 18, r());
    const gr = ng.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ng.fillStyle = gr;
    ng.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(n, 0, 0, W, H);

  paintStars(g, 1500, 11);
  // bandın içinde daha yoğun, sönük yıldız tozu
  const r2 = rng(13);
  for (let i = 0; i < 900; i++) {
    const s = r2();
    const x = lerp(-0.15, 1.15, s) * W + (r2() - 0.5) * 260;
    const y = lerp(0.04, 0.6, s) * H + (r2() - 0.5) * 360;
    g.fillStyle = `rgba(230,225,255,${(0.08 + 0.3 * r2() * r2()).toFixed(3)})`;
    g.fillRect(x, y, 1, 1);
  }
  paintCaptionShade(g, 0.22);
  paintVignette(g, 0.72);
}
function bgSpace(ctx, t, theme) {
  const base = layer('space|' + tkey(theme), W, H, (g) => paintSpace(g, theme));
  ctx.save();
  ctx.drawImage(base, 0, 0);
  // ışıldayan yıldızlar
  const spr = glowSprite('#e8eeff');
  for (let i = 0; i < 70; i++) {
    const x = hash(i * 4.13 + 0.5) * W, y = hash(i * 7.31 + 0.2) * H;
    const band = y > 1240 && y < 1560 ? 0.45 : 1;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.7 + hash(i) * 2.4) + i * 1.7);
    const a = (0.2 + 0.8 * tw) * (0.35 + 0.65 * hash(i * 2.9)) * band;
    const s = (8 + hash(i * 6.1) * 16) * (0.75 + 0.25 * tw);
    ctx.globalAlpha = a;
    ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
  }
  // birkaç parlak, haçlı yıldız
  const fl = flareSprite();
  for (let i = 0; i < 7; i++) {
    const x = 60 + hash(i * 9.7 + 3) * (W - 120), y = 80 + hash(i * 5.3 + 1) * 1100;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.5 + hash(i * 3.3)) + i * 2.1);
    const s = (46 + hash(i * 1.9) * 54) * (0.8 + 0.2 * tw);
    ctx.globalAlpha = 0.45 + 0.45 * tw;
    ctx.drawImage(fl, x - s / 2, y - s / 2, s, s);
  }
  // ara sıra kayan yıldız
  const period = 9, k = Math.floor(t / period), lt = t - k * period;
  if (lt < 0.8 && hash(k * 3.7) > 0.25) {
    const sx = 100 + hash(k * 1.1) * 700, sy = 80 + hash(k * 2.3) * 520;
    const ang = 0.35 + hash(k * 4.4) * 0.4;
    const prog = lt / 0.8, len = 220;
    const hx = sx + Math.cos(ang) * prog * 520, hy = sy + Math.sin(ang) * prog * 520;
    const lg = ctx.createLinearGradient(hx, hy, hx - Math.cos(ang) * len, hy - Math.sin(ang) * len);
    lg.addColorStop(0, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(180,200,255,0)');
    ctx.globalAlpha = Math.sin(prog * Math.PI) * 0.8;
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - Math.cos(ang) * len, hy - Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

// ================================================================= SİLÜET GEOMETRİSİ
// Tüm şekiller saat yönünde eklenir; tek Path2D 'nonzero' ile birleşir.
function pRect(p, x, y, w, h) { p.rect(x, y, w, h); }
function pDome(p, cx, by, rx, ry) {
  p.moveTo(cx - rx, by);
  p.ellipse(cx, by, rx, ry, 0, Math.PI, 0);
  p.closePath();
}
function pSpire(p, cx, by, w, h) {
  p.moveTo(cx - w / 2, by);
  p.lineTo(cx, by - h);
  p.lineTo(cx + w / 2, by);
  p.closePath();
}
function pBall(p, cx, cy, r) {
  p.moveTo(cx + r, cy);
  p.arc(cx, cy, r, 0, TAU);
}
function pMinaret(p, x, by, hgt, wd) {
  pRect(p, x - wd * 0.8, by - hgt * 0.1, wd * 1.6, hgt * 0.1);
  pRect(p, x - wd / 2, by - hgt * 0.84, wd, hgt * 0.84);
  pRect(p, x - wd * 1.0, by - hgt * 0.6, wd * 2.0, hgt * 0.022);
  pSpire(p, x, by - hgt * 0.578, wd * 2.0, -hgt * 0.03); // şerefe altı (ters koni)
  pRect(p, x - wd * 0.92, by - hgt * 0.78, wd * 1.84, hgt * 0.02);
  pRect(p, x - wd * 0.38, by - hgt * 0.88, wd * 0.76, hgt * 0.05);
  pSpire(p, x, by - hgt * 0.87, wd * 0.95, hgt * 0.17);
  pRect(p, x - 0.7, by - hgt * 1.08, 1.4, hgt * 0.05);
}
// Osmanlı camisi silüeti; s ölçeği ≈ ana kubbenin yarıçapının 2.5 katı.
function pMosque(p, cx, by, s, minarets = 2, wins = null) {
  pRect(p, cx - s, by - 0.3 * s, 2 * s, 0.3 * s);
  pDome(p, cx - 0.84 * s, by - 0.3 * s, 0.13 * s, 0.11 * s);
  pDome(p, cx + 0.84 * s, by - 0.3 * s, 0.13 * s, 0.11 * s);
  pRect(p, cx - 0.68 * s, by - 0.58 * s, 1.36 * s, 0.29 * s);
  pDome(p, cx - 0.52 * s, by - 0.58 * s, 0.25 * s, 0.19 * s);
  pDome(p, cx + 0.52 * s, by - 0.58 * s, 0.25 * s, 0.19 * s);
  for (const d of [-1, 1]) {
    pRect(p, cx + d * 0.43 * s - 0.035 * s, by - 0.8 * s, 0.07 * s, 0.22 * s);
    pSpire(p, cx + d * 0.43 * s, by - 0.8 * s, 0.085 * s, 0.09 * s);
  }
  pRect(p, cx - 0.36 * s, by - 0.73 * s, 0.72 * s, 0.16 * s);
  pDome(p, cx, by - 0.73 * s, 0.4 * s, 0.36 * s);
  pRect(p, cx - 0.012 * s, by - 1.2 * s, 0.024 * s, 0.12 * s);
  pBall(p, cx, by - 1.17 * s, 0.022 * s);
  const mh = 1.62 * s, mw = Math.max(3, 0.07 * s);
  pMinaret(p, cx - 1.16 * s, by, mh, mw);
  pMinaret(p, cx + 1.16 * s, by, mh, mw);
  if (minarets >= 4) {
    pMinaret(p, cx - 1.42 * s, by, mh * 0.82, mw);
    pMinaret(p, cx + 1.42 * s, by, mh * 0.82, mw);
  }
  if (wins) {
    for (let k = -6; k <= 6; k++) {
      if (k === 0) continue;
      wins.push({ x: cx + k * 0.135 * s - 0.022 * s, y: by - 0.22 * s, w: 0.044 * s, h: 0.09 * s, arch: true });
    }
    for (let k = -4; k <= 4; k++) wins.push({ x: cx + k * 0.13 * s - 0.02 * s, y: by - 0.5 * s, w: 0.04 * s, h: 0.08 * s, arch: true });
    for (let k = -3; k <= 3; k++) wins.push({ x: cx + k * 0.1 * s - 0.016 * s, y: by - 0.7 * s, w: 0.032 * s, h: 0.06 * s, arch: true });
  }
}
// Galata Kulesi benzeri taş kule.
function pTower(p, cx, by, s, wins = null) {
  p.moveTo(cx - 0.18 * s, by);
  p.lineTo(cx - 0.155 * s, by - 1.25 * s);
  p.lineTo(cx + 0.155 * s, by - 1.25 * s);
  p.lineTo(cx + 0.18 * s, by);
  p.closePath();
  pRect(p, cx - 0.21 * s, by - 1.275 * s, 0.42 * s, 0.03 * s);
  pRect(p, cx - 0.155 * s, by - 1.42 * s, 0.31 * s, 0.15 * s);
  pRect(p, cx - 0.175 * s, by - 1.445 * s, 0.35 * s, 0.028 * s);
  pSpire(p, cx, by - 1.44 * s, 0.35 * s, 0.4 * s);
  pRect(p, cx - 0.007 * s, by - 1.92 * s, 0.014 * s, 0.1 * s);
  if (wins) {
    for (let k = 0; k < 4; k++) wins.push({ x: cx + (k - 1.5) * 0.072 * s - 0.022 * s, y: by - 1.405 * s, w: 0.044 * s, h: 0.1 * s, arch: true, bright: true });
    for (const f of [0.35, 0.65, 0.95]) {
      wins.push({ x: cx - 0.07 * s, y: by - f * s, w: 0.026 * s, h: 0.07 * s, arch: true });
      wins.push({ x: cx + 0.044 * s, y: by - f * s, w: 0.026 * s, h: 0.07 * s, arch: true });
    }
  }
}
function pBuilding(p, x, by, w, h, r, wins, opts = {}) {
  pRect(p, x, by - h, w, h);
  const roof = r();
  if (roof < 0.22) pSpire(p, x + w / 2, by - h, w * 1.02, Math.min(w * 0.35, 26));
  else if (roof < 0.3 && w > 26) pDome(p, x + w / 2, by - h, w * 0.32, w * 0.28);
  else if (roof < 0.4) pRect(p, x + w * (0.2 + r() * 0.5), by - h - 18, 2, 18);
  else if (roof < 0.55) pRect(p, x + w * 0.15, by - h - 8, w * 0.35, 8);
  if (!wins) return;
  const cw = opts.win || 13;
  const cols = Math.max(1, Math.floor((w - 6) / cw)), rows = Math.max(1, Math.floor((h - 10) / (cw * 1.35)));
  const ox = x + (w - cols * cw) / 2 + cw * 0.28;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (r() > (opts.lit ?? 0.3)) continue;
      wins.push({ x: ox + i * cw, y: by - h + 8 + j * cw * 1.35, w: cw * 0.44, h: cw * 0.6 });
    }
  }
}
// Genel şehir silüeti; landmarks: [{kind:'mosque'|'tower', x:0..1, s}]
function buildSkyline(seed, w, h, landmarks, opts = {}) {
  const p = new Path2D(), marks = new Path2D();
  const wins = [], r = rng(seed);
  const near = (x) => landmarks.reduce((m, l) => Math.min(m, Math.abs(x - l.x * w) / (l.s * 1.6)), 9);
  let x = -12;
  const hmax = opts.hmax ?? 0.42;
  while (x < w + 12) {
    const bw = lerp(24, 74, r()) * (opts.scale || 1);
    const env = 0.55 + 0.45 * fbm(x / w * 3, seed);
    let bh = lerp(0.1, hmax, r() * env) * h;
    const d = near(x + bw / 2);
    if (d < 1.2) bh *= lerp(0.35, 1, clamp(d / 1.2));
    pBuilding(p, x, h, bw, Math.max(10, bh), r, opts.windows === false ? null : wins, opts);
    x += bw + (r() < 0.25 ? r() * 8 : -2);
  }
  landmarks.forEach((l) => {
    const target = opts.windows === false ? null : wins;
    if (l.kind === 'mosque') {
      pMosque(p, l.x * w, h, l.s, l.minarets || 2, target);
      pMosque(marks, l.x * w, h, l.s, l.minarets || 2);
    } else if (l.kind === 'tower') {
      pTower(p, l.x * w, h, l.s, target);
      pTower(marks, l.x * w, h, l.s);
    }
  });
  return { path: p, marks, windows: wins, lamps: [] };
}
// Alçak kemerli köprü (Galata Köprüsü esinli): güverte, kemerler, fenerler, orta kuleler.
function buildBridge(seed, w, h, opts = {}) {
  const p = new Path2D(), wins = [], lamps = [];
  const deckTop = h * 0.56, deckH = h * 0.1, water = h;
  const spans = Math.max(3, Math.round(w / (h * 1.15)));
  const pier = Math.max(6, w * 0.022);
  const spanW = (w - pier * (spans + 1)) / spans;
  const archH = (water - deckTop - deckH) * 0.82;
  // güverte + kemerler tek kontur
  p.moveTo(0, deckTop);
  p.lineTo(w, deckTop);
  p.lineTo(w, water);
  let xr = w - pier;
  p.lineTo(xr, water);
  for (let i = 0; i < spans; i++) {
    const xl = xr - spanW;
    p.ellipse((xl + xr) / 2, water, spanW / 2, archH, 0, 0, Math.PI, true);
    xr = xl - pier;
    p.lineTo(Math.max(0, xr), water);
  }
  p.lineTo(0, water);
  p.closePath();
  // korkuluk
  const railY = deckTop - h * 0.075;
  pRect(p, 0, railY, w, Math.max(2, h * 0.014));
  for (let x = 4; x < w; x += Math.max(9, h * 0.05)) pRect(p, x, railY, 1.6, deckTop - railY);
  // orta kuleler (açılır bölüm)
  if (opts.towers !== false && w > h * 2.4) {
    for (const f of [0.43, 0.57]) {
      const tw = h * 0.16, tx = w * f - tw / 2, th = h * 0.42;
      pRect(p, tx, deckTop - th, tw, th);
      pSpire(p, w * f, deckTop - th, tw * 1.15, h * 0.1);
      for (let j = 0; j < 2; j++) wins.push({ x: tx + tw * 0.22, y: deckTop - th + h * 0.07 + j * h * 0.12, w: tw * 0.2, h: h * 0.07 });
      for (let j = 0; j < 2; j++) wins.push({ x: tx + tw * 0.58, y: deckTop - th + h * 0.07 + j * h * 0.12, w: tw * 0.2, h: h * 0.07 });
    }
  }
  // fener direkleri
  const step = Math.max(50, h * 0.55);
  for (let x = step / 2; x < w; x += step) {
    if (opts.towers !== false && w > h * 2.4 && (Math.abs(x - w * 0.43) < h * 0.14 || Math.abs(x - w * 0.57) < h * 0.14)) continue;
    const top = deckTop - h * 0.34;
    pRect(p, x - 1.4, top, 2.8, deckTop - top);
    pRect(p, x - 5, top - 2, 10, 3);
    lamps.push({ x, y: top + 3 });
  }
  return { path: p, windows: wins, lamps };
}
// Katmanlı dağ sırtları (ön plan en koyu).
function buildMountains(seed, w, h, layers = 3) {
  const out = [];
  for (let k = 0; k < layers; k++) {
    const p = new Path2D();
    const top = h * (0.02 + 0.24 * k), amp = h * (0.5 - 0.1 * k);
    p.moveTo(0, h);
    for (let x = 0; x <= w + 4; x += 5) {
      const n = fbm((x / w) * (2.4 + k * 1.3), seed + k * 3.3, 6);
      const ridge = 1 - Math.abs(2 * n - 1);
      const y = top + (1 - Math.pow(ridge, 1.6)) * amp;
      p.lineTo(Math.min(x, w), y);
    }
    p.lineTo(w, h);
    p.closePath();
    out.push(p);
  }
  return out;
}

// ---- city-night
const CITY = { horizon: 1640, farH: 440 };
let cityGeoCache = null;
function cityGeo() {
  if (cityGeoCache) return cityGeoCache;
  const far = buildSkyline(41, W, CITY.farH, [
    { kind: 'mosque', x: 0.27, s: 150, minarets: 4 },
    { kind: 'mosque', x: 0.66, s: 96 },
    { kind: 'tower', x: 0.9, s: 140 },
  ], { hmax: 0.24, win: 11, lit: 0.22, scale: 0.9 });
  const bridge = buildBridge(5, W + 120, 124);
  cityGeoCache = { far, bridge, farY: CITY.horizon - CITY.farH, bridgeX: -60, bridgeY: 1786 - 124 };
  return cityGeoCache;
}
function paintCity(g, theme) {
  const hz = CITY.horizon;
  const geo = cityGeo();
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, css(mix(theme.bg, '#02030a', 0.65)));
  sky.addColorStop(0.5, css(mix(theme.bg, '#0a1230', 0.5)));
  sky.addColorStop(0.82, css(mix(theme.bg2, '#1d1b44', 0.55)));
  sky.addColorStop(1, css(mix(theme.bg2, '#4a2e5a', 0.55)));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, hz + 2);
  // şehir ışığı pusu
  g.save();
  g.translate(W / 2, hz);
  g.scale(1, 0.32);
  const haze = g.createRadialGradient(0, 0, 0, 0, 0, W * 0.9);
  haze.addColorStop(0, css(mix(theme.accent2, '#ff9a4a', 0.4), 0.32));
  haze.addColorStop(0.5, css(mix(theme.accent2, '#ff7a5a', 0.5), 0.1));
  haze.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = haze;
  g.fillRect(-W, -W, W * 2, W * 2);
  g.restore();
  paintStars(g, 420, 23, { y0: 0, y1: 1150, fade: (y) => 1 - y / 1250 });
  // ay: başlıkların oturduğu y 200–360 şeridinin üstünde, sağ köşede küçük durur
  const mx = 880, my = 132, mr = 30;
  const mg = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 6);
  mg.addColorStop(0, 'rgba(255,240,210,0.22)');
  mg.addColorStop(0.3, 'rgba(220,210,255,0.07)');
  mg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mg;
  g.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
  const md = g.createRadialGradient(mx - mr * 0.35, my - mr * 0.35, 2, mx, my, mr);
  md.addColorStop(0, '#fffaf0');
  md.addColorStop(1, '#e6dcc4');
  g.fillStyle = md;
  g.beginPath();
  g.arc(mx, my, mr, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(150,140,120,0.18)';
  [[-12, -8, 9], [10, 6, 12], [-4, 16, 6], [16, -14, 5]].forEach(([dx, dy, r]) => {
    g.beginPath();
    g.arc(mx + dx, my + dy, r, 0, TAU);
    g.fill();
  });
  // ince bulutlar
  const r = rng(77);
  g.save();
  for (let i = 0; i < 14; i++) {
    const cx = r() * W, cy = 180 + r() * 700, rw = 160 + r() * 260;
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.12);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, rw);
    cg.addColorStop(0, css(mix(theme.bg2, '#9aa6d8', 0.4), 0.09));
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.fillRect(-rw, -rw, rw * 2, rw * 2);
    g.restore();
  }
  g.restore();
  // uzak silüet (ufuk pusuyla hafif açık)
  const farCol = mix(mix(theme.bg2, '#1a1838', 0.5), '#000000', 0.28);
  g.save();
  g.translate(0, geo.farY);
  const fg = g.createLinearGradient(0, 0, 0, CITY.farH);
  fg.addColorStop(0, css(farCol));
  fg.addColorStop(1, css(darken(farCol, 0.45)));
  g.fillStyle = fg;
  g.fill(geo.far.path);
  // camiler projektörle aydınlatılmış
  g.save();
  g.clip(geo.far.marks);
  const up = g.createLinearGradient(0, CITY.farH, 0, CITY.farH * 0.3);
  up.addColorStop(0, 'rgba(255,196,120,0.34)');
  up.addColorStop(1, 'rgba(255,196,120,0)');
  g.fillStyle = up;
  g.fillRect(0, 0, W, CITY.farH);
  g.restore();
  // üst kenar ışığı
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(160,170,255,0.08)';
  g.lineWidth = 1.5;
  g.stroke(geo.far.marks);
  g.restore();
  g.restore();
  // su
  const wg = g.createLinearGradient(0, hz, 0, H);
  wg.addColorStop(0, css(mix(theme.bg2, '#120f2a', 0.5)));
  wg.addColorStop(0.3, css(mix(theme.bg, '#050816', 0.6)));
  wg.addColorStop(1, '#020309');
  g.fillStyle = wg;
  g.fillRect(0, hz, W, H - hz);
  // silüet yansıması
  g.save();
  g.beginPath();
  g.rect(0, hz, W, H - hz);
  g.clip();
  g.translate(0, hz);
  g.scale(1, -0.55);
  g.translate(0, -CITY.farH);
  g.globalAlpha = 0.5;
  g.fillStyle = css(darken(farCol, 0.2));
  g.fill(geo.far.path);
  g.restore();
  // yansımayı soldur + dalga çizgileri
  const fade = g.createLinearGradient(0, hz, 0, hz + 260);
  fade.addColorStop(0, 'rgba(4,6,16,0)');
  fade.addColorStop(1, 'rgba(4,6,16,0.75)');
  g.fillStyle = fade;
  g.fillRect(0, hz, W, H - hz);
  const r2 = rng(91);
  for (let i = 0; i < 160; i++) {
    const y = hz + Math.pow(r2(), 1.4) * (H - hz), x = r2() * W, len = 30 + r2() * 160 * (1 + (y - hz) / 200);
    g.fillStyle = r2() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(150,160,230,0.05)';
    g.fillRect(x - len / 2, y, len, 1 + (y - hz) / 140);
  }
  // köprü
  g.save();
  g.translate(geo.bridgeX, geo.bridgeY);
  g.fillStyle = '#04050c';
  g.fill(geo.bridge.path);
  g.strokeStyle = 'rgba(255,200,140,0.10)';
  g.lineWidth = 1.2;
  g.stroke(geo.bridge.path);
  g.restore();
  paintCaptionShade(g, 0.2);
  paintVignette(g, 0.6);
}
function drawWindows(ctx, wins, lt, lightCol, alphaMul = 1, seed = 0) {
  const glow = 'rgba(255,190,110,0.16)';
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    const per = 3 + hash(i * 1.7 + seed) * 6;
    const on = w.bright || hash(i * 7.3 + seed + Math.floor((lt + hash(i) * per) / per) * 13.1) > 0.14;
    if (!on) continue;
    const tw = 0.78 + 0.22 * Math.sin(lt * (0.6 + hash(i * 3.1) * 1.4) + i);
    ctx.globalAlpha = alphaMul * tw * (0.55 + 0.45 * hash(i * 5.7 + seed));
    ctx.fillStyle = glow;
    ctx.fillRect(w.x - w.w * 0.6, w.y - w.h * 0.35, w.w * 2.2, w.h * 1.7);
    ctx.fillStyle = lightCol;
    if (w.arch && w.w > 3) {
      ctx.beginPath();
      ctx.moveTo(w.x, w.y + w.h);
      ctx.lineTo(w.x, w.y + w.w / 2);
      ctx.arc(w.x + w.w / 2, w.y + w.w / 2, w.w / 2, Math.PI, 0);
      ctx.lineTo(w.x + w.w, w.y + w.h);
      ctx.fill();
    } else ctx.fillRect(w.x, w.y, w.w, w.h);
  }
}
function bgCity(ctx, t, theme) {
  const base = layer('city|' + tkey(theme), W, H, (g) => paintCity(g, theme));
  const geo = cityGeo();
  const hz = CITY.horizon;
  ctx.save();
  ctx.drawImage(base, 0, 0);
  // pencereler
  ctx.save();
  ctx.translate(0, geo.farY);
  drawWindows(ctx, geo.far.windows, t, '#ffd58e', 0.85, 3);
  ctx.restore();
  ctx.save();
  ctx.translate(geo.bridgeX, geo.bridgeY);
  drawWindows(ctx, geo.bridge.windows, t, '#ffd58e', 1, 9);
  ctx.restore();
  // sudaki ışık yansımaları
  ctx.globalCompositeOperation = 'lighter';
  const refl = (x, y0, y1, c, a, seed) => {
    for (let k = 0; k < 7; k++) {
      const yy = y0 + (k / 7) * (y1 - y0) + hash(seed + k) * 8;
      const wob = Math.sin(t * 1.3 + k * 1.9 + seed) * (3 + k * 1.2);
      const len = 6 + k * 3 + hash(seed * 3 + k) * 8;
      ctx.globalAlpha = a * (1 - k / 8) * (0.55 + 0.45 * Math.sin(t * 2.1 + k + seed * 0.7));
      ctx.fillStyle = c;
      ctx.fillRect(x + wob - len / 2, yy, len, 2);
    }
  };
  for (let i = 0; i < 18; i++) {
    const x = hash(i * 3.9 + 1) * W;
    refl(x, hz + 6, hz + 110, '#ffcf8a', 0.35, i);
  }
  // köprü fenerleri
  const spr = glowSprite('#ffc879');
  geo.bridge.lamps.forEach((l, i) => {
    const x = geo.bridgeX + l.x, y = geo.bridgeY + l.y;
    const fl = 0.85 + 0.15 * Math.sin(t * 3 + i * 2.3);
    ctx.globalAlpha = 0.75 * fl;
    ctx.drawImage(spr, x - 26, y - 26, 52, 52);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff1cf';
    ctx.fillRect(x - 2, y - 2, 4, 4);
    refl(x, geo.bridgeY + 124, geo.bridgeY + 250, '#ffc879', 0.5, i + 40);
  });
  // vapur
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const fx = ((t * 16 + 380) % 1500) - 210, fy = 1850;
  drawFerry(ctx, fx, fy, t);
  ctx.restore();
}
function drawFerry(ctx, x, y, t) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 1.2) * 1.5);
  ctx.fillStyle = '#05060d';
  ctx.beginPath();
  ctx.moveTo(-86, -14);
  ctx.lineTo(86, -14);
  ctx.lineTo(74, 6);
  ctx.lineTo(-74, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-64, -32, 128, 18);
  ctx.fillRect(-40, -46, 80, 14);
  ctx.fillRect(4, -64, 12, 18);
  ctx.fillStyle = '#ffd58e';
  for (let i = 0; i < 11; i++) {
    ctx.globalAlpha = 0.6 + 0.4 * hash(i * 2.2);
    ctx.fillRect(-58 + i * 11, -27, 5, 6);
  }
  for (let i = 0; i < 6; i++) ctx.fillRect(-34 + i * 12, -42, 5, 5);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ff5a4a';
  ctx.fillRect(4, -64, 12, 4);
  // dümen suyu
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#c9d6ff';
  for (let i = 0; i < 5; i++) ctx.fillRect(-90 - i * 26 - ((t * 20) % 26), 8 + i * 1.2, 18, 1.6);
  ctx.restore();
}

// ---- vintage: eski kâğıt / film
function paintVintage(g) {
  const bgr = g.createRadialGradient(W / 2, 780, 60, W / 2, 900, 1350);
  bgr.addColorStop(0, '#5c4329');
  bgr.addColorStop(0.45, '#3a2a1b');
  bgr.addColorStop(1, '#140d07');
  g.fillStyle = bgr;
  g.fillRect(0, 0, W, H);
  // lekeli doku
  const sw = 135, sh = 240;
  const n = makeCanvas(sw, sh);
  const ng = n.getContext('2d');
  const r = rng(31);
  for (let i = 0; i < 120; i++) {
    const x = r() * sw, y = r() * sh, rad = 14 + r() * 40;
    const light = r() < 0.45;
    const gr = ng.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, light ? `rgba(255,226,170,${0.02 + r() * 0.04})` : `rgba(20,10,0,${0.06 + r() * 0.1})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ng.fillStyle = gr;
    ng.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.imageSmoothingQuality = 'high';
  g.drawImage(n, 0, 0, W, H);
  // kâğıt lifleri
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r() * W, y = r() * H, len = 6 + r() * 30, a = r() * TAU;
    g.strokeStyle = r() < 0.6 ? `rgba(255,235,195,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.06})`;
    g.lineWidth = 0.6 + r() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // kahve lekesi halkaları
  for (let i = 0; i < 3; i++) {
    const x = [170, 900, 820][i], y = [260, 520, 1780][i], rad = [120, 70, 150][i];
    g.strokeStyle = 'rgba(30,16,4,0.12)';
    g.lineWidth = 3 + i;
    g.beginPath();
    g.ellipse(x, y, rad, rad * 0.93, i, 0.3, TAU - 0.5);
    g.stroke();
  }
  // ince ince çizgili kenar (film karesi hissi)
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 18, H);
  g.fillRect(W - 18, 0, 18, H);
  paintCaptionShade(g, 0.18);
  paintVignette(g, 0.82, W / 2, H * 0.46, '#0c0703');
}
let grainTiles = null;
function getGrainTiles() {
  if (grainTiles) return grainTiles;
  grainTiles = [];
  const S = 360;
  for (let k = 0; k < 4; k++) {
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const d = img.data, r = rng(100 + k);
    for (let i = 0; i < S * S; i++) {
      const v = r();
      const o = i * 4;
      if (v < 0.07) { d[o] = 255; d[o + 1] = 236; d[o + 2] = 205; d[o + 3] = 30 + r() * 60; }
      else if (v < 0.15) { d[o] = 18; d[o + 1] = 10; d[o + 2] = 4; d[o + 3] = 40 + r() * 80; }
    }
    g.putImageData(img, 0, 0);
    grainTiles.push(c);
  }
  return grainTiles;
}
function bgVintage(ctx, t) {
  const base = layer('vintage', W, H, paintVintage);
  ctx.save();
  ctx.drawImage(base, 0, 0);
  const fi = Math.floor(t * 12);
  // ışık titremesi
  const fl = hash(fi * 1.37);
  ctx.fillStyle = fl > 0.5 ? `rgba(255,225,180,${((fl - 0.5) * 0.06).toFixed(3)})` : `rgba(0,0,0,${((0.5 - fl) * 0.1).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  // gren
  const tiles = getGrainTiles();
  const tile = tiles[fi % tiles.length];
  const S = 360, ox = -Math.floor(hash(fi * 2.1) * S), oy = -Math.floor(hash(fi * 3.7) * S);
  // gren hafif kalır: güçlü gren 1080p'de çamurlu görünür ve videoyu sıkıştırmayı zorlaştırır
  ctx.globalAlpha = 0.55;
  for (let y = oy; y < H; y += S) for (let x = ox; x < W; x += S) ctx.drawImage(tile, x, y);
  ctx.globalAlpha = 1;
  // çizikler
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const h0 = hash(fi * 3.1 + i * 17.7);
    if (h0 < 0.55) continue;
    const x = hash(fi * 5.3 + i * 9.1) * W;
    const y0 = hash(fi * 7.7 + i) * H * 0.6, y1 = y0 + 200 + hash(fi + i * 4.4) * 1200;
    ctx.strokeStyle = hash(fi + i * 2.2) < 0.7 ? `rgba(255,240,210,${(0.08 + 0.18 * h0).toFixed(3)})` : `rgba(0,0,0,${(0.2 + 0.2 * h0).toFixed(3)})`;
    ctx.lineWidth = 0.8 + hash(fi * 1.9 + i) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + (hash(fi + i * 6.6) - 0.5) * 14, y1);
    ctx.stroke();
  }
  // yavaş gezinen kalıcı çizik
  const sx = 300 + Math.sin(t * 0.6) * 60 + Math.sin(t * 2.3) * 6;
  ctx.strokeStyle = `rgba(255,236,200,${(0.06 + 0.05 * hash(fi * 0.7)).toFixed(3)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sx, 0);
  ctx.lineTo(sx + 8, H);
  ctx.stroke();
  // toz ve kıl
  for (let i = 0; i < 4; i++) {
    const hv = hash(fi * 9.3 + i * 3.3);
    if (hv < 0.6) continue;
    const x = hash(fi * 4.1 + i) * W, y = hash(fi * 6.2 + i * 2) * H;
    ctx.fillStyle = hv > 0.85 ? 'rgba(255,240,215,0.35)' : 'rgba(0,0,0,0.45)';
    if (hv > 0.92) {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 14, y - 10, x + 6, y + 20, x + 26, y + 18);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + hv * 3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- ocean: derin su, ışık huzmeleri, parçacıklar
function paintOcean(g, theme) {
  const lg = g.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, css(mix('#1c7aa0', theme.bg2, 0.15)));
  lg.addColorStop(0.22, css(mix('#0e4a72', theme.bg2, 0.15)));
  lg.addColorStop(0.55, css(mix('#062642', theme.bg, 0.2)));
  lg.addColorStop(1, '#010812');
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
  // yüzey parıltısı
  const sg = g.createRadialGradient(W * 0.45, -120, 20, W * 0.45, -120, 900);
  sg.addColorStop(0, 'rgba(180,240,255,0.32)');
  sg.addColorStop(1, 'rgba(180,240,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, W, 1000);
  // derinlik bulanıklığı
  const r = rng(55);
  for (let i = 0; i < 20; i++) {
    const x = r() * W, y = 300 + r() * 1500, rad = 120 + r() * 320;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, r() < 0.5 ? 'rgba(40,140,190,0.07)' : 'rgba(0,0,0,0.12)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  paintCaptionShade(g, 0.2);
  paintVignette(g, 0.7, W / 2, H * 0.4, '#000510');
}
function bgOcean(ctx, t, theme) {
  const base = layer('ocean|' + tkey(theme), W, H, (g) => paintOcean(g, theme));
  ctx.save();
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  // ışık huzmeleri
  const rg = ctx.createLinearGradient(0, -100, 0, 1250);
  rg.addColorStop(0, 'rgba(170,235,255,0.20)');
  rg.addColorStop(0.45, 'rgba(120,210,255,0.07)');
  rg.addColorStop(1, 'rgba(120,210,255,0)');
  ctx.fillStyle = rg;
  for (let i = 0; i < 8; i++) {
    const x0 = 60 + i * 135 + Math.sin(t * 0.21 + i * 1.7) * 50;
    const lean = 0.18 + Math.sin(t * 0.13 + i) * 0.05;
    const w0 = 20 + hash(i * 3.3) * 50, w1 = 90 + hash(i * 5.1) * 170;
    const x1 = x0 + lean * 1250 - 120;
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.35 + hash(i) * 0.5) + i * 2.4));
    // iç içe üç kat: kenarlar yumuşak görünsün
    for (const k of [1.7, 1.0, 0.45]) {
      ctx.globalAlpha = a * 0.4;
      ctx.beginPath();
      ctx.moveTo(x0 - (w0 * k) / 2, -100);
      ctx.lineTo(x0 + (w0 * k) / 2, -100);
      ctx.lineTo(x1 + (w1 * k) / 2, 1250);
      ctx.lineTo(x1 - (w1 * k) / 2, 1250);
      ctx.closePath();
      ctx.fill();
    }
  }
  // yüzey dalgacıkları
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(200,245,255,${(0.05 + 0.03 * Math.sin(t + i)).toFixed(3)})`;
    ctx.beginPath();
    const y0 = 28 + i * 26;
    for (let x = -20; x <= W + 20; x += 30) {
      const y = y0 + Math.sin(x * 0.011 + t * 0.9 + i * 1.3) * 9 + Math.sin(x * 0.027 - t * 0.7 + i) * 5;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // deniz karı
  ctx.fillStyle = '#d8f4ff';
  for (let i = 0; i < 120; i++) {
    const depth = hash(i * 1.3);
    const sp = 8 + depth * 18;
    const y = (((hash(i * 2.7) * (H + 40) + t * sp) % (H + 40)) + (H + 40)) % (H + 40) - 20;
    const x = hash(i * 4.1) * W + Math.sin(t * 0.4 + i) * (10 + depth * 14);
    const s = 1 + depth * 2.6;
    const band = y > 1250 && y < 1560 ? 0.5 : 1;
    ctx.globalAlpha = (0.12 + depth * 0.4) * (0.6 + 0.4 * Math.sin(t * 1.3 + i)) * band;
    ctx.fillRect(x, y, s, s);
  }
  // birkaç bulanık bokeh
  const spr = glowSprite('#9fe3ff');
  for (let i = 0; i < 9; i++) {
    const x = hash(i * 8.8 + 2) * W + Math.sin(t * 0.25 + i) * 30;
    const y = (((hash(i * 6.6) * (H + 200) - t * (6 + i)) % (H + 200)) + H + 200) % (H + 200) - 100;
    const s = 50 + hash(i * 2.2) * 80;
    ctx.globalAlpha = 0.07 + 0.05 * Math.sin(t * 0.8 + i);
    ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
  }
  ctx.restore();
}

// ---- lab: koyu mavi çizim kağıdı (blueprint)
const LAB_LINE = '#7cc4ff';
function paintLab(g, theme) {
  const base = mix(theme.bg, '#06182c', 0.6);
  const bgr = g.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.5, H * 0.8);
  bgr.addColorStop(0, css(lighten(base, 0.06)));
  bgr.addColorStop(1, css(darken(base, 0.4)));
  g.fillStyle = bgr;
  g.fillRect(0, 0, W, H);
  // ince ve kalın ızgara
  g.strokeStyle = css(LAB_LINE, 0.045);
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += 24) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += 24) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
  g.stroke();
  g.strokeStyle = css(LAB_LINE, 0.1);
  g.beginPath();
  for (let x = 0; x <= W; x += 120) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += 120) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
  g.stroke();
  // cetvel çentikleri
  g.strokeStyle = css(LAB_LINE, 0.35);
  g.fillStyle = css(LAB_LINE, 0.38);
  g.font = '700 15px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textBaseline = 'middle';
  g.beginPath();
  for (let y = 0; y <= H; y += 12) {
    const len = y % 120 === 0 ? 22 : y % 60 === 0 ? 14 : 7;
    g.moveTo(0, y + 0.5); g.lineTo(len, y + 0.5);
    g.moveTo(W, y + 0.5); g.lineTo(W - len, y + 0.5);
  }
  for (let x = 0; x <= W; x += 12) {
    const len = x % 120 === 0 ? 22 : x % 60 === 0 ? 14 : 7;
    g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, len);
    g.moveTo(x + 0.5, H); g.lineTo(x + 0.5, H - len);
  }
  g.stroke();
  g.textAlign = 'left';
  for (let y = 120; y < H; y += 240) g.fillText(String(y / 12), 28, y);
  g.textAlign = 'center';
  for (let x = 120; x < W; x += 240) g.fillText(String(x / 12), x, 34);
  // şema çizimleri (köşelerde, sönük)
  g.strokeStyle = css(LAB_LINE, 0.16);
  g.fillStyle = css(LAB_LINE, 0.3);
  g.lineWidth = 1.5;
  const circ = (x, y, r, dash) => {
    g.setLineDash(dash || []);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
    g.setLineDash([]);
  };
  // sol üst: daire + artı + çap ölçüsü
  circ(190, 300, 120);
  circ(190, 300, 78, [8, 6]);
  circ(190, 300, 10);
  g.beginPath();
  g.moveTo(40, 300); g.lineTo(340, 300); g.moveTo(190, 150); g.lineTo(190, 450);
  g.stroke();
  const dim = (x0, y0, x1, y1, label) => {
    g.beginPath();
    g.moveTo(x0, y0); g.lineTo(x1, y1);
    const a = Math.atan2(y1 - y0, x1 - x0);
    for (const [px, py, d] of [[x0, y0, 1], [x1, y1, -1]]) {
      g.moveTo(px + Math.cos(a + 0.4) * 12 * d, py + Math.sin(a + 0.4) * 12 * d);
      g.lineTo(px, py);
      g.lineTo(px + Math.cos(a - 0.4) * 12 * d, py + Math.sin(a - 0.4) * 12 * d);
    }
    g.stroke();
    g.save();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2);
    g.rotate(Math.abs(a) > Math.PI / 2 ? a + Math.PI : a);
    g.textAlign = 'center';
    g.fillText(label, 0, -14);
    g.restore();
  };
  g.font = '700 20px "Barlow Condensed", "Arial Narrow", sans-serif';
  dim(70, 470, 310, 470, 'Ø 240');
  dim(380, 180, 380, 420, 'R 120');
  // sağ üst: dişli/yay taslağı ve açı
  g.beginPath();
  g.arc(900, 210, 140, Math.PI * 0.55, Math.PI * 1.15);
  g.stroke();
  g.beginPath();
  g.moveTo(900, 210); g.lineTo(900 + Math.cos(Math.PI * 0.55) * 170, 210 + Math.sin(Math.PI * 0.55) * 170);
  g.moveTo(900, 210); g.lineTo(900 + Math.cos(Math.PI * 1.15) * 170, 210 + Math.sin(Math.PI * 1.15) * 170);
  g.stroke();
  g.textAlign = 'center';
  g.fillText('38°', 830, 260);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.58 + i * 0.065);
    g.beginPath();
    g.moveTo(900 + Math.cos(a) * 140, 210 + Math.sin(a) * 140);
    g.lineTo(900 + Math.cos(a) * 128, 210 + Math.sin(a) * 128);
    g.stroke();
  }
  // alt: dalga formu, kesik yardımcı çizgiler
  g.setLineDash([10, 8]);
  g.beginPath();
  g.moveTo(40, 1700); g.lineTo(W - 40, 1700);
  g.moveTo(560, 1600); g.lineTo(560, 1880);
  g.stroke();
  g.setLineDash([]);
  g.beginPath();
  for (let x = 60; x <= W - 60; x += 4) {
    const y = 1760 + Math.sin((x - 60) * 0.025) * 40 * Math.exp(-(x - 60) / 900);
    if (x === 60) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  // sağ alt: kutu şeması
  g.strokeRect(780, 1600, 220, 140);
  g.strokeRect(810, 1630, 70, 80);
  g.beginPath();
  g.moveTo(880, 1670); g.lineTo(960, 1670); g.lineTo(960, 1740);
  g.stroke();
  g.textAlign = 'left';
  g.font = '700 18px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText('FIG. 02', 786, 1590);
  g.fillText('FIG. 01', 50, 140);
  paintCaptionShade(g, 0.16);
  paintVignette(g, 0.6);
}
function bgLab(ctx, t, theme) {
  const base = layer('lab|' + tkey(theme) + '|' + fontsReady(), W, H, (g) => paintLab(g, theme));
  ctx.save();
  ctx.drawImage(base, 0, 0);
  // tarama çizgisi
  const sy = ((t * 110) % (H + 400)) - 200;
  const sg = ctx.createLinearGradient(0, sy - 160, 0, sy);
  sg.addColorStop(0, css(LAB_LINE, 0));
  sg.addColorStop(1, css(LAB_LINE, 0.06));
  ctx.fillStyle = sg;
  ctx.fillRect(0, sy - 160, W, 160);
  ctx.fillStyle = css(LAB_LINE, sy > 1200 && sy < 1600 ? 0.08 : 0.22);
  ctx.fillRect(0, sy, W, 1.5);
  // radar süpürmesi (sol üst daire)
  ctx.save();
  ctx.translate(190, 300);
  const a = t * 0.9;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = css(LAB_LINE, 0.08);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 118, a - 0.5, a);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(LAB_LINE, 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(a) * 118, Math.sin(a) * 118);
  ctx.stroke();
  ctx.restore();
  // nabız atan düğümler
  const nodes = [[190, 300], [900, 210], [560, 1700], [880, 1670], [960, 1740], [310, 470]];
  nodes.forEach(([x, y], i) => {
    const k = (t * 0.7 + i * 0.37) % 1;
    ctx.strokeStyle = css(LAB_LINE, 0.4 * (1 - k));
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 4 + k * 22, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = css(LAB_LINE, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, TAU);
    ctx.fill();
  });
  // köşe okuması
  ctx.font = '700 18px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = css(LAB_LINE, 0.4);
  const v1 = (0.5 + 0.5 * Math.sin(t * 0.7)).toFixed(3), v2 = (1 + 0.3 * Math.sin(t * 0.45 + 1)).toFixed(3);
  ctx.fillText(`X ${v1}   Y ${v2}   T ${t.toFixed(1)}s`, W - 40, H - 52);
  ctx.restore();
}

// ---- sunset: alacakaranlık, güneş, katmanlı sırtlar
let sunsetRidges = null;
function paintSunset(g, theme) {
  const sky = g.createLinearGradient(0, 0, 0, 1180);
  sky.addColorStop(0, css(mix(theme.bg, '#160f38', 0.6)));
  sky.addColorStop(0.32, css(mix('#3a1d5e', theme.bg2, 0.15)));
  sky.addColorStop(0.6, '#86305e');
  sky.addColorStop(0.82, '#d9594a');
  sky.addColorStop(0.95, '#f59a52');
  sky.addColorStop(1, '#ffc477');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  paintStars(g, 160, 61, { y0: 0, y1: 520, fade: (y) => 1 - y / 560 });
  const sx = 560, sy = 1092;
  const glow = g.createRadialGradient(sx, sy, 40, sx, sy, 760);
  glow.addColorStop(0, 'rgba(255,214,140,0.55)');
  glow.addColorStop(0.25, 'rgba(255,150,90,0.22)');
  glow.addColorStop(1, 'rgba(255,120,90,0)');
  g.fillStyle = glow;
  g.fillRect(0, 300, W, 1300);
  const sun = g.createRadialGradient(sx, sy - 20, 6, sx, sy, 92);
  sun.addColorStop(0, '#fff8e1');
  sun.addColorStop(0.7, '#ffe0a0');
  sun.addColorStop(1, '#ffc070');
  g.fillStyle = sun;
  g.beginPath();
  g.arc(sx, sy, 92, 0, TAU);
  g.fill();
  // ışıkla alttan aydınlanan ince bulutlar
  const r = rng(17);
  for (let i = 0; i < 22; i++) {
    const cx = r() * W, cy = 560 + r() * 440, rw = 120 + r() * 300;
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.07 + r() * 0.05);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, rw);
    const warm = cy > 800;
    cg.addColorStop(0, warm ? 'rgba(255,190,140,0.32)' : 'rgba(255,140,170,0.2)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.fillRect(-rw, -rw, rw * 2, rw * 2);
    g.restore();
  }
  // sırtlar
  const layers = [
    { top: 1060, amp: 90, c: '#a24a6a', a: 1, f: 2.2 },
    { top: 1130, amp: 140, c: '#64285c', a: 1, f: 3.0 },
    { top: 1230, amp: 150, c: '#36163f', a: 1, f: 3.6 },
    { top: 1330, amp: 170, c: '#170b22', a: 1, f: 2.6 },
  ];
  sunsetRidges = layers;
  layers.forEach((L, k) => {
    g.fillStyle = css(mix(L.c, theme.bg, 0.12));
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W + 6; x += 6) {
      const n = fbm((x / W) * L.f, 70 + k * 5, 6);
      const ridge = k < 2 ? 1 - Math.abs(2 * n - 1) : n;
      g.lineTo(x, L.top + (1 - ridge) * L.amp);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    // sis: bir sonraki sırtın tabanına doğru
    if (k < layers.length - 1) {
      const mg = g.createLinearGradient(0, L.top + L.amp * 0.4, 0, layers[k + 1].top + layers[k + 1].amp * 0.6);
      mg.addColorStop(0, 'rgba(255,170,150,0)');
      mg.addColorStop(1, `rgba(255,160,150,${0.16 - k * 0.04})`);
      g.fillStyle = mg;
      g.fillRect(0, L.top + L.amp * 0.4, W, 400);
    }
  });
  paintCaptionShade(g, 0.18, 1200, 1640);
  paintVignette(g, 0.62, W / 2, H * 0.52, '#0a0510');
}
let hazeStrip = null;
function getHaze() {
  if (hazeStrip) return hazeStrip;
  hazeStrip = makeCanvas(540, 120);
  const g = hazeStrip.getContext('2d');
  const r = rng(201);
  for (let i = 0; i < 26; i++) {
    const x = r() * 540, y = 30 + r() * 60, rw = 60 + r() * 120;
    for (const dx of [-540, 0, 540]) {
      g.save();
      g.translate(x + dx, y);
      g.scale(1, 0.18);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rw);
      gr.addColorStop(0, 'rgba(255,200,180,0.22)');
      gr.addColorStop(1, 'rgba(255,200,180,0)');
      g.fillStyle = gr;
      g.fillRect(-rw, -rw, rw * 2, rw * 2);
      g.restore();
    }
  }
  return hazeStrip;
}
function bgSunset(ctx, t, theme) {
  const base = layer('sunset|' + tkey(theme), W, H, (g) => paintSunset(g, theme));
  ctx.save();
  ctx.drawImage(base, 0, 0);
  // güneş nabzı
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.05 + 0.03 * Math.sin(t * 0.9);
  const gg = ctx.createRadialGradient(560, 1092, 60, 560, 1092, 420);
  gg.addColorStop(0, `rgba(255,200,130,${pulse.toFixed(3)})`);
  gg.addColorStop(1, 'rgba(255,200,130,0)');
  ctx.fillStyle = gg;
  ctx.fillRect(140, 680, 840, 520);
  // kayan pus bantları
  const hz = getHaze();
  [[1010, 7, 0.9], [1150, -5, 0.7], [1250, 4, 0.45]].forEach(([y, sp, a], i) => {
    const off = (((t * sp + i * 200) % 1080) + 1080) % 1080;
    ctx.globalAlpha = a;
    for (let x = -1080 + off; x < W; x += 1080) ctx.drawImage(hz, x, y - 60, 1080, 120);
  });
  ctx.globalCompositeOperation = 'source-over';
  // kuşlar
  ctx.strokeStyle = 'rgba(30,12,30,0.75)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 6; i++) {
    const sp = 22 + hash(i * 1.9) * 16;
    const bx = ((t * sp + hash(i * 3.3) * 1500) % 1500) - 200;
    const by = 520 + hash(i * 5.1) * 260 + Math.sin(t * 0.6 + i) * 12;
    const s = 0.7 + hash(i * 2.7) * 0.6;
    const flap = Math.sin(t * (6 + hash(i) * 3) + i * 2);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(bx - 13 * s, by - 5 * flap * s);
    ctx.quadraticCurveTo(bx - 5 * s, by - 3 * s, bx, by + 1.5 * s);
    ctx.quadraticCurveTo(bx + 5 * s, by - 3 * s, bx + 13 * s, by - 5 * flap * s);
    ctx.stroke();
  }
  // ışıkta süzülen toz
  ctx.fillStyle = '#ffe2b0';
  for (let i = 0; i < 40; i++) {
    const x = hash(i * 6.3) * W + Math.sin(t * 0.3 + i) * 20;
    const y = 700 + ((hash(i * 2.9) * 500 - t * (4 + hash(i) * 6)) % 500 + 500) % 500;
    ctx.globalAlpha = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.4 + i));
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

// ---- abstract: tema renklerinde yumuşak hareketli lekeler
let absCanvas = null;
function bgAbstract(ctx, t, theme) {
  if (!absCanvas) absCanvas = makeCanvas(108, 192);
  const g = absCanvas.getContext('2d');
  const base = mix(theme.bg, '#000000', 0.35);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = css(base);
  g.fillRect(0, 0, 108, 192);
  g.globalCompositeOperation = 'lighter';
  const hues = [theme.accent, mix(theme.bg2, '#3b6dff', 0.5), '#6a3fe0', mix(theme.bg2, '#22b8ff', 0.55), theme.accent2, mix(theme.accent, '#6a3fe0', 0.5)];
  const amps = [0.42, 0.55, 0.5, 0.42, 0.22, 0.4];
  for (let i = 0; i < 6; i++) {
    const sp = 0.05 + hash(i * 3.1) * 0.06;
    const x = 54 + Math.sin(t * sp * TAU * 0.5 + i * 2.1) * 46;
    // lekeleri altyazı bandından (y≈130-155 / 192) uzak tut: 4'ü üstte, 2'si altta gezer
    const y = i < 4 ? 62 + Math.sin(t * sp * TAU * 0.37 + i * 1.3) * 48 : 182 + Math.sin(t * sp * TAU * 0.4 + i) * 14;
    const r = 40 + hash(i * 7.7) * 34 + Math.sin(t * 0.3 + i) * 6;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, css(hues[i], amps[i]));
    gr.addColorStop(0.5, css(hues[i], amps[i] * 0.4));
    gr.addColorStop(1, css(hues[i], 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const over = layer('abstract-over', W, H, (o) => {
    paintCaptionShade(o, 0.38, 1100, 1720);
    paintVignette(o, 0.6);
    const r = rng(303);
    for (let i = 0; i < 9000; i++) {
      o.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
      o.fillRect(r() * W, r() * H, 1.5, 1.5);
    }
  });
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(absCanvas, 0, 0, W, H);
  ctx.drawImage(over, 0, 0);
  ctx.restore();
}

export const BACKGROUNDS = {
  grid: bgGrid,
  space: bgSpace,
  'city-night': bgCity,
  vintage: bgVintage,
  ocean: bgOcean,
  lab: bgLab,
  sunset: bgSunset,
  abstract: bgAbstract,
};

// Adı bilinmeyen preset için güvenli çağrı (varsayılan: grid).
export function drawBackgroundPreset(ctx, t, theme, name) {
  const fn = BACKGROUNDS[name] || BACKGROUNDS[String(name || '').toLowerCase().replace(/[\s_]+/g, '-')] || BACKGROUNDS.grid;
  fn(ctx, t, theme);
}

// ================================================================= ÖĞELER

// ---- orb: yumuşak 3B gölgeli küre / gezegen
const ORB = new WeakMap();
function drawOrb(ctx, el, env, p) {
  const theme = env.theme;
  const r = Math.max(4, num(el.r, 140));
  const c = col(el.color, theme, '#5b8cff');
  const glowC = el.glow === false ? null : col(el.glow, theme, c);
  ctx.save();
  if (glowC) {
    const gg = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 1.9);
    gg.addColorStop(0, css(glowC, 0.42));
    gg.addColorStop(0.35, css(glowC, 0.12));
    gg.addColorStop(1, css(glowC, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(-r * 1.9, -r * 1.9, r * 3.8, r * 3.8);
  }
  const ringAng = (num(el.ringAngle, -14) * Math.PI) / 180;
  const ringC = col(el.ringColor, theme, lighten(c, 0.45));
  const rings = (half) => {
    ctx.save();
    ctx.rotate(ringAng);
    ctx.beginPath();
    if (half === 'back') ctx.rect(-r * 3, -r * 3, r * 6, r * 3);
    else ctx.rect(-r * 3, 0, r * 6, r * 3);
    ctx.clip();
    ctx.scale(1, num(el.ringTilt, 0.24));
    const bands = [[1.32, 0.05, 0.25], [1.42, 0.08, 0.55], [1.56, 0.12, 0.75], [1.74, 0.07, 0.4], [1.9, 0.1, 0.55], [2.06, 0.04, 0.25]];
    bands.forEach(([rr, wd, a]) => {
      ctx.strokeStyle = css(ringC, a);
      ctx.lineWidth = r * wd;
      ctx.beginPath();
      ctx.arc(0, 0, r * rr, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  };
  if (el.rings) rings('back');
  // gövde
  const body = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.05, -r * 0.1, -r * 0.1, r * 1.25);
  body.addColorStop(0, css(lighten(c, 0.55)));
  body.addColorStop(0.35, css(c));
  body.addColorStop(0.78, css(darken(c, 0.55)));
  body.addColorStop(1, css(darken(c, 0.82)));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  // yüzey dokusu
  const surface = el.surface || 'none';
  if (surface === 'bands' || surface === 'craters') {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.clip();
    if (surface === 'bands') {
      const drift = p.lt * num(el.speed, 0.04) * r;
      for (let i = 0; i < 9; i++) {
        const y = -r + (i + 0.5) * (r * 2 / 9);
        ctx.fillStyle = i % 2 ? css(lighten(c, 0.35), 0.16) : css(darken(c, 0.45), 0.2);
        ctx.beginPath();
        for (let x = -r; x <= r; x += r / 12) {
          const yy = y + Math.sin((x + drift) / r * 3 + i) * r * 0.025;
          if (x === -r) ctx.moveTo(x, yy - r * 0.05);
          else ctx.lineTo(x, yy - r * 0.05);
        }
        for (let x = r; x >= -r; x -= r / 12) ctx.lineTo(x, y + Math.sin((x + drift) / r * 3 + i + 1) * r * 0.025 + r * 0.06);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      let cr = ORB.get(el);
      if (!cr) {
        cr = [];
        for (let i = 0; i < 12; i++) cr.push([(hash(i * 3.3) - 0.5) * 1.6, (hash(i * 5.9) - 0.5) * 1.6, 0.05 + hash(i * 7.1) * 0.16]);
        ORB.set(el, cr);
      }
      cr.forEach(([x, y, s]) => {
        if (x * x + y * y > 0.8) return;
        ctx.fillStyle = css(darken(c, 0.5), 0.28);
        ctx.beginPath();
        ctx.arc(x * r, y * r, s * r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = css(lighten(c, 0.4), 0.22);
        ctx.lineWidth = Math.max(1, r * 0.012);
        ctx.beginPath();
        ctx.arc(x * r, y * r, s * r, Math.PI * 0.9, Math.PI * 1.6);
        ctx.stroke();
      });
    }
    ctx.restore();
  }
  // gece tarafı
  if (el.shade !== false) {
    const sh = ctx.createLinearGradient(-r * 0.6, -r * 0.6, r * 0.9, r * 0.9);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(0.55, 'rgba(0,0,0,0.05)');
    sh.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  }
  // atmosfer kenarı
  const rim = ctx.createRadialGradient(0, 0, r * 0.82, 0, 0, r);
  rim.addColorStop(0, css(lighten(c, 0.5), 0));
  rim.addColorStop(1, css(lighten(c, 0.5), 0.38));
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  // parlama
  ctx.save();
  ctx.translate(-r * 0.4, -r * 0.45);
  ctx.rotate(-0.7);
  ctx.scale(1, 0.62);
  const hl = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.32);
  hl.addColorStop(0, 'rgba(255,255,255,0.45)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(-r * 0.32, -r * 0.32, r * 0.64, r * 0.64);
  ctx.restore();
  if (el.rings) rings('front');
  ctx.restore();
}

// ---- accretion: kara delik + yığılma diski
const ACC = new WeakMap();
function accretionData(el, r, inner, outer, n, hot, mid, cool) {
  const sig = [r, inner, outer, n, hot, mid, cool, el.seed].join('|');
  let d = ACC.get(el);
  if (d && d.sig === sig) return d;
  const seed = num(el.seed, 1) * 13.7;
  const streaks = [];
  for (let i = 0; i < n; i++) {
    const u = hash(i * 1.31 + seed);
    const rr = inner + (outer - inner) * Math.pow(u, 1.5);
    const f = (rr - inner) / (outer - inner);
    const c = f < 0.18 ? mix(hot, mid, f / 0.18) : mix(mid, cool, (f - 0.18) / 0.82);
    streaks.push({
      rr,
      f,
      a0: hash(i * 2.7 + seed) * TAU,
      len: (0.5 + hash(i * 3.9 + seed) * 1.6) * Math.sqrt(inner / rr),
      w: lerp(0.6, 3.4, hash(i * 5.3 + seed)) * (r / 120),
      b: 0.35 + 0.65 * hash(i * 7.1 + seed),
      c: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`,
    });
  }
  const bands = [];
  const nb = 34;
  for (let i = 0; i < nb; i++) {
    const f = (i + hash(i * 9.1 + seed) * 0.6) / nb;
    const rr = inner + (outer - inner) * Math.pow(f, 1.25);
    const c = f < 0.18 ? mix(hot, mid, f / 0.18) : mix(mid, cool, (f - 0.18) / 0.82);
    bands.push({ rr, w: lerp(0.8, 3, hash(i * 4.4 + seed)) * (r / 120), a: (0.18 + 0.5 * hash(i * 2.2 + seed)) * (1 - f * 0.75), c: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` });
  }
  d = { sig, streaks, bands };
  ACC.set(el, d);
  return d;
}
function drawAccretion(ctx, el, env, p) {
  const theme = env.theme;
  const r = Math.max(10, num(el.r, 130));
  // yukarıdan bakış (tilt < ~0.65) "göz" gibi görünür ve disk deliğin önünden geçmez;
  // zayıf modeller "hafif eğik" diye 0.2–0.4 yazdığı için alt sınır 0.68
  const tilt = Math.max(0.68, clamp(num(el.tilt, 0.82)));
  const ky = lerp(1, 0.13, tilt);
  const inner = r * num(el.inner, 1.3), outer = r * num(el.outer, 2.9);
  const mid = col(el.color, theme, '#ff8c2e');
  const hot = col(el.hot, theme, '#fff1d0');
  const cool = mix(mid, '#ff4a26', 0.45);
  const speed = num(el.speed, 0.22);
  const n = Math.round(clamp(num(el.count, 150), 20, 260));
  const data = accretionData(el, r, inner, outer, n, hot, mid, cool);
  const spin = (lt) => lt * speed * TAU;
  // açılışta disk hızlanarak dönmeye başlar
  const lt = p.lt;
  ctx.save();
  // geniş parıltı
  ctx.save();
  ctx.scale(1, lerp(1, ky, 0.55));
  const og = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, outer * 1.35);
  og.addColorStop(0, css(mid, 0.38));
  og.addColorStop(0.4, css(mid, 0.12));
  og.addColorStop(1, css(mid, 0));
  ctx.fillStyle = og;
  ctx.fillRect(-outer * 1.4, -outer * 1.4, outer * 2.8, outer * 2.8);
  ctx.restore();

  const baseAlpha = ctx.globalAlpha;
  // maxR: bu yarıçapın dışındaki halka/çizgiler çizilmez (deliğin önünde yalnızca iç bant görünsün)
  const paintDisk = (maxR, twice) => {
    const dg = ctx.createRadialGradient(0, 0, inner * 0.92, 0, 0, outer);
    dg.addColorStop(0, css(hot, 0));
    // parlaklık iç kenarda yoğun, dışa doğru hızla söner: ön bant deliğin önünde ince ve keskin görünür
    dg.addColorStop(0.03, css(hot, 0.95));
    dg.addColorStop(0.1, css(mix(hot, mid, 0.5), 0.8));
    dg.addColorStop(0.26, css(mid, 0.48));
    dg.addColorStop(0.55, css(cool, 0.17));
    dg.addColorStop(1, css(cool, 0));
    ctx.fillStyle = dg;
    for (let k = 0; k < (twice ? 2 : 1); k++) {
      ctx.beginPath();
      ctx.arc(0, 0, maxR, 0, TAU);
      ctx.arc(0, 0, inner * 0.92, 0, TAU, true);
      ctx.fill();
    }
    // ince eşmerkezli halkalar (bantlı doku)
    for (const b of data.bands) {
      if (b.rr > maxR) continue;
      ctx.strokeStyle = b.c;
      ctx.globalAlpha = b.a * baseAlpha;
      ctx.lineWidth = b.w;
      ctx.beginPath();
      ctx.arc(0, 0, b.rr, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = baseAlpha;
    // dönen ışık çizgileri
    ctx.lineCap = 'round';
    for (const s of data.streaks) {
      if (s.rr > maxR) continue;
      const om = Math.pow(inner / s.rr, 1.5);
      const a0 = s.a0 + spin(lt) * om;
      const midA = a0 + s.len / 2;
      const dop = 1 - 0.55 * Math.cos(midA);
      ctx.globalAlpha = baseAlpha * clamp(s.b * dop * 0.8 * (1 - s.f * 0.55));
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.arc(0, 0, s.rr, a0, a0 + s.len);
      ctx.stroke();
    }
    ctx.globalAlpha = baseAlpha;
  };
  const diskPass = (front) => {
    ctx.save();
    ctx.beginPath();
    if (front) {
      // deliğin dışında kalan ön yarı (evenodd: dikdörtgen eksi delik)
      ctx.rect(-outer * 1.2, 0, outer * 2.4, outer * 1.2);
      ctx.clip();
      ctx.beginPath();
      ctx.rect(-outer * 1.2, -outer * 1.2, outer * 2.4, outer * 2.4);
      ctx.moveTo(r * 1.02, 0);
      ctx.arc(0, 0, r * 1.02, 0, TAU);
      ctx.clip('evenodd');
    } else {
      ctx.rect(-outer * 1.2, -outer * 1.2, outer * 2.4, outer * 1.2);
      ctx.clip();
    }
    ctx.scale(1, ky);
    ctx.globalCompositeOperation = 'lighter';
    paintDisk(outer, false);
    ctx.restore();
    if (front) {
      // deliğin önünden geçen kısım: yalnızca parlak iç bant, daha yoğun (opak görünür);
      // dış soluk disk gölgenin üstünü boyamaz, altı kara kalır (Interstellar görünümü)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-outer * 1.2, 0, outer * 2.4, outer * 1.2);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.02, 0, TAU);
      ctx.clip();
      ctx.scale(1, ky);
      ctx.globalCompositeOperation = 'lighter';
      paintDisk(Math.min(outer, inner * 1.6), true);
      ctx.restore();
    }
  };
  diskPass(false);
  // kütleçekimsel merceklenme: arka diskin ışığı deliğin üstünden kıvrılır
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0, r * 0.98, 0, 0, r * 1.6);
  halo.addColorStop(0, css(hot, 0.9));
  halo.addColorStop(0.08, css(mid, 0.6));
  halo.addColorStop(0.35, css(mid, 0.18));
  halo.addColorStop(1, css(mid, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, TAU);
  ctx.fill();
  const lensA = tilt;
  if (lensA > 0.05) {
    ctx.lineCap = 'round';
    const baseA = ctx.globalAlpha;
    for (let i = 0; i < data.streaks.length; i += 2) {
      const s = data.streaks[i];
      if (s.f > 0.7) continue;
      const lr = r * (1.06 + 0.32 * s.f);
      const om = Math.pow(inner / s.rr, 1.5);
      const ph = ((s.a0 + spin(lt) * om) % TAU + TAU) % TAU;
      const th = Math.PI + (ph / TAU) * Math.PI;
      ctx.globalAlpha = baseA * lensA * s.b * 0.7 * (1 - s.f);
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w * 1.1;
      ctx.beginPath();
      ctx.arc(0, -r * 0.02, lr, th, Math.min(TAU, th + s.len * 0.6));
      ctx.stroke();
    }
    ctx.globalAlpha = baseA;
  }
  ctx.restore();
  // olay ufku (gölge)
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  // foton halkası
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = css(mid, 0.35);
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.04, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = css(hot, 0.95);
  ctx.lineWidth = Math.max(1.2, r * 0.022);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.012, 0, TAU);
  ctx.stroke();
  ctx.restore();
  diskPass(true);
  ctx.restore();
}

// ---- spacegrid: perspektifli, ortası çöken uzay-zaman ızgarası
function drawSpacegrid(ctx, el, env, p) {
  const theme = env.theme;
  const w = num(el.w, 900), h = num(el.h, 420);
  const n = Math.round(clamp(num(el.lines, 18), 4, 40));
  const c = col(el.color, theme, '#86b6ff');
  let warp = clamp(num(el.warp, 0.6), 0, 1.6);
  if (el.grow !== false) warp *= easeInOut(clamp(p.lt / 1.4));
  const phi = (clamp(num(el.pitch, 28), 8, 80) * Math.PI) / 180;
  const cp = Math.cos(phi), sp = Math.sin(phi), D = 3.2;
  const F = (w / 2) * (D - cp);
  const nearY = (F * sp) / (D - cp), farY = (-F * sp) / (D + cp);
  // düz düzlemin merkezi (çöküşün ağzı) öğenin (x, y) noktasına denk gelir
  const ys = h / (nearY - farY), yoff = 0;
  const s2 = 0.075, g0 = s2 / (s2 + 2), gn = 1 - g0;
  let depth = 1.25 * warp;
  // huninin dibi düzlemin ön kenarını geçmesin (kutunun altına, altyazı bandına sarkmasın):
  // merkezin ekrandaki düşüşü K·d/(D + d·sin) ≤ 0.58h
  {
    const K = cp * F * ys, L = h * 0.58;
    if (K > L * sp) depth = Math.min(depth, (L * D) / (K - L * sp));
  }
  const proj = (X, Z) => {
    const rho2 = X * X + Z * Z;
    const Y = -depth * Math.max(0, s2 / (s2 + rho2) - g0) / gn;
    const yc = Y * cp - Z * sp, zc = -Z * cp - Y * sp;
    const d = D + zc;
    return [(X * F) / d, ((-yc * F) / d) * ys + yoff];
  };
  const flow = num(el.flow, 0);
  const frac = flow ? (((p.lt * flow) % 1) + 1) % 1 : 0;
  const S = 44;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  const top = farY * ys + yoff, bottom = nearY * ys + yoff + depth * h * 0.6;
  const grad = ctx.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, css(c, 0.22));
  grad.addColorStop(0.5, css(c, 0.75));
  grad.addColorStop(1, css(c, 1));
  const zPath = new Path2D();
  for (let k = 0; k <= n; k++) {
    const X = -1 + (2 * k) / n;
    for (let j = 0; j <= S; j++) {
      const [x, y] = proj(X, -1 + (2 * j) / S);
      if (j === 0) zPath.moveTo(x, y);
      else zPath.lineTo(x, y);
    }
  }
  const baseA = ctx.globalAlpha;
  const xLine = (Z) => {
    const path = new Path2D();
    for (let j = 0; j <= S; j++) {
      const [x, y] = proj(-1 + (2 * j) / S, Z);
      if (j === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    return path;
  };
  const xPaths = [];
  for (let k = 0; k <= n; k++) {
    const Z = -1 + (2 * (k + frac)) / n;
    if (Z > 1) continue;
    const edge = flow ? Math.min(1, (k + frac) / 1, (n - k - frac) / 1) : 1;
    xPaths.push([xLine(Z), clamp(edge) * lerp(0.25, 1, (Z + 1) / 2)]);
  }
  // parıltı geçişi + ince çekirdek
  // sade ve ince: ızgara arka planda kalır, odak (delik/küre) öne çıkar
  for (const [lw, a] of [[6, 0.1], [1.6, 0.72]]) {
    ctx.lineWidth = lw;
    ctx.globalAlpha = baseA * a;
    ctx.strokeStyle = grad;
    ctx.stroke(zPath);
    ctx.strokeStyle = css(c);
    xPaths.forEach(([path, al]) => {
      ctx.globalAlpha = baseA * a * al;
      ctx.stroke(path);
    });
  }
  ctx.restore();
}

// ---- rays: tanrı ışınları / spot ışığı konisi
function drawRays(ctx, el, env, p) {
  const theme = env.theme;
  const ang = (num(el.angle, 90) * Math.PI) / 180;
  const spread = (clamp(num(el.spread, 36), 2, 170) * Math.PI) / 180;
  const len = num(el.length, 1200);
  const c = col(el.color, theme, '#fff1d6');
  const count = Math.round(clamp(num(el.count, 7), 0, 24));
  const k = el.in === 'none' ? 1 : easeOutCubic(clamp(p.lt / 0.8));
  const L = len * lerp(0.4, 1, k);
  ctx.save();
  ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  const baseA = ctx.globalAlpha;
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
  gr.addColorStop(0, css(c, 0.32));
  gr.addColorStop(0.35, css(c, 0.12));
  gr.addColorStop(1, css(c, 0));
  const wedge = (a0, a1) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a0) * L, Math.sin(a0) * L);
    ctx.lineTo(Math.cos(a1) * L, Math.sin(a1) * L);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = gr;
  ctx.globalAlpha = baseA * 0.7;
  wedge(-spread / 2, spread / 2);
  for (let i = 0; i < count; i++) {
    const center = (hash(i * 3.7 + 1) - 0.5) * spread * 0.85 + Math.sin(p.lt * 0.35 + i * 1.9) * spread * 0.04;
    const bw = spread * (0.03 + hash(i * 5.1) * 0.07);
    ctx.globalAlpha = baseA * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.lt * (0.6 + hash(i) * 0.9) + i * 2.3)));
    wedge(center - bw / 2, center + bw / 2);
  }
  // kaynak parıltısı
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.12);
  sg.addColorStop(0, css(c, 0.6));
  sg.addColorStop(1, css(c, 0));
  ctx.globalAlpha = baseA;
  ctx.fillStyle = sg;
  ctx.fillRect(-L * 0.12, -L * 0.12, L * 0.24, L * 0.24);
  // huzmede süzülen toz
  if (el.dust !== false) {
    ctx.fillStyle = css(c, 1);
    for (let i = 0; i < 26; i++) {
      const d = (((hash(i * 2.3) + p.lt * (0.01 + hash(i * 4.4) * 0.02)) % 1) * 0.85 + 0.1) * L;
      const a = (hash(i * 6.1) - 0.5) * spread * 0.8 + Math.sin(p.lt * 0.5 + i) * 0.02;
      ctx.globalAlpha = baseA * (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(p.lt * 1.7 + i * 1.3))) * (1 - d / L);
      const s = 1.5 + hash(i * 9.1) * 2.5;
      ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, s, s);
    }
  }
  ctx.restore();
}

// ---- silhouette: prosedürel siluetler (şehir, köprü, cami, kule, dağlar)
const SIL = new WeakMap();
function silGeo(el, kind, w, h) {
  const seed = Math.round(num(el.seed, 3));
  const sig = [kind, w, h, seed, el.minarets, el.landmarks, el.windows === false].join('|');
  let g = SIL.get(el);
  if (g && g.sig === sig) return g;
  const wins = el.windows === false ? null : [];
  let path = new Path2D(), lamps = [], layers = null, windows = wins || [];
  if (kind === 'mosque') {
    const four = num(el.minarets, 2) >= 4;
    const s = Math.min(w / (four ? 3.0 : 2.5), h / 1.78);
    pMosque(path, w / 2, h, s, four ? 4 : 2, wins);
  } else if (kind === 'tower') {
    const s = Math.min(h / 1.94, w / 0.5);
    // kulenin dibinde birkaç alçak bina
    const r = rng(seed);
    for (let x = 0; x < w; ) {
      const bw = lerp(30, 70, r()) * (h / 600);
      if (Math.abs(x + bw / 2 - w / 2) > s * 0.2) pBuilding(path, x, h, bw, lerp(0.06, 0.16, r()) * h, r, wins, { win: 12 * (h / 600), lit: 0.3 });
      x += bw;
    }
    pTower(path, w / 2, h, s, wins);
  } else if (kind === 'bridge') {
    const b = buildBridge(seed, w, h, { towers: el.towers });
    path = b.path;
    lamps = b.lamps;
    windows = wins ? b.windows : [];
  } else if (kind === 'mountains') {
    layers = buildMountains(seed, w, h, Math.round(clamp(num(el.layers, 3), 1, 5)));
  } else {
    const marks = el.landmarks === false ? [] : [
      { kind: 'mosque', x: 0.28, s: h * 0.3, minarets: 4 },
      { kind: 'tower', x: 0.78, s: h * 0.4 },
    ];
    const sk = buildSkyline(seed, w, h, marks, { hmax: 0.42, win: Math.max(9, h * 0.028), lit: 0.3, windows: el.windows !== false });
    path = sk.path;
    windows = sk.windows;
  }
  g = { sig, path, lamps, layers, windows };
  SIL.set(el, g);
  return g;
}
function drawSilhouette(ctx, el, env, p) {
  const theme = env.theme;
  const kind = ['skyline', 'bridge', 'mosque', 'tower', 'mountains'].includes(el.kind) ? el.kind : 'skyline';
  const defs = { skyline: [1080, 520], bridge: [1080, 240], mosque: [760, 520], tower: [360, 700], mountains: [1080, 480] };
  const w = Math.max(40, num(el.w, defs[kind][0])), h = Math.max(30, num(el.h, defs[kind][1]));
  const geo = silGeo(el, kind, w, h);
  const c = col(el.color, theme, '#070a16');
  ctx.save();
  ctx.translate(-w / 2, -h / 2);
  if (el.backlight) {
    const bc = col(el.backlight, theme, theme.accent2);
    ctx.save();
    ctx.translate(w / 2, h * 0.72);
    ctx.scale(1, 0.75);
    const R = Math.max(w, h) * 0.62;
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    bg.addColorStop(0, css(bc, 0.45));
    bg.addColorStop(0.45, css(bc, 0.14));
    bg.addColorStop(1, css(bc, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();
  }
  if (geo.layers) {
    const haze = col(el.haze, theme, theme.bg2);
    geo.layers.forEach((path, i) => {
      const k = geo.layers.length === 1 ? 0 : 1 - i / (geo.layers.length - 1);
      const fc = mix(c, haze, k * 0.6);
      const lg = ctx.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, css(lighten(fc, 0.04)));
      lg.addColorStop(1, css(darken(fc, 0.3)));
      ctx.fillStyle = lg;
      ctx.fill(path);
    });
  } else {
    if (el.reflect) {
      ctx.save();
      ctx.translate(0, h * 2);
      ctx.scale(1, -1);
      const rg = ctx.createLinearGradient(0, h, 0, h * 0.4);
      rg.addColorStop(0, css(c, 0.5));
      rg.addColorStop(1, css(c, 0));
      ctx.fillStyle = rg;
      ctx.fill(geo.path);
      ctx.restore();
    }
    const lg = ctx.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, css(mix(c, theme.bg2, 0.18)));
    if (el.reflect || el.ground === true) lg.addColorStop(1, css(c));
    else {
      // havada asılı kalan silüetin kesik alt kenarı sise karışır (sert dikdörtgen taban olmasın)
      lg.addColorStop(0.72, css(c));
      lg.addColorStop(1, css(c, 0));
    }
    ctx.fillStyle = lg;
    ctx.fill(geo.path);
    if (el.rim) {
      const rc = col(el.rim, theme, theme.accent2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-2, -h, w + 4, h * 2 - 3);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = css(rc, 0.55);
      ctx.lineWidth = 3.2;
      ctx.stroke(geo.path);
      ctx.restore();
      // iç kenarları gizlemek için gövde yeniden doldurulur (yalnızca dış kontur kalır)
      ctx.fillStyle = lg;
      ctx.fill(geo.path);
    }
  }
  if (el.windows !== false && geo.windows.length) {
    const light = col(el.lights, theme, '#ffd58e');
    // sise karışan alt kenardaki pencereler yanmaz (havada asılı ışık noktaları kalmasın)
    const floating = !geo.layers && !el.reflect && el.ground !== true;
    const keep = (wi) => !floating || wi.y + wi.h < h * 0.78;
    if (el.lightUp) {
      // pencereler sırayla yanar
      const vis = geo.windows.filter((wi, i) => keep(wi) && p.lt > 0.15 + hash(i * 2.9) * 1.4);
      drawWindows(ctx, vis, p.lt, light, 1, 5);
    } else drawWindows(ctx, floating ? geo.windows.filter(keep) : geo.windows, p.lt, light, 1, 5);
  }
  if (geo.lamps.length) {
    const spr = glowSprite(css(col(el.lights, theme, '#ffc879')));
    const s = Math.max(24, h * 0.24);
    geo.lamps.forEach((l, i) => {
      ctx.globalAlpha = 0.8 * (0.85 + 0.15 * Math.sin(p.lt * 3 + i * 2.3));
      ctx.drawImage(spr, l.x - s / 2, l.y - s / 2, s, s);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff1cf';
      ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
    });
  }
  ctx.restore();
}

// ---- starburst: odak nesnesinin arkasında ışın patlaması
function drawStarburst(ctx, el, env, p) {
  const theme = env.theme;
  const R = Math.max(20, num(el.r, 380));
  const count = Math.round(clamp(num(el.count, 22), 6, 72));
  const c = col(el.color, theme, theme.accent2);
  const k = easeOutCubic(clamp(p.lt / 0.7));
  const L = R * lerp(0.25, 1, k);
  const speed = num(el.speed, 0.03);
  const inner = R * 0.14;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const baseA = ctx.globalAlpha;
  // merkez parıltı
  const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.55);
  cg.addColorStop(0, css(c, 0.5));
  cg.addColorStop(0.4, css(c, 0.14));
  cg.addColorStop(1, css(c, 0));
  ctx.fillStyle = cg;
  ctx.fillRect(-L * 0.55, -L * 0.55, L * 1.1, L * 1.1);
  // geniş ışınlar
  const gr = ctx.createRadialGradient(0, 0, inner, 0, 0, L);
  gr.addColorStop(0, css(c, 0.5));
  gr.addColorStop(0.5, css(c, 0.16));
  gr.addColorStop(1, css(c, 0));
  ctx.fillStyle = gr;
  ctx.save();
  ctx.rotate(p.lt * speed * TAU);
  const half = (Math.PI / count) * 0.42;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const len = i % 2 ? L * 0.72 : L;
    ctx.moveTo(Math.cos(a - half * 0.25) * inner, Math.sin(a - half * 0.25) * inner);
    ctx.lineTo(Math.cos(a - half) * len, Math.sin(a - half) * len);
    ctx.lineTo(Math.cos(a + half) * len, Math.sin(a + half) * len);
    ctx.lineTo(Math.cos(a + half * 0.25) * inner, Math.sin(a + half * 0.25) * inner);
    ctx.closePath();
  }
  ctx.globalAlpha = baseA * (0.8 + 0.2 * Math.sin(p.lt * 2.2));
  ctx.fill();
  ctx.restore();
  // ters yönde dönen ince çizgiler
  ctx.save();
  ctx.rotate(-p.lt * speed * 0.6 * TAU + Math.PI / count);
  ctx.strokeStyle = gr;
  ctx.lineWidth = Math.max(1, R * 0.006);
  ctx.beginPath();
  for (let i = 0; i < count * 2; i++) {
    const a = (i / (count * 2)) * TAU;
    const len = L * (0.55 + 0.45 * hash(i * 3.3));
    ctx.moveTo(Math.cos(a) * inner * 1.2, Math.sin(a) * inner * 1.2);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
  }
  ctx.globalAlpha = baseA * 0.6;
  ctx.stroke();
  ctx.restore();
  // açılış halkası
  if (p.lt < 1.2) {
    const rk = clamp(p.lt / 1.2);
    ctx.globalAlpha = baseA * (1 - rk) * 0.6;
    ctx.strokeStyle = css(c, 1);
    ctx.lineWidth = Math.max(1.5, R * 0.012) * (1 - rk);
    ctx.beginPath();
    ctx.arc(0, 0, R * easeOutCubic(rk), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

export const DRAWERS = {
  orb: drawOrb,
  accretion: drawAccretion,
  spacegrid: drawSpacegrid,
  rays: drawRays,
  silhouette: drawSilhouette,
  starburst: drawStarburst,
};

// LLM komutuna eklenecek kısa DSL açıklaması.
export const SCENERY_DOC = `ARKA PLAN (plan.background, sahne başına scene.background ile değiştirilebilir):
- "grid": lacivert hareketli ızgara (varsayılan, genel konular)
- "space": derin yıldız alanı, ışıldayan yıldızlar, tema renklerinde bulutsu (uzay, bilim, gizem)
- "city-night": gece şehir silüeti (camiler, kule), köprü fenerleri, suda yansıma, geçen vapur (İstanbul, şehir hikâyeleri, suç/dolandırıcılık). Silüet ve köprü ekranın ALTINDA zaten var: bu arka planda ayrıca silhouette "skyline"/"bridge" koyma (çift şehir olur); sahnenin odağı art olsun.
- "vintage": eski kâğıt/film; sepya, gren, çizik, titreme (tarih, 1900'ler, biyografi)
- "ocean": derin su, yukarıdan ışık huzmeleri, süzülen parçacıklar (deniz, doğa, keşif)
- "lab": koyu mavi teknik çizim kâğıdı, cetvel çentikleri, şema, tarama çizgisi (bilim, teknoloji, mühendislik)
- "sunset": alacakaranlık gökyüzü, güneş, katmanlı dağ sırtları, kuşlar (doğa, seyahat, duygusal)
- "abstract": tema renklerinde yavaş hareket eden yumuşak lekeler (soyut fikirler, psikoloji, finans)
ÖĞELER:
- orb {r, color, glow?:renk|false, rings?:bool, surface?:"bands"|"craters", shade?:bool}: gölgeli 3B küre/gezegen
- accretion {r, tilt:0.68..1 (varsayılan 0.82 = yandan, "Interstellar" görünümü; disk deliğin önünden geçer), color, speed}: kara delik + dönen parlak yığılma diski ve foton halkası (r = karanlık merkez yarıçapı 90–170, disk ≈ 2.9r genişler; disk ekran kenarından taşabilir, sinematik durur)
- spacegrid {w, h, warp:0..1.5, color, pitch?:derece, lines?, flow?}: perspektifli uzay-zaman ızgarası, ortası huni gibi çöker; (x,y) huninin ağzıdır, kara deliği/küreyi aynı x,y'ye koy
- rays {angle:derece (90=aşağı), spread:derece, length, color, count?}: hafif hareketli ışık huzmesi/spot konisi (x,y = ışık kaynağı)
- silhouette {kind:"skyline"|"bridge"|"mosque"|"tower"|"mountains", w, h, color?, windows?:bool, backlight?:renk, rim?:renk, reflect?:bool, lightUp?:bool}: net vektör siluet; zemin kutunun alt kenarı (reflect yoksa alt kenar sise karışır). Şehir/köprü yoksa arka planda (grid, vintage, sunset…) odak olarak kullan; tek yapı için kind "tower"/"mosque" daha zarif.
- starburst {r, count, color, speed?}: odak nesnesinin arkasında dönen ışın patlaması (açıklama anları için, öğeden önce yaz)`;
