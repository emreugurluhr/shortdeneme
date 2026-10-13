// Sahne planı düzeltici ("lint"). Zayıf bir modelin yazdığı planı çizimden ÖNCE
// belirlenimci olarak onarır: tür/sayı/renk temizliği, güvenli alan, altyazı bandı,
// tek başlık kuralı, aynı anda en fazla 3 yazı, yazı–görsel çakışması, kapak karesi.
//
//   import { lintPlan } from './layout.js';
//   const { plan, notes } = lintPlan(rawPlan, { W: 1080, H: 1920, words, segments, duration });
//
// Saf fonksiyondur (DOM yok, girdi değiştirilmez), belirlenimcidir ve kendi çıktısına
// tekrar uygulanınca hiçbir şey değiştirmez. Seçenekler:
//   words, segments, duration  proje zamanlaması; verilirse "cue" zamanları motorla aynı çözülür
//   captionY (H*0.72), captions:false (bant kuralı kapanır)
//   labels:false  motor "label" türünü çizemiyorsa ikinci başlıklar 48px yazıya iner
//   types: ['yeniTür']  bilinmeyen diye atılmaması gereken ek öğe türleri
// Tek sahne için: lintScene(scene, { index, cover, timing? , ...aynı seçenekler }, notes).

// ---------------------------------------------------------------- türler
const CORE_TYPES = ['text', 'counter', 'gear', 'waves', 'meter', 'chips', 'shape', 'equalizer', 'particles', 'art', 'flash', 'shake'];
const HUD_TYPES = ['label', 'panel', 'clock', 'spectrum', 'sine', 'readout', 'bracket', 'badge'];
const SCENERY_TYPES = ['orb', 'accretion', 'spacegrid', 'rays', 'silhouette', 'starburst'];
// fizik düzeneği (js/elements/physics.js): ortak dünya geometrisiyle çizilir, yerinden oynatılmaz
const PHYSICS_TYPES = ['wavefield', 'barrier', 'emitter', 'detector', 'eye', 'superpose'];
const RIG_TYPES = new Set(['wavefield', 'barrier', 'emitter', 'detector']);
export const KNOWN_TYPES = [...CORE_TYPES, ...HUD_TYPES, ...SCENERY_TYPES, ...PHYSICS_TYPES];

// Zayıf modellerin sık uydurduğu tür adları → gerçek tür
const ALIASES = {
  title: 'text', heading: 'text', headline: 'text', subtitle: 'text', subheading: 'text', caption: 'text',
  paragraph: 'text', quote: 'text', body: 'text', textbox: 'text', 'text-box': 'text',
  image: 'art', illustration: 'art', svg: 'art', picture: 'art', drawing: 'art', img: 'art', graphic: 'art',
  number: 'counter', count: 'counter', stat: 'counter', countup: 'counter',
  pill: 'label', tag: 'label', chip: 'label', hud: 'label',
  circle: 'shape', rect: 'shape', rectangle: 'shape', ring: 'shape', line: 'shape', arrow: 'shape',
  planet: 'orb', sphere: 'orb', blackhole: 'accretion', 'black-hole': 'accretion',
  gauge: 'readout', progress: 'readout', card: 'panel', frame: 'panel', dial: 'clock', wave: 'sine',
  skyline: 'silhouette', burst: 'starburst', sparkles: 'particles', dust: 'particles', bars: 'equalizer',
};
const SHAPE_KINDS = ['circle', 'rect', 'ring', 'line', 'arrow'];

const TEXTLIKE = new Set(['text', 'label', 'counter', 'readout']);
// yazının üstüne binmemesi gereken ana görseller
const OBSTACLE = new Set(['art', 'orb', 'accretion', 'gear']);
const DATA_OBSTACLE = new Set(['spectrum', 'sine', 'clock', 'meter', 'badge', 'chips', 'equalizer']);
// yer değiştirmeyen atmosfer/dekor öğeleri (tam ekran, ışık, zemin silueti)
const DECOR = new Set(['particles', 'rays', 'silhouette', 'flash', 'shake', 'starburst', ...PHYSICS_TYPES]);
// bir ana görselle aynı merkezdeyse onunla birlikte taşınan/ölçeklenen öğeler
const FOLLOWER = new Set(['starburst', 'bracket', 'shape', 'rays', 'waves']);
const ANCHOR = new Set(['art', 'orb', 'accretion', 'gear', 'clock', 'panel']);

const IN_ANIMS = new Set(['fade', 'pop', 'zoom', 'slideUp', 'slideDown', 'slideLeft', 'slideRight', 'stamp', 'type', 'draw', 'spin', 'none']);
const LOOPS = new Set(['rotate', 'spin', 'pulse', 'float', 'sway', 'shake', 'vibrate', 'blink']);
const TRANSITIONS = new Set(['zoom', 'fade', 'slide', 'flash', 'none']);

const NUMERIC = [
  'x', 'y', 'x2', 'y2', 'tx', 'ty', 'toX', 'toY', 'w', 'h', 'r', 'size', 'at', 'until', 'offset', 'inDur', 'loopSpeed',
  'scale', 'rotation', 'opacity', 'maxWidth', 'lineHeight', 'duration', 'from', 'to', 'decimals', 'teeth', 'depth', 'speed',
  'toSpeed', 'count', 'length', 'spread', 'value', 'cols', 'stagger', 'gap', 'radius', 'lineWidth', 'amp', 'bars', 'angle',
  'tilt', 'warp', 'pitch', 'lines', 'labelSize', 'titleSize', 'valueSize', 'markerSize', 'footerSize', 'wavelength',
  'toWavelength', 'delay', 'hour', 'max', 'barHeight', 'len', 'active', 'inner', 'outer', 'flow', 'strokeWidth', 'weight',
  'titleY', 'scanPeriod', 'ringAngle', 'outTo', 'outDur',
];
const COLOR_KEYS = [
  'color', 'fill', 'stroke', 'glow', 'highlight', 'backlight', 'rim', 'tint', 'iconColor', 'labelColor', 'titleColor',
  'footerColor', 'lineColor', 'barColor', 'toColor', 'scanColor', 'bracketColor', 'opColor', 'hot', 'arrowColor', 'backing',
];
// true/false da anlamlı olan renk alanları
const BOOL_COLOR = new Set(['glow', 'stroke', 'backlight', 'rim', 'fill']);

const NAMED = {
  white: '#ffffff', black: '#000000', red: '#ff3b3b', crimson: '#dc143c', orange: '#ff8c2e', gold: '#ffd166', yellow: '#ffd93d',
  green: '#3ddc84', lime: '#a3e635', teal: '#2dd4bf', cyan: '#22d3ee', blue: '#4d8dff', navy: '#0b1530', purple: '#a855f7',
  violet: '#8b5cf6', magenta: '#ff3df2', pink: '#ff6fae', brown: '#8a5226', gray: '#9aa3b5', grey: '#9aa3b5', silver: '#c9ced8',
  beige: '#e8d9b5', cream: '#f3efe6', amber: '#ffbf3d', transparent: 'transparent',
};

// ---------------------------------------------------------------- yardımcılar
// sayı/yıl/üs gibi yalnızca rakam ve işaretlerden oluşan yazı ("1929", "%97,37", "50¹²")
const NUMERIC_RE = /^[\s\d.,:%+\-–/×⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r1 = (v) => Math.round(v);
const r2 = (v) => Math.round(v * 100) / 100;
function num(v, d) {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function isKeyframes(v) {
  return Array.isArray(v) && v.length > 0 && v.every((e) => Array.isArray(e) && e.length >= 2 && Number.isFinite(Number(e[0])));
}
function clone(o) {
  return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}
function normWord(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, '');
}
function plainText(s) {
  return String(s ?? '').replace(/\*/g, '');
}
function wordsOf(s) {
  return plainText(s).split(/\s+/).filter(Boolean);
}

export function isColor(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (['accent', 'accent2', 'text', 'bg', 'bg2', 'transparent'].includes(s)) return true;
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return true;
  const m = /^(rgba?|hsla?)\(([^()]*)\)$/i.exec(s);
  if (!m) return false;
  const parts = m[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return false;
  return parts.every((p) => /^-?\d*\.?\d+(%|deg)?$/.test(p));
}
function fixColor(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (isColor(s)) return s;
  const low = s.toLowerCase();
  if (NAMED[low]) return NAMED[low];
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s; // "#" unutulmuş
  if (low === 'primary') return 'accent';
  if (low === 'secondary') return 'accent2';
  return undefined;
}

// ---------------------------------------------------------------- boyut tahmini
// Gerçek yazı tiplerinden ölçülmüş karakter genişlikleri (100px'te, piksel):
// n9 = Nunito 900 (başlık/yazı), n7 = Nunito 700 (etiket), b7 = Barlow Condensed 700 (rakam).
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÇĞİÖŞÜabcdefghijklmnopqrstuvwxyzçğıöşü0123456789 .,:;!?'’\"-–%/()…+×";
const WIDTHS = {
  n9: [76,70,69,79,61,58,75,79,31,39,71,58,88,76,81,68,81,71,65,64,75,74,113,70,64,62,69,75,31,81,65,75,57,62,48,62,55,40,63,61,28,29,58,35,90,61,60,62,62,43,50,43,60,54,87,57,54,49,48,63,28,60,50,60,60,60,60,60,60,60,60,60,60,60,29,27,27,27,27,27,48,27,27,51,44,50,96,35,41,41,82,60,60],
  n7: [74,69,68,76,60,56,74,77,28,35,66,56,87,75,78,65,78,69,63,62,74,71,111,67,62,60,68,74,28,78,63,74,55,60,47,60,54,36,60,58,25,26,54,32,88,58,58,60,60,39,49,38,58,53,85,55,53,47,47,60,25,58,49,58,60,60,60,60,60,60,60,60,60,60,27,25,25,25,25,25,46,24,25,45,43,50,94,31,36,36,74,60,60],
  b7: [48,47,46,48,44,42,47,48,23,45,49,43,55,51,47,46,46,47,44,47,48,49,69,47,47,41,46,47,23,47,44,48,45,44,43,44,44,30,44,45,22,22,45,21,67,45,44,45,45,32,41,29,45,44,61,44,42,37,43,44,19,44,41,45,45,28,44,44,48,44,44,41,44,43,20,22,21,27,23,28,44,17,19,35,33,38,77,41,31,31,71,44,40],
};
const GLYPH_MAP = {};
Object.keys(WIDTHS).forEach((k) => {
  const m = new Map();
  [...GLYPHS].forEach((ch, i) => m.set(ch, WIDTHS[k][i] / 100));
  GLYPH_MAP[k] = m;
});
// metin genişliği (em cinsinden); bilinmeyen karakter ≈ 0.62 em
function emWidth(str, font = 'n9', spacing = 0) {
  const m = GLYPH_MAP[font] || GLYPH_MAP.n9;
  let w = 0;
  for (const ch of str) w += (m.get(ch) ?? 0.62) + spacing;
  return w;
}
function fontOf(el) {
  if (el.font === 'number') return 'b7';
  return num(el.weight, 900) <= 700 ? 'n7' : 'n9';
}
function shownText(el) {
  const t = plainText(el.text);
  return el.upper ? t.toLocaleUpperCase('tr-TR') : t;
}

// Metni maxWidth'e göre satırlara böler (motorun wrapSpans'i gibi, tahmini).
// font: 'n9' | 'n7' | 'b7' ya da sabit karakter genişliği katsayısı (sayı). {lines, width, longest}
export function wrapEstimate(text, size, maxWidth, font = 'n9') {
  const wOf = (s) => (typeof font === 'number' ? s.length * font : emWidth(s, font)) * size * 1.02;
  const paras = plainText(text).split(/\n/);
  const space = wOf(' ');
  let lines = 0, width = 0, longest = 0;
  paras.forEach((para) => {
    const ws = para.split(/\s+/).filter(Boolean);
    if (!ws.length) { lines++; return; }
    let cur = 0;
    ws.forEach((w) => {
      const ww = wOf(w);
      longest = Math.max(longest, ww);
      if (cur > 0 && cur + space + ww > maxWidth) {
        width = Math.max(width, cur);
        lines++;
        cur = ww;
      } else cur = cur ? cur + space + ww : ww;
    });
    width = Math.max(width, cur);
    lines++;
  });
  return { lines: Math.max(1, lines), width: Math.min(width, Math.max(maxWidth, longest)), longest };
}

function groupedLen(v, decimals) {
  const n = Math.floor(Math.abs(v));
  const digits = String(n).length;
  return digits + Math.floor((digits - 1) / 3) + (decimals > 0 ? decimals + 1 : 0) + (v < 0 ? 1 : 0);
}

function pillW(text, size, icon) {
  const hasIcon = icon && icon !== 'none';
  return emWidth(plainText(text), 'n7', 0.02) * size * 1.02 + size * 1.44 + (hasIcon ? size * 1.21 : 0);
}

function rawExtents(el, opts) {
  const S = Math.abs(num(el.scale, 1)) || 1;
  const box = (hw, hh) => ({ l: hw, r: hw, t: hh, b: hh });
  let e;
  switch (el.type) {
    case 'text': {
      const size = num(el.size, 80);
      const mw = num(el.maxWidth, 940);
      const wr = wrapEstimate(shownText(el), size, mw, fontOf(el));
      let w = wr.width, h = wr.lines * size * num(el.lineHeight, 1.12);
      if (el.box) {
        const pad = num(el.box.pad, size * 0.4);
        w += pad * 2;
        h += pad * 1.2;
      }
      e = box(w / 2, h / 2);
      break;
    }
    case 'counter': {
      const size = num(el.size, 80);
      const dec = num(el.decimals, 0);
      const em = emWidth(String(el.prefix || '') + String(el.suffix || ''), 'b7')
        + Math.max(groupedLen(num(el.from, 0), dec), groupedLen(num(el.to, 100), dec)) * 0.45;
      e = box((em * size * 1.02) / 2, (size * 1.12) / 2);
      break;
    }
    case 'label': {
      const size = num(el.size, 30);
      e = box(pillW(el.text, size, el.icon) / 2, (size * 1.62) / 2);
      break;
    }
    case 'readout': {
      const size = num(el.size, 72);
      const dec = num(el.decimals, 0);
      const ls = num(el.labelSize, Math.max(18, size * 0.3));
      const valW = Math.max(groupedLen(num(el.from, 0), dec), groupedLen(num(el.to, 100), dec)) * size * 0.46
        + (String(el.prefix || '').length + String(el.suffix || '').length) * size * 0.34;
      const labW = plainText(el.label).length * ls * 0.78;
      const row = el.layout === 'row' || (el.layout !== 'stack' && el.w);
      const w = Math.max(num(el.w, 0), row ? labW + valW + 40 : Math.max(labW, valW));
      e = row ? { l: w / 2, r: w / 2, t: size * 0.6, b: size * 0.55 + 6 } : { l: w / 2, r: w / 2, t: size * 0.62 + (el.label ? ls * 0.6 : 0), b: size * 0.66 + 6 };
      break;
    }
    case 'art': e = box(num(el.w, 600) / 2, num(el.h, 600) / 2); break;
    case 'panel': e = box(num(el.w, 820) / 2, num(el.h, 860) / 2); break;
    case 'equalizer': e = box(num(el.w, 520) / 2, num(el.h, 220) / 2); break;
    case 'spacegrid': {
      // perspektif: (x,y) huninin ağzıdır; düzlemin arka kenarı yakın, ön kenarı uzaktadır
      const w = num(el.w, 900), h = num(el.h, 420);
      const ph = (clamp(num(el.pitch, 28), 8, 80) * Math.PI) / 180, D = 3.2, cp = Math.cos(ph);
      e = { l: w / 2, r: w / 2, t: (h * (D - cp)) / (2 * D) + 6, b: (h * (D + cp)) / (2 * D) + 6 };
      break;
    }
    case 'gear': {
      const r = num(el.r, 120);
      const d = num(el.depth, Math.max(8, r * 0.14));
      e = box(r + d, r + d);
      break;
    }
    case 'orb': {
      const r = num(el.r, 140);
      e = { l: el.rings ? r * 1.9 : r, r: el.rings ? r * 1.9 : r, t: r, b: r };
      break;
    }
    case 'accretion': {
      const r = num(el.r, 130);
      const tilt = Math.max(0.68, clamp(num(el.tilt, 0.82), 0, 1)); // motor da 0.68'in altına inmez
      const ky = 1 - 0.87 * tilt;
      const outer = r * num(el.outer, 2.9);
      const v = Math.max(r * 1.45, outer * ky + r * 0.3);
      e = { l: outer, r: outer, t: v, b: v };
      break;
    }
    case 'clock': {
      const r = num(el.r, 110);
      e = { l: r + 12, r: r + 12, t: r + 12 + (el.title ? 54 : 0), b: r + 12 + (el.label ? 74 : 0) };
      break;
    }
    case 'spectrum': {
      const w = num(el.w, 760), h = num(el.h, 30);
      e = { l: w / 2, r: w / 2, t: h / 2 + (el.markerLabel || el.showValue ? 74 : 12), b: h / 2 + (el.leftLabel || el.rightLabel ? 56 : 12) };
      break;
    }
    case 'sine': {
      const w = num(el.w, 760), amp = num(el.amp, 60), lw = num(el.lineWidth, 5);
      e = { l: w / 2, r: w / 2, t: amp + lw + 8, b: amp + lw + (el.label ? 60 : 8) };
      break;
    }
    case 'bracket': {
      const w = num(el.w, 300), h = num(el.h, 300);
      e = { l: w / 2, r: w / 2, t: h / 2 + (el.label ? 34 : 0), b: h / 2 };
      break;
    }
    case 'badge': {
      const size = num(el.size, 30);
      const items = (Array.isArray(el.items) ? el.items : el.text ? [el.text] : []).map((it) => (it && typeof it === 'object' ? it : { text: it }));
      const ws = items.map((it) => pillW(it.text, size, it.icon || el.icon));
      const ph = size * 1.62;
      if (el.direction === 'column') {
        const h = items.length * ph + Math.max(0, items.length - 1) * size * 1.6;
        e = box(Math.max(0, ...ws) / 2, h / 2);
      } else {
        const total = ws.reduce((a, b) => a + b, 0) + Math.max(0, items.length - 1) * size * 2.4;
        e = box(Math.min(num(el.maxWidth, 960), total) / 2, ph / 2);
      }
      break;
    }
    case 'chips': {
      const n = Array.isArray(el.items) ? el.items.length : 0;
      const size = num(el.size, 56), cols = Math.max(1, num(el.cols, 6)), gap = num(el.gap, 26);
      const c = Math.min(cols, Math.max(1, n)), rows = Math.ceil(Math.max(1, n) / cols);
      const cw = size * 1.6;
      e = box(Math.min(num(el.maxWidth, 960), c * cw + (c - 1) * gap) / 2, (rows * size * 1.5 + (rows - 1) * gap) / 2);
      break;
    }
    case 'meter': {
      let w = num(el.w, 46), h = num(el.h, 760);
      const marks = Array.isArray(el.marks) && el.marks.length;
      if (el.horizontal === true) e = { l: h / 2 + 10, r: h / 2 + 10, t: w / 2 + 10, b: w / 2 + (marks ? 70 : 10) };
      else e = { l: w / 2 + (marks ? 260 : 10), r: w / 2 + 10, t: h / 2 + 10, b: h / 2 + 10 }; // dikeyde işaret yazıları SOLDA
      break;
    }
    case 'waves': {
      const len = num(el.length, 420);
      if (el.ring === true || el.full === true) { e = box(len, len); break; }
      let ang = (num(el.angle, 0) * Math.PI) / 180;
      if (Number.isFinite(el.tx) && Number.isFinite(el.ty)) ang = Math.atan2(el.ty - num(el.y, 960), el.tx - num(el.x, 540));
      const sp = (num(el.spread, 70) * Math.PI) / 360;
      const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len, side = Math.sin(sp) * len;
      e = { l: Math.max(0, -ex) + side * Math.abs(Math.sin(ang)), r: Math.max(0, ex) + side * Math.abs(Math.sin(ang)), t: Math.max(0, -ey) + side * Math.abs(Math.cos(ang)), b: Math.max(0, ey) + side * Math.abs(Math.cos(ang)) };
      break;
    }
    case 'shape': {
      const kind = el.shape;
      const lw = num(el.lineWidth, 6) / 2;
      if (kind === 'line' || kind === 'arrow') {
        const x = num(el.x, 540), y = num(el.y, 960), x2 = num(el.x2, x + 300), y2 = num(el.y2, y);
        return { l: Math.max(0, x - x2) + lw, r: Math.max(0, x2 - x) + lw, t: Math.max(0, y - y2) + lw, b: Math.max(0, y2 - y) + lw };
      }
      if (kind === 'rect') e = box(num(el.w, 200) / 2 + lw, num(el.h, 200) / 2 + lw);
      else e = box(num(el.r, 100) + lw, num(el.r, 100) + lw);
      break;
    }
    case 'starburst': e = box(num(el.r, 380), num(el.r, 380)); break;
    case 'silhouette': {
      const defs = { skyline: [1080, 520], bridge: [1080, 240], mosque: [760, 520], tower: [360, 700], mountains: [1080, 480] };
      const d = defs[el.kind] || defs.skyline;
      e = box(num(el.w, d[0]) / 2, num(el.h, d[1]) / 2);
      break;
    }
    case 'rays': {
      const len = num(el.length, 1200);
      e = box(len, len);
      break;
    }
    case 'particles': e = box(num(el.w, opts.W) / 2, num(el.h, opts.H) / 2); break;
    default: e = box(0, 0);
  }
  // döngü hareketleri kutuyu biraz büyütür
  let k = S;
  if (el.loop === 'pulse') k *= 1.05;
  const out = { l: e.l * k, r: e.r * k, t: e.t * k, b: e.b * k };
  if (el.loop === 'float') { out.t += 14; out.b += 14; }
  return out;
}

// Mutlak kutu {x0, y0, x1, y1}. core:true → görselin şeffaf kenarı düşülmüş "dolu" kutusu.
export function estimateBox(el, opts = {}, core = false) {
  const o = { W: 1080, H: 1920, ...opts };
  const e = rawExtents(el, o);
  let x = num(el.x, o.W / 2), y = num(el.y, o.H / 2);
  if (el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow')) { x = num(el.x, o.W / 2); y = num(el.y, o.H / 2); }
  const b = { x0: x - e.l, y0: y - e.t, x1: x + e.r, y1: y + e.b };
  if (core && el.type === 'art') {
    const ix = (b.x1 - b.x0) * 0.08, iy = (b.y1 - b.y0) * 0.08;
    b.x0 += ix; b.x1 -= ix; b.y0 += iy; b.y1 -= iy;
  }
  return b;
}

const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
function interArea(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}
const pad = (b, p) => ({ x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p, y1: b.y1 + p });

// ---------------------------------------------------------------- öğe değiştirme
function resizeEl(el, k) {
  const mul = (key, d) => { el[key] = r1(num(el[key], d) * k); };
  switch (el.type) {
    case 'art': mul('w', 600); mul('h', 600); break;
    case 'panel': mul('w', 820); mul('h', 860); break;
    case 'equalizer': mul('w', 520); mul('h', 220); break;
    case 'spacegrid': mul('w', 900); mul('h', 420); break;
    case 'bracket': mul('w', 300); mul('h', 300); break;
    case 'silhouette': if (el.w !== undefined) mul('w', 1080); if (el.h !== undefined) mul('h', 520); break;
    case 'gear': mul('r', 120); if (el.depth !== undefined) mul('depth', 17); break;
    case 'orb': mul('r', 140); break;
    case 'accretion': mul('r', 130); break;
    case 'clock': mul('r', 110); break;
    case 'starburst': mul('r', 380); break;
    case 'meter': mul('h', 760); mul('w', 46); break;
    case 'spectrum': mul('w', 760); mul('h', 30); break;
    case 'sine': mul('w', 760); mul('amp', 60); break;
    case 'waves': mul('length', 420); break;
    case 'rays': mul('length', 1200); break;
    case 'text': mul('size', 80); break;
    case 'counter': mul('size', 80); break;
    case 'label': mul('size', 30); break;
    case 'readout': mul('size', 72); break;
    case 'badge': mul('size', 30); el.maxWidth = r1(num(el.maxWidth, 960) * k); break;
    case 'chips': mul('size', 56); el.maxWidth = r1(num(el.maxWidth, 960) * k); break;
    case 'shape':
      if (el.shape === 'line' || el.shape === 'arrow') break;
      if (el.shape === 'rect') { mul('w', 200); mul('h', 200); } else mul('r', 100);
      break;
    default: el.scale = r2(num(el.scale, 1) * k);
  }
}

// ---------------------------------------------------------------- zamanlama
function estimateWordsFromSegments(segments) {
  const out = [];
  segments.forEach((s) => {
    const ws = String(s.text || '').split(/\s+/).filter(Boolean);
    const tot = ws.reduce((a, w) => a + w.length + 2, 0) || 1;
    const dur = Math.max(0.1, num(s.end, 0) - num(s.start, 0));
    let t = num(s.start, 0);
    ws.forEach((w) => {
      const d = ((w.length + 2) / tot) * dur;
      out.push({ text: w, start: t, end: t + d });
      t += d;
    });
  });
  return out;
}

// Motorun resolveTimeline mantığının kopyası: her sahne için {start, end, words}.
function sceneTiming(scenes, opts) {
  const segments = Array.isArray(opts.segments) ? opts.segments : [];
  let words = Array.isArray(opts.words) && opts.words.length ? opts.words : null;
  if (!words && segments.length) words = estimateWordsFromSegments(segments);
  if (!segments.length && !words) return scenes.map(() => ({ start: 0, end: Infinity, words: null, known: false }));
  const duration = num(opts.duration, words?.length ? words[words.length - 1].end + 0.6 : Infinity);
  const list = scenes.map((sc, i) => {
    const seg = segments[clamp(Math.round(num(sc.from, 0)), 0, Math.max(0, segments.length - 1))];
    let start = i === 0 ? 0 : seg ? num(seg.start, 0) : 0;
    if (Number.isFinite(sc.start)) start = sc.start;
    return { i, start };
  });
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const res = [];
  sorted.forEach((s, k) => {
    let end = k + 1 < sorted.length ? sorted[k + 1].start : duration;
    if (end <= s.start) end = s.start + 0.5;
    const ws = words ? words.filter((w) => w.start >= s.start - 0.05 && w.start < end) : null;
    res[s.i] = { start: s.start, end, words: ws, known: true };
  });
  return res;
}

// Öğenin sahne başına göre başlangıcı; cue çözülemezse null.
function cueStart(el, timing) {
  if (!el.cue || !timing.words?.length) return null;
  const target = normWord(el.cue);
  if (!target) return null;
  const ws = timing.words;
  const hit = ws.find((w) => normWord(w.text) === target) || ws.find((w) => normWord(w.text).startsWith(target)) || ws.find((w) => normWord(w.text).includes(target));
  return hit ? Math.max(0, hit.start - timing.start + num(el.offset, 0)) : null;
}

// ---------------------------------------------------------------- 1) temizlik
function sanitizeElement(raw, tag, notes, extraTypes) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    notes.push(`${tag}: geçersiz öğe atıldı`);
    return null;
  }
  const el = clone(raw);
  let type = typeof el.type === 'string' ? el.type.trim() : '';
  const low = type.toLowerCase();
  if (!KNOWN_TYPES.includes(type) && !extraTypes.has(type)) {
    const known = KNOWN_TYPES.find((t) => t.toLowerCase() === low);
    if (known) type = known;
    else if (ALIASES[low]) {
      const to = ALIASES[low];
      if (to === 'shape' && !el.shape) el.shape = low === 'rectangle' ? 'rect' : low;
      if (to === 'art' && !el.art) el.art = el.prompt || el.description || el.alt || el.text;
      if (to === 'text' && el.text === undefined) el.text = el.content ?? el.value ?? el.label;
      if (to === 'silhouette' && !el.kind) el.kind = 'skyline';
      notes.push(`${tag}: tür "${type}" → "${to}"`);
      type = to;
    } else {
      notes.push(`${tag}: bilinmeyen tür "${type || '?'}" atıldı`);
      return null;
    }
  }
  el.type = type;
  // fizik öğelerinin alanları (anahtar dizileri, sayısal "glow" vb.) çizicinin kendi sözleşmesidir
  if (PHYSICS_TYPES.includes(type)) {
    if (el.in !== undefined && !IN_ANIMS.has(el.in)) el.in = 'fade';
    if (el.loop !== undefined && el.loop !== null && !LOOPS.has(el.loop)) delete el.loop;
    if (el.cue !== undefined && typeof el.cue !== 'string') delete el.cue;
    return el;
  }

  // sayılar
  NUMERIC.forEach((k) => {
    if (!(k in el)) return;
    const v = el[k];
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (isKeyframes(v)) return; // [[t, v], ...] anahtar dizisi (motor kv ile çözer)
    if (typeof v === 'string') {
      const m = /^\s*(-?\d*\.?\d+)\s*(px|s|sn|deg|°)?\s*$/i.exec(v);
      if (m) { el[k] = Number(m[1]); return; }
      const pm = /^\s*(-?\d*\.?\d+)\s*%\s*$/.exec(v);
      if (pm && (k === 'opacity' || k === 'value' || k === 'tilt' || k === 'warp')) { el[k] = Number(pm[1]) / 100; return; }
    }
    // panel.bars (sinyal simgesi) ve badge.active de true/false olabilir
    if (typeof v === 'boolean' && (k === 'active' || (k === 'bars' && type === 'panel'))) return;
    delete el[k];
    notes.push(`${tag}: "${k}" sayı değil, silindi`);
  });
  if ('at' in el && el.at < 0) el.at = 0;
  // küçük öğeler küçük kalsın (hap etiket / rozet dev olmasın)
  if (type === 'label' && 'size' in el) el.size = clamp(el.size, 18, 48);
  if (type === 'badge' && 'size' in el) el.size = clamp(el.size, 18, 44);
  if ('opacity' in el) el.opacity = clamp(el.opacity, 0, 1);
  if ('scale' in el && (el.scale <= 0 || el.scale > 4)) { el.scale = clamp(el.scale || 1, 0.2, 4); }
  if (type === 'shape' && !SHAPE_KINDS.includes(el.shape)) {
    const s = String(el.shape || '').toLowerCase();
    el.shape = s === 'rectangle' || s === 'square' || s === 'box' ? 'rect' : s === 'oval' || s === 'dot' ? 'circle' : 'circle';
  }
  if (Array.isArray(el.dash)) {
    el.dash = el.dash.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
    if (!el.dash.length) delete el.dash;
  } else if ('dash' in el) delete el.dash;

  // renkler
  const fixKey = (obj, k, where) => {
    if (!(k in obj)) return;
    const v = obj[k];
    if (isKeyframes(v)) {
      v.forEach((e) => { const c = fixColor(e[1]); if (c !== undefined) e[1] = c; });
      return;
    }
    if (typeof v === 'boolean' && BOOL_COLOR.has(k)) return;
    if (v === null || v === 'none' || v === '') { delete obj[k]; return; }
    const c = fixColor(v);
    if (c === undefined) {
      delete obj[k];
      notes.push(`${tag}: geçersiz renk ${where}${k}=${JSON.stringify(v)} silindi`);
    } else obj[k] = c;
  };
  COLOR_KEYS.forEach((k) => fixKey(el, k, ''));
  if (el.box && typeof el.box === 'object') {
    fixKey(el.box, 'fill', 'box.');
    fixKey(el.box, 'stroke', 'box.');
    ['pad', 'radius', 'lineWidth'].forEach((k) => { if (k in el.box && !Number.isFinite(Number(el.box[k]))) delete el.box[k]; else if (k in el.box) el.box[k] = Number(el.box[k]); });
  } else if ('box' in el && el.box !== true) delete el.box;
  if (Array.isArray(el.stops)) {
    el.stops = el.stops.map(fixColor).filter(Boolean);
    if (el.stops.length < 2) delete el.stops;
  }
  if (Array.isArray(el.items)) {
    el.items = el.items.filter((it) => it !== null && it !== undefined && it !== '').map((it) => {
      if (it && typeof it === 'object') {
        const o = { ...it };
        if (o.text !== undefined) o.text = String(o.text);
        if ('color' in o) { const c = fixColor(o.color); if (c) o.color = c; else delete o.color; }
        return o;
      }
      return String(it);
    });
  }

  // animasyon adları
  if (el.in !== undefined && !IN_ANIMS.has(el.in)) { notes.push(`${tag}: bilinmeyen giriş "${el.in}" → fade`); el.in = 'fade'; }
  if (el.loop !== undefined && el.loop !== null && !LOOPS.has(el.loop)) { delete el.loop; }
  if (el.cue !== undefined && typeof el.cue !== 'string') el.cue = el.cue === null ? undefined : String(el.cue);
  if (el.cue === undefined) delete el.cue;

  // içerik
  if (type === 'text' || type === 'label') {
    if (typeof el.text === 'number') el.text = String(el.text);
    if (typeof el.text !== 'string' || !el.text.trim()) {
      notes.push(`${tag}: boş yazı atıldı`);
      return null;
    }
  }
  if (type === 'badge' && (!Array.isArray(el.items) || !el.items.length) && !el.text) {
    notes.push(`${tag}: boş badge atıldı`);
    return null;
  }
  if (type === 'art' && typeof el.art !== 'string') {
    if (typeof el.prompt === 'string') el.art = el.prompt;
  }

  // yıl sayacı: "1.929" gibi binlik ayraçlı yazılmasın → düz yazı
  if (type === 'counter') {
    const to = num(el.to, NaN), from = num(el.from, 0);
    const affix = String(el.prefix || '') + String(el.suffix || '');
    if (Number.isInteger(to) && to >= 1000 && to <= 2100 && num(el.decimals, 0) === 0 && !/\d/.test(affix)
        && (from === 0 || (from >= 1000 && from <= 2100))) {
      const t = { ...el, type: 'text', text: `${el.prefix || ''}${to}${el.suffix || ''}`, font: 'number', weight: 700 };
      ['from', 'to', 'duration', 'decimals', 'prefix', 'suffix'].forEach((k) => delete t[k]);
      if (t.size === undefined) t.size = 80;
      if (t.glow === undefined) t.glow = true;
      notes.push(`${tag}: yıl sayacı (${to}) düz yazıya çevrildi (binlik ayracı olmasın)`);
      return t;
    }
  }
  return el;
}

// ---------------------------------------------------------------- ana fonksiyon
export function lintPlan(plan, opts = {}) {
  const o = { W: 1080, H: 1920, ...opts };
  const notes = [];
  const out = plan && typeof plan === 'object' ? clone(plan) : {};
  if (!Array.isArray(out.scenes)) {
    out.scenes = [];
    notes.push('plan.scenes yoktu');
  }
  out.scenes = out.scenes.filter((s) => s && typeof s === 'object' && !Array.isArray(s));
  if (out.theme && typeof out.theme === 'object') {
    Object.keys(out.theme).forEach((k) => {
      const c = fixColor(out.theme[k]);
      if (!c || ['accent', 'accent2', 'text', 'bg', 'bg2'].includes(c)) { delete out.theme[k]; notes.push(`theme.${k} geçersiz, silindi`); } else out.theme[k] = c;
    });
  }
  const timing = sceneTiming(out.scenes, o);
  // kapak sahnesi: zamanı 0 olan (genelde ilk) sahne
  let coverIdx = 0;
  timing.forEach((tm, i) => { if (tm.start < timing[coverIdx].start) coverIdx = i; });
  out.scenes = out.scenes.map((sc, i) => lintScene(sc, { ...o, index: i, timing: timing[i], cover: i === coverIdx }, notes));
  // plan.stage: kalıcı düzenek öğeleri (mutlak zaman, sahnelerin kamerasıyla çizilir)
  if (out.stage !== undefined) {
    if (!Array.isArray(out.stage)) { delete out.stage; notes.push('plan.stage dizi değil, silindi'); }
    else {
      out.stage = out.stage.filter((e) => e && typeof e === 'object' && (KNOWN_TYPES.includes(e.type) || (o.types || []).includes(e.type)));
      // altyazı bandına inen sahne öğesi uyarısı (her kamera anahtarında dünya y → ekran y)
      const limit = num(o.stageMaxY, 1290);
      out.stage.forEach((el) => {
        if (el.fixed || !Number.isFinite(Number(el.y)) || RIG_TYPES.has(el.type)) return;
        out.scenes.forEach((sc, i) => {
          const c = sc.camera;
          if (!c || !c.from) return;
          [c.from, c.to || c.from].forEach((k) => {
            const sy = o.H / 2 + (Number(el.y) - num(k.cy, o.H / 2)) * num(k.zoom, 1);
            if (sy > limit) notes.push(`stage ${el.type}: sahne ${i + 1} kamerasında ekran y≈${Math.round(sy)} > ${limit} (altyazı bandı)`);
          });
        });
      });
      // düzenek: ekran şeridinin alt kenarı (grafik dahil) altyazıya inmesin
      const det = out.stage.find((e) => e.type === 'detector');
      if (det) {
        const sY = num(det.geom?.screenY, 1040), dh = num(det.h, 84);
        const gTop = sY - dh / 2 - 50; // okumalar dahil
        const gy = sY + dh / 2 + (det.graph === false ? 0 : num(det.graph?.gap, 16) + num(det.graph?.h, 130));
        const capY = num(o.captionY, o.H * 0.72);
        out.scenes.forEach((sc, i) => {
          const c = sc.camera;
          if (!c || !c.from) return;
          [c.from, c.to || c.from].forEach((k) => {
            const sy = o.H / 2 + (gy - num(k.cy, o.H / 2)) * num(k.zoom, 1);
            const st = o.H / 2 + (gTop - num(k.cy, o.H / 2)) * num(k.zoom, 1);
            // şerit+grafik altyazı bandıyla kesişiyorsa uyar (tamamen ekran dışındaysa değil)
            if (sy > limit && st < capY + 128) notes.push(`detector (şerit+grafik ${Math.round(st)}–${Math.round(sy)}): sahne ${i + 1} kamerasında altyazı bandına iniyor (> ${limit})`);
          });
        });
      }
    }
  }
  return { plan: out, notes };
}

// Tek sahneyi düzeltir (sahne yeniden tasarlanınca da kullanılabilir).
export function lintScene(scene, opts = {}, notes = []) {
  // fixed:true öğeler kameradan bağımsız (ekran koordinatı): kamerası olan sahnede
  // ayrı, kamerasız bir geçişte düzeltilir; sıra korunur.
  const raw = Array.isArray(scene?.elements) ? scene.elements : null;
  if (raw && scene.camera && raw.some((e) => e && e.fixed)) {
    const fixedIdx = raw.map((e, i) => (e && e.fixed ? i : -1)).filter((i) => i >= 0);
    const worldEls = raw.filter((e) => !(e && e.fixed));
    const world = lintSceneCore({ ...scene, elements: worldEls }, worldEls.length ? opts : { ...opts, cover: false }, notes);
    const scr = lintSceneCore({ ...scene, camera: undefined, elements: fixedIdx.map((i) => raw[i]) }, { ...opts, cover: false }, notes);
    world.elements = [...world.elements, ...scr.elements.map((e) => ({ ...e, fixed: true }))];
    return world;
  }
  return lintSceneCore(scene, opts, notes);
}

function lintSceneCore(scene, opts = {}, notes = []) {
  const o = { W: 1080, H: 1920, ...opts };
  const W = o.W, H = o.H;
  const idx = o.index ?? 0;
  // ekran koordinatlarında güvenli alan ve altyazı bandı (kamera hesaba katılmadan)
  const S0 = {
    x0: 70 * (W / 1080), x1: W - 70 * (W / 1080),
    y0: 150 * (H / 1920), y1: H - 200 * (H / 1920),
  };
  const capY = num(o.captionY, H * 0.72);
  const band0 = o.captions === false ? null : { y0: capY - 92 * (H / 1920), y1: capY + 128 * (H / 1920) };
  let S = S0, band = band0;
  const timing = o.timing || { start: 0, end: Infinity, words: null, known: false };
  const sceneLen = Number.isFinite(timing.end) ? timing.end - timing.start : Infinity;
  const extraTypes = new Set(o.types || []);
  const sc = clone(scene) || {};
  const pfx = `Sahne ${idx + 1}`;
  const note = (s) => notes.push(`${pfx}: ${s}`);

  // sahne alanları
  if (sc.transition !== undefined && !TRANSITIONS.has(sc.transition)) { note(`geçiş "${sc.transition}" → zoom`); sc.transition = 'zoom'; }
  if (sc.camera && typeof sc.camera === 'object') {
    if (Array.isArray(sc.camera.zoom)) {
      const z = sc.camera.zoom.map((v) => clamp(num(v, 1), 0.85, 1.3));
      sc.camera.zoom = [z[0] ?? 1, z[1] ?? z[0] ?? 1.05];
    } else if (sc.camera.zoom !== undefined) {
      const z = num(sc.camera.zoom, NaN);
      sc.camera.zoom = Number.isFinite(z) ? [1, clamp(z, 0.85, 1.3)] : [1, 1.05];
    }
    ['panX', 'panY'].forEach((k) => { if (k in sc.camera) { const v = num(sc.camera[k], 0); sc.camera[k] = clamp(v, -300, 300); } });
  } else if (sc.camera !== undefined) delete sc.camera;
  // Kamera yakınlaşması/kaydırması öğeleri ekranda büyütüp kaydırır. Ekran alanlarını
  // dünya koordinatına çevir: güvenli alan tüm kamera durumlarının kesişimi, bant birleşimi.
  {
    const cam = sc.camera || {};
    const states = [];
    if (cam.from && typeof cam.from === 'object') {
      // anahtar kareli kamera: dünya noktası (cx,cy) ekran merkezine gelir
      [cam.from, cam.to && typeof cam.to === 'object' ? cam.to : cam.from].forEach((c) => {
        states.push({ z: Math.max(0.5, num(c.zoom, 1)), dx: W / 2 - num(c.cx, W / 2), dy: H / 2 - num(c.cy, H / 2) });
      });
    } else {
      const zs = Array.isArray(cam.zoom) ? cam.zoom.map((v) => num(v, 1)) : [1, 1.05];
      const px = num(cam.panX, 0), py = num(cam.panY, 0);
      zs.forEach((z) => [0, 1].forEach((k) => states.push({ z: Math.max(0.5, z), dx: px * k, dy: py * k })));
    }
    const toWX = (x, st) => W / 2 + (x - W / 2) / st.z - st.dx;
    const toWY = (y, st) => H / 2 + (y - H / 2) / st.z - st.dy;
    S = {
      x0: Math.max(...states.map((st) => toWX(S0.x0, st))), x1: Math.min(...states.map((st) => toWX(S0.x1, st))),
      y0: Math.max(...states.map((st) => toWY(S0.y0, st))), y1: Math.min(...states.map((st) => toWY(S0.y1, st))),
    };
    if (S.x1 - S.x0 < 400 || S.y1 - S.y0 < 800) S = S0; // aşırı kamera değeri: ekran alanına dön
    if (band0) band = { y0: Math.min(...states.map((st) => toWY(band0.y0, st))), y1: Math.max(...states.map((st) => toWY(band0.y1, st))) };
  }

  const els = [];
  (Array.isArray(sc.elements) ? sc.elements : []).forEach((raw, i) => {
    const el = sanitizeElement(raw, `${pfx}: #${i} ${raw?.type ?? '?'}`, notes, extraTypes);
    if (el) els.push(el);
  });
  if (!Array.isArray(sc.elements)) note('elements dizisi yoktu');

  // konumları kesinleştir (motorun varsayılanı merkez)
  els.forEach((el) => {
    if (el.type === 'flash' || el.type === 'shake') return;
    if (el.x === undefined) el.x = W / 2;
    if (el.y === undefined) el.y = H / 2;
    if (el.type === 'text' && el.maxWidth !== undefined && el.maxWidth > S.x1 - S.x0) el.maxWidth = r1(S.x1 - S.x0);
  });

  const tagOf = (el) => `#${els.indexOf(el)} ${el.type}${el.text ? ` "${plainText(el.text).slice(0, 24)}"` : ''}`;

  // -------------------------------------------------- zaman aralıkları
  let cueRank = 0;
  const info = new Map();
  els.forEach((el) => {
    let start = cueStart(el, timing);
    let estimated = false;
    if (start === null) {
      if (el.cue && !timing.words) { start = num(el.at, 0) + 0.8 * ++cueRank + num(el.offset, 0); estimated = true; } else start = num(el.at, 0);
    }
    info.set(el, { start, estimated });
  });
  const startOf = (el) => info.get(el).start;
  const endOf = (el) => (Number.isFinite(Number(el.until)) ? Number(el.until) + 0.3 : Infinity);
  const coexist = (a, b) => startOf(a) < endOf(b) - 0.02 && startOf(b) < endOf(a) - 0.02;
  els.forEach((el) => {
    if (el.until !== undefined && el.until < startOf(el) + 0.5) {
      note(`${tagOf(el)}: until (${el.until}) başlangıçtan önce, silindi`);
      delete el.until;
    }
  });
  // Sahne boş kalmasın: bütün ana görseller sahne bitmeden "until" ile kayboluyorsa
  // en geç gideni sahne sonuna kadar tutulur (kaybolma anlatılıyorsa yarı saydam kalır).
  if (Number.isFinite(sceneLen)) {
    const focal = els.filter((el) => OBSTACLE.has(el.type) || el.type === 'silhouette');
    const gone = (el) => Number.isFinite(Number(el.until)) && !Number.isFinite(Number(el.outTo)) && Number(el.until) + 0.3 < sceneLen - 0.8;
    if (focal.length && focal.every(gone)) {
      const last = focal.reduce((a, b) => (Number(b.until) > Number(a.until) ? b : a));
      note(`${tagOf(last)}: sahne ${(sceneLen - Number(last.until)).toFixed(1)} sn boş kalıyordu; görsel kaybolmak yerine silikleşiyor (outTo 0.3)`);
      last.outTo = 0.3;
    }
  }

  // -------------------------------------------------- 2) yazı disiplini
  const textMaxW = S.x1 - S.x0;
  const fitText = (el, maxLines, minSize = 34) => {
    if (el.type !== 'text') return;
    const mw0 = Math.min(num(el.maxWidth, 940), textMaxW);
    if (num(el.maxWidth, 940) > mw0 + 0.5) el.maxWidth = Math.floor(mw0);
    // kutulu yazıda kutu, yazı genişliğine eklenir: kutu da güvenli alana sığsın
    const mwOf = (sz) => (el.box ? Math.min(mw0, textMaxW - 2 * num(el.box.pad, sz * 0.4)) : mw0);
    let size = Math.round(num(el.size, 80));
    const orig = num(el.size, 80);
    const cw = fontOf(el);
    // tam sayı boyut ve tam sayı genişlikle sına: ikinci geçişte aynı sonuç çıksın
    for (let k = 0; k < 60; k++) {
      const mw = Math.floor(mwOf(size));
      const wr = wrapEstimate(shownText(el), size, mw, cw);
      if ((wr.lines <= maxLines && wr.longest <= mw) || size <= minSize) break;
      size = Math.max(minSize, Math.floor(size * 0.95));
    }
    if (el.box && Math.floor(mwOf(size)) < num(el.maxWidth, 940)) el.maxWidth = Math.floor(mwOf(size));
    if (size < orig) {
      el.size = size;
      note(`${tagOf(el)}: ${maxLines} satıra sığsın diye boyut ${orig}→${el.size}`);
    }
  };

  // uzun cümle (> 7 kelime) başlık olamaz: gövde yazısı gibi en fazla 56px ve 2 satır
  els.forEach((el) => {
    if (el.type !== 'text' || wordsOf(el.text).length <= 7 || num(el.size, 80) <= 56) return;
    note(`${tagOf(el)}: uzun cümle başlık boyutunda olmaz, ${num(el.size, 80)}→56`);
    el.size = 56;
    if (el.glow) el.glow = false;
  });
  const big = els.filter((el) => (el.type === 'text' || el.type === 'counter') && num(el.size, 80) >= 80);
  let headline = null;
  if (big.length) {
    headline = [...big].sort((a, b) => num(b.size, 80) - num(a.size, 80) || startOf(a) - startOf(b) || els.indexOf(a) - els.indexOf(b))[0];
    // sayı/yıl kahramanı ("1952") büyük kalabilir; yazı başlığı 140'ı geçmesin
    const isNum = headline.type === 'counter' || headline.font === 'number' || NUMERIC_RE.test(plainText(headline.text));
    const cap = isNum ? 280 : 140;
    if (num(headline.size, 80) > cap) { note(`${tagOf(headline)}: başlık boyutu ${headline.size}→${cap}`); headline.size = cap; }
    big.forEach((el) => {
      if (el === headline) return;
      const was = num(el.size, 80);
      const numeric = el.type === 'counter' || el.font === 'number' || NUMERIC_RE.test(plainText(el.text));
      if (numeric) {
        el.size = 64;
        if (el.type === 'text') el.glow = false;
        note(`${tagOf(el)}: ikinci büyük sayı ${was}→64`);
        return;
      }
      const words = wordsOf(el.text);
      if (words.length <= 4 && o.labels !== false) {
        const t = plainText(el.text);
        const keep = ['x', 'y', 'at', 'cue', 'offset', 'until', 'in', 'inDur', 'loop', 'loopSpeed', 'opacity', 'scale', 'rotation', 'out', 'id'];
        Object.keys(el).forEach((k) => { if (!keep.includes(k)) delete el[k]; });
        el.type = 'label';
        el.text = t;
        el.size = 34;
        if (el.in === 'type' || el.in === 'stamp') el.in = 'fade';
        note(`${tagOf(el)}: ikinci büyük başlık (${was}px) küçük etikete çevrildi`);
      } else {
        el.size = words.length <= 4 ? 48 : 56;
        el.glow = false;
        if (el.in === 'stamp') el.in = 'fade';
        note(`${tagOf(el)}: ikinci büyük başlık ${was}→56`);
      }
    });
  }
  els.forEach((el) => {
    if (el.type !== 'text') return;
    const paras = String(el.text).split('\n').length; // yazarın bilerek koyduğu satır sonları korunur
    // kısa başlık (≤ 4 kelime) tek satırda dursun; gerekirse 72px'e kadar küçülür ("donar / mı?" gibi yetim satır olmasın)
    if (el === headline && paras === 1 && wordsOf(el.text).length <= 4) {
      // yalnızca gerçekten tek satıra sığıyorsa küçült; sığmıyorsa dengeli iki satır kalır
      const mw = Math.floor(Math.min(num(el.maxWidth, 940), textMaxW) - (el.box ? 2 * num(el.box.pad, num(el.size, 80) * 0.4) : 0));
      const min = wordsOf(el.text).length <= 3 ? 72 : 68;
      let sz = Math.round(num(el.size, 80));
      while (sz > min && wrapEstimate(shownText(el), sz, mw, fontOf(el)).lines > 1) sz = Math.max(min, Math.floor(sz * 0.95));
      if (sz < num(el.size, 80) && wrapEstimate(shownText(el), sz, mw, fontOf(el)).lines === 1) {
        note(`${tagOf(el)}: kısa başlık tek satıra sığsın diye boyut ${el.size}→${sz}`);
        el.size = sz;
      }
    }
    fitText(el, Math.max(paras, num(el.size, 80) >= 56 || wordsOf(el.text).length > 7 ? 2 : 3), el === headline ? Math.min(80, num(el.size, 80)) : 34);
  });

  // -------------------------------------------------- 2b) kapak karesi (zamanlamalar bundan sonra hesaplanır)
  if (o.cover) {
    const real = els.filter((el) => !['flash', 'shake', 'particles'].includes(el.type));
    const atZero = real.filter((el) => startOf(el) === 0 && num(el.opacity, 1) > 0.05);
    if (!atZero.length && real.length) {
      const vis = real.filter((el) => !TEXTLIKE.has(el.type) && !DECOR.has(el.type));
      const pick = vis.sort((a, b) => area(estimateBox(b, o)) - area(estimateBox(a, o)))[0] || headline || real[0];
      delete pick.cue;
      delete pick.offset;
      pick.at = 0;
      if (Number.isFinite(pick.until) && pick.until < 0.8) delete pick.until;
      info.get(pick).start = 0;
      atZero.push(pick);
      note(`${tagOf(pick)}: ilk kare boş kalmasın diye at=0`);
    }
    atZero.forEach((el) => {
      if (el.in === 'type') { el.in = 'none'; note(`${tagOf(el)}: kapakta daktilo girişi kapatıldı`); }
      if (num(el.opacity, 1) < 0.3) el.opacity = 1;
    });
    if (!real.length) note('kapak sahnesinde hiç öğe yok');
  }

  // -------------------------------------------------- 3) aynı anda en fazla 3 yazı
  const prio = (el) => (el === headline ? 3 : el.type === 'counter' || el.type === 'readout' ? 2 : el.type === 'text' ? 1 : 0);
  {
    const hasResolvedCue = (x) => !!x.cue && cueStart(x, timing) !== null;
    const items = els.filter((el) => TEXTLIKE.has(el.type));
    const queue = [...items].sort((a, b) => startOf(a) - startOf(b) || prio(b) - prio(a) || els.indexOf(a) - els.indexOf(b));
    const placed = [];
    const dropped = new Set();
    let guard = 0;
    while (queue.length && guard++ < 500) {
      const e = queue.shift();
      const s = startOf(e);
      let active = placed.filter((p) => endOf(p) > s + 0.02 && startOf(p) <= s + 0.02);
      let delayed = false;
      while (active.length >= 3) {
        const victim = [...active].sort((a, b) => prio(a) - prio(b) || startOf(a) - startOf(b))[0];
        const cut = r2(s - 0.3);
        if (cut >= startOf(victim) + 1.2) {
          victim.until = cut;
          note(`${tagOf(victim)}: aynı anda 3'ten fazla yazı olmasın diye until=${cut}`);
          active = active.filter((p) => p !== victim);
          continue;
        }
        // kurban çok yeni: yeni yazıyı biraz geciktir
        const ns = r2(startOf(victim) + 1.5);
        if (ns > sceneLen - 0.6) {
          dropped.add(e);
          note(`${tagOf(e)}: sahnede aynı anda 3'ten fazla yazı vardı ve yer yoktu, atıldı`);
        } else {
          const d = ns - s;
          if (hasResolvedCue(e)) e.offset = r2(num(e.offset, 0) + d);
          else { delete e.cue; delete e.offset; e.at = ns; }
          info.get(e).start = hasResolvedCue(e) ? cueStart(e, timing) : ns;
          if (Number.isFinite(e.until) && e.until < info.get(e).start + 0.5) delete e.until;
          victim.until = r2(ns - 0.3);
          note(`${tagOf(e)}: ${r2(d)} sn geciktirildi, ${tagOf(victim)} until=${victim.until}`);
          queue.push(e);
          queue.sort((a, b) => startOf(a) - startOf(b) || prio(b) - prio(a));
        }
        delayed = true;
        break;
      }
      if (!delayed) placed.push(e);
    }
    if (dropped.size) for (let i = els.length - 1; i >= 0; i--) if (dropped.has(els[i])) els.splice(i, 1);
  }

  // -------------------------------------------------- 4) geometri: güvenli alan + altyazı bandı
  // aynı merkezdeki takipçiler (ışın patlaması, vizör, halka) ana görselle birlikte hareket eder
  const followers = new Map();
  els.forEach((a) => {
    if (!ANCHOR.has(a.type)) return;
    const list = els.filter((f) => f !== a && FOLLOWER.has(f.type) && !(f.type === 'shape' && (f.shape === 'line' || f.shape === 'arrow'))
      && Math.hypot(num(f.x, 0) - num(a.x, 0), num(f.y, 0) - num(a.y, 0)) <= 40);
    if (list.length) followers.set(a, list);
  });
  const isFollower = (el) => [...followers.values()].some((l) => l.includes(el));
  const move = (el, dx, dy) => {
    if (!dx && !dy) return;
    el.x = r1(num(el.x, 0) + dx);
    el.y = r1(num(el.y, 0) + dy);
    if (el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow')) {
      if (el.x2 !== undefined) el.x2 = r1(el.x2 + dx);
      if (el.y2 !== undefined) el.y2 = r1(el.y2 + dy);
    }
    (followers.get(el) || []).forEach((f) => { f.x = r1(num(f.x, 0) + dx); f.y = r1(num(f.y, 0) + dy); });
  };
  const resize = (el, k) => {
    resizeEl(el, k);
    (followers.get(el) || []).forEach((f) => resizeEl(f, k));
  };
  const box = (el, core) => estimateBox(el, o, core);
  const inBand = (b) => band && b.y1 > band.y0 && b.y0 < band.y1;

  // yerleşim kutusu: kara deliğin dış diski ekran kenarından taşabilir (sinematik kırpma);
  // güvenli alanda kalması gereken kısım delik + parlak iç halka (±1.6r)
  const geomBox = (el) => {
    const b = box(el);
    if (el.type !== 'accretion') return b;
    const x = num(el.x, W / 2), hw = num(el.r, 130) * 1.6 * Math.abs(num(el.scale, 1) || 1);
    return { ...b, x0: x - hw, x1: x + hw };
  };
  const clampInto = (el) => {
    const b = geomBox(el);
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const x = num(el.x, W / 2), y = num(el.y, H / 2);
    let dx = 0, dy = 0;
    // 1 px tolerans; taşınırken tam sayıya yuvarlama içeride kalsın diye yönlü yuvarlanır
    if (bw > S.x1 - S.x0) dx = Math.round((S.x0 + S.x1) / 2 - (b.x0 + b.x1) / 2);
    else if (b.x0 < S.x0 - 1) dx = Math.ceil(S.x0 - b.x0);
    else if (b.x1 > S.x1 + 1) dx = Math.floor(S.x1 - b.x1);
    if (bh > S.y1 - S.y0) dy = Math.round((S.y0 + S.y1) / 2 - (b.y0 + b.y1) / 2);
    else if (b.y0 < S.y0 - 1) dy = Math.ceil(S.y0 - b.y0);
    else if (b.y1 > S.y1 + 1) dy = Math.floor(S.y1 - b.y1);
    return { dx, dy, x, y };
  };

  const lineFix = (el) => {
    const pt = (xk, yk) => {
      let x = num(el[xk], W / 2), y = num(el[yk], H / 2);
      const nx = clamp(x, S.x0, S.x1), ny0 = clamp(y, S.y0, S.y1);
      let ny = ny0;
      if (band && ny > band.y0 - 8 && ny < band.y1 + 8) ny = ny - band.y0 < band.y1 - ny ? band.y0 - 12 : band.y1 + 12;
      if (nx !== x || ny !== y) { el[xk] = r1(nx); el[yk] = r1(ny); return true; }
      return false;
    };
    if (el.x2 === undefined) el.x2 = num(el.x, W / 2) + 300;
    if (el.y2 === undefined) el.y2 = num(el.y, H / 2);
    const a = pt('x', 'y'), b2 = pt('x2', 'y2');
    if (a || b2) note(`${tagOf(el)}: çizgi uçları güvenli alana alındı`);
  };

  const smallTextLike = (el) => TEXTLIKE.has(el.type) && (el.type !== 'text' || num(el.size, 80) <= 60);

  const placeGeom = (el) => {
    if (DECOR.has(el.type) || isFollower(el)) {
      if (el.type === 'silhouette' || el.type === 'rays' || el.type === 'starburst') {
        el.x = r1(clamp(num(el.x, W / 2), 0, W));
        el.y = r1(clamp(num(el.y, H / 2), 0, H));
      }
      return;
    }
    if (el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow')) { lineFix(el); return; }
    if (el.type === 'waves') {
      // dalga çizgileri ince ve yayılır: yalnızca kaynak noktası güvenli alanda kalsın
      const nx = r1(clamp(num(el.x, W / 2), S.x0, S.x1)), ny = r1(clamp(num(el.y, H / 2), S.y0, S.y1));
      if (nx !== el.x || ny !== el.y) { el.x = nx; el.y = ny; note(`${tagOf(el)}: dalga kaynağı güvenli alana alındı`); }
      return;
    }
    // ekrana sığmayan görsel orantılı küçülür (kamera yakınlaşması dahil)
    if (!TEXTLIKE.has(el.type)) {
      const b0 = box(el);
      const fitK = () => { const bb = geomBox(el); return Math.min(1, (S.x1 - S.x0) / (bb.x1 - bb.x0 || 1), (S.y1 - S.y0) / (bb.y1 - bb.y0 || 1)); };
      const k = fitK();
      if (k < 0.99) {
        resize(el, k * 0.995);
        for (let i = 0; i < 3 && fitK() < 0.99; i++) resize(el, fitK() * 0.99);
        if (fitK() < 0.99) el.scale = r2(num(el.scale, 1) * fitK() * 0.99);
        note(`${tagOf(el)}: güvenli alana sığması için %${Math.round(k * 100)} küçültüldü`);
      }
    }
    // önce güvenli alan
    let c = clampInto(el);
    if (c.dx || c.dy) {
      move(el, c.dx, c.dy);
      note(`${tagOf(el)}: güvenli alana taşındı (${r1(c.x)},${r1(c.y)})→(${el.x},${el.y})`);
    }
    // sonra altyazı bandı
    let b = box(el);
    if (!inBand(b)) return;
    const h = b.y1 - b.y0;
    const below = smallTextLike(el) && (b.y0 + b.y1) / 2 > (band.y0 + band.y1) / 2 - 20 && band.y1 + 12 + h <= S.y1;
    if (below) {
      move(el, 0, band.y1 + 12 - b.y0);
      note(`${tagOf(el)}: altyazı bandından aşağı alındı (y=${el.y})`);
      return;
    }
    const room = band.y0 - 12 - S.y0;
    if (h > room) {
      const k = room / h;
      if (TEXTLIKE.has(el.type)) resize(el, Math.max(el === headline ? 80 / num(el.size, 80) : 0.5, k)); else resize(el, Math.max(0.35, k));
      note(`${tagOf(el)}: altyazı bandına sığmadığı için %${Math.round(k * 100)} küçültüldü`);
      b = box(el);
    }
    move(el, 0, band.y0 - 12 - b.y1);
    note(`${tagOf(el)}: altyazı bandından yukarı alındı (y=${el.y})`);
    c = clampInto(el);
    if (c.dy || c.dx) move(el, c.dx, c.dy);
  };
  // önce ana görseller, sonra diğerleri
  els.filter((el) => !TEXTLIKE.has(el.type)).forEach(placeGeom);
  els.filter((el) => TEXTLIKE.has(el.type)).forEach(placeGeom);
  // takipçiler (görselle aynı merkezdeki halka/vizör) merkezini korur, gerekirse küçülür
  els.filter((el) => isFollower(el) && (el.type === 'shape' || el.type === 'bracket')).forEach((el) => {
    const cy = num(el.y, H / 2), cx = num(el.x, W / 2);
    let b = box(el);
    const lim = Math.min(1,
      (cx - S.x0) / Math.max(1, cx - b.x0), (S.x1 - cx) / Math.max(1, b.x1 - cx),
      (cy - S.y0) / Math.max(1, cy - b.y0), (S.y1 - cy) / Math.max(1, b.y1 - cy));
    let k = lim;
    if (band && cy < band.y0 && b.y1 > band.y0) k = Math.min(k, (band.y0 - 8 - cy) / Math.max(1, b.y1 - cy));
    if (band && cy > band.y1 && b.y0 < band.y1) k = Math.min(k, (cy - band.y1 - 8) / Math.max(1, cy - b.y0));
    if (k < 0.99 && k > 0.2) {
      resizeEl(el, k * 0.99);
      note(`${tagOf(el)}: görselin çevresindeki süs güvenli alana/banda göre küçültüldü`);
    }
    b = box(el);
    if (inBand(b) || b.y0 < S.y0 - 1 || b.y1 > S.y1 + 1) { followers.forEach((l) => { const i = l.indexOf(el); if (i >= 0) l.splice(i, 1); }); placeGeom(el); }
  });

  // -------------------------------------------------- 5) yazı–görsel / yazı–yazı çakışması
  // veri bileşenleri de yazının altında kalmamalı (dalga, spektrum, kadran, çubuk, rozet akışı)
  const visuals = els.filter((el) => OBSTACLE.has(el.type) || DATA_OBSTACLE.has(el.type));
  const panels = els.filter((el) => el.type === 'panel');
  const texts = els
    .filter((el) => TEXTLIKE.has(el.type))
    .sort((a, b) => prio(b) - prio(a) || startOf(a) - startOf(b) || els.indexOf(a) - els.indexOf(b));
  const placedTexts = [];
  const conflicts = (el, bx, strict) => {
    const A = area(bx) || 1;
    const vis = visuals.filter((v) => coexist(v, el));
    for (const v of vis) {
      const ov = interArea(bx, box(v, true));
      if (ov > (strict ? 0.04 : 0.15) * A) return true;
    }
    for (const t of placedTexts) {
      if (!coexist(t, el)) continue;
      if (interArea(pad(bx, strict ? 14 : 6), box(t)) > 0) return true;
    }
    // panel kenarına binen yazı: ya tamamen içinde (başlık şeridinin altında) ya tamamen dışında olsun
    for (const pn of panels) {
      if (!coexist(pn, el)) continue;
      const pb = box(pn);
      const m = strict ? 14 : 4;
      if (interArea(pad(bx, m), pb) <= 0) continue;
      const top = pb.y0 + (pn.title ? 66 : 14);
      const inside = bx.x0 >= pb.x0 + 14 && bx.x1 <= pb.x1 - 14 && bx.y0 >= top && bx.y1 <= pb.y1 - 14;
      if (!inside) return true;
    }
    return false;
  };
  const findSlot = (el) => {
    const b = box(el);
    const h = b.y1 - b.y0;
    const oy = num(el.y, H / 2);
    const top = oy - b.y0, bottom = b.y1 - oy; // merkezden kenarlara
    const ok = (y) => {
      const bx = { x0: b.x0, x1: b.x1, y0: y - top, y1: y + bottom };
      if (bx.y0 < S.y0 || bx.y1 > S.y1) return false;
      if (inBand(pad(bx, 6))) return false;
      return !conflicts(el, bx, true);
    };
    let up = null, down = null;
    for (let y = oy; y - top >= S.y0; y -= 8) if (ok(y)) { up = y; break; }
    for (let y = oy; y + bottom <= S.y1; y += 8) if (ok(y)) { down = y; break; }
    if (up === null && down === null) return null;
    if (up === null) return down;
    if (down === null) return up;
    return oy - up <= down - oy ? up : down;
  };
  // sabit noktaya ulaşana kadar tekrarla: sonradan küçülen bir görsel öncekine yer açabilir
  let unresolved = [];
  for (let round = 0; round < 4; round++) {
  placedTexts.length = 0;
  unresolved = [];
  let changed = false;
  texts.forEach((el) => {
    if (el.type === 'label' && Number.isFinite(el.toX) && Number.isFinite(el.toY)) { placedTexts.push(el); return; }
    if (!conflicts(el, box(el), false)) { placedTexts.push(el); return; }
    const from = num(el.y, 0);
    let y = findSlot(el);
    // boş yer çok uzaktaysa önce yazıyı biraz küçültmeyi dene: başlığın sahneden kopup
    // panelin içine / altyazının hemen üstüne düşmesinden iyidir
    if (y !== null && Math.abs(y - from) > 420 && el.type === 'text' && num(el.size, 80) > 60) {
      const snap = { ...el };
      let y2 = null;
      for (let k = 0; k < 3 && num(el.size, 80) > 60; k++) {
        resize(el, Math.max(60 / num(el.size, 80), 0.88));
        const c2 = clampInto(el);
        if (c2.dx || c2.dy) move(el, c2.dx, c2.dy);
        y2 = findSlot(el);
        if (y2 !== null && Math.abs(y2 - num(el.y, 0)) <= 420) break;
        y2 = null;
      }
      if (y2 !== null) {
        note(`${tagOf(el)}: yakında yer açılsın diye boyut ${snap.size ?? 80}→${el.size}`);
        // aşağıdaki move(el, 0, y - from) son konumu y2 yapsın (clamp kayması zaten uygulandı)
        y = y2 + (from - num(el.y, 0));
      } else {
        Object.keys(el).forEach((k) => delete el[k]);
        Object.assign(el, snap);
      }
    }
    // boş yer çok uzaktaysa (yazı bağlamından kopar) önce görseli biraz küçültmeyi dene
    if (y !== null && Math.abs(y - from) > 420) {
      const tb = box(el);
      const vs = visuals.filter((v) => {
        if (v.type !== 'art' || !coexist(v, el)) return false;
        const vb = box(v, true);
        return vb.x1 > tb.x0 && vb.x0 < tb.x1 && Math.min(Math.abs(vb.y0 - from), Math.abs(vb.y1 - from), vb.y0 < from && from < vb.y1 ? 0 : 1e9) < 300;
      });
      if (vs.length) {
        const restore = (obj, snap) => { Object.keys(obj).forEach((k) => delete obj[k]); Object.assign(obj, snap); };
        const saved = vs.map((v) => ({ v, snap: { ...v }, f: (followers.get(v) || []).map((f) => ({ ...f })) }));
        for (let k = 0; k < 2; k++) {
          vs.forEach((v) => resize(v, 0.9));
          const y2 = findSlot(el);
          if (y2 !== null && Math.abs(y2 - from) <= 420) {
            vs.forEach((v) => note(`${tagOf(v)}: yazıya yakın yer açmak için küçültüldü`));
            y = y2;
            break;
          }
          if (k === 1) {
            // işe yaramadı: geri al
            saved.forEach(({ v, snap, f }) => {
              restore(v, snap);
              (followers.get(v) || []).forEach((fl, i) => restore(fl, f[i]));
            });
          }
        }
      }
    }
    let tries = 0;
    const snaps = y === null ? [el, ...visuals].map((v) => [v, { ...v }, (followers.get(v) || []).map((f) => [f, { ...f }])]) : null;
    while (y === null && tries < 4) {
      tries++;
      const kText = el === headline ? Math.max(0.85, 80 / num(el.size, 80)) : 0.85;
      if (tries <= 2 && num(el.size, 30) > 36 && kText < 0.995) {
        resize(el, kText);
        const c2 = clampInto(el);
        if (c2.dx) move(el, c2.dx, 0);
      }
      else {
        // son çare: çakışan görseli biraz küçült
        visuals.filter((v) => coexist(v, el) && interArea(box(el), box(v, true)) > 0).forEach((v) => {
          resize(v, 0.85);
          note(`${tagOf(v)}: yazıya yer açmak için %85 küçültüldü`);
        });
      }
      y = findSlot(el);
    }
    if (y === null) {
      // hiçbir şey işe yaramadı: küçültmeleri geri al (tekrar çalıştırınca aynı sonuç çıksın)
      const put = (obj, snap) => { Object.keys(obj).forEach((k) => delete obj[k]); Object.assign(obj, snap); };
      snaps.forEach(([v, snap, fs]) => { put(v, snap); fs.forEach(([f, fsnap]) => put(f, fsnap)); });
      for (let i = notes.length - 1; i >= 0 && /yazıya yer açmak için %85/.test(notes[i]); i--) notes.pop();
      unresolved.push(el);
    } else {
      changed = true;
      move(el, 0, y - from);
      note(`${tagOf(el)}: çakışma yüzünden y ${r1(from)}→${el.y}`);
    }
    placedTexts.push(el);
  });
  if (!changed) break;
  }
  unresolved.forEach((el) => note(`${tagOf(el)}: görselle çakışıyor ama boş yer bulunamadı`));

  // son kontrol: küçültmelerden sonra yatayda taşan kalmasın
  els.forEach((el) => {
    if (DECOR.has(el.type) || isFollower(el) || (el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow'))) return;
    const c3 = clampInto(el);
    if (c3.dx) move(el, c3.dx, 0);
  });

  sc.elements = els;
  return sc;
}

// LLM istemine eklenebilecek kısa açıklama: bu kurallar çizimden önce otomatik uygulanır.
export const LINT_DOC = `OTOMATİK DÜZELTMELER (plan çizilmeden önce uygulanır; baştan uyarsan sahnen olduğu gibi kalır):
- Güvenli alan x 70–1010, y 150–1720 (kamera zoom/pan hesaba katılır); taşan öğe içeri itilir, sığmayan görsel küçülür.
- y 1290–1510 ALTYAZI bandıdır: oradaki öğe yukarı alınır (küçük etiket/sayı ise banda altına, 1520–1720), büyük görsel orantılı küçülür.
- Sahne başına TEK büyük başlık (size ≥ 80, en fazla 7 kelime, 140px'i geçmez; sadece sayıysa 280). Diğer büyük yazılar 56'ya iner ya da (≤ 4 kelimeyse) küçük "label" hapına çevrilir. 7 kelimeden uzun yazı en fazla 56px ve 2 satır olur.
- Aynı anda en fazla 3 yazı öğesi (text, label, counter, readout) görünür; fazlası "until" ile sırayla kaybolur.
- Yazı bir görselin (art, orb, accretion, gear) üstüne binerse ya da başka yazıya değerse en yakın boş yere (görselin üstü/altı) taşınır.
- Bütün ana görseller sahne bitmeden "until" ile gidiyorsa en son giden kaybolmaz, silikleşerek (outTo 0.3) kalır: sahne boş kalmaz.
- Yıl sayaçları ("to":1929) düz yazıya çevrilir ("1.929" görünmesin). Bilinmeyen türler ve geçersiz renkler atılır; ilk sahnenin ilk karesi boş kalmaz.`;
