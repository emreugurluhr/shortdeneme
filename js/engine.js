// Sahne motoru: bir projeyi (sahneler + kelime zamanlamaları) verilen t anında
// 1080x1920 tuvale çizer. Önizleme ve video dışa aktarımı aynı fonksiyonu kullanır.
// Ek öğe türleri (HUD bileşenleri, uzay/şehir dekorları) ve arka plan hazırları
// js/elements/ altındaki modüllerden gelir.
import { DRAWERS as HUD_DRAWERS } from './elements/hud.js';
import { DRAWERS as SCENERY_DRAWERS, BACKGROUNDS } from './elements/scenery.js';

export const W = 1080;
export const H = 1920;

export const FONTS = {
  display: '"Nunito", "Arial Rounded MT Bold", system-ui, sans-serif',
  number: '"Barlow Condensed", "Nunito", "Arial Narrow", sans-serif',
  body: '"Nunito", system-ui, sans-serif',
};

export const DEFAULT_THEME = {
  bg: '#0b1530',
  bg2: '#1a2a55',
  grid: 'rgba(140,170,255,0.07)',
  accent: '#ff4d6d',
  accent2: '#ffc83d',
  text: '#ffffff',
};

// ---------------------------------------------------------------- yardımcılar
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const TAU = Math.PI * 2;

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function color(v, theme, d) {
  if (!v) return d;
  if (v === 'accent') return theme.accent;
  if (v === 'accent2') return theme.accent2;
  if (v === 'text') return theme.text;
  if (v === 'bg') return theme.bg;
  if (v === 'bg2') return theme.bg2;
  return v;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function formatNumber(v, decimals = 0) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

// ---------------------------------------------------------------- zamanlama
// Sahnelerin başlangıç/bitiş zamanlarını ve "cue" (kelimeye bağlı) zamanları çözer.
export function resolveTimeline(project) {
  const words = project.words || [];
  const segments = project.segments || [];
  const scenes = project.plan?.scenes || [];
  const duration = project.duration || (words.length ? words[words.length - 1].end + 0.6 : 10);
  const out = [];
  scenes.forEach((sc, i) => {
    const seg = segments[clamp(num(sc.from, 0), 0, Math.max(0, segments.length - 1))];
    let start = i === 0 ? 0 : seg ? seg.start : 0;
    if (Number.isFinite(sc.start)) start = sc.start;
    out.push({ scene: sc, start, index: i });
  });
  out.sort((a, b) => a.start - b.start);
  out.forEach((s, i) => {
    s.end = i + 1 < out.length ? out[i + 1].start : duration;
    if (s.end <= s.start) s.end = s.start + 0.5;
    s.words = words.filter((w) => w.start >= s.start - 0.05 && w.start < s.end);
  });
  return { scenes: out, duration };
}

function norm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// Bir öğenin sahne içindeki başlangıç zamanı (saniye, sahne başına göre).
export function elementStart(el, sc) {
  if (el.cue && sc.words?.length) {
    const target = norm(el.cue);
    if (target) {
      const hit =
        sc.words.find((w) => norm(w.text) === target) ||
        sc.words.find((w) => norm(w.text).startsWith(target)) ||
        sc.words.find((w) => norm(w.text).includes(target));
      if (hit) return Math.max(0, hit.start - sc.start + num(el.offset, 0));
    }
  }
  return Math.max(0, num(el.at, 0));
}

// ---------------------------------------------------------------- arka plan
// Hazır arka planlar js/elements/scenery.js içindedir ("grid" eski lacivert ızgara).
// plan.background tüm video için, scene.background tek sahne için seçilir.
export const BACKGROUND_NAMES = Object.keys(BACKGROUNDS);

export function backgroundName(name) {
  if (!name || typeof name !== 'string') return null;
  if (BACKGROUNDS[name]) return name;
  const k = name.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return BACKGROUNDS[k] ? k : null;
}

function drawBackground(ctx, t, theme, name) {
  (BACKGROUNDS[name] || BACKGROUNDS.grid)(ctx, t, theme);
}

// Geçişte gelen sahnenin arka planı ayrı bir tuvale çizilip saydamlıkla bindirilir
// (arka planlar globalAlpha'yı kendileri ayarladığı için doğrudan karıştırılamaz).
let blendCanvas = null;
function drawBackgroundOver(ctx, t, theme, name, alpha) {
  if (alpha <= 0.001) return;
  if (alpha >= 0.999) return drawBackground(ctx, t, theme, name);
  if (!blendCanvas) {
    blendCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  }
  const b = blendCanvas.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.globalAlpha = 1;
  b.globalCompositeOperation = 'source-over';
  drawBackground(b, t, theme, name);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(blendCanvas, 0, 0, W, H);
  ctx.restore();
}

// ---------------------------------------------------------------- metin
// "*kelime*" ile işaretlenen kısımlar vurgu rengiyle yazılır.
function parseSpans(text) {
  const spans = [];
  const re = /\*([^*]+)\*/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) spans.push({ t: text.slice(last, m.index), hi: false });
    spans.push({ t: m[1], hi: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ t: text.slice(last), hi: false });
  return spans;
}

function wrapSpans(ctx, spans, maxWidth) {
  // kelime bazında satırlara böl, vurgu bilgisini koru
  const tokens = [];
  spans.forEach((s) => {
    s.t.split(/(\s+)/).forEach((p) => {
      if (p === '') return;
      if (/^\s+$/.test(p)) {
        if (p.includes('\n')) tokens.push({ br: true });
        else tokens.push({ t: ' ', hi: s.hi, space: true });
      } else tokens.push({ t: p, hi: s.hi });
    });
  });
  const lines = [[]];
  let width = 0;
  tokens.forEach((tk) => {
    if (tk.br) {
      lines.push([]);
      width = 0;
      return;
    }
    const w = ctx.measureText(tk.t).width;
    const line = lines[lines.length - 1];
    if (!tk.space && width + w > maxWidth && line.length) {
      while (line.length && line[line.length - 1].space) line.pop();
      lines.push([]);
      width = 0;
    }
    if (tk.space && lines[lines.length - 1].length === 0) return;
    lines[lines.length - 1].push({ ...tk, w });
    width += w;
  });
  return lines.map((l) => ({ parts: l, w: l.reduce((a, p) => a + p.w, 0) }));
}

function drawText(ctx, el, env, p) {
  const theme = env.theme;
  const size = num(el.size, 80);
  const family = FONTS[el.font] || FONTS.display;
  const weight = el.weight || 900;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textBaseline = 'middle';
  let text = String(el.text ?? '');
  if (el.upper) text = text.toLocaleUpperCase('tr-TR');
  const spans = parseSpans(text);
  const maxW = num(el.maxWidth, 940);
  let lines = wrapSpans(ctx, spans, maxW);
  // dengeli satırlar: aynı satır sayısını koruyan en dar genişliği bul ("donar / mı?" gibi
  // tek kelimelik yetim satır kalmasın)
  if (lines.length >= 2 && el.balance !== false) {
    let lo = maxW * 0.4, hi = maxW, best = lines;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const l2 = wrapSpans(ctx, spans, mid);
      if (l2.length <= lines.length && Math.max(...l2.map((l) => l.w)) <= mid + 0.5) { best = l2; hi = mid; } else lo = mid;
    }
    lines = best;
  }
  const lh = size * num(el.lineHeight, 1.12);
  const total = lines.length * lh;
  const fill = color(el.color, theme, theme.text);
  const hiFill = color(el.highlight, theme, theme.accent2);

  // typewriter: kaç karakter görünür
  let visible = Infinity;
  if (el.in === 'type') {
    const chars = lines.reduce((a, l) => a + l.parts.reduce((b, pp) => b + pp.t.length, 0), 0);
    visible = Math.floor(chars * p.inRaw);
  }

  if (el.box) {
    const maxW = Math.max(...lines.map((l) => l.w));
    const pad = num(el.box.pad, size * 0.4);
    const bw = maxW + pad * 2, bh = total + pad * 1.2;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, num(el.box.radius, bh / 2));
    ctx.fillStyle = color(el.box.fill, theme, 'rgba(10,14,30,0.85)');
    ctx.fill();
    if (el.box.stroke) {
      ctx.lineWidth = num(el.box.lineWidth, 5);
      ctx.strokeStyle = color(el.box.stroke, theme, theme.accent2);
      ctx.stroke();
    }
  }

  const align = el.align || 'center';
  let shown = 0;
  lines.forEach((line, li) => {
    const y = -total / 2 + lh * (li + 0.5);
    let x = align === 'left' ? 0 : align === 'right' ? -line.w : -line.w / 2;
    line.parts.forEach((part) => {
      let str = part.t;
      if (shown + str.length > visible) str = str.slice(0, Math.max(0, visible - shown));
      shown += part.t.length;
      if (!str) {
        x += part.w;
        return;
      }
      const c = part.hi ? hiFill : fill;
      ctx.textAlign = 'left';
      if (el.stroke !== false && (el.stroke || el.outline)) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = num(el.strokeWidth, size * 0.14);
        ctx.strokeStyle = color(el.stroke === true ? null : el.stroke, theme, 'rgba(0,0,0,0.85)');
        ctx.strokeText(str, x, y);
      }
      if (el.glow) {
        ctx.save();
        ctx.shadowColor = color(el.glow === true ? null : el.glow, theme, c);
        ctx.shadowBlur = size * 0.45;
        ctx.fillStyle = c;
        ctx.fillText(str, x, y);
        ctx.shadowBlur = size * 0.2;
        ctx.fillText(str, x, y);
        ctx.restore();
      } else if (el.shadow !== false) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = size * 0.15;
        ctx.shadowOffsetY = size * 0.05;
        ctx.fillStyle = c;
        ctx.fillText(str, x, y);
        ctx.restore();
      }
      ctx.fillStyle = c;
      ctx.fillText(str, x, y);
      x += part.w;
    });
  });
}

function drawCounter(ctx, el, env, p) {
  const dur = num(el.duration, 1.6);
  const k = easeOutCubic(clamp(p.lt / dur));
  const from = num(el.from, 0), to = num(el.to, 100);
  let v = lerp(from, to, k);
  // büyük sayılarda sayarken anlamsız basamaklar görünmesin
  if (k < 1 && Math.abs(v) >= 1e5) v = Number(v.toPrecision(3));
  // Türkçede yüzde işareti önde: "%40"
  const pctFix = !el.prefix && String(el.suffix || '').trim() === '%';
  const text = pctFix ? `%${formatNumber(v, num(el.decimals, 0))}` : `${el.prefix || ''}${formatNumber(v, num(el.decimals, 0))}${el.suffix || ''}`;
  drawText(ctx, { font: 'number', weight: 700, glow: true, ...el, text, in: 'none' }, env, p);
}

// ---------------------------------------------------------------- dişli
function drawGear(ctx, el, env, p) {
  const theme = env.theme;
  const r = num(el.r, 120);
  const teeth = Math.max(6, Math.round(num(el.teeth, r / 9)));
  const depth = num(el.depth, Math.max(8, r * 0.14));
  const speed = num(el.speed, 0.15); // tur/saniye (eksi: ters yön)
  ctx.rotate(p.lt * speed * TAU);
  const style = el.style || 'metal';
  const base = { metal: ['#eef1f6', '#9aa3b5'], gold: ['#ffe39a', '#c98a12'], wood: ['#e0a86a', '#8a5226'], dark: ['#556080', '#232c48'] }[style] || ['#eef1f6', '#9aa3b5'];
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, el.color ? color(el.color, theme) : base[0]);
  g.addColorStop(1, base[1]);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = r * 0.15;
  ctx.shadowOffsetY = r * 0.05;
  ctx.beginPath();
  const inner = r - depth;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const s = TAU / teeth;
    ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a + s * 0.15) * r, Math.sin(a + s * 0.15) * r);
    ctx.lineTo(Math.cos(a + s * 0.45) * r, Math.sin(a + s * 0.45) * r);
    ctx.lineTo(Math.cos(a + s * 0.6) * inner, Math.sin(a + s * 0.6) * inner);
  }
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // iç halka
  ctx.beginPath();
  ctx.arc(0, 0, inner * 0.82, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fill();
  // kollar
  const spokes = num(el.spokes, 6);
  ctx.fillStyle = color(el.hub, theme, style === 'metal' ? '#2b3350' : 'rgba(0,0,0,0.35)');
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * inner * 0.5, Math.sin(a) * inner * 0.5, inner * 0.2, inner * 0.13, a, 0, TAU);
    ctx.fill();
  }
  // göbek
  ctx.beginPath();
  ctx.arc(0, 0, inner * 0.28, 0, TAU);
  const hg = ctx.createRadialGradient(-inner * 0.08, -inner * 0.08, 2, 0, 0, inner * 0.28);
  hg.addColorStop(0, '#fff2b8');
  hg.addColorStop(1, color(el.hubColor, theme, theme.accent2));
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, inner * 0.09, 0, TAU);
  ctx.fillStyle = '#2b2b2b';
  ctx.fill();
}

// ---------------------------------------------------------------- radyo dalgaları
function drawWaves(ctx, el, env, p) {
  const theme = env.theme;
  const count = num(el.count, 4);
  const length = num(el.length, 420);
  const speed = num(el.speed, 0.6);
  const spread = (num(el.spread, 70) * Math.PI) / 180;
  let angle = (num(el.angle, 0) * Math.PI) / 180;
  if (Number.isFinite(el.tx) && Number.isFinite(el.ty)) angle = Math.atan2(el.ty - el.y, el.tx - el.x);
  const full = el.ring === true || el.full === true;
  const c = color(el.color, theme, theme.accent);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const ph = (p.lt * speed + i / count) % 1;
    const rad = 20 + ph * length;

    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * (1 - ph) * 0.95;
    ctx.strokeStyle = c;
    ctx.lineWidth = num(el.lineWidth, 10) * (1 - ph * 0.5);
    ctx.shadowColor = c;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    if (full) ctx.arc(0, 0, rad, 0, TAU);
    else ctx.arc(0, 0, rad, angle - spread / 2, angle + spread / 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- ölçek / çubuk
function drawMeter(ctx, el, env, p) {
  // HUD görünümü: ince cam kapsül, degrade dolum, küçük harf aralıklı etiketler
  const theme = env.theme;
  const w = Math.min(num(el.w, 30), 44), h = num(el.h, 760);
  const horizontal = el.horizontal === true;
  const dur = num(el.duration, 1.8);
  const val = clamp(lerp(num(el.from, 0), num(el.value, 1), easeInOut(clamp(p.lt / dur))));
  const c = color(el.color, theme, theme.accent);
  const bw = horizontal ? h : w, bh = horizontal ? w : h;
  const pad = Math.max(4, w * 0.18);
  // kapsül
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, Math.min(bw, bh) / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // dolum
  const iw = bw - pad * 2, ih = bh - pad * 2;
  const thick = Math.min(iw, ih);
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = 16;
  let g;
  if (horizontal) {
    const fw = Math.max(thick, iw * val);
    g = ctx.createLinearGradient(-iw / 2, 0, iw / 2, 0);
    g.addColorStop(0, withAlpha(c, 0.45));
    g.addColorStop(1, c);
    roundRect(ctx, -iw / 2, -ih / 2, fw, ih, thick / 2);
  } else {
    const fh = Math.max(thick, ih * val);
    g = ctx.createLinearGradient(0, ih / 2, 0, -ih / 2);
    g.addColorStop(0, withAlpha(c, 0.45));
    g.addColorStop(1, c);
    roundRect(ctx, -iw / 2, ih / 2 - fh, iw, fh, thick / 2);
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // işaretler
  const ls = num(el.labelSize, 24);
  (el.marks || []).forEach((m) => {
    const v = clamp(num(m.v, 0));
    const reached = val >= v - 0.001;
    ctx.save();
    ctx.font = `800 ${ls}px ${FONTS.display}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(ls * 0.12).toFixed(1)}px`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = reached ? color(m.color, theme, c) : 'rgba(255,255,255,0.7)';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    const label = String(m.label ?? '').toLocaleUpperCase('tr-TR');
    if (horizontal) {
      const x = -iw / 2 + iw * v;
      ctx.beginPath();
      ctx.moveTo(x, -bh / 2 - 10);
      ctx.lineTo(x, bh / 2 + 10);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(label, x, bh / 2 + 10 + ls);
    } else {
      const y = ih / 2 - ih * v;
      ctx.beginPath();
      ctx.moveTo(-bw / 2 - 18, y);
      ctx.lineTo(-bw / 2 - 4, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(label, -bw / 2 - 28, y);
    }
    ctx.restore();
  });
}

// ---------------------------------------------------------------- çipler (50 × 50 × …)
function drawChips(ctx, el, env, p) {
  const theme = env.theme;
  const items = (el.items || []).map(String);
  const size = num(el.size, 56);
  const cols = Math.max(1, num(el.cols, 6));
  const stagger = num(el.stagger, 0.12);
  const gapX = num(el.gap, 26);
  ctx.font = `800 ${size}px ${FONTS.number}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const chipW = Math.max(...items.map((s) => ctx.measureText(s).width)) + size * 1.1;
  const chipH = size * 1.5;
  const opW = size * 0.9;
  const isOp = (s) => /^[×x+\-−=÷·*/]$/.test(s.trim());
  // satırlara böl: her satırda "cols" çip
  const rows = [];
  let row = [], count = 0;
  items.forEach((s) => {
    if (!isOp(s)) count++;
    if (!isOp(s) && count > cols) {
      rows.push(row);
      row = [];
      count = 1;
    }
    row.push(s);
  });
  if (row.length) rows.push(row);
  const rowGap = chipH * 0.55;
  const totalH = rows.length * chipH + (rows.length - 1) * rowGap;
  // en geniş satır ekrana sığmıyorsa tüm grubu küçült
  const rowWidth = (r) => r.reduce((a, s) => a + (isOp(s) ? opW : chipW), 0) + gapX * (r.length - 1);
  const widest = Math.max(...rows.map((r) => rowWidth(r.filter((s, i) => !(i === r.length - 1 && isOp(s))))));
  const fit = Math.min(1, num(el.maxWidth, 960) / widest);
  ctx.scale(fit, fit);
  let idx = 0;
  rows.forEach((r, ri) => {
    while (r.length && isOp(r[r.length - 1])) r.pop();
    const widths = r.map((s) => (isOp(s) ? opW : chipW));
    const rw = widths.reduce((a, b) => a + b, 0) + gapX * (r.length - 1);
    let x = -rw / 2;
    const y = -totalH / 2 + ri * (chipH + rowGap) + chipH / 2;
    r.forEach((s, i) => {
      const k = clamp((p.lt - idx * stagger) / 0.3);
      idx++;
      const cw = widths[i];
      if (k > 0) {
        ctx.save();
        ctx.translate(x + cw / 2, y);
        const sc = easeOutBack(k);
        ctx.scale(sc, sc);
        ctx.globalAlpha *= k;
        if (isOp(s)) {
          ctx.fillStyle = color(el.opColor, theme, theme.accent2);
          ctx.fillText(s, 0, 0);
        } else {
          roundRect(ctx, -cw / 2, -chipH / 2, cw, chipH, chipH / 2);
          ctx.fillStyle = color(el.fill, theme, 'rgba(8,10,20,0.9)');
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = color(el.stroke, theme, theme.accent2);
          ctx.stroke();
          ctx.fillStyle = color(el.color, theme, '#ffffff');
          ctx.fillText(s, 0, 2);
        }
        ctx.restore();
      }
      x += cw + gapX;
    });
  });
}

// ---------------------------------------------------------------- şekiller
function drawShape(ctx, el, env, p) {
  const theme = env.theme;
  const shape = el.shape || 'circle';
  const fill = el.fill ? color(el.fill, theme) : null;
  const stroke = el.stroke ? color(el.stroke, theme) : null;
  const lw = num(el.lineWidth, 6);
  const reveal = el.in === 'draw' ? easeInOut(p.inRaw) : 1;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.glow) {
    ctx.shadowColor = color(el.glow === true ? null : el.glow, theme, stroke || fill || theme.accent);
    ctx.shadowBlur = 30;
  }
  if (Array.isArray(el.dash)) {
    ctx.setLineDash(el.dash);
    ctx.lineDashOffset = -p.lt * num(el.flow, 0) * 60;
  }
  if (shape === 'line' || shape === 'arrow') {
    const dx = num(el.x2, el.x) - el.x, dy = num(el.y2, el.y) - el.y;
    const ex = dx * reveal, ey = dy * reveal;
    ctx.strokeStyle = stroke || theme.text;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (shape === 'arrow' && reveal > 0.05) {
      const a = Math.atan2(dy, dx), hs = num(el.head, lw * 4);
      ctx.setLineDash([]);
      ctx.fillStyle = stroke || theme.text;
      ctx.beginPath();
      ctx.moveTo(ex + Math.cos(a) * hs * 0.4, ey + Math.sin(a) * hs * 0.4);
      ctx.lineTo(ex + Math.cos(a + 2.5) * hs, ey + Math.sin(a + 2.5) * hs);
      ctx.lineTo(ex + Math.cos(a - 2.5) * hs, ey + Math.sin(a - 2.5) * hs);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  ctx.beginPath();
  if (shape === 'rect') {
    const w = num(el.w, 200), h = num(el.h, 200);
    roundRect(ctx, -w / 2, -h / 2, w, h, num(el.radius, 24));
  } else if (shape === 'ring') {
    ctx.arc(0, 0, num(el.r, 100), -Math.PI / 2, -Math.PI / 2 + TAU * reveal);
  } else {
    ctx.arc(0, 0, num(el.r, 100), 0, TAU * reveal);
  }
  if (fill && shape !== 'ring') {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke || shape === 'ring') {
    ctx.strokeStyle = stroke || theme.accent;
    ctx.stroke();
  }
}

function drawEqualizer(ctx, el, env, p) {
  const theme = env.theme;
  const n = num(el.bars, 14), w = num(el.w, 520), h = num(el.h, 220);
  const bw = (w / n) * 0.62;
  const c = color(el.color, theme, theme.accent2);
  ctx.fillStyle = c;
  ctx.shadowColor = c;
  ctx.shadowBlur = 16;
  for (let i = 0; i < n; i++) {
    const v = 0.15 + 0.85 * Math.abs(Math.sin(p.lt * (3 + hash(i) * 5) + hash(i + 9) * 6));
    const bh = Math.max(bw, h * v);
    const x = -w / 2 + (i + 0.5) * (w / n) - bw / 2;
    roundRect(ctx, x, -bh / 2, bw, bh, bw / 2);
    ctx.fill();
  }
}

function drawParticles(ctx, el, env, p) {
  const theme = env.theme;
  const n = num(el.count, 40);
  const aw = num(el.w, W), ah = num(el.h, H);
  ctx.fillStyle = color(el.color, theme, 'rgba(255,220,150,0.8)');
  for (let i = 0; i < n; i++) {
    const sx = hash(i * 3.1) * aw - aw / 2;
    const sy = hash(i * 7.7) * ah - ah / 2;
    const y = ((sy + ah / 2 - p.lt * (20 + hash(i) * 40)) % ah + ah) % ah - ah / 2;
    const x = sx + Math.sin(p.lt * 0.8 + i) * 14;
    const r = 2 + hash(i * 1.3) * num(el.size, 5);
    ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(p.lt * 1.5 + i));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

function drawArt(ctx, el, env) {
  const img = env.images?.[el.id];
  const w = num(el.w, 600), h = num(el.h, 600);
  if (!img) {
    // görsel henüz hazır değilse yumuşak bir yer tutucu
    ctx.save();
    ctx.globalAlpha *= 0.35;
    roundRect(ctx, -w / 2, -h / 2, w, h, 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (el.glow) {
    // yarı saydam ışıma: tam doygun renk çizimin çevresinde "çıkartma" kenarı gibi görünür
    ctx.shadowColor = withAlpha(color(el.glow === true ? null : el.glow, env.theme, env.theme.accent2), 0.55);
    ctx.shadowBlur = 50;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
  }
  // oranı koru: çizim kutuya sığdırılır
  const iw = img.naturalWidth || img.width || w, ih = img.naturalHeight || img.height || h;
  const k = Math.min(w / iw, h / ih);
  const dw = iw * k, dh = ih * k;
  ctx.drawImage(featheredArt(img, dw, dh), -dw / 2, -dh / 2, dw, dh);
}

// "#rgb" / "#rrggbb" / "rgb()" rengine saydamlık ekler; çözülemeyen renk aynen döner.
function withAlpha(c, a) {
  const s = String(c || '').trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.replace(/./g, (x) => x + x);
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : s;
}

// Yapay zekâ çizimleri kenara kadar taşan hale/ışık/zemin bırakabilir; viewBox bunları
// sert bir dikdörtgen kenarla keser. Çizim bir kez önbellek tuvaline basılır ve kenarları
// yumuşakça saydamlaşır (iyi çizimlerde kenar boşluğu zaten boştur, fark görünmez).
// Önbellek ayrıca karmaşık SVG'nin her karede yeniden taranmasını önler.
const ART_CACHE = new WeakMap();
function featheredArt(img, dw, dh) {
  const s = Math.min(1.25, 1400 / Math.max(dw, dh, 1)); // kamera yakınlaşmasında net kalsın
  const cw = Math.max(1, Math.round(dw * s)), ch = Math.max(1, Math.round(dh * s));
  const key = cw + 'x' + ch;
  let byKey = ART_CACHE.get(img);
  if (!byKey) ART_CACHE.set(img, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  let cv;
  try {
    cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, cw, ch);
    g.globalCompositeOperation = 'destination-in';
    const f = 0.04;
    const edge = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(f, 'rgba(0,0,0,1)');
      gr.addColorStop(1 - f, 'rgba(0,0,0,1)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, cw, ch);
    };
    edge(0, 0, cw, 0);
    edge(0, 0, 0, ch);
  } catch (_) {
    return img; // tuval oluşturulamazsa çizim olduğu gibi kullanılır
  }
  if (byKey.size >= 3) byKey.delete(byKey.keys().next().value);
  byKey.set(key, cv);
  return cv;
}

const DRAWERS = {
  ...HUD_DRAWERS,
  ...SCENERY_DRAWERS,
  text: drawText,
  counter: drawCounter,
  gear: drawGear,
  waves: drawWaves,
  meter: drawMeter,
  chips: drawChips,
  shape: drawShape,
  equalizer: drawEqualizer,
  particles: drawParticles,
  art: drawArt,
};

// ---------------------------------------------------------------- öğe çizimi
function drawElement(ctx, el, sc, t, env) {
  if (el.type === 'flash' || el.type === 'shake') return;
  const draw = DRAWERS[el.type];
  if (!draw) return;
  const start = elementStart(el, sc);
  const lt = t - sc.start - start;
  if (lt < 0) return;
  const until = Number.isFinite(Number(el.until)) ? Number(el.until) : null;
  // videonun ilk karesi boş kalmasın: açılış sahnesinde 0. saniyedeki öğeler hazır görünür
  const inAnim = sc.start === 0 && start === 0 && el.in !== 'type' ? 'none' : el.in || 'fade';
  const inDur = num(el.inDur, inAnim === 'stamp' ? 0.28 : inAnim === 'type' ? Math.max(0.4, String(el.text || '').length * 0.045) : inAnim === 'draw' ? 0.9 : 0.45);
  const inRaw = inAnim === 'none' ? 1 : clamp(lt / inDur);
  let alpha = num(el.opacity, 1);
  let sx = 1, sy = 1, dx = 0, dy = 0, rot = (num(el.rotation, 0) * Math.PI) / 180;
  const e = easeOutCubic(inRaw);
  switch (inAnim) {
    case 'fade': alpha *= e; break;
    case 'pop': { const s = lerp(0.3, 1, easeOutBack(inRaw)); sx = sy = s; alpha *= clamp(inRaw * 3); break; }
    case 'zoom': { const s = lerp(1.6, 1, e); sx = sy = s; alpha *= e; break; }
    case 'slideUp': dy = (1 - e) * 140; alpha *= e; break;
    case 'slideDown': dy = -(1 - e) * 140; alpha *= e; break;
    case 'slideLeft': dx = (1 - e) * 260; alpha *= e; break;
    case 'slideRight': dx = -(1 - e) * 260; alpha *= e; break;
    case 'stamp': {
      const s = lerp(2.6, 1, easeOutCubic(inRaw)); sx = sy = s; alpha *= clamp(inRaw * 2);
      const after = lt - inDur;
      if (after > 0 && after < 0.35) { const k = (1 - after / 0.35) * 14; dx += Math.sin(after * 90) * k; dy += Math.cos(after * 70) * k; }
      break;
    }
    case 'spin': { rot += (1 - e) * -Math.PI; const s = lerp(0.2, 1, e); sx = sy = s; alpha *= e; break; }
    default: break;
  }
  // çıkış
  if (until !== null) {
    const outT = t - sc.start - until;
    // outTo: 0..1 → öğe tamamen kaybolmaz, yavaşça bu opaklığa silikleşir ("ortadan kayboldu" anları)
    const outTo = Number.isFinite(Number(el.outTo)) ? clamp(Number(el.outTo)) : null;
    const outDur = num(el.outDur, outTo !== null ? 1.4 : 0.3);
    if (outT > outDur && !outTo) return;
    if (outT > 0) {
      const k = outTo !== null ? easeInOut(clamp(outT / outDur)) : clamp(outT / outDur);
      alpha *= 1 - k * (1 - (outTo || 0));
      if (el.out === 'zoom') sx = sy = sx * (1 + k * 0.4);
      if (el.out === 'slideUp') dy -= k * 140;
    }
  }
  // döngüler
  const sp = num(el.loopSpeed, 1);
  switch (el.loop) {
    case 'rotate': rot += lt * 0.12 * sp * TAU; break;
    case 'spin': rot += lt * 0.6 * sp * TAU; break;
    case 'pulse': { const s = 1 + 0.05 * Math.sin(lt * 4 * sp); sx *= s; sy *= s; break; }
    case 'float': dy += Math.sin(lt * 1.6 * sp) * 14; break;
    case 'sway': rot += Math.sin(lt * 1.4 * sp) * 0.06; break;
    case 'shake': dx += (hash(Math.floor(lt * 30)) - 0.5) * 12 * sp; dy += (hash(Math.floor(lt * 30) + 5) - 0.5) * 12 * sp; break;
    case 'vibrate': dx += Math.sin(lt * 90) * 3 * sp; dy += Math.cos(lt * 77) * 2 * sp; break;
    case 'blink': alpha *= 0.55 + 0.45 * Math.sin(lt * 5 * sp); break;
    default: break;
  }
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.translate(num(el.x, W / 2) + dx, num(el.y, H / 2) + dy);
  if (rot) ctx.rotate(rot);
  const scale = num(el.scale, 1);
  ctx.scale(sx * scale, sy * scale);
  draw(ctx, el, env, { lt, inRaw, until });
  ctx.restore();
}

function sceneShake(sc, t) {
  let dx = 0, dy = 0;
  (sc.scene.elements || []).forEach((el) => {
    if (el.type !== 'shake') return;
    const lt = t - sc.start - elementStart(el, sc);
    const dur = num(el.duration, 0.4);
    if (lt < 0 || lt > dur) return;
    const k = (1 - lt / dur) * num(el.amp, 18);
    dx += Math.sin(lt * 95) * k;
    dy += Math.cos(lt * 83) * k;
  });
  return [dx, dy];
}

function sceneFlash(ctx, sc, t) {
  (sc.scene.elements || []).forEach((el) => {
    if (el.type !== 'flash') return;
    const lt = t - sc.start - elementStart(el, sc);
    const dur = num(el.duration, 0.35);
    if (lt < 0 || lt > dur) return;
    ctx.save();
    ctx.globalAlpha = (1 - lt / dur) * num(el.opacity, 0.85);
    ctx.fillStyle = el.color || '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  });
}

function drawScene(ctx, sc, t, env) {
  const local = t - sc.start;
  const len = Math.max(0.1, sc.end - sc.start);
  const cam = sc.scene.camera || {};
  const zoom = Array.isArray(cam.zoom) ? cam.zoom : [1, 1.05];
  const z = lerp(num(zoom[0], 1), num(zoom[1], 1.05), clamp(local / len));
  const [shx, shy] = sceneShake(sc, t);
  ctx.save();
  ctx.translate(W / 2 + shx, H / 2 + shy);
  ctx.scale(z, z);
  ctx.translate(-W / 2 + num(cam.panX, 0) * clamp(local / len), -H / 2 + num(cam.panY, 0) * clamp(local / len));
  (sc.scene.elements || []).forEach((el) => drawElement(ctx, el, sc, t, env));
  ctx.restore();
  sceneFlash(ctx, sc, t);
}

// ---------------------------------------------------------------- altyazı
export function captionGroups(words, maxChars = 16, maxWords = 3) {
  const groups = [];
  let cur = [];
  const flush = () => {
    if (cur.length) groups.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  words.forEach((w) => {
    const len = cur.reduce((a, x) => a + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= maxWords || len > maxChars)) flush();
    cur.push(w);
    if (w.breakAfter) flush();
  });
  flush();
  // grup bitişini bir sonrakinin başına uzat (titremeyi önler)
  groups.forEach((g, i) => {
    const next = groups[i + 1];
    g.showUntil = next ? Math.min(next.start, g.end + 0.6) : g.end + 0.8;
  });
  return groups;
}

function drawCaptions(ctx, t, env) {
  const cap = env.captions;
  if (!cap || !cap.groups?.length || cap.enabled === false) return;
  const g = cap.groups.find((x) => t >= x.start - 0.02 && t < x.showUntil);
  if (!g) return;
  const size = num(cap.size, 86);
  ctx.save();
  ctx.font = `900 ${size}px ${FONTS.display}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const words = g.words.map((w) => w.display);
  const space = ctx.measureText(' ').width;
  const widths = words.map((w) => ctx.measureText(w).width);
  let total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  const maxW = W - 120;
  const fit = total > maxW ? maxW / total : 1;
  const k = clamp((t - g.start) / 0.18);
  const s = lerp(0.82, 1, easeOutBack(k)) * fit;
  ctx.translate(W / 2, num(cap.y, H * 0.72));
  ctx.scale(s, s);
  let x = -total / 2;
  g.words.forEach((w, i) => {
    const isActive = t >= w.start - 0.03 && (i === g.words.length - 1 || t < g.words[i + 1].start - 0.03);
    const c = isActive ? cap.activeColor || env.theme.accent2 : cap.color || '#ffffff';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.strokeText(words[i], x, 0);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = c;
    ctx.fillText(words[i], x, 0);
    x += widths[i] + space;
  });
  ctx.restore();
}

// ---------------------------------------------------------------- ana çizim
// env: { theme, images, captions: {groups, ...}, timeline }
export function renderFrame(ctx, t, env) {
  const theme = env.theme || DEFAULT_THEME;
  ctx.save();
  const scenes = env.timeline?.scenes || [];
  const idx = scenes.findIndex((s) => t >= s.start && t < s.end);
  const cur = idx >= 0 ? scenes[idx] : scenes[scenes.length - 1];
  const bgOf = (sc) => backgroundName(sc?.scene?.background) || backgroundName(env.background) || 'grid';
  const tr = 0.3;
  const local = cur ? t - cur.start : 0;
  const prev = cur && idx > 0 ? scenes[idx - 1] : null;
  const inTransition = !!(prev && local < tr);
  const k = inTransition ? easeOutCubic(local / tr) : 1;
  // arka plan: sahneler arasında farklıysa yumuşak geçiş
  const bgCur = bgOf(cur);
  if (inTransition && bgOf(prev) !== bgCur) {
    drawBackground(ctx, t, theme, bgOf(prev));
    drawBackgroundOver(ctx, t, theme, bgCur, k);
  } else {
    drawBackground(ctx, t, theme, bgCur);
  }
  if (cur) {
    if (inTransition) {
      // önceki sahne son karesinde donar, yenisi üstüne gelir
      ctx.save();
      ctx.globalAlpha = 1 - k;
      drawScene(ctx, prev, Math.min(t, prev.end - 0.001), { ...env, theme });
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = k;
      const type = cur.scene.transition || 'zoom';
      if (type === 'zoom') {
        const s = lerp(1.08, 1, k);
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
      } else if (type === 'slide') {
        ctx.translate((1 - k) * W * 0.25, 0);
      }
      drawScene(ctx, cur, t, { ...env, theme });
      ctx.restore();
      if (type === 'flash') {
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    } else {
      drawScene(ctx, cur, t, { ...env, theme });
    }
  }
  drawCaptions(ctx, t, { ...env, theme });
  ctx.restore();
}

// Tüm projeden çizim ortamını hazırlar.
export function buildEnv(project, images) {
  const theme = { ...DEFAULT_THEME, ...(project.plan?.theme || {}) };
  const timeline = resolveTimeline(project);
  const words = (project.words || []).filter((w) => w.display);
  const groups = captionGroups(words, project.settings?.captionChars || 16, project.settings?.captionWords || 3);
  return {
    theme,
    background: backgroundName(project.plan?.background) || 'grid',
    images: images || {},
    timeline,
    duration: timeline.duration,
    captions: { groups, enabled: project.settings?.captions !== false, y: project.settings?.captionY },
  };
}
