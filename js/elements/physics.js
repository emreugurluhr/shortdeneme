// Fizik öğeleri: çift yarık düzeneği (dalga alanı, yarıklı levha, kaynak/elektron
// tabancası, algılayıcı ekran + grafik), gözlemci gözü ve üst üste binme grafiği.
//
// Çizici sözleşmesi (hud.js ile aynı): draw(ctx, el, env, p). ctx öğenin MERKEZİNE
// taşınmış, giriş/çıkış/döngü dönüşümleri ve opaklık uygulanmıştır.
// p = { lt, inRaw, until, t (videonun mutlak sn'si), st (sahne içi sn), ox, oy (öğe merkezi) }.
//
// Düzenek öğeleri (wavefield, barrier, emitter, detector) dünya koordinatında, ortak
// `geom` ile çizer (varsayılan: kaynak 540,250 · levha y 560 · yarıklar x 480/600 ·
// ekran y 1040 · x 90..990). Fizik js/elements/slit.js'tedir; hepsi aynı formülleri
// kullandığı için saçaklar, hiperboller, grafik ve noktalar birebir hizalıdır.
// Alanlarda (K) yazanlar düz değer ya da [[t, v], ...] anahtar dizisi olabilir
// (bkz. keys.js). Zaman: varsayılan mutlak video saniyesi; el.clock:'scene' sahne içi,
// 'local' öğe göründükten sonraki saniye.
// Belirlenimci: Math.random yok, her şey p.t'nin saf fonksiyonu (ağır kısımlar önbellekte).

import { kv, kvStep, clamp, lerp, smooth, parseColor, mixColor, fadeColor, isKeys } from './keys.js';
import {
  geomOf, presetOf, hash, profile, profileAt, sampleX, dotY, visibility, visibilityOf,
  fringeXs, xForPathDiff, countCurve, whiteRGB, ghostI,
} from './slit.js';

const TAU = Math.PI * 2;
const FONT_UI = '"Nunito", system-ui, sans-serif';
const FONT_NUM = '"Barlow Condensed", "Nunito", "Arial Narrow", sans-serif';
const MAGENTA = '#ff4d8d';
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function num(v, d) {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function col(v, theme, d) {
  if (v === null || v === undefined || v === '' || v === true || v === false) return d;
  if (v === 'accent') return theme.accent;
  if (v === 'accent2') return theme.accent2;
  if (v === 'text') return theme.text;
  if (v === 'bg') return theme.bg;
  if (v === 'bg2') return theme.bg2;
  return String(v);
}
const rgbOf = (c) => parseColor(c) || [255, 255, 255, 1];
function K(el, key, t, d) {
  const v = kv(el[key], t);
  return v === undefined || v === null ? d : v;
}
function Kn(el, key, t, d) {
  return num(kv(el[key], t), d);
}
function clockOf(el, p) {
  if (el.clock === 'local') return p.lt;
  if (el.clock === 'scene') return Number.isFinite(p.st) ? p.st : p.lt;
  return Number.isFinite(p.t) ? p.t : p.lt;
}
// dünya koordinatına dön (öğe merkezi çevirisini geri al)
function toWorld(ctx, el, p) {
  ctx.translate(-num(p.ox, num(el.x, 540)), -num(p.oy, num(el.y, 960)));
}
function makeCanvas(w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function setLS(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}
function fmtTR(n) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.floor(n));
}

// Yumuşak ışık lekesi (önceden çizilmiş, drawImage ile hızlı)
const SPRITES = new Map();
function glowSprite(color) {
  let s = SPRITES.get(color);
  if (s) return s;
  const R = 64;
  s = makeCanvas(R * 2, R * 2);
  const g = s.getContext('2d');
  const [r, gg, b] = rgbOf(color);
  const gr = g.createRadialGradient(R, R, 0, R, R, R);
  gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  gr.addColorStop(0.18, `rgba(${r},${gg},${b},0.55)`);
  gr.addColorStop(0.45, `rgba(${r},${gg},${b},0.16)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, R * 2, R * 2);
  if (SPRITES.size > 64) SPRITES.clear();
  SPRITES.set(color, s);
  return s;
}
function blob(ctx, x, y, r, color, a = 1) {
  if (a <= 0.003 || r <= 0) return;
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * Math.min(1, a);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = pa;
}
function sparkle(ctx, x, y, r, color, a = 1) {
  blob(ctx, x, y, r, color, a * 0.8);
  if (a < 0.05) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, a);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - r * 1.4, y);
  ctx.lineTo(x + r * 1.4, y);
  ctx.moveTo(x, y - r * 1.4);
  ctx.lineTo(x, y + r * 1.4);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------ öğe bulma (bağlantılar)
// Sahne + sahne öncesi "stage" öğeleri arasında tür/ad ile arar.
const ELS_CACHE = new WeakMap();
function allEls(env) {
  const key = env?.timeline || env?.stage || env;
  if (!key || typeof key !== 'object') return [];
  let list = ELS_CACHE.get(key);
  if (list) return list;
  list = [];
  const push = (arr) => Array.isArray(arr) && arr.forEach((e) => e && typeof e === 'object' && list.push(e));
  push(env.stage);
  push(env.plan?.stage);
  (env.timeline?.scenes || []).forEach((s) => push(s.scene?.elements));
  ELS_CACHE.set(key, list);
  return list;
}
function findRun(env, runId, el) {
  if (el?.link?.keys) return { run: el.link, det: null };
  for (const d of allEls(env)) {
    if (d.type !== 'detector' || !Array.isArray(d.runs)) continue;
    if (el?.link?.detector && d.id !== el.link.detector) continue;
    const run = d.runs.find((r) => String(r.id) === String(runId));
    if (run) return { run, det: d };
  }
  return null;
}
function findEmitter(env, id) {
  return allEls(env).find((e) => e.type === 'emitter' && (!id || e.id === id)) || null;
}

// ================================================================== WAVEFIELD
// İki yarıktan Huygens dalgaları: ψ_j = A_j·cos(k·(ρ_s + r_j) − ωt + δ_j)
// (ρ_s: kaynaktan yarığa uzaklık; levhanın üstünde kaynaktan gelen dalga ile aynı faz).
// Düşük çözünürlüklü tampona yazılır, yumuşak büyütülüp 'lighter' ile eklenir.
const WF_CACHE = new WeakMap();

function wfGrid(el, g, P, preset) {
  let c = WF_CACHE.get(el);
  const res = clamp(num(el.res, preset === 'electron' ? 0.42 : 0.32), 0.15, 1);
  const top = num(el.top, g.srcY - 20);
  const bottom = num(el.bottom, g.screenY - 42);
  const key = `${g.key}|${preset}|${P.lambda}|${res}|${top}|${bottom}|${el.falloff}|${el.edge}`;
  if (c && c.key === key) return c;
  const cols = Math.round(g.w * res), rows = Math.round((bottom - top) * res);
  const n = cols * rows;
  // P1/P2/PI: k·r ön çarpımı (kosinüs tablosu indeksi), A1/A2/AI: genlik (kenar yumuşatması dahil)
  const P1 = new Float32Array(n), P2 = new Float32Array(n), A1 = new Float32Array(n), A2 = new Float32Array(n);
  const r1 = new Float32Array(n), r2 = new Float32Array(n), X12 = new Float32Array(n), C12 = new Float32Array(n);
  const PI = new Float32Array(n), AI = new Float32Array(n), RI = new Float32Array(n), zone = new Uint8Array(n);
  const bTop = g.barrierY - g.thick / 2, bBot = g.barrierY + g.thick / 2;
  const s1 = g.slits[0], s2 = g.slits[1];
  const lam = P.lambda;
  const kI = COS_N / lam; // r → tablo indeksi
  const isE = preset === 'electron';
  const s4 = isE ? 4 * P.beamSigma * P.beamSigma : 1;
  const cB = isE ? [g.xc - P.beamOffset, g.xc + P.beamOffset] : null;
  const edgeX = num(el.edge, 70);
  const fo = num(el.falloff, isE ? 6 : 3); // 1/√r yayılımının başladığı uzaklık (λ cinsinden)
  for (let j = 0; j < rows; j++) {
    const y = top + (j + 0.5) / res;
    for (let i = 0; i < cols; i++) {
      const x = g.x0 + (i + 0.5) / res;
      const q = j * cols + i;
      const ex = smooth(clamp(Math.min(x - g.x0, g.x1 - x) / edgeX));
      if (y > bBot) {
        zone[q] = 2;
        const dy = y - g.barrierY;
        const a = Math.hypot(x - s1, dy), b = Math.hypot(x - s2, dy);
        const eb = ex * smooth(clamp((bottom - y) / 40));
        // ≈ 1/√r yayılım (yakın alanda doymasın) · eğiklik √cosθ
        let fa = Math.sqrt(dy / a) / Math.sqrt(1 + a / (fo * lam));
        let fb = Math.sqrt(dy / b) / Math.sqrt(1 + b / (fo * lam));
        if (isE) {
          // elektron demeti zarfı: ekrana izdüşümde g_j ile aynı
          const Xa = s1 + (g.L * (x - s1)) / dy, Xb = s2 + (g.L * (x - s2)) / dy;
          fa *= Math.exp(-((Xa - cB[0]) ** 2) / s4);
          fb *= Math.exp(-((Xb - cB[1]) ** 2) / s4);
        }
        A1[q] = fa * eb;
        A2[q] = fb * eb;
        r1[q] = a;
        r2[q] = b;
        P1[q] = (a * kI) % COS_N;
        P2[q] = (b * kI) % COS_N;
        C12[q] = Math.cos((TAU / lam) * (a - b));
        X12[q] = 2 * A1[q] * A2[q] * C12[q];
      } else if (y < bTop) {
        zone[q] = 1;
        const d = Math.hypot(x - g.srcX, y - g.srcY);
        const dy = Math.max(0, y - g.srcY);
        RI[q] = d;
        PI[q] = (d * kI) % COS_N;
        AI[q] = ((dy / (d + 1e-3)) ** 1.5 / Math.sqrt(1 + d / (6 * lam))) * Math.exp(-(((x - g.srcX) / 360) ** 2)) * ex * smooth(clamp((bTop - y) / 8));
      }
    }
  }
  const canvas = makeCanvas(cols, rows);
  const cx = canvas.getContext('2d');
  const img = cx.createImageData(cols, rows);
  c = { key, cols, rows, res, top, bottom, P1, P2, A1, A2, r1, r2, X12, C12, PI, AI, RI, zone, canvas, cx, img, rhoS: Math.hypot(s1 - g.srcX, g.barrierY - g.srcY) };
  WF_CACHE.set(el, c);
  return c;
}

const COS_N = 2048;
const COS_M = COS_N - 1;
const COS = new Float32Array(COS_N);
for (let i = 0; i < COS_N; i++) COS[i] = Math.cos((i / COS_N) * TAU);
const cosL = (a) => {
  let f = (a / TAU) * COS_N;
  f = f - Math.floor(f / COS_N) * COS_N;
  return COS[f | 0];
};
// faz kayması → [0, COS_N) tablo kayması
const shiftOf = (ph) => {
  let f = (ph / TAU) * COS_N;
  return f - Math.floor(f / COS_N) * COS_N;
};

// hiperboller (r1 − r2 = Δ) önbellekli çoklu çizgi
const HYP_CACHE = new Map();
function hyperbola(delta, g, bottom) {
  const key = `${g.key}|${delta.toFixed(3)}|${bottom}`;
  let pts = HYP_CACHE.get(key);
  if (pts) return pts;
  pts = [];
  const y0 = g.barrierY + g.thick / 2 + 1;
  for (let y = y0; y <= bottom + 0.01; y += 6) pts.push([xForPathDiff(delta, y, g), y]);
  if (pts[pts.length - 1][1] < bottom) pts.push([xForPathDiff(delta, bottom, g), bottom]);
  if (HYP_CACHE.size > 300) HYP_CACHE.clear();
  HYP_CACHE.set(key, pts);
  return pts;
}
function strokePartial(ctx, pts, u) {
  if (u <= 0) return;
  const n = pts.length - 1;
  const f = u * n;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= Math.floor(f); i++) ctx.lineTo(pts[i][0], pts[i][1]);
  const i = Math.floor(f);
  if (i < n) {
    const r = f - i;
    ctx.lineTo(lerp(pts[i][0], pts[i + 1][0], r), lerp(pts[i][1], pts[i + 1][1], r));
  }
  ctx.stroke();
}

function drawWavefield(ctx, el, env, p) {
  const theme = env.theme;
  const t = clockOf(el, p);
  const g = geomOf(el.geom);
  const preset = String(K(el, 'preset', t, 'light'));
  const P = presetOf(preset, el.physics);
  const lam = P.lambda;
  const k = TAU / lam;
  const speed = num(el.speed, 60);
  const w = k * speed;
  const color = col(K(el, 'color', t, null), theme, preset === 'light' ? theme.accent2 : theme.accent);
  const amp = Kn(el, 'amp', t, 1);
  const coh = clamp(Kn(el, 'coherence', t, 1));
  const incident = Kn(el, 'incident', t, 0);
  const incT0 = num(el.incidentFront, null);
  const incSpeed = num(el.incidentSpeed, 300);
  const incFront = incT0 === null ? 1e9 : (t - incT0) * incSpeed;
  const frontV = el.front === undefined ? 1e9 : Kn(el, 'front', t, 1e9);
  const beam = Kn(el, 'beam', t, 0);
  const gain = num(el.gain, 1);
  const packets = (Array.isArray(el.packets) ? el.packets : []).filter((pk) => t >= num(pk.t0, 0) && t <= num(pk.t1, 0) + 0.08);
  const ampBelow = Math.max(amp, beam);
  const hyper = el.hyper || {};
  const antiK = Kn(hyper, 'anti', t, 0), nodeK = Kn(hyper, 'node', t, 0);
  // çizim ilerlemesi (şimdiye dek ulaşılan en yüksek değer) ile parlaklık ayrı: sönerken kısalmaz
  const revealOf = (v) => {
    let m = num(kv(v, t), 0), top = m;
    if (isKeys(v)) {
      top = 0;
      v.forEach((k) => { top = Math.max(top, Number(k[1])); if (Number(k[0]) <= t) m = Math.max(m, Number(k[1])); });
    }
    return clamp(top > 0 ? m / top : 0);
  };
  const antiR = revealOf(hyper.anti), nodeR = revealOf(hyper.node);
  const glints = Kn(el, 'glints', t, 0);
  const anyField = ampBelow > 0.003 || incident > 0.003 || packets.length > 0;
  toWorld(ctx, el, p);

  if (anyField) {
    const G = wfGrid(el, g, P, preset);
    const { cols, rows, P1, P2, A1, A2, r1, r2, X12, C12, PI, AI, RI, zone, img } = G;
    // hyper.node > 0: karanlık (söndürücü) hiperboller gerçek karanlık şeritler olur: × lerp(1, cos²(πΔr/λ), node)
    const nodeDark = clamp(nodeK) * num(hyper.nodeDark, 1);
    const data = img.data;
    const [cr, cg, cb] = rgbOf(color);
    const ph0 = k * G.rhoS;
    // ölçüm (uyumsuzluk): ikinci dalganın fazı her 0.1 sn kayar ve yoğunluklar tutarsız
    // toplanır (girişim çizgileri silinir, iki ayrı halka takımı kalır)
    const jit = (1 - coh) * Math.PI * (2 * hash(Math.floor(t * 10) + 0.37) - 1);
    const sh1 = shiftOf(-w * t + ph0), sh2 = shiftOf(-w * t + ph0 + jit);
    const pkList = packets.map((pk) => {
      const t0 = num(pk.t0, 0), t1 = num(pk.t1, t0 + 1);
      const v = g.L / Math.max(0.05, t1 - t0);
      const fadeEnd = t > t1 ? 1 - (t - t1) / 0.08 : 1;
      return { R: v * (t - t0), sig: num(pk.sigma, 38), a: num(pk.amp, 1.6) * clamp(fadeEnd) };
    });
    const hasPk = pkList.length > 0;
    const base = 0.05;
    const fr = frontV;
    const noFront = fr > 1e8;
    const gk = (preset === 'electron' ? 1.7 : 0.95) * gain;
    const doBelow = ampBelow > 0.003;
    const doInc = incident > 0.003;
    const shI = sh1;
    const N = cols * rows;
    for (let q = 0, o = 0; q < N; q++, o += 4) {
      const z = zone[q];
      let b = 0;
      if (z === 2) {
        if (doBelow) {
          let m1 = 1, m2 = 1;
          if (!noFront) {
            m1 = (fr - r1[q]) / 30 + 0.5;
            m1 = m1 < 0 ? 0 : m1 > 1 ? 1 : m1;
            m2 = (fr - r2[q]) / 30 + 0.5;
            m2 = m2 < 0 ? 0 : m2 > 1 ? 1 : m2;
          }
          if (m1 > 0 || m2 > 0) {
            const a1 = A1[q] * m1, a2 = A2[q] * m2;
            const p1 = a1 * COS[(P1[q] + sh1) & COS_M];
            const p2 = a2 * COS[(P2[q] + sh2) & COS_M];
            // koherent: ψ1+ψ2'nin tepeleri; tutarsız: iki dalganın ayrı ayrı tepeleri
            const s = p1 + p2;
            let bc = s > 0 ? s * Math.sqrt(s) : 0;
            if (coh < 0.999) {
              const u1 = p1 > 0 ? p1 * Math.sqrt(p1) : 0, u2 = p2 > 0 ? p2 * Math.sqrt(p2) : 0;
              bc = coh * bc + (1 - coh) * 1.25 * (u1 + u2);
            }
            // ortalama yoğunluk (lob parıltısı) + taban tonu
            const avg = a1 * a1 + a2 * a2 + coh * m1 * m2 * X12[q];
            b = ampBelow * (gk * bc + 0.07 * avg + base * (a1 > a2 ? a1 : a2));
            if (nodeDark > 0.003) b *= 1 - nodeDark * 0.5 * (1 - C12[q]);
          }
        }
        if (hasPk) {
          const a = r1[q], bb = r2[q];
          for (const pk of pkList) {
            const d1 = (a - pk.R) / pk.sig, d2 = (bb - pk.R) / pk.sig;
            if (d1 * d1 > 9 && d2 * d2 > 9) continue;
            const s1v = A1[q] * Math.exp(-d1 * d1), s2v = A2[q] * Math.exp(-d2 * d2);
            // koherent paket: |ψ1+ψ2|² → yaprak (petal) desenli iki halka
            const I = s1v * s1v + s2v * s2v + (X12[q] / (2 * A1[q] * A2[q] + 1e-9)) * 2 * s1v * s2v * coh;
            const cr1 = COS[(P1[q] + sh1) & COS_M];
            b += pk.a * (I * 1.4 + 0.3 * Math.max(0, (s1v + s2v) * cr1));
          }
        }
      } else if (z === 1 && doInc) {
        const d = RI[q];
        let m = (incFront - d) / 30 + 0.5;
        m = m < 0 ? 0 : m > 1 ? 1 : m;
        if (m > 0) {
          const v = AI[q] * m * 1.3 * COS[(PI[q] + shI) & COS_M];
          b = incident * ((v > 0 ? v * Math.sqrt(v) : 0) * gk + base * m * AI[q]);
        }
      }
      if (b > 1) b = 1;
      data[o] = cr * b;
      data[o + 1] = cg * b;
      data[o + 2] = cb * b;
      data[o + 3] = 255;
    }
    G.cx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = el.smoothing || 'low'; // tampon zaten yumuşak; çift doğrusal yeterli ve hızlı
    ctx.drawImage(G.canvas, g.x0, G.top, g.w, G.bottom - G.top);
    ctx.restore();
  }
  // Jönsson modu: kaynaktan levhaya ince sürekli demet
  if (beam > 0.003) drawBeamFan(ctx, g, color, beam, el.beamSpread);

  // hiperboller: parlak (r1−r2 = mλ) düz, karanlık ((m+½)λ) kesikli
  if (antiK > 0.003 || nodeK > 0.003) {
    const bottom = num(hyper.bottom, g.screenY);
    const orders = num(hyper.orders, 3);
    const hc = col(kv(hyper.color, t), theme, color);
    const nc = col(kv(hyper.nodeColor, t), theme, '#8fb0ff');
    const stag = 0.35;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x0, g.barrierY, g.w, bottom - g.barrierY + 2);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let m = -orders; m <= orders; m++) {
      if (Math.abs(m * lam) >= g.d) continue;
      const u = clamp(antiR * (1 + stag * orders) - stag * Math.abs(m));
      if (u <= 0) continue;
      const pts = hyperbola(m * lam, g, bottom);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = fadeColor(hc, 0.18 * Math.min(1, antiK * 1.5));
      ctx.lineWidth = 9;
      strokePartial(ctx, pts, u);
      ctx.strokeStyle = fadeColor(hc, 0.95 * Math.min(1, antiK * 1.5));
      ctx.lineWidth = 2.5;
      strokePartial(ctx, pts, u);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (nodeK > 0.003) {
      ctx.setLineDash([10, 9]);
      ctx.lineWidth = 2;
      for (let m = -orders - 1; m <= orders; m++) {
        const d = (m + 0.5) * lam;
        if (Math.abs(d) >= g.d) continue;
        const u = clamp(nodeR * (1 + stag * orders) - stag * Math.abs(m + 0.5));
        if (u <= 0) continue;
        ctx.strokeStyle = fadeColor(nc, 0.45 * Math.min(1, nodeK * 1.5));
        strokePartial(ctx, hyperbola(d, g, bottom), u);
      }
    }
    ctx.restore();
  }

  // süpürme: parlak hiperboller boyunca levhadan ekrana kayan ışık (hyper.sweep [{t, dur}])
  (Array.isArray(hyper.sweep) ? hyper.sweep : []).forEach((sw) => {
    const u = (t - num(sw.t, -9)) / num(sw.dur, 0.45);
    if (u < 0 || u > 1.25) return;
    const bottom = num(hyper.bottom, g.screenY);
    const orders = num(hyper.orders, 3);
    const hc = col(kv(hyper.color, t), theme, color);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const fadeA = u > 1 ? 1 - (u - 1) / 0.25 : 1;
    for (let m = -orders; m <= orders; m++) {
      if (Math.abs(m * lam) >= g.d) continue;
      const pts = hyperbola(m * lam, g, bottom);
      const n = pts.length - 1;
      const head = Math.min(1, u) * n, tail = Math.max(0, head - n * 0.28);
      const seg = pts.slice(Math.floor(tail), Math.ceil(head) + 1);
      if (seg.length < 2) continue;
      [[10, 0.22], [3, 0.95]].forEach(([lw, al]) => {
        ctx.lineWidth = lw;
        const a0 = seg[0], a1 = seg[seg.length - 1];
        const gr = ctx.createLinearGradient(a0[0], a0[1], a1[0], a1[1]);
        gr.addColorStop(0, fadeColor(hc, 0));
        gr.addColorStop(1, fadeColor(lw > 5 ? hc : '#ffffff', al * fadeA));
        ctx.strokeStyle = gr;
        ctx.beginPath();
        seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      });
      blob(ctx, seg[seg.length - 1][0], seg[seg.length - 1][1], 16, '#ffffff', 0.8 * fadeA);
    }
    ctx.restore();
  });

  // parıltılar: tepe çemberlerinin parlak hiperboller üzerindeki kesişimleri
  if (glints > 0.003 && amp > 0.01) {
    const bottom = num(el.bottom, g.screenY - 42);
    const orders = num(hyper.orders, 3);
    const G = wfGrid(el, g, P, preset);
    const ph0 = k * G.rhoS;
    const s1 = g.slits[0], d = g.d;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const Rmax = Math.hypot(g.w, g.L);
    const nMin = Math.ceil((k * lam - w * t + ph0) / TAU) - 1;
    for (let m = -orders; m <= orders; m++) {
      if (Math.abs(m * lam) >= d) continue;
      for (let n = nMin; ; n++) {
        const R1 = (TAU * n + w * t - ph0) / k; // tepe: kR1 − ωt + ph0 = 2πn
        if (R1 > Rmax) break;
        if (R1 < lam * 1.5) continue;
        const R2 = R1 - m * lam;
        if (R2 <= 0) continue;
        const xs = (R1 * R1 - R2 * R2 + d * d) / (2 * d);
        const yy = R1 * R1 - xs * xs;
        if (yy <= 0) continue;
        const x = s1 + xs, y = g.barrierY + Math.sqrt(yy);
        if (y > bottom || x < g.x0 || x > g.x1) continue;
        if (frontV < 1e8 && R1 > frontV) continue;
        const fall = 1 / Math.sqrt(1 + R1 / (4 * lam));
        sparkle(ctx, x, y, 7 + 5 * fall, '#ffffff', glints * fall * 0.9);
      }
    }
    ctx.restore();
  }
}

// Elektron demeti: tabanca ucundan (≈8 px) iki yarığı da kapsayan geniş, sönük yelpaze
function drawBeamFan(ctx, g, color, beam, spread) {
  const top = g.barrierY - g.thick / 2;
  const half = num(spread, g.d / 2 + g.a * 2.2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(g.xc - half, 0, g.xc + half, 0);
  gr.addColorStop(0, fadeColor(color, 0));
  gr.addColorStop(0.2, fadeColor(color, 0.16 * beam));
  gr.addColorStop(0.5, fadeColor(color, 0.22 * beam));
  gr.addColorStop(0.8, fadeColor(color, 0.16 * beam));
  gr.addColorStop(1, fadeColor(color, 0));
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(g.srcX - 4, g.srcY + 6);
  ctx.lineTo(g.srcX + 4, g.srcY + 6);
  ctx.lineTo(g.xc + half, top);
  ctx.lineTo(g.xc - half, top);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ================================================================== BARRIER
const BAR_CACHE = new WeakMap();
function barrierSlab(el, g) {
  const key = `${g.key}|${num(el.w, g.w)}`;
  let c = BAR_CACHE.get(el);
  if (c && c.key === key) return c;
  const bw = num(el.w, g.w), th = g.thick, pad = 6;
  const s = 2;
  const cv = makeCanvas((bw + pad * 2) * s, (th + pad * 2) * s);
  const x = cv.getContext('2d');
  x.scale(s, s);
  x.translate(pad, pad);
  const left = 0, x0w = g.xc - bw / 2;
  const gaps = g.slits.map((sx) => [sx - g.a / 2 - x0w, sx + g.a / 2 - x0w]);
  const pieces = [[left, gaps[0][0]], [gaps[0][1], gaps[1][0]], [gaps[1][1], bw]];
  pieces.forEach(([a, b], i) => {
    const r = 5;
    x.save();
    rr(x, a, 0, b - a, th, r);
    x.clip();
    const gr = x.createLinearGradient(0, 0, 0, th);
    gr.addColorStop(0, '#26304a');
    gr.addColorStop(0.18, '#1a2236');
    gr.addColorStop(1, '#0a0f1c');
    x.fillStyle = gr;
    x.fillRect(a, 0, b - a, th);
    // işlenmiş metal tarama
    x.strokeStyle = 'rgba(255,255,255,0.04)';
    x.lineWidth = 1;
    for (let k = a - th; k < b; k += 7) {
      x.beginPath();
      x.moveTo(k, th);
      x.lineTo(k + th, 0);
      x.stroke();
    }
    // üst kenar ışığı
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.fillRect(a, 0, b - a, 1);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.fillRect(a, th - 2, b - a, 2);
    x.restore();
    x.strokeStyle = 'rgba(160,190,255,0.16)';
    x.lineWidth = 1;
    rr(x, a + 0.5, 0.5, b - a - 1, th - 1, r);
    x.stroke();
    // cıvatalar (uç parçalarda)
    if (i !== 1) {
      const bx = i === 0 ? a + 16 : b - 16;
      [bx, i === 0 ? a + 40 : b - 40].forEach((cx) => {
        const bg = x.createRadialGradient(cx - 1, th / 2 - 1, 0.5, cx, th / 2, 4);
        bg.addColorStop(0, '#8a96b3');
        bg.addColorStop(1, '#2a3350');
        x.fillStyle = bg;
        x.beginPath();
        x.arc(cx, th / 2, 3.6, 0, TAU);
        x.fill();
      });
    }
    // alt kenar ölçek çizgileri
    x.fillStyle = 'rgba(255,255,255,0.14)';
    for (let k = Math.ceil(a / 12) * 12 + 6; k < b - 4; k += 12) x.fillRect(k, th - 6, 1, (k / 12) % 5 === 0 ? 5 : 3);
  });
  c = { key, cv, bw, pad, x0w };
  BAR_CACHE.set(el, c);
  return c;
}

function drawBarrier(ctx, el, env, p) {
  const theme = env.theme;
  const t = clockOf(el, p);
  const g = geomOf(el.geom);
  toWorld(ctx, el, p);
  const slab = barrierSlab(el, g);
  const th = g.thick;
  const top = g.barrierY - th / 2;
  const color = col(K(el, 'color', t, null), theme, theme.accent2);
  const stag = num(el.glowStagger, 0.15);
  const glowAt = (i) => clamp(Kn(el, 'glow', t - (i === 1 ? stag : 0), 0), 0, 1.5);
  // darbe (pulse): 0.4 sn parlama
  const pulse = [0, 0];
  (Array.isArray(el.pulses) ? el.pulses : []).forEach((pu) => {
    const a = t - num(pu.t, -9);
    if (a < 0 || a > 0.5) return;
    const v = a < 0.06 ? a / 0.06 : 1 - (a - 0.06) / 0.44;
    if (pu.slit === 'both' || pu.slit === undefined) { pulse[0] += v; pulse[1] += v; }
    else pulse[clamp(num(pu.slit, 0), 0, 1)] += v;
  });

  // arkadan sızan ışık (yarık boşluğu)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  g.slits.forEach((sx, i) => {
    const gl = glowAt(i) + pulse[i] * 1.2;
    if (gl <= 0.003) return;
    blob(ctx, sx, g.barrierY, 46 + 18 * pulse[i], color, 0.55 * gl);
    // dikey ışık çizgisi (levhanın üst/altına 40 px)
    const vg = ctx.createLinearGradient(0, g.barrierY - 52, 0, g.barrierY + 52);
    vg.addColorStop(0, fadeColor(color, 0));
    vg.addColorStop(0.5, fadeColor(color, Math.min(1, 0.6 * gl)));
    vg.addColorStop(1, fadeColor(color, 0));
    ctx.fillStyle = vg;
    ctx.fillRect(sx - g.a * 0.32, g.barrierY - 52, g.a * 0.64, 104);
  });
  ctx.restore();

  // levha
  ctx.drawImage(slab.cv, slab.x0w - slab.pad, top - slab.pad, slab.bw + slab.pad * 2, th + slab.pad * 2);

  // yarık dudakları (kenar ışığı)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  g.slits.forEach((sx, i) => {
    const gl = clamp(glowAt(i) + pulse[i], 0, 1.6);
    if (gl <= 0.003) return;
    [sx - g.a / 2, sx + g.a / 2].forEach((lx, side) => {
      const lg = ctx.createLinearGradient(0, top, 0, top + th);
      lg.addColorStop(0, fadeColor('#ffffff', 0.9 * Math.min(1, gl)));
      lg.addColorStop(0.5, fadeColor(color, Math.min(1, gl)));
      lg.addColorStop(1, fadeColor('#ffffff', 0.7 * Math.min(1, gl)));
      ctx.fillStyle = lg;
      ctx.fillRect(side ? lx : lx - 2.5, top + 1, 2.5, th - 2);
    });
    // yarık ağzının üst ve alt kenarında küçük parlama
    blob(ctx, sx, top, 14, '#ffffff', 0.35 * Math.min(1, gl));
    blob(ctx, sx, top + th, 14, color, 0.45 * Math.min(1, gl));
  });
  // ping halkaları (ör. ölçülen yarık)
  (Array.isArray(el.pings) ? el.pings : []).forEach((pg) => drawPing(ctx, g.slits[clamp(num(pg.slit, 0), 0, 1)], g.barrierY, t - num(pg.t, -9), col(pg.color, theme, MAGENTA)));
  ctx.restore();
}

function drawPing(ctx, x, y, a, color) {
  if (a < 0 || a > 0.45) return;
  const u = a / 0.45;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = fadeColor(color, 0.9 * (1 - u));
  ctx.lineWidth = 3 * (1 - u) + 1;
  ctx.beginPath();
  ctx.arc(x, y, 8 + 38 * easeOut(u), 0, TAU);
  ctx.stroke();
  blob(ctx, x, y, 26, color, 0.9 * (1 - u));
  blob(ctx, x, y, 10, '#ffffff', 1 - u);
  ctx.restore();
}

// ================================================================== EMITTER
const SHOT_CACHE = new WeakMap();
function emitterShots(el, env, g) {
  const lks = (Array.isArray(el.link) ? el.link : el.link ? [el.link] : []).filter((l) => l && typeof l === 'object');
  const found = lks.map((lk) => findRun(env, lk.run, { link: lk }));
  let c = SHOT_CACHE.get(el);
  if (c && c.shotsRef === el.shots && c.found.length === found.length && c.found.every((f, i) => f?.run === found[i]?.run)) return c;
  const shots = (Array.isArray(el.shots) ? el.shots : []).map((s) => ({ ...s, t: num(s.t, 0) }));
  const links = [];
  lks.forEach((lk, li) => {
    const run = found[li]?.run;
    if (!run || !isKeys(run.keys)) return;
    const geomR = found[li].det ? geomOf(found[li].det.geom) : g;
    const physR = run.physics || found[li].det?.physics;
    const cc = countCurve(run.keys);
    const runC = num(run.coherence, 1);
    const runPreset = run.preset || 'electron';
    const count = Math.max(0, Math.round(num(lk.count, 60)));
    const flight = num(lk.flight, 0.75);
    for (let i = 0; i < count; i++) {
      const landT = cc.tOf(i + 1);
      if (!Number.isFinite(landT)) break;
      const landX = sampleX(i, runC, runPreset, geomR, physR);
      shots.push({ t: landT - flight, landT, landX, flight, mode: lk.mode || 'wave', slit: landX > g.xc ? 1 : 0, linked: true, color: lk.color });
    }
    links.push({ lk, run, cc, physics: physR });
  });
  shots.sort((a, b) => a.t - b.t);
  c = { found, shotsRef: el.shots, shots, links, physics: links[0]?.physics };
  SHOT_CACHE.set(el, c);
  return c;
}

// tek bir kuantumun t anındaki durumu (konum, görünürlük) — göz takibi de kullanır
function shotState(s, t, g, el) {
  const mode = s.mode || 'wave';
  const F = num(s.flight, num(el.flight, 0.75));
  const t0 = s.t;
  if (t < t0) return null;
  const D1 = g.barrierY - g.thick / 2 - g.srcY;
  const L = g.screenY - g.barrierY;
  if (mode === 'hover') {
    const ha = num(s.hoverAt, t0 + 0.6);
    const hy = num(s.hoverY, g.barrierY - 50);
    const u = clamp((t - t0) / Math.max(0.01, ha - t0));
    const fadeAt = num(s.fadeAt, Infinity);
    const a = t > fadeAt ? 1 - (t - fadeAt) / 0.4 : 1;
    if (a <= 0) return null;
    return { x: lerp(g.srcX, g.xc, u), y: lerp(g.srcY, hy, easeOut(u)), a, phase: 'fly', mode, hover: u >= 1 };
  }
  if (mode === 'particle' || mode === 'ghost') {
    const j = s.slit !== undefined ? clamp(num(s.slit, 0), 0, 1) : num(s.landX, g.xc) > g.xc ? 1 : 0;
    const sx = g.slits[j];
    const lx = mode === 'ghost' ? g.proj[j] : num(s.landX, g.proj[j]);
    const tl = num(s.landT, t0 + F);
    const l1 = Math.hypot(sx - g.srcX, g.barrierY - g.srcY), l2 = Math.hypot(lx - sx, L);
    const tp = t0 + (tl - t0) * (l1 / (l1 + l2));
    if (t > tl) return { x: lx, y: g.screenY, a: 0, phase: 'landed', since: t - tl, tp, j, sx, mode };
    let x, y;
    if (t < tp) {
      const u = (t - t0) / (tp - t0);
      x = lerp(g.srcX, sx, u);
      y = lerp(g.srcY, g.barrierY, u);
    } else {
      const u = (t - tp) / (tl - tp);
      x = lerp(sx, lx, u);
      y = lerp(g.barrierY, g.screenY - num(el.landInset, 30), u);
    }
    const a = mode === 'ghost' ? clamp((tl - t) / (0.12 * (tl - t0))) : 1;
    return { x, y, a, phase: 'fly', tp, j, sx, lx, tl, mode };
  }
  // wave
  const tb = num(s.barrierT, t0 + F * (D1 / (D1 + L)));
  const tl = num(s.landT, t0 + F);
  if (t <= tb) {
    const u = (t - t0) / Math.max(0.01, tb - t0);
    const vanish = num(s.vanish, null);
    const splits = vanish === null && s.split !== false && el.split !== false;
    let a = splits ? 1 - smooth(clamp((u - 0.94) / 0.06)) : 1 - smooth(clamp((u - 0.86) / 0.14));
    if (vanish !== null) a *= 1 - smooth(clamp((u - vanish * 0.8) / (vanish * 0.25)));
    // dalga paketi levhaya yaklaşırken iki yarığa doğru ikiye açılır (orta çubuğa çarpmaz)
    const sp = splits ? smooth(clamp((u - 0.45) / 0.45)) : 0;
    return { x: lerp(g.srcX, g.xc, u), y: g.srcY + D1 * u, a, phase: 'fly', tb, tl, mode, vanished: vanish !== null, sp };
  }
  if (num(s.vanish, null) !== null) return null;
  if (t <= tl) return { x: g.xc, y: g.barrierY, a: 0, phase: 'wave', q: (t - tb) / Math.max(0.01, tl - tb), tb, tl, mode };
  return { x: num(s.landX, g.xc), y: g.screenY, a: 0, phase: 'landed', since: t - tl, tl, mode };
}

function drawQuantum(ctx, x, y, color, hero, a, trail, trailDir, size) {
  if (a <= 0.003) return;
  const rc = size ? size / 2 : hero ? 9 : 5, rh = size ? size * 1.6 : hero ? 30 : 18;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (trail > 0) {
    const [dx, dy] = trailDir;
    const tx = x - dx * trail, ty = y - dy * trail;
    const gr = ctx.createLinearGradient(x, y, tx, ty);
    gr.addColorStop(0, fadeColor(color, 0.75 * a));
    gr.addColorStop(1, fadeColor(color, 0));
    ctx.strokeStyle = gr;
    ctx.lineCap = 'round';
    ctx.lineWidth = rc * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.lineWidth = rc * 0.5;
    const gr2 = ctx.createLinearGradient(x, y, x - dx * trail * 0.5, y - dy * trail * 0.5);
    gr2.addColorStop(0, fadeColor('#ffffff', 0.7 * a));
    gr2.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = gr2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * trail * 0.5, y - dy * trail * 0.5);
    ctx.stroke();
  }
  blob(ctx, x, y, rh * 1.6, color, 0.85 * a);
  blob(ctx, x, y, rc * 1.8, '#ffffff', a);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, rc * 0.55, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// dalga kipinde levhadan sonra iki yarıktan yayılan, girişim çizgili yaylar
function drawArcs(ctx, g, q, color, a, lam, hero) {
  if (a <= 0.003) return;
  const k = TAU / lam;
  const R = Math.max(4, q * g.L * 1.04);
  const segs = 44;
  const span = 1.15;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  g.slits.forEach((sx, j) => {
    const other = g.slits[1 - j];
    for (let i = 0; i < segs; i++) {
      const th0 = Math.PI / 2 - span + (2 * span * i) / segs;
      const th1 = th0 + (2 * span) / segs;
      const tm = (th0 + th1) / 2;
      const px = sx + R * Math.cos(tm), py = g.barrierY + R * Math.sin(tm);
      if (py > g.screenY - 40) continue;
      const r2 = Math.hypot(px - other, py - g.barrierY);
      const stripe = 0.5 * (1 + Math.cos(k * (R - r2)));
      const edge = Math.cos(((tm - Math.PI / 2) / span) * (Math.PI / 2));
      const al = a * (0.15 + 0.85 * stripe) * edge;
      if (al < 0.02) continue;
      // yumuşak, parlayan dalga cephesi (geniş sönük + ince parlak)
      ctx.beginPath();
      ctx.arc(sx, g.barrierY, R, th0, th1);
      ctx.strokeStyle = fadeColor(color, Math.min(0.5, al) * 0.28);
      ctx.lineWidth = hero ? 16 : 12;
      ctx.stroke();
      ctx.strokeStyle = fadeColor(color, Math.min(0.5, al) * 0.55);
      ctx.lineWidth = hero ? 6 : 5;
      ctx.stroke();
      ctx.strokeStyle = fadeColor('#ffffff', Math.min(0.5, al) * 0.35);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawLamp(ctx, g, color, power, t, flareV = 1) {
  const x = g.srcX, y = g.srcY;
  const sh = 1 + 0.06 * Math.sin(t * TAU * 0.5) + 0.03 * Math.sin(t * 7.3);
  // ışık konisi (aşağı)
  if (power > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createLinearGradient(0, y, 0, y + 230);
    cg.addColorStop(0, fadeColor(color, 0.32 * power));
    cg.addColorStop(1, fadeColor(color, 0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 6);
    ctx.lineTo(x + 10, y + 6);
    ctx.lineTo(x + 95, y + 230);
    ctx.lineTo(x - 95, y + 230);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // pirinç gövde
  const hg = ctx.createLinearGradient(x - 50, y - 50, x + 50, y + 50);
  hg.addColorStop(0, '#f1d7a0');
  hg.addColorStop(0.35, '#b98a3e');
  hg.addColorStop(0.7, '#6d4c1d');
  hg.addColorStop(1, '#3a2810');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(x, y, 46, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#120d07';
  ctx.beginPath();
  ctx.arc(x, y, 37, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,236,190,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, 43, Math.PI * 1.05, Math.PI * 1.7);
  ctx.stroke();
  // vida başları
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    ctx.fillStyle = 'rgba(40,26,8,0.9)';
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 41.5, y + Math.sin(a) * 41.5, 1.8, 0, TAU);
    ctx.fill();
  }
  if (power <= 0.01) {
    ctx.fillStyle = '#2a1e0e';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, x, y, 120 * sh, color, 0.55 * power);
  blob(ctx, x, y, 44 * sh, '#fff2d0', 0.95 * power);
  blob(ctx, x, y, 16, '#ffffff', power);
  // 4 kollu parlama
  const fl0 = 95 * sh * power;
  [[1, 0], [0, 1]].forEach(([dx, dy]) => {
    const fl = dy ? fl0 * flareV : fl0;
    const gr = ctx.createLinearGradient(x - dx * fl, y - dy * fl, x + dx * fl, y + dy * fl);
    gr.addColorStop(0, 'rgba(255,240,210,0)');
    gr.addColorStop(0.5, `rgba(255,248,230,${0.9 * power})`);
    gr.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.strokeStyle = gr;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - dx * fl, y - dy * fl);
    ctx.lineTo(x + dx * fl, y + dy * fl);
    ctx.stroke();
  });
  ctx.restore();
}

function drawGun(ctx, g, color, power, t, coilT, bloom) {
  const x = g.srcX, y = g.srcY;
  const top = y - 160;
  // gövde
  const bg = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
  bg.addColorStop(0, '#0d121e');
  bg.addColorStop(0.3, '#33405c');
  bg.addColorStop(0.5, '#4a5878');
  bg.addColorStop(0.75, '#232c42');
  bg.addColorStop(1, '#0b0f19');
  ctx.fillStyle = bg;
  rr(ctx, x - 44, top, 88, 128, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,215,255,0.22)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // kanatçıklar
  ctx.fillStyle = '#1b2234';
  [-1, 1].forEach((s) => {
    ctx.beginPath();
    ctx.moveTo(x + s * 44, top + 18);
    ctx.lineTo(x + s * 62, top + 30);
    ctx.lineTo(x + s * 62, top + 96);
    ctx.lineTo(x + s * 44, top + 108);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,215,255,0.14)';
    ctx.stroke();
  });
  // flanş + nozul
  const ng = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
  ng.addColorStop(0, '#151b2a');
  ng.addColorStop(0.5, '#56658a');
  ng.addColorStop(1, '#151b2a');
  ctx.fillStyle = ng;
  rr(ctx, x - 54, top + 124, 108, 10, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 26, top + 134);
  ctx.lineTo(x + 26, top + 134);
  ctx.lineTo(x + 9, y - 2);
  ctx.lineTo(x - 9, y - 2);
  ctx.closePath();
  ctx.fill();
  // filaman penceresi
  rr(ctx, x - 13, top + 12, 26, 18, 5);
  ctx.fillStyle = '#05070c';
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, x, top + 21, 22, '#ffb35a', 0.55 * power);
  blob(ctx, x, top + 21, 7, '#fff1d0', 0.9 * power);
  ctx.restore();
  // 3 bobin halkası
  for (let i = 0; i < 3; i++) {
    const cy = top + 48 + i * 24;
    const lit = clamp(power * 0.25 + coilT[i]);
    ctx.fillStyle = '#0a0e17';
    rr(ctx, x - 47, cy - 6, 94, 12, 6);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(x - 46, 0, x + 46, 0);
    lg.addColorStop(0, fadeColor(color, 0));
    lg.addColorStop(0.5, fadeColor(color, 0.9 * lit));
    lg.addColorStop(1, fadeColor(color, 0));
    ctx.fillStyle = lg;
    rr(ctx, x - 46, cy - 3, 92, 6, 3);
    ctx.fill();
    if (lit > 0.4) blob(ctx, x, cy, 60, color, 0.25 * lit);
    ctx.restore();
  }
  // nozul parıltısı
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  blob(ctx, x, y, 34 + 30 * bloom, color, (0.35 + 0.65 * bloom) * power);
  blob(ctx, x, y, 8, '#ffffff', (0.4 + 0.6 * bloom) * power);
  ctx.restore();
}

function drawEmitter(ctx, el, env, p) {
  const theme = env.theme;
  const t = clockOf(el, p);
  const g = geomOf(el.geom);
  toWorld(ctx, el, p);
  const color = col(K(el, 'color', t, null), theme, theme.accent);
  const power = clamp(Kn(el, 'power', t, 1));
  const S = emitterShots(el, env, g);
  const lamE = presetOf('electron', S.physics).lambda;

  // bobin ışıkları ve nozul parıltısı: son atışlar
  const coilT = [0, 0, 0];
  let recent = 0;
  for (let i = S.shots.length - 1; i >= 0; i--) {
    const s = S.shots[i];
    if (s.t > t) continue;
    const a = t - s.t;
    if (a > 0.6) break;
    for (let c = 0; c < 3; c++) {
      const d = a - c * 0.05;
      if (d >= 0 && d < 0.28) coilT[c] = Math.max(coilT[c], 1 - d / 0.28);
    }
    recent++;
  }
  let bloom = clamp(recent / 6);
  S.links.forEach((L) => { bloom = Math.max(bloom, clamp(Math.log10(1 + L.cc.rate(t)) / 3)); });
  const beam = Kn(el, 'beam', t, 0);
  bloom = Math.max(bloom, beam);
  if (beam > 0.01) for (let c = 0; c < 3; c++) coilT[c] = Math.max(coilT[c], beam * (0.7 + 0.3 * Math.sin(t * 9 + c)));

  // kaynak cihazı (lamba ↔ tabanca, 0.5 sn ölçekli geçiş)
  const kind = kvStep(el.kind ?? 'gun', t);
  const drawKind = (kd, a, sc) => {
    if (a <= 0.003) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(g.srcX, g.srcY);
    ctx.scale(sc, sc);
    ctx.translate(-g.srcX, -g.srcY);
    if (kd === 'none' || kd === false) { ctx.restore(); return; }
    if (kd === 'lamp') drawLamp(ctx, g, col(el.lampColor, theme, theme.accent2), power, t, num(el.flareV, 1));
    else drawGun(ctx, g, color, power, t, coilT, bloom);
    ctx.restore();
  };
  const kD = num(el.kindDur, 0.5);
  if (kind.since < kD && kind.prev !== kind.cur) {
    // sırayla: eski cihaz ilk yarıda küçülüp söner, yenisi ikinci yarıda büyür (üst üste binmez)
    const u = kind.since / kD;
    const uo = smooth(clamp(u * 2)), ui = smooth(clamp(u * 2 - 1));
    drawKind(kind.prev, 1 - uo, 1 - 0.4 * uo);
    drawKind(kind.cur, ui, 0.7 + 0.3 * ui);
  } else drawKind(kind.cur, 1, 1);

  // Jönsson modu: sürekli demet = ince çizgi + yoğun nokta akışı
  if (beam > 0.01) {
    drawBeamFan(ctx, g, color, beam * 0.8, el.beamSpread);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const y0 = g.srcY + 4, y1 = g.barrierY - g.thick / 2;
    for (let i = 0; i < 26; i++) {
      const ph = (t * 1.9 + hash(i * 3.7)) % 1;
      const cyc = Math.floor(t * 1.9 + hash(i * 3.7));
      // her nokta bir yarığa (hash ile seçilir) doğru gider: demet iki yarığı da aydınlatır
      const j = hash(i * 5.3 + cyc * 1.7) < 0.5 ? 0 : 1;
      const tx = g.slits[j] + (hash(i * 9.1 + cyc) - 0.5) * g.a * 1.6;
      const y = y0 + (y1 - y0) * ph;
      const x = lerp(g.srcX, tx, ph);
      blob(ctx, x, y, 7, color, 0.8 * beam * (1 - smooth(clamp((ph - 0.85) / 0.15))));
      blob(ctx, x, y, 2.5, '#ffffff', 0.9 * beam * (1 - smooth(clamp((ph - 0.85) / 0.15))));
    }
    ctx.restore();
  }

  const lam = num(el.lambda, lamE);
  // akış (bağlantının sayısı aşılınca): uçuştaki elektronlardan en fazla 30 sönük nokta
  for (const { lk, cc } of S.links) {
    const F = num(lk.flight, 0.75);
    const count = num(lk.count, 60);
    const n0 = Math.max(count, Math.floor(cc.N(t)));
    const n1 = Math.floor(cc.N(t + F));
    const streamA = num(lk.streamAlpha, 0.55);
    if (n1 > n0 && t >= num(lk.streamFrom, -Infinity) && streamA > 0.003) {
      const step = Math.max(1, Math.floor((n1 - n0) / 30));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = n0; i < n1; i += step) {
        const tl = cc.tOf(i + 1);
        const u = 1 - (tl - t) / F;
        const D1 = g.barrierY - g.thick / 2 - g.srcY, L = g.screenY - g.barrierY;
        const yy = g.srcY + (D1 + L) * u;
        if (yy > g.barrierY - 14) continue;
        const lkRun = S.links.find((q) => q.lk === lk)?.run;
        const rc = num(lkRun?.coherence, 1);
        const j = rc < 0.5 ? (sampleX(i, rc, lkRun?.preset || 'electron', g, S.physics) > g.xc ? 1 : 0) : hash(i * 2.31) < 0.5 ? 0 : 1;
        const uu = clamp((yy - g.srcY) / Math.max(1, D1));
        const xx = lerp(g.srcX, g.slits[j], uu) + (hash(i * 0.77) - 0.5) * 6;
        blob(ctx, xx, yy, 9, col(lk.color, theme, color), streamA);
        blob(ctx, xx, yy, 2.5, '#ffffff', streamA * 1.27);
      }
      ctx.restore();
    }
  }

  // tek tek atışlar
  const pingColor = col(el.pingColor, theme, MAGENTA);
  for (const s of S.shots) {
    if (s.t > t) break;
    // namlu parlaması (muzzle: true, 0.12 sn)
    if ((s.muzzle || (el.muzzle && !s.linked)) && t - s.t < 0.14) {
      const u = (t - s.t) / 0.14;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, g.srcX, g.srcY + 4, 70 * (1 - 0.4 * u), col(s.color, theme, color), 0.9 * (1 - u));
      blob(ctx, g.srcX, g.srcY + 4, 22, '#ffffff', 1 - u);
      ctx.restore();
    }
    const st = shotState(s, t, g, el);
    if (!st) continue;
    const sc = col(s.color, theme, s.mode === 'ghost' ? col(el.ghostColor, theme, theme.accent2) : s.mode === 'particle' ? col(el.particleColor, theme, color) : color);
    const hero = !!s.hero;
    if (st.mode === 'hover') {
      const splitAt = num(s.splitAt, Infinity);
      if (t < splitAt) {
        const pulse = st.hover ? 1 + 0.12 * Math.sin((t - num(s.hoverAt, 0)) * TAU * 1.2) : 1;
        ctx.save();
        if (st.hover) {
          ctx.globalCompositeOperation = 'lighter';
          blob(ctx, st.x, st.y, 46 * pulse, sc, 0.35 * st.a);
          ctx.globalCompositeOperation = 'source-over';
        }
        drawQuantum(ctx, st.x, st.y, sc, hero || s.big, st.a, st.hover ? 0 : 70, [0, 1]);
        ctx.restore();
      } else {
        // süperpozisyon: iki yarıda iki yarı-parlak hayalet, zıt fazda 3 Hz titreşim
        const u = smooth(clamp((t - splitAt) / 0.35));
        g.slits.forEach((sx, j) => {
          const x = lerp(st.x, sx, u), y = lerp(st.y, g.barrierY, u);
          const fl = 0.5 + 0.5 * Math.sin((t - splitAt) * TAU * num(s.flicker, 3) + j * Math.PI);
          const ga = st.a * (0.35 + 0.5 * fl) * (0.6 + 0.4 * u);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          blob(ctx, x, y, 42, sc, 0.55 * ga);
          ctx.restore();
          drawQuantum(ctx, x, y, sc, true, ga, 0, [0, 1]);
        });
      }
      continue;
    }
    if (st.mode === 'particle' || st.mode === 'ghost') {
      if (st.mode === 'particle') drawPing(ctx, st.sx, g.barrierY, t - st.tp, pingColor);
      if (st.phase === 'landed') {
        if (st.mode === 'particle' && st.since < 0.18) {
          // sert çarpma: halesiz küçük pelet parlaması
          ctx.save();
          ctx.globalAlpha *= 1 - st.since / 0.18;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(st.x - 4, st.y - 30 - 4, 8, 8);
          ctx.restore();
        }
        continue;
      }
      const dir = st.y < g.barrierY ? [st.sx - g.srcX, g.barrierY - g.srcY] : [st.lx - st.sx, g.screenY - g.barrierY];
      const dl = Math.hypot(dir[0], dir[1]);
      if (st.mode === 'ghost') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gs = num(el.ghostSize, 7);
        blob(ctx, st.x, st.y, gs * 4.3, sc, 0.7 * st.a);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha *= 0.75 * st.a;
        ctx.strokeStyle = fadeColor(sc, 0.5);
        ctx.lineWidth = Math.max(3, gs * 0.6);
        ctx.lineCap = 'round';
        const dl2 = Math.hypot(dir[0], dir[1]) || 1;
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x - (dir[0] / dl2) * gs * 5, st.y - (dir[1] / dl2) * gs * 5);
        ctx.stroke();
        ctx.fillStyle = sc;
        ctx.beginPath();
        ctx.arc(st.x, st.y, gs, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath();
        ctx.arc(st.x, st.y, gs * 0.43, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else {
        // sert iz: düz, keskin çizgi (dalga yayı yok)
        const tr = hero ? 150 : 70;
        ctx.save();
        ctx.strokeStyle = fadeColor(sc, 0.9);
        ctx.lineWidth = hero ? 3 : 2;
        const back = Math.min(tr, st.y < g.barrierY ? Math.hypot(st.x - g.srcX, st.y - g.srcY) : Math.hypot(st.x - st.sx, st.y - g.barrierY) + 0);
        const gr = ctx.createLinearGradient(st.x, st.y, st.x - (dir[0] / dl) * back, st.y - (dir[1] / dl) * back);
        gr.addColorStop(0, fadeColor(sc, 0.95));
        gr.addColorStop(1, fadeColor(sc, 0));
        ctx.strokeStyle = gr;
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x - (dir[0] / dl) * back, st.y - (dir[1] / dl) * back);
        ctx.stroke();
        ctx.restore();
        drawQuantum(ctx, st.x, st.y, sc, hero, 1, 0, [0, 1]);
      }
      continue;
    }
    // dalga kipi
    if (st.phase === 'fly') {
      if (st.sp > 0.003) {
        g.slits.forEach((sx) => {
          const x = lerp(st.x, sx, st.sp);
          const dx = x - st.x, dy = 40;
          const dl = Math.hypot(dx * 0.4, dy);
          drawQuantum(ctx, x, st.y, sc, hero, st.a * (0.55 + 0.1 * st.sp), num(s.tail, hero ? 180 : 60) * (1 - 0.5 * st.sp), [(dx * 0.4) / dl, dy / dl], num(s.size, 0) * (1 - 0.3 * st.sp));
        });
      } else drawQuantum(ctx, st.x, st.y, sc, hero, st.a, num(s.tail, hero ? 180 : 60), [0, 1], num(s.size, 0));
    } else if (st.phase === 'wave') {
      if (s.arcs !== false && !(hero && s.arcs === undefined)) drawArcs(ctx, g, st.q, sc, (1 - 0.65 * st.q) * (s.linked ? 0.55 : 0.8), lam, hero);
      if (st.q < 0.15) {
        // levhada iki yarık birden parlar
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        g.slits.forEach((sx) => blob(ctx, sx, g.barrierY, hero ? 40 : 22, sc, (1 - st.q / 0.15) * (hero ? 0.9 : 0.5)));
        ctx.restore();
      }
    } else if (st.phase === 'landed' && st.since < 0.3 && s.collapse !== false) {
      // çöküş: yaylar tek noktaya iner
      const u = st.since / 0.3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = fadeColor(hero ? '#ffffff' : sc, 0.9 * (1 - u));
      ctx.lineWidth = hero ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(st.x, g.screenY, (hero ? 10 : 6) + (hero ? 34 : 16) * easeOut(u), 0, TAU);
      ctx.stroke();
      blob(ctx, st.x, g.screenY, hero ? 40 : 18, sc, (1 - u) * (hero ? 1 : 0.7));
      ctx.restore();
    }
  }
}

// emitter'ın şu an izlenen kuantumu (göz takibi için)
function emitterFocus(em, env, t) {
  const g = geomOf(em.geom);
  const S = emitterShots(em, env, g);
  let best = null;
  for (const s of S.shots) {
    if (s.t > t) break;
    const st = shotState(s, t, g, em);
    if (!st || st.phase === 'landed') continue;
    best = st.phase === 'wave' ? { x: g.xc, y: g.barrierY + st.q * g.L } : { x: st.x, y: st.y };
  }
  return best;
}

// ================================================================== DETECTOR
const DET_CACHE = new WeakMap();
function detCache(el) {
  let c = DET_CACHE.get(el);
  if (!c) {
    c = { runs: new Map(), tex: new Map() };
    DET_CACHE.set(el, c);
  }
  return c;
}

// yoğunluk dokusu: 512 x 24, dikeyde yumuşak kenar; renk / beyaz ışık
function fringeTex(cache, preset, c, color, white, g, physics, P, centerBias = 0.12) {
  const cq = Math.round(clamp(c) * 50) / 50;
  const key = `${preset}|${cq}|${color}|${white}|${g.key}`;
  let tx = cache.tex.get(key);
  if (tx) return tx;
  const N = 512, Hh = 24;
  tx = makeCanvas(N, Hh);
  const x = tx.getContext('2d');
  const img = x.createImageData(N, Hh);
  const [cr, cg, cb] = rgbOf(color);
  const pr = profile(preset, cq, g, physics);
  const rowW = new Float32Array(Hh);
  for (let j = 0; j < Hh; j++) {
    const v = (j + 0.5) / Hh;
    const e = Math.min(1, Math.min(v, 1 - v) / 0.22);
    rowW[j] = smooth(e);
  }
  let rgbMax = 0;
  const cols = [];
  for (let i = 0; i < N; i++) {
    const X = g.x0 + ((i + 0.5) / N) * g.w;
    if (preset === 'light' && white) {
      // merkez saçak en parlak kalsın: yan saçaklar hafifçe kısılır (aşırı sürüşte de doyuma birlikte gitmesinler)
      const fw = (P.lambda * g.L) / g.d;
      const k = 1 - centerBias * smooth(clamp(Math.abs(X - g.xc) / (0.8 * fw)));
      const rgb = whiteRGB(X, P, g).map((v) => v * k);
      cols.push(rgb);
      rgbMax = Math.max(rgbMax, ...rgb);
    } else {
      const v = pr.I[i];
      cols.push([v, v, v]);
      rgbMax = Math.max(rgbMax, v);
    }
  }
  for (let i = 0; i < N; i++) {
    let r, gg, b;
    if (preset === 'light' && white) {
      // beyaz merkez, kenarlarda altın/mavi saçak (sıcak beyaz ton, göz karışımı gibi hafif doygun)
      let [R, G, B] = cols[i].map((v) => v / rgbMax);
      const Y = 0.3 * R + 0.55 * G + 0.15 * B;
      const sat = 0.75;
      [R, G, B] = [R, G, B].map((v) => Math.pow(Math.max(0, Y + (v - Y) * sat), 0.9));
      r = 255 * R;
      gg = 240 * G;
      b = 215 * B;
    } else {
      const v = Math.pow(cols[i][0] / (rgbMax || 1), 0.9);
      r = lerp(cr, 255, v * v * 0.5) * v;
      gg = lerp(cg, 255, v * v * 0.5) * v;
      b = lerp(cb, 255, v * v * 0.5) * v;
    }
    for (let j = 0; j < Hh; j++) {
      const o = (j * N + i) * 4;
      img.data[o] = r * rowW[j];
      img.data[o + 1] = gg * rowW[j];
      img.data[o + 2] = b * rowW[j];
      img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  if (cache.tex.size > 160) cache.tex.clear();
  cache.tex.set(key, tx);
  return tx;
}

// bir koşunun nokta tuvali + histogramı (artımlı; zaman geri giderse yeniden kurulur)
function runState(cache, run, g, h, maxDots, bins, color, physics) {
  let rs = cache.runs.get(run);
  const cq = num(run.coherence, 1);
  const preset = run.preset || 'electron';
  const S = 2;
  const key = `${g.key}|${h}|${color}|${cq}|${bins}`;
  if (!rs || rs.key !== key) {
    const cv = makeCanvas(g.w * S, h * S);
    rs = { key, cv, cx: cv.getContext('2d'), drawn: 0, hist: new Float32Array(bins), counted: 0, cc: countCurve(run.keys), cq, preset, S, xs: new Float32Array(0) };
    cache.runs.set(run, rs);
  }
  return rs;
}
function runSync(rs, n, g, h, maxDots, bins, color, physics, r0 = 5) {
  const target = Math.min(n, maxDots);
  if (target < rs.drawn) {
    rs.cx.clearRect(0, 0, rs.cv.width, rs.cv.height);
    rs.drawn = 0;
  }
  if (target > rs.drawn) {
    const x = rs.cx;
    const S = rs.S;
    x.fillStyle = fadeColor(color, 0.85);
    for (let i = rs.drawn; i < target; i++) {
      const X = sampleX(i, rs.cq, rs.preset, g, physics) - g.x0;
      const Y = dotY(i, h) + h / 2;
      const r = lerp(r0, 1.8, clamp(i / 300));
      x.beginPath();
      x.arc(X * S, Y * S, r * S * 0.5, 0, TAU);
      x.fill();
    }
    rs.drawn = target;
  }
  // histogram (tüm N)
  if (n < rs.counted) {
    rs.hist.fill(0);
    rs.counted = 0;
  }
  if (n > rs.counted) {
    for (let i = rs.counted; i < n; i++) {
      const X = sampleX(i, rs.cq, rs.preset, g, physics);
      const b = Math.min(bins - 1, Math.max(0, Math.floor(((X - g.x0) / g.w) * bins)));
      rs.hist[b]++;
    }
    rs.counted = n;
  }
}

function drawDetector(ctx, el, env, p) {
  const theme = env.theme;
  const t = clockOf(el, p);
  const g = geomOf(el.geom);
  toWorld(ctx, el, p);
  const cache = detCache(el);
  const h = Math.max(8, Kn(el, 'h', t, 84));
  // nokta tuvali sabit bir yükseklikte kurulur (h anahtarlıysa en büyük değer) ve h'ye ölçeklenir
  const hDots = num(el.hDots, isKeys(el.h) ? Math.max(...el.h.map((k) => Number(k[1]) || 0)) : h);
  const x0 = g.x0, x1 = g.x1, wS = g.w;
  const yT = g.screenY - h / 2, yB = g.screenY + h / 2;
  const preset = String(K(el, 'preset', t, 'electron'));
  const physics = el.physics;
  const P = presetOf(preset, physics);
  const white = el.white !== false && preset === 'light';
  const color = col(K(el, 'color', t, null), theme, preset === 'light' ? theme.accent2 : theme.accent);
  const coh = clamp(Kn(el, 'coherence', t, 1));
  const dim = clamp(Kn(el, 'dim', t, 1), 0, 2);
  const power = clamp(Kn(el, 'power', t, 1));
  const compare = clamp(Kn(el, 'compare', t, 0));
  const maxDots = num(el.maxDots, 12000);
  const graph = el.graph === false ? null : el.graph || {};
  const bins = num(graph?.histBins, 90);
  const lamC = presetOf('light', physics).lambda;
  const eP = presetOf('electron', physics);

  // ---- çerçeve (cam fosfor levha)
  ctx.save();
  ctx.globalAlpha *= 0.4 + 0.6 * power;
  rr(ctx, x0 - 8, yT - 8, wS + 16, h + 16, 12);
  ctx.fillStyle = 'rgba(7,11,18,0.94)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();
  // ince iç ızgara
  ctx.strokeStyle = 'rgba(140,190,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0 + 30; x < x1; x += 30) {
    ctx.moveTo(x, yT);
    ctx.lineTo(x, yB);
  }
  ctx.moveTo(x0, g.screenY);
  ctx.lineTo(x1, g.screenY);
  ctx.stroke();
  // köşe parantezleri
  ctx.strokeStyle = power > 0.5 ? fadeColor(color, 0.55 + 0.3 * power) : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 2;
  const bl = 16;
  [[x0 - 14, yT - 14, 1, 1], [x1 + 14, yT - 14, -1, 1], [x0 - 14, yB + 14, 1, -1], [x1 + 14, yB + 14, -1, -1]].forEach(([x, y, sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * bl);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * bl, y);
    ctx.stroke();
  });
  // alt cetvel
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i <= 60; i++) {
    const x = x0 + (wS * i) / 60;
    ctx.fillRect(x - 0.5, yB + 2, 1, i % 10 === 0 ? 7 : i % 5 === 0 ? 5 : 3);
  }
  ctx.restore();
  // açılış taraması (power yükselirken)
  if (power > 0.001 && power < 0.999) {
    const sx = x0 + wS * power;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createLinearGradient(sx - 60, 0, sx, 0);
    gr.addColorStop(0, fadeColor(color, 0));
    gr.addColorStop(1, fadeColor(color, 0.35));
    ctx.fillStyle = gr;
    ctx.fillRect(sx - 60, yT, 60, h);
    ctx.fillStyle = fadeColor('#ffffff', 0.8);
    ctx.fillRect(sx - 1, yT - 6, 2, h + 12);
    ctx.restore();
  }

  // ---- temizleme taraması
  const clears = (Array.isArray(el.clearAt) ? el.clearAt : []).map((c) => ({ t: num(c.t, 0), dur: num(c.dur, 0.5) }));
  // x'teki içerik born anından sonra yapılmış bir temizlemeyle silindi mi? (0..1 maske)
  const intensityKeys = isKeys(el.intensity) ? el.intensity : null;
  const clearMask = (born, rearm) => {
    let m = 1, edge = null;
    for (const c of clears) {
      if (c.t < born || t < c.t) continue;
      // analitik katman, silmeden sonra intensity yeniden anahtarlanınca (değeri değişen ilk
      // anahtar aralığının başında) geri gelir
      if (rearm && intensityKeys) {
        const ks = intensityKeys.map((k) => [Number(k[0]), Number(k[1])]).sort((a, b) => a[0] - b[0]);
        let back = Infinity;
        for (let i = 0; i < ks.length - 1; i++) {
          if (ks[i][0] >= c.t + c.dur && Math.abs(ks[i + 1][1] - ks[i][1]) > 1e-6) { back = ks[i][0]; break; }
        }
        if (t >= back) continue;
      }
      const u = (t - c.t) / c.dur;
      if (u >= 1) return { m: 0, edge: null };
      edge = x0 + wS * u;
      m = 0.5;
    }
    return { m, edge };
  };

  // tarama çizgisi
  clears.forEach((c) => {
    const u = (t - c.t) / c.dur;
    if (u < 0 || u > 1.15) return;
    const x = x0 + wS * Math.min(1, u);
    const a = u > 1 ? 1 - (u - 1) / 0.15 : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sc = col(el.clearColor, theme, theme.accent);
    const gr = ctx.createLinearGradient(x - 90, 0, x, 0);
    gr.addColorStop(0, fadeColor(sc, 0));
    gr.addColorStop(1, fadeColor(sc, 0.3 * a));
    ctx.fillStyle = gr;
    ctx.fillRect(Math.max(x0, x - 90), yT, Math.min(90, x - x0), h);
    ctx.fillStyle = fadeColor('#ffffff', 0.9 * a);
    ctx.fillRect(x - 1.5, yT - 10, 3, h + 20);
    blob(ctx, x, yT - 10, 18, sc, a);
    blob(ctx, x, yB + 10, 18, sc, a);
    ctx.restore();
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, yT, wS, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';

  const mainA = dim * (1 - compare);
  // ---- analitik yoğunluk (ışık saçakları / Jönsson / canlı mod)
  const inten = Kn(el, 'intensity', t, 0);
  let intenVis = 0;
  if (inten > 0.003 && mainA > 0.003) {
    const cm = clearMask(-Infinity, true);
    if (cm.m > 0) {
      const reveal = el.reveal && typeof el.reveal === 'object' && (el.reveal.from === undefined || t >= num(el.reveal.from, -Infinity)) ? el.reveal : null;
      let R = wS;
      if (reveal) {
        const u = clamp((t - num(reveal.t, 0)) / num(reveal.dur, 0.8));
        R = (wS / 2 + 10) * easeOut(u);
      }
      if (R > 0) {
        const tex = fringeTex(cache, preset, coh, color, white, g, physics, P);
        const shimmer = 1 + 0.03 * Math.sin(t * 5.1) * (preset === 'light' ? 1 : 0);
        ctx.save();
        ctx.beginPath();
        const cx0 = Math.max(x0, g.xc - R), cx1 = Math.min(x1, g.xc + R, cm.edge !== null ? x1 : x1);
        if (cm.edge !== null) ctx.rect(cm.edge, yT, x1 - cm.edge, h);
        else ctx.rect(cx0, yT, cx1 - cx0, h);
        ctx.clip();
        ctx.globalAlpha *= clamp(inten * mainA * shimmer, 0, 1.5);
        // split (K 0..1): sağ yarı "izlenen" desen (uyum 0, splitColor), sol yarı mevcut desen
        const split = clamp(Kn(el, 'split', t, 0));
        const ga0 = ctx.globalAlpha;
        const half = (side, img, k) => {
          if (k <= 0.003) return;
          ctx.save();
          if (split > 0.003) {
            ctx.beginPath();
            if (side < 0) ctx.rect(x0, yT, g.xc - x0, h);
            else ctx.rect(g.xc, yT, x1 - g.xc, h);
            ctx.clip();
          }
          ctx.globalAlpha = ga0 * k;
          ctx.drawImage(img, x0, yT, wS, h);
          if (inten * mainA > 1) {
            ctx.globalAlpha = clamp(inten * mainA - 1) * k;
            ctx.drawImage(img, x0, yT, wS, h);
          }
          ctx.restore();
        };
        if (split > 0.003) {
          const tex0 = fringeTex(cache, preset, 0, col(el.splitColor, theme, MAGENTA), false, g, physics, P);
          half(-1, tex, 1);
          half(1, tex, 1 - split);
          half(1, tex0, split);
        } else half(0, tex, 1);
        ctx.restore();
        if (split > 0.003) {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = fadeColor('#ffffff', 0.85 * split);
          ctx.fillRect(g.xc - 1.5, yT, 3, h);
          ctx.restore();
        }
        if (reveal && R < wS / 2) {
          // açılma cephesi
          [g.xc - R, g.xc + R].forEach((x) => blob(ctx, x, g.screenY, 40, '#ffffff', 0.5 * mainA));
        }
        intenVis = inten * cm.m;
      }
    }
  }

  // ---- hayalet (klasik beklenti: iki dar şerit)
  const ghost = Kn(el, 'ghost', t, 0);
  if (ghost > 0.003 || (el.ghostDelay && Kn(el, 'ghost', t - num(el.ghostDelay, 0), 0) > 0.003)) {
    const gc = col(K(el, 'ghostColor', t, null), theme, 'rgba(255,255,255,0.85)');
    ctx.globalCompositeOperation = 'source-over';
    const bw = num(el.ghostW, 34), gf = num(el.ghostFill, 0.25), gGlow = num(el.ghostGlow, 0);
    g.proj.forEach((px, j) => {
      // ghostDelay: sağ şerit gecikmeli belirir ("iki" ... "çizgi")
      const gj = j === 1 && el.ghostDelay ? clamp(Kn(el, 'ghost', t - num(el.ghostDelay, 0), 0), 0, 1.5) : ghost;
      if (gj <= 0.003) return;
      if (gGlow > 0) {
        ctx.globalCompositeOperation = 'lighter';
        blob(ctx, px, g.screenY, bw * 1.6, gc, gGlow * Math.min(1, gj));
        ctx.globalCompositeOperation = 'source-over';
      }
      if (el.ghostOutline === false) {
        // ışık şeridi: dikeyde yumuşak, yatayda parlak çekirdek
        ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createLinearGradient(px - bw / 2, 0, px + bw / 2, 0);
        gr.addColorStop(0, fadeColor(gc, 0));
        gr.addColorStop(0.5, fadeColor(gc, gf * Math.min(1, gj)));
        gr.addColorStop(1, fadeColor(gc, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(px - bw / 2, yT + 4, bw, h - 8);
        ctx.fillStyle = fadeColor('#ffffff', 0.55 * gf * Math.min(1, gj));
        ctx.fillRect(px - bw * 0.12, yT + 6, bw * 0.24, h - 12);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.fillStyle = fadeColor(gc, gf * Math.min(1, gj));
        ctx.fillRect(px - bw / 2, yT + 6, bw, h - 12);
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = fadeColor(gc, 0.85 * Math.min(1, gj));
        ctx.lineWidth = 2;
        ctx.strokeRect(px - bw / 2, yT + 6, bw, h - 12);
        ctx.setLineDash([]);
      }
    });
    ctx.globalCompositeOperation = 'lighter';
  }

  // ---- koşular (tek tek gelen elektronlar)
  const runs = Array.isArray(el.runs) ? el.runs : [];
  let activeRun = null, activeInfo = null;
  const runInfos = [];
  runs.forEach((run) => {
    if (!isKeys(run.keys)) return;
    const cc = countCurve(run.keys);
    if (t < cc.t0) return;
    const n = Math.floor(cc.N(t) + 1e-6);
    const rc = col(kv(run.color, t), theme, color);
    let a = 1;
    const fadeAt = num(run.fadeAt, Infinity);
    if (t > fadeAt) a = lerp(1, num(run.fadeTo, 0.08), smooth(clamp((t - fadeAt) / num(run.fadeDur, 0.8))));
    a *= clamp(num(kv(run.dim, t), 1), 0, 2);
    const cm = clearMask(cc.t0, false);
    a *= cm.m > 0 ? 1 : 0;
    const rs = runState(cache, run, g, hDots, maxDots, bins, rc, run.physics || physics);
    runSync(rs, n, g, hDots, maxDots, bins, rc, run.physics || physics, num(el.dotR0, 5));
    // shatter: sönerken desen yatay dilimlere bölünüp titreşerek dağılır
    const shU = run.shatter && t > fadeAt ? clamp((t - fadeAt) / num(run.fadeDur, 0.8)) : 0;
    const drawSliced = (img) => {
      if (shU <= 0.001) { ctx.drawImage(img, x0, yT, wS, h); return; }
      const nS = 9, iw = img.width, ih = img.height;
      for (let k = 0; k < nS; k++) {
        const dx = (hash(k * 3.3 + Math.floor(t * 30) * 0.17) - 0.5) * 70 * shU + (hash(k * 1.9) - 0.5) * 40 * shU;
        ctx.drawImage(img, 0, (ih * k) / nS, iw, ih / nS, x0 + dx, yT + (h * k) / nS, wS * (1 + 0.15 * shU), h / nS);
      }
    };
    const aAn = smooth(clamp((Math.log(Math.max(1, n)) - Math.log(2000)) / (Math.log(160000) - Math.log(2000))));
    const info = { run, rs, n, cc, a, aAn, rc };
    runInfos.push(info);
    if (a > 0.25 && (!activeRun || cc.t0 >= activeRun.cc.t0)) {
      activeRun = info;
    }
    const scv = kv(el.showCount, t);
    if (String(scv?.run ?? scv) === String(run.id)) activeInfo = info;
    if (a * mainA <= 0.003) return;
    ctx.save();
    if (cm.edge !== null) {
      ctx.beginPath();
      ctx.rect(cm.edge, yT, x1 - cm.edge, h);
      ctx.clip();
    }
    // noktalar
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= a * mainA * (1 - 0.6 * aAn);
    drawSliced(rs.cv);
    ctx.restore();
    if (aAn > 0.003) {
      ctx.save();
      ctx.globalAlpha *= a * mainA * aAn;
      drawSliced(fringeTex(cache, rs.preset, rs.cq, rc, false, g, run.physics || physics, presetOf(rs.preset, run.physics || physics)));
      ctx.restore();
    }
    // yeni noktalar: kısa hale
    const hitS = Kn(el, 'hitScale', t, 1);
    if (cc.rate(t) < 50) {
      for (let i = n - 1, k = 0; i >= 0 && k < 40; i--, k++) {
        const age = t - cc.tOf(i + 1);
        if (age > 0.25) break;
        if (age < 0) continue;
        const X = sampleX(i, rs.cq, rs.preset, g, run.physics || physics);
        const Y = g.screenY + dotY(i, h);
        const u = age / 0.25;
        blob(ctx, X, Y, lerp(22, 6, u) * hitS, rc, (1 - u) * a * mainA);
        blob(ctx, X, Y, 4 * hitS, '#ffffff', (1 - u) * a * mainA);
      }
      // hitScale > 1: belirgin çarpma halkası (seyrek gelen tekil elektronlar)
      if (hitS > 1) {
        for (let i = n - 1, k = 0; i >= 0 && k < 12; i--, k++) {
          const age = t - cc.tOf(i + 1);
          if (age > 0.45) break;
          if (age < 0) continue;
          const u = age / 0.45;
          const X = sampleX(i, rs.cq, rs.preset, g, run.physics || physics);
          const Y = g.screenY + dotY(i, h);
          ctx.strokeStyle = fadeColor(rc, 0.9 * (1 - u) * a * mainA);
          ctx.lineWidth = 2.5 * (1 - u) + 0.5;
          ctx.beginPath();
          ctx.arc(X, Y, 6 + 10 * hitS * easeOut(u), 0, TAU);
          ctx.stroke();
          // seyrek tekil çarpma: 0.35 sn parlama
          if (hitS >= 2 && age < 0.35) blob(ctx, X, Y, 14 * hitS, rc, 0.7 * (1 - age / 0.35) * a * mainA);
        }
      }
    }
  });

  // ---- ek tekil noktalar (kahraman elektron)
  (Array.isArray(el.extraDots) ? el.extraDots : []).forEach((d) => {
    const age = t - num(d.t, Infinity);
    if (age < 0) return;
    const until = num(d.until, Infinity);
    if (t > until + 0.3) return;
    const X = num(d.x, g.xc), Y = g.screenY + num(d.dy, 0);
    const dc = col(d.color, theme, d.solid ? MAGENTA : color);
    const a = dim * (1 - compare) * (t > until ? clamp(1 - (t - until) / 0.3) : 1);
    if (d.solid) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha *= a;
      ctx.fillStyle = dc;
      ctx.beginPath();
      ctx.arc(X, Y, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(X, Y, 2, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (age < 0.12) {
        ctx.fillStyle = fadeColor('#ffffff', 1 - age / 0.12);
        ctx.fillRect(X - 7, Y - 7, 14, 14);
      }
    } else {
      blob(ctx, X, Y, d.big ? 18 : 10, dc, 0.9 * a);
      blob(ctx, X, Y, d.big ? 7 : 4, '#ffffff', a);
      if (age < 0.45) {
        const u = age / 0.45;
        ctx.strokeStyle = fadeColor('#ffffff', 0.9 * (1 - u) * a);
        ctx.lineWidth = 2.5 * (1 - u) + 0.5;
        ctx.beginPath();
        ctx.arc(X, Y, 8 + 50 * easeOut(u), 0, TAU);
        ctx.stroke();
        blob(ctx, X, Y, 70 * (1 - u * 0.5), dc, (1 - u) * 0.8 * a);
      }
    }
  });

  // ---- karşılaştırma: üst yarı ışık, alt yarı elektron
  if (compare > 0.003) {
    ctx.save();
    ctx.globalAlpha *= compare * dim;
    const lt = fringeTex(cache, 'light', 1, col(el.compareColorA, theme, theme.accent2), true, g, physics, presetOf('light', physics));
    const et = fringeTex(cache, 'electron', 1, col(el.compareColorB, theme, theme.accent), false, g, physics, eP);
    const sh = (k) => 1 + 0.12 * Math.max(0, Math.sin((t - k) * 4));
    ctx.globalAlpha *= sh(0);
    ctx.drawImage(lt, x0, yT + 2, wS, h / 2 - 3);
    const slide = (1 - easeOut(compare)) * h * 0.5;
    ctx.drawImage(et, x0, g.screenY + 1 + slide, wS, h / 2 - 3);
    ctx.restore();
  }
  ctx.restore(); // klip

  if (compare > 0.003) {
    ctx.save();
    ctx.globalAlpha *= compare;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x0, g.screenY - 0.5, wS, 1);
    const tags = Array.isArray(el.compareTags) ? el.compareTags : ['ışık · 550 nm', 'e⁻ · 5 pm'];
    const tz = num(el.compareTagSize, 19);
    ctx.font = `700 ${tz}px ${FONT_NUM}`;
    setLS(ctx, 1.5);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    [[tags[0], g.screenY - h / 4, theme.accent2], [tags[1], g.screenY + h / 4, theme.accent]].forEach(([s, y, c]) => {
      const tw = ctx.measureText(s).width;
      const ph = Math.min(h / 2 - 4, tz * 1.35);
      ctx.fillStyle = 'rgba(5,7,14,0.78)';
      rr(ctx, x0 + 8, y - ph / 2, tw + tz, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.fillText(s, x0 + 8 + tz / 2, y + 1);
    });
    setLS(ctx, 0);
    ctx.restore();
  }

  // ---- saçak işaretleri (▲ parlak, ▼ karanlık)
  const ticks = Kn(el, 'ticks', t, 0);
  if (ticks > 0.003) {
    const lamT = preset === 'light' ? lamC : eP.lambda;
    const br = fringeXs(lamT, g, false).map((f) => ({ ...f, bright: true }));
    const dk = fringeXs(lamT, g, true).map((f) => ({ ...f, bright: false }));
    const all = [...br, ...dk].sort((a, b) => Math.abs(a.x - g.xc) - Math.abs(b.x - g.xc));
    const n = all.length;
    const tc = col(el.tickColor, theme, preset === 'light' ? theme.accent2 : color);
    all.forEach((f, i) => {
      const u = clamp((ticks - (i / n) * 0.6) / 0.4);
      if (u <= 0) return;
      const e = easeOut(u);
      const len = (f.bright ? 22 : 11) * e;
      const y = yT - 14;
      ctx.save();
      ctx.globalAlpha *= u;
      ctx.fillStyle = f.bright ? tc : 'rgba(150,175,215,0.75)';
      ctx.beginPath();
      if (f.bright) {
        ctx.moveTo(f.x - 6, y);
        ctx.lineTo(f.x + 6, y);
        ctx.lineTo(f.x, y - len);
      } else {
        ctx.moveTo(f.x - 5, y - len);
        ctx.lineTo(f.x + 5, y - len);
        ctx.lineTo(f.x, y);
      }
      ctx.closePath();
      ctx.fill();
      if (f.bright) blob(ctx, f.x, y - len / 2, 16, tc, 0.4 * u);
      ctx.restore();
    });
  }

  // ---- grafik
  let shownV = null;
  if (graph) {
    const gh = num(graph.h, 130), gap = num(graph.gap, 16);
    const gT = yB + gap, gB = gT + gh;
    const ga = clamp(Kn(graph, 'opacity', t, 1)) * Math.min(1, dim);
    const mode = String(K(graph, 'mode', t, 'curve'));
    const draws = Array.isArray(graph.draw) ? graph.draw : null;
    let drawU = 1;
    if (draws) {
      // son başlamış çizim belirler (her çizim eğriyi merkezden yeniden açar)
      drawU = 0;
      draws.forEach((d) => { if (t >= num(d.t, 0)) drawU = clamp((t - num(d.t, 0)) / num(d.dur, 0.85)); });
    }
    if (ga > 0.003) {
      ctx.save();
      ctx.globalAlpha *= ga;
      // taban + kılavuzlar
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x0, gB, wS, 1.5);
      const lamG = preset === 'light' ? lamC : eP.lambda;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      fringeXs(lamG, g, false).forEach((f) => {
        for (let y = gT; y < gB; y += 8) ctx.fillRect(f.x - 0.5, y, 1, 4);
      });
      // histogram
      const showHist = (mode === 'hist' || mode === 'both') && activeRun && activeRun.n > 0;
      if (showHist) {
        const { rs, rc, a } = activeRun;
        const bwid = wS / bins;
        let mx = 0;
        for (let i = 0; i < bins; i++) mx = Math.max(mx, rs.hist[i]);
        const block = Math.min(10, (gh * 0.9) / Math.max(1, mx));
        const ha = clamp(Kn(graph, 'histOpacity', t, 1)) * a;
        ctx.save();
        ctx.globalAlpha *= ha;
        for (let i = 0; i < bins; i++) {
          const c = rs.hist[i];
          if (!c) continue;
          const x = x0 + i * bwid + bwid * 0.15;
          const bw = bwid * 0.7;
          if (block >= 5) {
            for (let j = 0; j < c; j++) {
              ctx.fillStyle = fadeColor(rc, 0.75);
              ctx.fillRect(x, gB - (j + 1) * block + 1, bw, block - 1.5);
            }
          } else {
            const hh = c * block;
            const gr = ctx.createLinearGradient(0, gB - hh, 0, gB);
            gr.addColorStop(0, fadeColor(rc, 0.8));
            gr.addColorStop(1, fadeColor(rc, 0.25));
            ctx.fillStyle = gr;
            ctx.fillRect(x, gB - hh, bw, hh);
          }
        }
        ctx.restore();
      }
      // kuram eğrisi
      const showCurve = (mode === 'curve' || mode === 'both') && drawU > 0;
      const curveOf = (pre, c, wht) => {
        const pts = [];
        const M = 300;
        let mx = 0;
        const vals = [];
        for (let i = 0; i <= M; i++) {
          const X = x0 + (wS * i) / M;
          let v;
          if (pre === 'light' && wht) {
            const [r, gg, b] = whiteRGB(X, presetOf('light', physics), g);
            v = 0.3 * r + 0.55 * gg + 0.15 * b;
          } else v = profileAt(profile(pre, c, g, physics), X, g);
          vals.push(v);
          mx = Math.max(mx, v);
        }
        for (let i = 0; i <= M; i++) pts.push([x0 + (wS * i) / M, gB - (vals[i] / (mx || 1)) * gh * 0.9]);
        return pts;
      };
      const strokeCurve = (pts, c, lw, fill) => {
        const half = wS / 2;
        const R = half * easeOut(drawU);
        ctx.save();
        ctx.beginPath();
        ctx.rect(g.xc - R, gT - 20, R * 2, gh + 24);
        ctx.clip();
        if (fill) {
          const fg = ctx.createLinearGradient(0, gT, 0, gB);
          fg.addColorStop(0, fadeColor(c, 0.2));
          fg.addColorStop(1, fadeColor(c, 0.02));
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], gB);
          pts.forEach(([x, y]) => ctx.lineTo(x, y));
          ctx.lineTo(pts[pts.length - 1][0], gB);
          ctx.closePath();
          ctx.fill();
        }
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = fadeColor(c, 0.22);
        ctx.lineWidth = lw * 3;
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.strokeStyle = c;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.restore();
      };
      if (showCurve && compare < 0.999) {
        ctx.save();
        ctx.globalAlpha *= 1 - compare;
        const gc = col(kv(graph.color, t), theme, color);
        strokeCurve(curveOf(preset, coh, white), gc, 3.5, true);
        ctx.restore();
      }
      if (compare > 0.003) {
        ctx.save();
        ctx.globalAlpha *= compare;
        strokeCurve(curveOf('electron', 1, false), col(el.compareColorB, theme, theme.accent), 4, true);
        strokeCurve(curveOf('light', 1, true), col(el.compareColorA, theme, theme.accent2), 2, false);
        ctx.restore();
      }
      // tepe → saçak kılavuz çizgileri (eğri çizimi bitince 0.4 sn)
      if (draws && graph.guides !== false) {
        draws.forEach((d) => {
          const a = t - (num(d.t, 0) + num(d.dur, 0.85) * 0.6);
          if (a < 0 || a > 0.6) return;
          const al = a < 0.1 ? a / 0.1 : 1 - (a - 0.1) / 0.5;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const pr = profile(preset, coh, g, physics);
          fringeXs(lamG, g, false).forEach((f) => {
            const v = profileAt(pr, f.x, g);
            if (v < 0.15) return;
            const yTop = gB - v * gh * 0.9;
            const gr = ctx.createLinearGradient(0, yTop, 0, g.screenY);
            gr.addColorStop(0, fadeColor(color, 0.8 * al));
            gr.addColorStop(1, fadeColor(color, 0.1 * al));
            ctx.fillStyle = gr;
            ctx.fillRect(f.x - 0.75, g.screenY, 1.5, yTop - g.screenY);
          });
          ctx.restore();
        });
      }
      ctx.restore();
    }
  }

  // ---- okumalar (sayaç / kontrast)
  const fs = num(el.readoutSize, 26);
  // okumalar yakın kamerada da ekranda kalsın diye varsayılan olarak içeride (x 230 / 850)
  const rX = Array.isArray(el.readoutX) ? [num(el.readoutX[0], g.xc - 310), num(el.readoutX[1], g.xc + 310)] : [g.xc - 310, g.xc + 310];
  const ry = yT - 22 - (ticks > 0.05 ? 26 : 0);
  const readout = (label, value, x, align, c, a, pop = 0) => {
    if (a <= 0.003) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${Math.round(fs * 0.62)}px ${FONT_UI}`;
    setLS(ctx, 2.4);
    const lw = ctx.measureText(label).width;
    ctx.font = `700 ${fs}px ${FONT_NUM}`;
    setLS(ctx, 0.5);
    if ('fontVariantNumeric' in ctx) ctx.fontVariantNumeric = 'tabular-nums';
    const vw = ctx.measureText(value).width;
    const total = lw + 10 + vw;
    const sx = align === 'left' ? x : x - total;
    ctx.textAlign = 'left';
    ctx.font = `800 ${Math.round(fs * 0.62)}px ${FONT_UI}`;
    setLS(ctx, 2.4);
    ctx.fillStyle = 'rgba(220,232,255,0.6)';
    ctx.fillText(label, sx, ry);
    ctx.font = `700 ${fs}px ${FONT_NUM}`;
    setLS(ctx, 0.5);
    ctx.shadowColor = c;
    ctx.shadowBlur = 12;
    ctx.fillStyle = mixColor(c, '#ffffff', 0.35 + 0.5 * pop);
    if (pop > 0.003) {
      // sayaç "pop": yeni çarpmada rakam kısa süre büyür
      const vx = sx + lw + 10;
      ctx.translate(vx, ry - fs * 0.35);
      ctx.scale(1 + 0.35 * pop, 1 + 0.35 * pop);
      ctx.shadowBlur = 12 + 20 * pop;
      ctx.fillText(value, 0, fs * 0.35);
    } else ctx.fillText(value, sx + lw + 10, ry);
    setLS(ctx, 0);
    ctx.restore();
  };
  const countVis = clamp(Kn(el, 'countVis', t, el.showCount ? 1 : 0));
  if (countVis > 0.003 && activeInfo) {
    const age = t - activeInfo.cc.tOf(Math.max(1, activeInfo.n));
    const pop = activeInfo.n > 0 && age >= 0 && age < 0.15 && activeInfo.cc.rate(t) < 20 ? 1 - age / 0.15 : 0;
    readout(String(el.countLabel || 'ELEKTRON'), fmtTR(activeInfo.n), rX[1], 'right', activeInfo.rc, countVis * Math.min(1, dim + 0.4), pop);
  }
  const showVis = clamp(Kn(el, 'showVis', t, 0));
  if (showVis > 0.003) {
    // kontrast: görüntülenen profilden hesaplanır (histogram + kuram karışımı)
    let V = 0;
    if (el.visFrom === 'coherence' && runInfos.length && intenVis < 0.3) {
      // saçak görünürlüğü = koşuların uyumu (ağırlıklı) × tam uyumlu görünürlük + istatistik gürültü
      const V1 = visibility(1, 'electron', g, physics);
      let W = 0, S = 0, noise = 0;
      runInfos.forEach(({ run, n, a }) => {
        const w = a * (n / (n + 120));
        if (w <= 1e-4) return;
        S += w * clamp(num(run.coherence, 1)) * V1;
        noise += w * Math.min(0.3, 1.5 / Math.sqrt(n + 1));
        W += w;
      });
      V = W > 0 ? clamp(S / W + (1 - S / W / (V1 || 1)) * noise / W) : 0;
    } else if (intenVis >= 0.3 || !runInfos.length) {
      V = preset === 'light' ? visibility(1, 'light', g, physics) : visibility(coh, 'electron', g, physics);
    } else {
      // görünen koşuların yoğunluk karışımı: her koşu (histogram + az veride düz önsel,
      // çok veride kuram eğrisi) görünürlüğü × güvenilirliği ile ağırlıklanır
      const halfW = (eP.lambda * g.L) / g.d;
      const idx = [];
      for (let i = 0; i < bins; i++) if (Math.abs(g.x0 + ((i + 0.5) / bins) * g.w - g.xc) <= halfW) idx.push(i);
      const D = new Float64Array(idx.length);
      let W = 0;
      const prior = 3;
      runInfos.forEach(({ rs, aAn, n, a }) => {
        const w = a * (n / (n + 120));
        if (w <= 1e-4) return;
        const pr = profile(rs.preset, rs.cq, g, physics);
        idx.forEach((bi, j) => {
          const xa = g.x0 + (bi / bins) * g.w, xb = g.x0 + ((bi + 1) / bins) * g.w;
          const ia = Math.round(((xa - g.x0) / g.w) * pr.N), ib = Math.round(((xb - g.x0) / g.w) * pr.N);
          const dAn = pr.cdf[ib] - pr.cdf[ia];
          const dH = (rs.hist[bi] + prior) / (n + prior * bins);
          D[j] += w * lerp(dH, dAn, aAn);
        });
        W += w;
      });
      V = W > 0 ? visibilityOf(D) : 0;
    }
    shownV = V;
    readout(String(el.visLabel || 'KONTRAST'), `%${Math.round(V * 100)}`, rX[0], 'left', color, showVis * Math.min(1, dim + 0.4));
  }
}

// ================================================================== EYE
function drawEye(ctx, el, env, p) {
  const theme = env.theme;
  const t = clockOf(el, p);
  const w = num(el.w, 230), h = w * 0.5;
  const open = clamp(Kn(el, 'open', t, 1));
  const color = col(K(el, 'color', t, null), theme, MAGENTA);
  const glow = clamp(Kn(el, 'glow', t, 0.6), 0, 2);
  const scan = clamp(Kn(el, 'scan', t, 0));
  const ex = num(p.ox, num(el.x, 540)), ey = num(p.oy, num(el.y, 960));
  const R = w * 0.2;

  // bakış hedefi
  const targetAt = (tt) => {
    if (el.look === 'track:emitter' || (typeof el.look === 'string' && el.look.startsWith('track'))) {
      const id = el.look.split(':')[2];
      const em = findEmitter(env, id);
      const f = em ? emitterFocus(em, env, tt) : null;
      if (f) return f;
      const g = geomOf(em?.geom);
      return el.scanTo ? { x: num(el.scanTo.x, g.xc), y: num(el.scanTo.y, g.barrierY) } : { x: g.xc, y: g.barrierY };
    }
    if (el.look && typeof el.look === 'object') return { x: num(kv(el.look.tx, tt), ex), y: num(kv(el.look.ty, tt), ey + 300) };
    if (el.scanTo) return { x: num(el.scanTo.x, ex), y: num(el.scanTo.y, ey + 300) };
    return null;
  };
  let lx = 0, ly = 0;
  const pts = [targetAt(t), targetAt(t - 0.075), targetAt(t - 0.15)].filter(Boolean);
  if (pts.length) {
    const tx = pts.reduce((a, q) => a + q.x, 0) / pts.length, ty = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    const dx = tx - ex, dy = ty - ey;
    const d = Math.hypot(dx, dy) || 1;
    const m = w * 0.22 * clamp(d / 260);
    lx = (dx / d) * m;
    ly = (dy / d) * m * 0.6;
  }
  // küçük göz kaymaları
  const sk = Math.floor(t / 1.3);
  lx += (hash(sk * 3.1) - 0.5) * w * 0.04;
  ly += (hash(sk * 5.7) - 0.5) * w * 0.03;

  // tarama konisi
  if (scan > 0.003 && el.scanTo) {
    const tx = num(el.scanTo.x, ex) - ex, ty = num(el.scanTo.y, ey) - ey;
    const spread = num(el.scanTo.spread, 120);
    const ang = Math.atan2(ty, tx);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const px = lx, py = ly;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createLinearGradient(px, py, tx, ty);
    gr.addColorStop(0, fadeColor(color, 0.3 * scan));
    gr.addColorStop(1, fadeColor(color, 0.12 * scan));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(px + nx * R * 0.35, py + ny * R * 0.35);
    ctx.lineTo(tx + nx * spread, ty + ny * spread);
    ctx.lineTo(tx - nx * spread, ty - ny * spread);
    ctx.lineTo(px - nx * R * 0.35, py - ny * R * 0.35);
    ctx.closePath();
    ctx.fill();
    // akan tarama çizgileri
    ctx.strokeStyle = fadeColor(color, 0.35 * scan);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const u = ((t / 0.9 + i / 5) % 1);
      const cx = lerp(px, tx, u), cy = lerp(py, ty, u);
      const sp = lerp(R * 0.35, spread, u);
      ctx.globalAlpha = Math.sin(u * Math.PI);
      ctx.beginPath();
      ctx.moveTo(cx + nx * sp, cy + ny * sp);
      ctx.lineTo(cx - nx * sp, cy - ny * sp);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    blob(ctx, tx, ty, spread * 0.9, color, 0.35 * scan);
    ctx.restore();
  }
  if (el.tether && el.scanTo) {
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -t * 30;
    ctx.strokeStyle = fadeColor(color, 0.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(num(el.scanTo.x, ex) - ex, num(el.scanTo.y, ey) - ey);
    ctx.stroke();
    ctx.restore();
  }

  // badem göz şekli
  const up = h * 1.1 * Math.max(0.02, open), lo = h * 0.85 * Math.max(0.02, open);
  const almond = () => {
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.quadraticCurveTo(0, -up, w / 2, 0);
    ctx.quadraticCurveTo(0, lo, -w / 2, 0);
    ctx.closePath();
  };
  if (glow > 0.003) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blob(ctx, 0, 0, w * 0.75, color, 0.22 * glow * (0.3 + 0.7 * open));
    ctx.restore();
  }
  // kapanma süresi (kapalıyken kirpik çizgisi 0.3 sn sonra söner)
  let closedFor = 0;
  if (open <= 0.03) {
    for (let s = 0.05; s <= 1; s += 0.05) {
      if (Kn(el, 'open', t - s, 1) > 0.03) break;
      closedFor = s;
    }
  }
  if (open > 0.03) {
    ctx.save();
    almond();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.clip();
    // iris
    const ir = ctx.createRadialGradient(lx, ly, R * 0.2, lx, ly, R);
    ir.addColorStop(0, mixColor(color, '#ffffff', 0.25));
    ir.addColorStop(0.55, color);
    ir.addColorStop(1, '#3a0d5c');
    ctx.fillStyle = ir;
    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, TAU);
    ctx.fill();
    // lifler
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + hash(i * 1.7) * 0.2;
      const r0 = R * (0.42 + 0.08 * hash(i * 2.3)), r1 = R * (0.8 + 0.18 * hash(i * 4.1));
      ctx.beginPath();
      ctx.moveTo(lx + Math.cos(a) * r0, ly + Math.sin(a) * r0);
      ctx.lineTo(lx + Math.cos(a + 0.05) * r1, ly + Math.sin(a + 0.05) * r1);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(20,0,30,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(lx, ly, R - 1, 0, TAU);
    ctx.stroke();
    // göz bebeği (açıldıkça büyür)
    ctx.fillStyle = '#040208';
    ctx.beginPath();
    ctx.arc(lx, ly, R * (0.32 + 0.14 * open), 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(lx - R * 0.3, ly - R * 0.33, R * 0.11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(lx + R * 0.22, ly + R * 0.25, R * 0.05, 0, TAU);
    ctx.fill();
    // kapak gölgesi
    const sg = ctx.createLinearGradient(0, -up / 2, 0, up * 0.1);
    sg.addColorStop(0, 'rgba(0,0,0,0.45)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-w / 2, -up, w, up);
    ctx.restore();
    // HUD halkası (dönen 24 çentik)
    ctx.save();
    ctx.globalAlpha *= 0.55 * open;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const rot = t * 0.05 * TAU;
    for (let i = 0; i < 24; i++) {
      const a = rot + (i / 24) * TAU;
      const r0 = R + 9, r1 = R + (i % 6 === 0 ? 18 : 13);
      ctx.beginPath();
      ctx.moveTo(lx + Math.cos(a) * r0, ly + Math.sin(a) * r0);
      ctx.lineTo(lx + Math.cos(a) * r1, ly + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
    // kapak çizgileri
    ctx.save();
    almond();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * glow;
    ctx.stroke();
    ctx.restore();
  } else {
    const a = closedFor < 0.3 ? 1 : clamp(1 - (closedFor - 0.3) / 0.5, 0.35, 1);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.strokeStyle = mixColor(color, '#ffffff', 0.4);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.quadraticCurveTo(0, h * 0.42, w / 2, 0);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const u = 0.2 + i * 0.15;
      const x = lerp(-w / 2, w / 2, u);
      const y = 2 * (1 - u) * u * h * 0.42;
      const ang = Math.PI / 2 + (u - 0.5) * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * w * 0.07, y + Math.sin(ang) * w * 0.07);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ================================================================== SUPERPOSE
function drawSuperpose(ctx, el, env, p) {
  const theme = env.theme;
  const t = clockOf(el, p);
  const w = num(el.w, 640), h = num(el.h, 170);
  const wl = num(el.wavelength, 150);
  const amp = num(el.amp, h * 0.16);
  const ca = col(el.colorA, theme, theme.accent2);
  const cb = col(el.colorB, theme, '#ffe9b8');
  const cs = col(el.colorSum, theme, '#ffffff');
  // faz: phase → toPhase (phaseAt öğe içi sn, phaseDur)
  let ph = num(el.phase, 0);
  if (el.toPhase !== undefined) {
    const at = num(el.phaseAt, 0);
    const u = clamp((p.lt - at) / num(el.phaseDur, 0.6));
    ph = lerp(ph, num(el.toPhase, Math.PI), easeInOut(u));
  }
  ph = num(kv(el.phaseK, t), ph);
  const scroll = p.lt * num(el.speed, 0.5) * TAU;
  rr(ctx, -w / 2, -h / 2, w, h, 18);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const padX = 64;
  const x0 = -w / 2 + padX, x1 = w / 2 - 24;
  const yTop = -h * 0.25, yBot = h * 0.2;
  const wave = (yc, a, phi, c, lw, glowA) => {
    ctx.save();
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 3) {
      const y = yc - a * Math.sin(((x - x0) / wl) * TAU - scroll + phi);
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (glowA) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = fadeColor(c, glowA);
      ctx.lineWidth = lw * 3.5;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();
  };
  ctx.save();
  ctx.globalAlpha *= 0.75;
  wave(yTop - 4, amp, 0, ca, 2);
  wave(yTop + 4, amp, ph, cb, 2);
  ctx.restore();
  const sumA = Math.min(2 * amp, h / 2 - yBot - 8) * Math.abs(Math.cos(ph / 2));
  wave(yBot, Math.max(0.0001, sumA), ph / 2, cs, 4, 0.25);
  // + ve = işaretleri
  ctx.font = `800 26px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('+', -w / 2 + 32, yTop);
  ctx.fillText('=', -w / 2 + 32, yBot);
}

export const DRAWERS = {
  wavefield: drawWavefield,
  barrier: drawBarrier,
  emitter: drawEmitter,
  detector: drawDetector,
  eye: drawEye,
  superpose: drawSuperpose,
};

export const PHYSICS_DOC = `ÇİFT YARIK / FİZİK ÖĞELERİ (dünya koordinatı; ortak geom = {srcX:540,srcY:250, barrierY:560, thick:26, slits:[480,600], a:22, screenY:1040, x0:90,x1:990}; hepsine aynı "geom" verilir, x/y yalnızca giriş/çıkış ölçeğinin merkezidir. (K) = düz değer ya da [[t,v],...] anahtar dizisi (mutlak sn; clock:'scene'|'local' ile sahne/öğe içi). Önerilen çizim sırası: wavefield, detector, barrier, emitter, eye)
- wavefield: iki yarıktan fiziksel girişim dalgaları (ψ_j=A_j·cos(k r_j−ωt), toplam ışıkla eklenir) {preset:'light'|'electron' (K), color (K), amp=1 (K, 0..1.3), coherence=1 (K; 0 = yarık ölçülüyor, çizgiler silinir), incident=0 (K, levha üstü kaynak dalgası), incidentFront (başlangıç sn; 300 px/sn), front (K, px; yarık dalgalarının ulaştığı yarıçap), speed=60 (tepe px/sn), hyper:{anti (K 0..1 parlak hiperboller r1−r2=mλ), node (K kesikli karanlık hiperboller), orders=3, color, nodeColor}, glints (K, tepe parıltıları), beam (K, Jönsson sürekli demet), packets:[{t0,t1,sigma=38}] (tek elektron dalga paketi; t1'de söner), res=0.34, gain=1}
- barrier: yarıklı metal levha, yarıklar gerçek boşluk {color (K, yarık ışığı), glow (K 0..1), glowStagger=0.15 (sağ yarık gecikmesi), pulses:[{t, slit:0|1|'both'}] (0.4 sn parlama), pings:[{t, slit, color='#ff4d8d'}] (ölçüm halkası)}
- emitter: kaynak + uçan kuantumlar {kind:'lamp'|'gun' (K yazı; 0.5 sn geçiş), color (K), power=1 (K), beam (K, Jönsson akışı), shots:[{t, mode:'wave'|'particle'|'ghost'|'hover', slit:0|1, hero:true (büyük, uzun iz), landX, landT, barrierT, flight=0.75, vanish:0.5 (yolun yarısında kaybolur), arcs:false, hoverY, hoverAt, splitAt (iki yarıkta iki hayalet, 3 Hz zıt faz), fadeAt, color}], link:{run:'A', count=60, flight=0.75, mode:'wave'|'particle', color, streamFrom (sn; sönük akış bundan önce çizilmez), streamAlpha=0.55}, ghostSize=7 (detector koşusunun i. noktasına tam t_i anında iner; sayıdan sonrası sönük akış), lampColor, ghostColor, particleColor, pingColor='#ff4d8d'}
- detector: ekran şeridi + yoğunluk grafiği + nokta birikimi {h=84, preset:'light'|'electron' (K), white:true (ışıkta beyaz merkez + renkli saçak kenarları), color (K), power (K, açılış taraması), intensity (K, analitik saçak parlaklığı), coherence (K; 1 saçak ↔ 0 iki yumru, yumuşak geçiş), dim (K), reveal:{t,dur=0.8} (merkezden açılır), ghost (K, klasik iki şerit), ghostColor (K), ticks (K, ▲ parlak ▼ karanlık işaretleri), compare (K, üst ışık / alt elektron), compareTags:['ışık · 550 nm','e⁻ · 5 pm'], clearAt:[{t,dur=0.5}] (tarama ile silme), runs:[{id, keys:[[t,N],...] (log ara değer), coherence=1, color, fadeAt, fadeTo=0.08, fadeDur=0.8, dim (K)}], extraDots:[{t,x,big|solid}], maxDots=12000, ghostW=34, ghostFill=0.25, ghostGlow=0, ghostDelay (sağ şerit gecikmesi, sn), split (K 0..1: sağ yarı uyum-0 deseni) + splitColor, hitScale=1 (seyrek çarpmalarda büyük hale + halka), compareTagSize=19, visFrom:'coherence' (KONTRAST = koşuların uyumu × V(1) + istatistik gürültü), readoutSize=26, showCount:'A' (K yazı; hangi koşu sayılır) + countVis (K) ('ELEKTRON 160.000'), showVis (K) ('KONTRAST %89', gösterilen desenden hesaplanır), graph:{h=130, gap=16, mode:'curve'|'hist'|'both' (K), draw:[{t,dur=0.85}] (merkezden çizilir), histBins=90, color, opacity (K), guides:true}}
- eye: gözlemci gözü {w=230, open (K 0..1; 0 = parlayan kirpik çizgisi), color='#ff4d8d', look:'track:emitter' | {tx,ty} (aynı koordinat uzayında), scan (K) + scanTo:{x,y,spread=120} (gözden hedefe tarama konisi), tether:true, glow (K)}
- superpose: üst üste binme şeması (yapıcı ↔ yıkıcı girişim) {w=640,h=170, wavelength=150, amp, phase=0 → toPhase=π, phaseAt (öğe içi sn), phaseDur=0.6, speed=0.5, colorA, colorB, colorSum}`;
