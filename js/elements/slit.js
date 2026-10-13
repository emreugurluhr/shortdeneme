// Çift yarık deneyinin ortak fiziği. wavefield / barrier / emitter / detector
// çizicileri yalnızca bu saf fonksiyonları kullanır; böylece hiperboller, saçaklar,
// grafik ve elektron noktaları piksel piksel aynı yere düşer. (Dünya koordinatı, px.)
//
//   φ(x) = k·(r1 − r2),  r_j = √((x − s_j)² + L²),  k = 2π/λ
//   Işık (light):     I = sinc²(π a X / λL) · (1 + cos φ)/2   (X = x − merkez), beyaz ışıkta R/G/B ayrı λ
//   Elektron:         I = g1² + g2² + 2c·g1·g2·cos φ,  g_j² = exp(−(x − c_j)²/(2s²))
//                     c = uyum (1: izlenmiyor → saçak, 0: hangi yarık ölçülüyor → iki yumru)
//   Klasik beklenti:  yarıkların kaynaktan izdüşümünde iki dar şerit (σ 16)
// Belirlenimci: Math.random yok, örnekler hash ile.

export const GEOM = {
  srcX: 540, srcY: 250,
  barrierY: 560, thick: 26,
  screenY: 1040,
  slits: [480, 600], a: 22,
  x0: 90, x1: 990,
};

export const PRESETS = {
  light: { lambda: 28, white: true, band: 0.13 },
  // s ve c_j: c=1'de ≥5 belirgin saçak (görünürlük > 0.25), c=0'da ≥%10 merkez çukuru
  electron: { lambda: 24, beamOffset: 150, beamSigma: 120 },
};

const TAU = Math.PI * 2;

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const GEOM_CACHE = new WeakMap();
export function geomOf(over) {
  if (!over || typeof over !== 'object') return GEOM_DEFAULT;
  let g = GEOM_CACHE.get(over);
  if (!g) {
    g = derive({ ...GEOM, ...over });
    GEOM_CACHE.set(over, g);
  }
  return g;
}
function derive(g) {
  g.slits = (Array.isArray(g.slits) && g.slits.length === 2 ? g.slits : GEOM.slits).map(Number);
  g.L = g.screenY - g.barrierY;
  g.d = g.slits[1] - g.slits[0];
  g.xc = (g.slits[0] + g.slits[1]) / 2;
  g.w = g.x1 - g.x0;
  g.key = [g.srcX, g.srcY, g.barrierY, g.screenY, g.slits[0], g.slits[1], g.a, g.x0, g.x1].join(',');
  // klasik izdüşüm: kaynaktan yarıktan geçen düz çizginin ekrana düştüğü yer
  const D = g.barrierY - g.srcY;
  g.proj = g.slits.map((s) => g.srcX + (s - g.srcX) * (1 + g.L / D));
  return g;
}
const GEOM_DEFAULT = derive({ ...GEOM });

// over: düz alanlar her ön ayara uygulanır; over[ad] (ör. {electron:{lambda:16}}) yalnız o ön ayara
const PRESET_CACHE = new WeakMap();
export function presetOf(name, over) {
  const base = PRESETS[name] || PRESETS.electron;
  if (!over || typeof over !== 'object') return base;
  let m = PRESET_CACHE.get(over);
  if (!m) PRESET_CACHE.set(over, (m = new Map()));
  let P = m.get(name);
  if (!P) {
    const flat = {};
    for (const [k, v] of Object.entries(over)) if (!v || typeof v !== 'object') flat[k] = v;
    const own = over[name] && typeof over[name] === 'object' ? over[name] : {};
    P = { ...base, ...flat, ...own };
    m.set(name, P);
  }
  return P;
}

export function pathDiff(x, y, g) {
  const dy = y - g.barrierY;
  return Math.hypot(x - g.slits[0], dy) - Math.hypot(x - g.slits[1], dy);
}
export function phase(x, lambda, g) {
  return (TAU / lambda) * pathDiff(x, g.screenY, g);
}

function sinc2(u) {
  if (Math.abs(u) < 1e-6) return 1;
  const s = Math.sin(u) / u;
  return s * s;
}

// Işık: tek dalga boyu
export function lightI(x, lambda, g) {
  const X = x - g.xc;
  const env = sinc2((Math.PI * g.a * X) / (lambda * g.L));
  return env * 0.5 * (1 + Math.cos(phase(x, lambda, g)));
}
// Beyaz ışık: 550 nm (= λ ön ayarı) çevresinde 15 dalga boyunun toplamı.
// Merkez beyaz, ilk mertebelerde mavi/altın kenarlar, üst mertebeler soluk beyaza karışır
// (Young'ın güneş ışığıyla gördüğü desen). Dönüş [R,G,B], beyaz = (1,1,1).
function nmRGB(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  return [r * f, g * f, b * f];
}
const SPECTRA = new Map();
function spectrum(band) {
  let out = SPECTRA.get(band);
  if (out) return out;
  out = [];
  const n = 15;
  for (let i = 0; i < n; i++) {
    const nm = 550 * (1 - band + (2 * band * i) / (n - 1));
    out.push({ m: nm / 550, c: nmRGB(nm) });
  }
  const sum = [0, 0, 0];
  out.forEach((s) => s.c.forEach((v, i) => (sum[i] += v)));
  out.forEach((s) => (s.c = s.c.map((v, i) => v / (sum[i] || 1))));
  SPECTRA.set(band, out);
  return out;
}
// band: göreli yarı bant genişliği (0.24 ≈ 420–680 nm güneş ışığı; dar bant daha çok mertebe gösterir)
export function whiteRGB(x, P, g) {
  const rgb = [0, 0, 0];
  for (const s of spectrum(P.band ?? 0.13)) {
    const I = lightI(x, P.lambda * s.m, g);
    rgb[0] += s.c[0] * I;
    rgb[1] += s.c[1] * I;
    rgb[2] += s.c[2] * I;
  }
  return rgb;
}

export function beams(x, P, g) {
  const s2 = 2 * P.beamSigma * P.beamSigma;
  const c1 = g.xc - P.beamOffset, c2 = g.xc + P.beamOffset;
  return [Math.exp(-((x - c1) ** 2) / s2), Math.exp(-((x - c2) ** 2) / s2)];
}
export function electronI(x, c, P, g) {
  const [a, b] = beams(x, P, g);
  return a + b + 2 * c * Math.sqrt(a * b) * Math.cos(phase(x, P.lambda, g));
}

// Tek fonksiyon: ön ayara göre ham yoğunluk (normalize edilmemiş)
export function intensity(x, preset, c = 1, g = GEOM_DEFAULT, over) {
  const P = presetOf(preset, over);
  if (preset === 'light') {
    if (P.white) {
      const [r, gg, b] = whiteRGB(x, P, g);
      return 0.3 * r + 0.55 * gg + 0.15 * b;
    }
    return lightI(x, P.lambda, g);
  }
  return electronI(x, c, P, g);
}

// Klasik "parçacık" beklentisi: iki dar şerit
export function ghostI(x, g = GEOM_DEFAULT, sigma = 16) {
  return g.proj.reduce((a, p) => a + Math.exp(-((x - p) ** 2) / (2 * sigma * sigma)), 0);
}

// ------------------------------------------------------------ profil (önbellekli)
const PROFILE = new Map();
const qc = (c) => Math.round(Math.min(1, Math.max(0, c)) * 50) / 50;

// 512 kutulu profil + CDF. { xs, I (0..1, max=1), max, cdf }
export function profile(preset, c = 1, g = GEOM_DEFAULT, over) {
  const cq = preset === 'light' ? 1 : qc(c);
  const key = `${preset}|${cq}|${g.key}|${over ? JSON.stringify(over) : ''}`;
  let pr = PROFILE.get(key);
  if (pr) return pr;
  const N = 512;
  const I = new Float32Array(N), cdf = new Float32Array(N + 1);
  let max = 0;
  for (let i = 0; i < N; i++) {
    const x = g.x0 + ((i + 0.5) / N) * g.w;
    const v = Math.max(0, intensity(x, preset, cq, g, over));
    I[i] = v;
    if (v > max) max = v;
  }
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += I[i];
    cdf[i + 1] = acc;
  }
  for (let i = 0; i <= N; i++) cdf[i] /= acc || 1;
  for (let i = 0; i < N; i++) I[i] /= max || 1;
  pr = { N, I, cdf, max, c: cq, preset };
  if (PROFILE.size > 400) PROFILE.clear();
  PROFILE.set(key, pr);
  return pr;
}

// normalize yoğunluk (profil maksimumu = 1), doğrusal ara değer
export function profileAt(pr, x, g = GEOM_DEFAULT) {
  const f = ((x - g.x0) / g.w) * pr.N - 0.5;
  const i = Math.floor(f);
  if (i < 0) return pr.I[0];
  if (i >= pr.N - 1) return pr.I[pr.N - 1];
  const u = f - i;
  return pr.I[i] * (1 - u) + pr.I[i + 1] * u;
}

export function invCDF(pr, u, g = GEOM_DEFAULT) {
  const cdf = pr.cdf;
  let lo = 0, hi = pr.N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = cdf[lo + 1] - cdf[lo];
  const f = span > 0 ? (u - cdf[lo]) / span : 0.5;
  return g.x0 + ((lo + f) / pr.N) * g.w;
}

// i. elektronun çarpma x'i (aynı i her zaman aynı yere)
export function sampleX(i, c = 1, preset = 'electron', g = GEOM_DEFAULT, over) {
  return invCDF(profile(preset, c, g, over), hash(i * 1.618 + 7), g);
}
export function dotY(i, h) {
  return (hash(i * 7.31) - 0.5) * 0.86 * h;
}

// Kontrast (görünürlük) V = (Imax − Imin)/(Imax + Imin), merkez ±halfW içinde
export function visibility(c = 1, preset = 'electron', g = GEOM_DEFAULT, over) {
  const P = presetOf(preset, over);
  const halfW = (P.lambda * g.L) / g.d; // bir saçak aralığı
  let mx = -Infinity, mn = Infinity;
  for (let i = 0; i <= 96; i++) {
    const x = g.xc - halfW + (2 * halfW * i) / 96;
    const v = intensity(x, preset, c, g, over);
    if (v > mx) mx = v;
    if (v < mn) mn = v;
  }
  return mx + mn > 0 ? (mx - mn) / (mx + mn) : 0;
}
// dizi (ör. histogram) üzerinden kontrast
export function visibilityOf(values) {
  let mx = -Infinity, mn = Infinity;
  for (const v of values) {
    if (v > mx) mx = v;
    if (v < mn) mn = v;
  }
  return mx + mn > 0 ? (mx - mn) / (mx + mn) : 0;
}

// Ekranda r1 − r2 = Δ olan x (yol farkı x'te tekdüze artar → ikiye bölme)
export function xForPathDiff(delta, y, g = GEOM_DEFAULT) {
  let lo = g.x0 - 2000, hi = g.x1 + 2000;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (pathDiff(mid, y, g) < delta) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
// Parlak (m tam) / karanlık (m+½) saçak konumları, ekran şeridi içinde
export function fringeXs(lambda, g = GEOM_DEFAULT, dark = false) {
  const out = [];
  const maxM = Math.ceil(g.w / ((lambda * g.L) / g.d)) + 2;
  for (let m = -maxM; m <= maxM; m++) {
    const order = dark ? m + 0.5 : m;
    const dmax = Math.hypot(g.d, 0);
    if (Math.abs(order * lambda) >= dmax) continue;
    const x = xForPathDiff(order * lambda, g.screenY, g);
    if (x >= g.x0 && x <= g.x1) out.push({ m: order, x });
  }
  return out;
}

// ------------------------------------------------------------ sayım eğrisi
// keys [[t, N], ...] → N(t) logaritmik ara değer; tOf(n): N'nin n'ye ulaştığı an
const CURVES = new WeakMap();
export function countCurve(keys) {
  if (!Array.isArray(keys) || !keys.length) return { N: () => 0, tOf: () => Infinity, rate: () => 0, total: 0, t0: Infinity };
  let cc = CURVES.get(keys);
  if (cc) return cc;
  const k = keys.map((e) => [Number(e[0]), Math.max(0, Number(e[1]))]).sort((a, b) => a[0] - b[0]);
  const lg = (n) => Math.log(n + 1);
  const N = (t) => {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 0; i < k.length - 1; i++) {
      if (t < k[i + 1][0]) {
        const u = (t - k[i][0]) / (k[i + 1][0] - k[i][0] || 1);
        return Math.exp(lg(k[i][1]) + (lg(k[i + 1][1]) - lg(k[i][1])) * u) - 1;
      }
    }
    return k[k.length - 1][1];
  };
  const tOf = (n) => {
    if (n <= k[0][1]) return k[0][0];
    for (let i = 0; i < k.length - 1; i++) {
      const a = k[i][1], b = k[i + 1][1];
      if (n <= b && b > a) {
        const u = (lg(n) - lg(a)) / (lg(b) - lg(a));
        return k[i][0] + u * (k[i + 1][0] - k[i][0]);
      }
    }
    return Infinity;
  };
  const rate = (t) => (N(t + 0.05) - N(t - 0.05)) / 0.1;
  cc = { N, tOf, rate, total: k[k.length - 1][1], t0: k[0][0], t1: k[k.length - 1][0] };
  CURVES.set(keys, cc);
  return cc;
}
