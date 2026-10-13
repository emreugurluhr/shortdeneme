// HUD öğeleri: sade, "premium" arayüz yapı taşları (etiket, cam panel, saat,
// spektrum, dalga, sayaç göstergesi, odak köşeleri, akış rozetleri).
//
// Çizici sözleşmesi: draw(ctx, el, env, p). Çağrılmadan önce ctx öğenin MERKEZİNE
// (el.x, el.y) taşınmış; dönüş/ölçek/opaklık animasyonları uygulanmıştır.
// p = { lt: öğe göründükten sonra geçen sn, inRaw: 0..1 giriş ilerlemesi, until }.
// Tüm çizimler deterministiktir (Math.random yok): t anındaki kare her zaman aynıdır.

const FONT_UI = '"Nunito", system-ui, sans-serif';
const FONT_NUM = '"Barlow Condensed", "Nunito", "Arial Narrow", sans-serif';
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- yardımcılar
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
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

const COLOR_CACHE = new Map();
function parseColor(c) {
  if (typeof c !== 'string') return null;
  if (COLOR_CACHE.has(c)) return COLOR_CACHE.get(c);
  let out = null;
  const s = c.trim().toLowerCase();
  let m;
  if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    if (h.length === 6 || h.length === 8) {
      out = [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
        h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      ];
    }
  } else if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      out = [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    }
  }
  if (COLOR_CACHE.size > 512) COLOR_CACHE.clear();
  COLOR_CACHE.set(c, out);
  return out;
}

// rengin opaklığını a ile çarpar (çözümlenemeyen renkler olduğu gibi döner)
function fade(c, a) {
  const p = parseColor(c);
  if (!p) return c;
  return `rgba(${p[0]},${p[1]},${p[2]},${+(p[3] * a).toFixed(3)})`;
}

function mix(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  if (!a || !b) return t < 0.5 ? c1 : c2;
  return `rgba(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))},${+lerp(a[3], b[3], t).toFixed(3)})`;
}

// rengi beyaza doğru açar (etiketlerde okunurluk için)
const lighten = (c, t) => mix(c, '#ffffff', t);

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

function upper(s) {
  return String(s ?? '').toLocaleUpperCase('tr-TR');
}

// harf aralıklı metin (Chromium'da ctx.letterSpacing, yoksa harf harf)
function setLS(ctx, sp) {
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${sp}px`;
    return true;
  }
  return false;
}
function textW(ctx, s, sp = 0) {
  if (!s) return 0;
  if (!sp) return ctx.measureText(s).width;
  if (setLS(ctx, sp)) {
    const w = ctx.measureText(s).width - sp;
    ctx.letterSpacing = '0px';
    return w;
  }
  let w = 0, n = 0;
  for (const ch of s) {
    w += ctx.measureText(ch).width;
    n++;
  }
  return w + sp * Math.max(0, n - 1);
}
function fillT(ctx, s, x, y, sp = 0, align = 'left') {
  if (!s) return 0;
  const w = textW(ctx, s, sp);
  let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left';
  if (!sp) {
    ctx.fillText(s, x0, y);
  } else if (setLS(ctx, sp)) {
    ctx.fillText(s, x0, y);
    ctx.letterSpacing = '0px';
  } else {
    for (const ch of s) {
      ctx.fillText(ch, x0, y);
      x0 += ctx.measureText(ch).width + sp;
    }
  }
  return w;
}

// küçük, harf aralıklı büyük harf başlık ("small caps" HUD etiketi)
function capsFont(size) {
  return `800 ${size}px ${FONT_UI}`;
}

// ---------------------------------------------------------------- ikonlar
// (x, y) merkezli, s boyutunda küçük glifler
function drawIcon(ctx, kind, x, y, s, c, lt = 0) {
  if (!kind || kind === 'none') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = Math.max(2, s * 0.1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'rec': {
      const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(lt * 4.2));
      ctx.globalAlpha *= blink;
      ctx.shadowColor = '#ff3b3b';
      ctx.shadowBlur = s * 0.6;
      ctx.fillStyle = '#ff4646';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.24, 0, TAU);
      ctx.fill();
      break;
    }
    case 'dot': {
      ctx.shadowColor = c;
      ctx.shadowBlur = s * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.2, 0, TAU);
      ctx.fill();
      break;
    }
    case 'eye': {
      const w = s * 0.55, h = s * 0.34;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.quadraticCurveTo(0, -h * 2, w, 0);
      ctx.quadraticCurveTo(0, h * 2, -w, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.15, 0, TAU);
      ctx.fill();
      break;
    }
    case 'check': {
      ctx.beginPath();
      ctx.moveTo(-s * 0.32, 0);
      ctx.lineTo(-s * 0.08, s * 0.24);
      ctx.lineTo(s * 0.34, -s * 0.24);
      ctx.stroke();
      break;
    }
    case 'x': {
      const k = s * 0.26;
      ctx.beginPath();
      ctx.moveTo(-k, -k); ctx.lineTo(k, k);
      ctx.moveTo(k, -k); ctx.lineTo(-k, k);
      ctx.stroke();
      break;
    }
    case 'clock': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.38, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.22);
      ctx.moveTo(0, 0); ctx.lineTo(s * 0.16, s * 0.06);
      ctx.stroke();
      break;
    }
    case 'warn': {
      const k = s * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, -k);
      ctx.lineTo(k * 1.05, k * 0.8);
      ctx.lineTo(-k * 1.05, k * 0.8);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -k * 0.3); ctx.lineTo(0, k * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, k * 0.52, ctx.lineWidth * 0.55, 0, TAU);
      ctx.fill();
      break;
    }
    case 'pin': {
      const r = s * 0.26;
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, r, Math.PI * 0.85, Math.PI * 0.15);
      ctx.lineTo(0, s * 0.42);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, r * 0.35, 0, TAU);
      ctx.fill();
      break;
    }
    case 'arrow': {
      const k = s * 0.36;
      ctx.beginPath();
      ctx.moveTo(-k, 0); ctx.lineTo(k, 0);
      ctx.moveTo(k * 0.35, -k * 0.6); ctx.lineTo(k, 0); ctx.lineTo(k * 0.35, k * 0.6);
      ctx.stroke();
      break;
    }
    case 'coin': {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.38, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.2, 0, TAU);
      ctx.globalAlpha *= 0.6;
      ctx.stroke();
      break;
    }
    case 'star': {
      const R = s * 0.42, r = R * 0.45;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? r : R;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.18, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- cam hap (pill)
function pillMetrics(ctx, text, size, icon) {
  ctx.font = `700 ${size}px ${FONT_UI}`;
  const sp = size * 0.02;
  const tw = textW(ctx, text, sp);
  const hasIcon = icon && icon !== 'none';
  const iconS = size * 0.95;
  const gap = size * 0.38;
  const padX = size * 0.72;
  const h = Math.round(size * 1.62);
  const w = tw + padX * 2 + (hasIcon ? iconS + gap : 0) - (hasIcon ? size * 0.12 : 0);
  return { w, h, tw, sp, iconS, gap, padX, hasIcon };
}

// (cx, cy) merkezli cam hap; o: {text, size, icon, textColor, fill, stroke, iconColor, solid}
function drawPill(ctx, cx, cy, o, lt, m) {
  m = m || pillMetrics(ctx, o.text, o.size, o.icon);
  const x = cx - m.w / 2, y = cy - m.h / 2;
  ctx.save();
  rr(ctx, x, y, m.w, m.h, m.h / 2);
  if (o.solid) {
    ctx.shadowColor = fade(o.fill, 0.55);
    ctx.shadowBlur = o.size * 0.7;
    ctx.fillStyle = o.fill;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else {
    // koyu taban + beyaz cam tonu
    ctx.fillStyle = o.backing || 'rgba(6,10,24,0.42)';
    ctx.fill();
    ctx.fillStyle = o.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = o.stroke;
    ctx.stroke();
    // üst kenarda ince parlama
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + m.h);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, m.w, m.h);
    ctx.restore();
  }
  let tx = x + m.padX;
  if (m.hasIcon) {
    drawIcon(ctx, o.icon, tx + m.iconS / 2 - o.size * 0.12, cy, m.iconS, o.iconColor || o.textColor, lt);
    tx += m.iconS + m.gap - o.size * 0.12;
  }
  ctx.font = `700 ${o.size}px ${FONT_UI}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.textColor;
  fillT(ctx, o.text, tx, cy + o.size * 0.04, m.sp, 'left');
  ctx.restore();
  return m;
}

// ---------------------------------------------------------------- label
// Küçük cam etiket; isteğe bağlı (toX, toY) noktasına çizgiyle bağlanır.
function drawLabel(ctx, el, env, p) {
  const th = env.theme;
  const size = num(el.size, 30);
  const text = String(el.text ?? '');
  const o = {
    text,
    size,
    icon: el.icon || 'none',
    textColor: col(el.color, th, fade(th.text, 0.88)),
    fill: col(el.fill, th, 'rgba(255,255,255,0.07)'),
    stroke: col(el.stroke, th, fade(th.text, 0.24)),
    iconColor: col(el.iconColor, th, th.accent2),
  };
  if (el.solid) {
    o.solid = true;
    o.fill = col(el.fill, th, th.accent2);
    o.textColor = col(el.color, th, th.bg);
    o.iconColor = col(el.iconColor, th, o.textColor);
  }
  const m = pillMetrics(ctx, text, size, o.icon);

  const tx = num(el.toX, NaN), ty = num(el.toY, NaN);
  if (Number.isFinite(tx) && Number.isFinite(ty)) {
    const dx = tx - num(el.x, 540), dy = ty - num(el.y, 960);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      // çizgi hapın kenarından başlar
      const k = Math.min(m.w / 2 / Math.max(1e-6, Math.abs(dx)), m.h / 2 / Math.max(1e-6, Math.abs(dy)));
      const sx = dx * Math.min(1, k), sy = dy * Math.min(1, k);
      const reveal = easeOutCubic(clamp((p.lt - 0.12) / 0.7));
      const ex = lerp(sx, dx, reveal), ey = lerp(sy, dy, reveal);
      const lc = col(el.lineColor, th, fade(th.text, 0.5));
      ctx.save();
      ctx.strokeStyle = lc;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (reveal > 0.02) {
        // uç noktası: dolu nokta + nefes alan halka
        ctx.fillStyle = lighten(lc, 0.3);
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, TAU);
        ctx.fill();
        if (reveal > 0.9) {
          const ph = (p.lt * 0.8) % 1;
          ctx.globalAlpha *= (1 - ph) * 0.6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ex, ey, 6 + ph * 18, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  drawPill(ctx, 0, 0, o, p.lt, m);
}

// ---------------------------------------------------------------- panel
// Cam HUD kartı (yalnızca çerçeve; içeriği diğer öğeler üstüne yerleşir).
const PANEL_PAD = 110;
const PANEL_BASE = new Map();
function panelBase(w, h, r, backing) {
  const key = [Math.round(w), Math.round(h), Math.round(r), backing].join('|');
  let c = PANEL_BASE.get(key);
  if (c) return c;
  const cw = Math.ceil(w + PANEL_PAD * 2), ch = Math.ceil(h + PANEL_PAD * 2);
  c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 70;
  g.shadowOffsetY = 24;
  rr(g, PANEL_PAD, PANEL_PAD, w, h, r);
  g.fillStyle = backing;
  g.fill();
  if (PANEL_BASE.size > 24) PANEL_BASE.clear();
  PANEL_BASE.set(key, c);
  return c;
}

function drawPanel(ctx, el, env, p) {
  const th = env.theme;
  const w = num(el.w, 820), h = num(el.h, 860);
  const r = num(el.radius, 36);
  const x = -w / 2, y = -h / 2;
  const lt = p.lt;
  const stroke = col(el.stroke, th, fade(th.text, 0.2));
  const tint = col(el.tint, th, null);

  ctx.save();
  // gölge + koyu cam tabanı: büyük shadowBlur her karede (özellikle GPU'suz) çok pahalı,
  // bu yüzden bir kez hazır görüntüye çizilip tekrar kullanılır
  ctx.drawImage(panelBase(w, h, r, col(el.backing, th, 'rgba(6,10,24,0.42)')), x - PANEL_PAD, y - PANEL_PAD);

  rr(ctx, x, y, w, h, r);
  if (el.fill) {
    ctx.fillStyle = col(el.fill, th);
  } else {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.055)');
    g.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = g;
  }
  ctx.fill();
  if (tint) {
    const g2 = ctx.createRadialGradient(0, y, 0, 0, y, Math.max(w, h));
    g2.addColorStop(0, fade(tint, 0.16));
    g2.addColorStop(1, fade(tint, 0));
    ctx.fillStyle = g2;
    ctx.fill();
  }

  // tarama efekti (panel içine kırpılır)
  if (el.scan) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    // ince yatay tarama çizgileri
    ctx.fillStyle = 'rgba(255,255,255,0.022)';
    for (let yy = y + 3; yy < y + h; yy += 7) ctx.fillRect(x, yy, w, 2);
    const period = num(el.scanPeriod, 3.6);
    const ph = ((lt / period) % 1) * 1.25 - 0.12;
    const by = y + ph * h;
    const bandH = Math.min(220, h * 0.3);
    const sc = col(el.scanColor, th, th.text);
    const g = ctx.createLinearGradient(0, by - bandH, 0, by);
    g.addColorStop(0, fade(sc, 0));
    g.addColorStop(1, fade(sc, 0.07));
    ctx.fillStyle = g;
    ctx.fillRect(x, by - bandH, w, bandH);
    ctx.fillStyle = fade(sc, 0.15);
    ctx.fillRect(x, by - 1, w, 2);
    ctx.restore();
  }

  // kenar + üst iç parlama
  rr(ctx, x, y, w, h, r);
  ctx.lineWidth = num(el.lineWidth, 2);
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.save();
  rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5);
  ctx.clip();
  const hg = ctx.createLinearGradient(0, y, 0, y + 40);
  hg.addColorStop(0, 'rgba(255,255,255,0.12)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = hg;
  ctx.lineWidth = 2;
  rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5);
  ctx.stroke();
  ctx.restore();

  // köşe parantezleri (giriş sırasında içeri kilitlenir)
  if (el.brackets) {
    const lock = easeOutCubic(clamp(lt / 0.6));
    const inset = 22 - (1 - lock) * 26;
    const L = Math.min(52, w * 0.12, h * 0.12);
    const bc = col(el.bracketColor, th, fade(th.text, 0.6));
    ctx.save();
    ctx.strokeStyle = bc;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.globalAlpha *= 0.4 + 0.6 * lock;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    ctx.beginPath();
    corners.forEach(([sx, sy]) => {
      const cx = sx * (w / 2 - inset), cy = sy * (h / 2 - inset);
      ctx.moveTo(cx, cy - sy * L);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - sx * L, cy);
    });
    ctx.stroke();
    ctx.restore();
  }

  // üst satır: başlık (sol), REC + sinyal (sağ)
  const pad = el.brackets ? 52 : 38;
  const rowY = y + num(el.titleY, 46);
  const tsize = num(el.titleSize, 22);
  if (el.title) {
    ctx.font = capsFont(tsize);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col(el.titleColor, th, fade(th.text, 0.55));
    const align = el.titleAlign === 'center' ? 'center' : 'left';
    fillT(ctx, upper(el.title), align === 'center' ? 0 : x + pad, rowY, tsize * 0.24, align);
  }
  let rx = x + w - pad;
  if (el.rec) {
    ctx.font = capsFont(tsize * 0.9);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fade(th.text, 0.6);
    const rw = fillT(ctx, 'REC', rx, rowY, tsize * 0.16, 'right');
    drawIcon(ctx, 'rec', rx - rw - tsize * 0.75, rowY, tsize * 1.3, '#ff4646', lt);
    rx -= rw + tsize * 1.7;
  }
  if (el.bars) {
    const bw = 5, gap = 4, n = 4;
    const lit = 2 + Math.floor((Math.sin(lt * 1.3) * 0.5 + 0.5) * 2.99);
    for (let i = 0; i < n; i++) {
      const bh = 8 + i * 5;
      ctx.fillStyle = i < lit ? fade(th.text, 0.6) : fade(th.text, 0.18);
      ctx.fillRect(rx - (n - i) * (bw + gap), rowY + 11 - bh, bw, bh);
    }
  }
  // alt bilgi
  if (el.footer) {
    const fs = num(el.footerSize, 22);
    ctx.font = `700 ${fs}px ${FONT_UI}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col(el.footerColor, th, fade(th.text, 0.5));
    fillT(ctx, String(el.footer), 0, y + h - 40, fs * 0.04, 'center');
  }
  ctx.restore();
}

// ---------------------------------------------------------------- clock
// Analog kadran. speed: akrep turu/sn; toSpeed+duration ile yavaşlayıp/hızlanır.
function clockAngle(el, lt) {
  const s0 = num(el.speed, 0.25);
  const s1 = num(el.toSpeed, s0);
  const D = Math.max(0.01, num(el.duration, 3));
  const d0 = num(el.delay, 0);
  const a0 = num(el.angle, 0); // başlangıç (tur)
  let turns;
  if (lt <= d0) turns = s0 * lt;
  else {
    const t = lt - d0;
    const base = s0 * d0;
    if (t < D) turns = base + s0 * t + ((s1 - s0) * t * t) / (2 * D);
    else turns = base + (s0 + s1) * D * 0.5 + s1 * (t - D);
  }
  return { a: (a0 + turns) * TAU, speedNow: lt <= d0 ? s0 : lerp(s0, s1, clamp((lt - d0) / D)) };
}

function drawClock(ctx, el, env, p) {
  const th = env.theme;
  const r = num(el.r, 110);
  const c = col(el.color, th, th.accent2);
  const lt = p.lt;
  ctx.save();
  // kadran tabanı
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.35;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = 'rgba(6,10,24,0.55)';
  ctx.fill();
  ctx.restore();
  const fg = ctx.createRadialGradient(0, -r * 0.4, 0, 0, 0, r);
  fg.addColorStop(0, 'rgba(255,255,255,0.08)');
  fg.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  // dış halka (hafif parıltılı)
  ctx.save();
  ctx.shadowColor = fade(c, 0.7);
  ctx.shadowBlur = r * 0.12;
  ctx.strokeStyle = c;
  ctx.lineWidth = Math.max(2.5, r * 0.028);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // çentikler
  ctx.lineCap = 'round';
  const majorPath = [], minorPath = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const major = i % 5 === 0;
    const r1 = r * 0.9, r0 = r1 - (major ? r * 0.13 : r * 0.05);
    (major ? majorPath : minorPath).push([Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1]);
  }
  ctx.strokeStyle = fade(th.text, 0.28);
  ctx.lineWidth = Math.max(1.2, r * 0.012);
  ctx.beginPath();
  minorPath.forEach(([a, b, cc, d]) => { ctx.moveTo(a, b); ctx.lineTo(cc, d); });
  ctx.stroke();
  ctx.strokeStyle = fade(th.text, 0.75);
  ctx.lineWidth = Math.max(2, r * 0.026);
  ctx.beginPath();
  majorPath.forEach(([a, b, cc, d]) => { ctx.moveTo(a, b); ctx.lineTo(cc, d); });
  ctx.stroke();

  const { a, speedNow } = clockAngle(el, lt);
  const ang = a - Math.PI / 2;

  // kısa akrep (sabit, kadranı "saat" gibi gösterir)
  const ha = num(el.hour, 0.36) * TAU - Math.PI / 2;
  ctx.strokeStyle = fade(th.text, 0.6);
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ha) * r * 0.46, Math.sin(ha) * r * 0.46);
  ctx.stroke();

  // hareket izi (hızla orantılı)
  const trail = clamp(Math.abs(speedNow) * 1.2, 0, 0.9);
  if (trail > 0.02) {
    const dir = speedNow >= 0 ? -1 : 1;
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.8, ang, ang + dir * trail, dir < 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // yelkovan (parlayan)
  ctx.save();
  ctx.shadowColor = c;
  ctx.shadowBlur = r * 0.15;
  ctx.strokeStyle = c;
  ctx.lineWidth = Math.max(3, r * 0.035);
  ctx.beginPath();
  ctx.moveTo(-Math.cos(ang) * r * 0.14, -Math.sin(ang) * r * 0.14);
  ctx.lineTo(Math.cos(ang) * r * 0.8, Math.sin(ang) * r * 0.8);
  ctx.stroke();
  ctx.restore();
  // göbek
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, TAU);
  ctx.fill();
  ctx.fillStyle = th.bg;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.03, 0, TAU);
  ctx.fill();

  // başlık (üstte, küçük harf aralıklı)
  if (el.title) {
    const ts = Math.max(18, r * 0.17);
    ctx.font = capsFont(ts);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fade(th.text, 0.6);
    fillT(ctx, upper(el.title), 0, -r - ts * 1.3, ts * 0.22, 'center');
  }
  // etiket hapı (altta, dolu)
  if (el.label) {
    const ls = Math.max(20, r * 0.2);
    drawPill(ctx, 0, r + ls * 1.75, {
      text: String(el.label),
      size: ls,
      icon: el.labelIcon || 'none',
      solid: true,
      fill: c,
      textColor: col(el.labelColor, th, th.bg),
    }, lt);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- spectrum
const SPECTRUM_STOPS = ['#3f6dff', '#7a52ff', '#c447e0', '#ff4a7a', '#ff3b30'];

function colorAt(stops, v) {
  const n = stops.length;
  if (n === 1) return stops[0];
  const f = clamp(v) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  return mix(stops[i], stops[i + 1], f - i);
}

function drawSpectrum(ctx, el, env, p) {
  const th = env.theme;
  const w = num(el.w, 760), h = num(el.h, 30);
  const stops = Array.isArray(el.stops) && el.stops.length ? el.stops.map((s) => col(s, th, '#ffffff')) : SPECTRUM_STOPS;
  const target = clamp(num(el.value, 0.82));
  const from = clamp(num(el.from, 0.08));
  const dur = Math.max(0.01, num(el.duration, 2.2));
  const delay = num(el.delay, 0.35);
  const k = easeInOut(clamp((p.lt - delay) / dur));
  const v = lerp(from, target, k);
  const x0 = -w / 2;
  const mc = colorAt(stops, v);

  ctx.save();
  // çubuk + yumuşak renkli parıltı
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1 || 1), s));
  ctx.save();
  ctx.shadowColor = fade(mc, 0.55);
  ctx.shadowBlur = h * 1.1;
  rr(ctx, x0, -h / 2, w, h, h / 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // parlak üst yarı
  ctx.save();
  rr(ctx, x0, -h / 2, w, h, h / 2);
  ctx.clip();
  const gl = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  gl.addColorStop(0, 'rgba(255,255,255,0.32)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0.04)');
  gl.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = gl;
  ctx.fillRect(x0, -h / 2, w, h);
  ctx.restore();
  rr(ctx, x0, -h / 2, w, h, h / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // alt çentikler
  ctx.strokeStyle = fade(th.text, 0.22);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const tx = x0 + h / 2 + (i / 10) * (w - h);
    ctx.moveTo(tx, h / 2 + 10);
    ctx.lineTo(tx, h / 2 + (i % 5 === 0 ? 22 : 16));
  }
  ctx.stroke();

  // işaretçi
  const mx = x0 + h / 2 + v * (w - h);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  rr(ctx, mx - 2.5, -h / 2 - 8, 5, h + 16, 2.5);
  ctx.fill();
  const tri = 13;
  ctx.beginPath();
  ctx.moveTo(mx - tri, -h / 2 - 26);
  ctx.lineTo(mx + tri, -h / 2 - 26);
  ctx.lineTo(mx, -h / 2 - 12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (el.markerLabel) {
    const ms = num(el.markerSize, 24);
    const m = pillMetrics(ctx, String(el.markerLabel), ms, 'none');
    // kenarlarda taşmasın
    const cx = clamp(mx, x0 + m.w / 2, x0 + w - m.w / 2);
    drawPill(ctx, cx, -h / 2 - 34 - m.h / 2, {
      text: String(el.markerLabel), size: ms, icon: 'none',
      textColor: fade(th.text, 0.92), fill: 'rgba(255,255,255,0.08)', stroke: fade(mc, 0.6),
    }, p.lt, m);
  }

  // uç etiketleri
  const ls = num(el.labelSize, 24);
  ctx.font = `700 ${ls}px ${FONT_UI}`;
  ctx.textBaseline = 'middle';
  const ly = h / 2 + 22 + ls * 0.95;
  if (el.leftLabel) {
    ctx.fillStyle = lighten(stops[0], 0.35);
    fillT(ctx, String(el.leftLabel), x0, ly, ls * 0.04, 'left');
  }
  if (el.rightLabel) {
    ctx.fillStyle = lighten(stops[stops.length - 1], 0.3);
    fillT(ctx, String(el.rightLabel), x0 + w, ly, ls * 0.04, 'right');
  }
  if (el.showValue) {
    const pct = `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v * 100)}`;
    if (el.markerLabel) {
      // işaretçi etiketi varsa değer alt satırın ortasına iner
      const vs = num(el.valueSize, 30);
      ctx.font = `700 ${vs}px ${FONT_NUM}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fade(th.text, 0.85);
      fillT(ctx, pct, 0, ly, 1, 'center');
    } else {
      // yoksa işaretçinin üstünde onu takip eder
      const vs = num(el.valueSize, 36);
      ctx.font = `700 ${vs}px ${FONT_NUM}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = fade(th.text, 0.9);
      const tw = textW(ctx, pct, 1);
      fillT(ctx, pct, clamp(mx, x0 + tw / 2, x0 + w - tw / 2), -h / 2 - 36, 1, 'center');
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- sine
// Hareketli dalga; wavelength → toWavelength ile kırmızıya kayma gibi gerilir.
function drawSine(ctx, el, env, p) {
  const th = env.theme;
  const w = num(el.w, 760);
  const amp = num(el.amp, 60);
  const wl0 = Math.max(8, num(el.wavelength, 150));
  const wl1 = Math.max(8, num(el.toWavelength, wl0));
  const dur = Math.max(0.01, num(el.duration, 2.6));
  const delay = num(el.delay, 0.4);
  const k = easeInOut(clamp((p.lt - delay) / dur));
  const wl = lerp(wl0, wl1, k);
  const c0 = col(el.color, th, th.accent);
  const c = el.toColor ? mix(c0, col(el.toColor, th, c0), k) : c0;
  const lw = num(el.lineWidth, 5);
  const speed = num(el.speed, 0.6);
  const phase = p.lt * speed * TAU;
  const reveal = el.reveal === false ? 1 : easeOutCubic(clamp(p.lt / 0.9));
  const x0 = -w / 2;
  const xEnd = x0 + w * reveal;

  ctx.save();
  if (el.axis !== false) {
    ctx.strokeStyle = fade(th.text, 0.14);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + w, 0);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (reveal > 0.001) {
    ctx.beginPath();
    const step = 3;
    for (let x = x0; x <= xEnd + 0.01; x += step) {
      const xx = Math.min(x, xEnd);
      const y = -amp * Math.sin((TAU * (xx - x0)) / wl - phase);
      if (x === x0) ctx.moveTo(xx, y);
      else ctx.lineTo(xx, y);
    }
    const grad = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    grad.addColorStop(0, fade(c, 0));
    grad.addColorStop(0.1, c);
    grad.addColorStop(0.9, c);
    grad.addColorStop(1, fade(c, 0));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = grad;
    // yumuşak parıltı + çekirdek
    ctx.save();
    ctx.globalAlpha *= 0.18;
    ctx.lineWidth = lw * 3.6;
    ctx.stroke();
    ctx.globalAlpha /= 0.18;
    ctx.globalAlpha *= 0.35;
    ctx.lineWidth = lw * 1.9;
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = lw;
    ctx.stroke();
    // ince parlak iç çizgi
    ctx.globalAlpha *= 0.5;
    ctx.lineWidth = Math.max(1, lw * 0.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    ctx.globalAlpha /= 0.5;
  }
  if (el.label) {
    const ls = num(el.labelSize, 22);
    ctx.font = capsFont(ls);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col(el.labelColor, th, fade(th.text, 0.55));
    fillT(ctx, upper(el.label), 0, amp + lw + ls * 1.6, ls * 0.2, 'center');
  }
  ctx.restore();
}

// ---------------------------------------------------------------- readout
// Sayısal gösterge: küçük başlık + tablo rakamlı değer + ince ilerleme çubuğu.
function fmtTR(v, decimals) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

// rakamlar sabit genişlikte (tabular) çizilir; sayaç sayarken titremez
function tabWidth(ctx, s, dw) {
  let w = 0;
  for (const ch of s) w += ch >= '0' && ch <= '9' ? dw : ctx.measureText(ch).width;
  return w;
}
function tabFill(ctx, s, x, y, dw) {
  ctx.textAlign = 'center';
  for (const ch of s) {
    const cw = ch >= '0' && ch <= '9' ? dw : ctx.measureText(ch).width;
    ctx.fillText(ch, x + cw / 2, y);
    x += cw;
  }
  ctx.textAlign = 'left';
  return x;
}

function drawReadout(ctx, el, env, p) {
  const th = env.theme;
  const size = num(el.size, 72);
  const decimals = Math.max(0, Math.min(6, Math.round(num(el.decimals, 0))));
  const from = num(el.from, 0), to = num(el.to, 100);
  const dur = Math.max(0.01, num(el.duration, 2));
  const delay = num(el.delay, 0.15);
  const k = easeOutCubic(clamp((p.lt - delay) / dur));
  const v = lerp(from, to, k);
  let prefix = String(el.prefix ?? ''), suffix = String(el.suffix ?? '');
  // Türkçede yüzde işareti sayının önüne yazılır: "97,37%" değil "%97,37"
  if (!prefix && suffix.trim() === '%') { prefix = '%'; suffix = ''; }
  const valColor = col(el.color, th, th.text);
  const barColor = col(el.barColor, th, th.accent2);
  const label = el.label ? upper(el.label) : '';
  const ls = num(el.labelSize, Math.max(18, size * 0.3));
  const affix = size * 0.66;
  const numFont = `700 ${size}px ${FONT_NUM}`;
  const affFont = `700 ${affix}px ${FONT_NUM}`;

  const body = fmtTR(v, decimals);
  ctx.font = numFont;
  const dw = ctx.measureText('0').width;
  const bodyW = (s) => { ctx.font = numFont; return tabWidth(ctx, s, dw); };
  const affW = (s) => { ctx.font = affFont; return s ? ctx.measureText(s).width + affix * 0.08 : 0; };
  const curW = affW(prefix) + bodyW(body) + affW(suffix);
  const maxW = affW(prefix) + Math.max(bodyW(fmtTR(to, decimals)), bodyW(fmtTR(from, decimals))) + affW(suffix);
  ctx.font = capsFont(ls);
  const labW = textW(ctx, label, ls * 0.2);

  const layout = el.layout || (el.w ? 'row' : 'stack');
  const W = Math.max(num(el.w, 0), layout === 'row' ? labW + maxW + 40 : Math.max(labW, maxW));
  let max = num(el.max, NaN);
  if (!Number.isFinite(max) && (prefix.includes('%') || suffix.includes('%'))) max = 100;
  const prog = Number.isFinite(max) && max !== 0 ? clamp(v / max) : k;

  // bileşen yerleşimi
  let labX, labAlign, labY, numX, numBase, barY;
  if (layout === 'row') {
    labX = -W / 2; labAlign = 'left';
    numBase = size * 0.18;
    labY = numBase - size * 0.36;
    numX = W / 2 - curW; // sağa yaslı
    barY = numBase + size * 0.32;
  } else {
    labX = 0; labAlign = 'center';
    labY = -size * 0.62;
    numBase = size * 0.36;
    numX = -curW / 2;
    barY = numBase + size * 0.3;
  }
  ctx.save();
  if (label) {
    ctx.font = capsFont(ls);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col(el.labelColor, th, fade(th.text, 0.55));
    fillT(ctx, label, labX, labY, ls * 0.2, labAlign);
  }
  // değer
  ctx.save();
  ctx.shadowColor = fade(valColor, 0.35);
  ctx.shadowBlur = size * 0.25;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = valColor;
  let x = numX;
  if (prefix) {
    ctx.font = affFont;
    ctx.globalAlpha *= 0.75;
    ctx.textAlign = 'left';
    ctx.fillText(prefix, x, numBase);
    ctx.globalAlpha /= 0.75;
    x += affW(prefix);
  }
  ctx.font = numFont;
  x = tabFill(ctx, body, x, numBase, dw);
  if (suffix) {
    ctx.font = affFont;
    ctx.globalAlpha *= 0.75;
    ctx.textAlign = 'left';
    ctx.fillText(suffix, x + affix * 0.08, numBase);
    ctx.globalAlpha /= 0.75;
  }
  ctx.restore();

  // ilerleme çubuğu
  if (el.bar !== false) {
    const bh = num(el.barHeight, 6);
    const bw = W;
    const bx = -bw / 2;
    rr(ctx, bx, barY, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    if (prog > 0.001) {
      const fw = Math.max(bh, bw * prog);
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, fade(barColor, 0.45));
      g.addColorStop(1, barColor);
      ctx.save();
      ctx.shadowColor = fade(barColor, 0.7);
      ctx.shadowBlur = 12;
      rr(ctx, bx, barY, fw, bh, bh / 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx + fw - bh / 2, barY + bh / 2, bh * 0.95, 0, TAU);
      ctx.fillStyle = lighten(barColor, 0.5);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- bracket
// Vizör köşeleri: hedefe kilitlenir, sonra hafifçe nefes alır.
function drawBracket(ctx, el, env, p) {
  const th = env.theme;
  const w = num(el.w, 300), h = num(el.h, 300);
  const c = col(el.color, th, fade(th.text, 0.85));
  const lw = num(el.lineWidth, 3);
  const L = num(el.len, Math.min(w, h) * 0.2);
  const lock = easeOutCubic(clamp(p.lt / 0.55));
  const pulse = el.pulse === false ? 0 : Math.sin(p.lt * 3.2) * Math.min(w, h) * 0.018 * lock;
  const o = (1 - lock) * Math.min(w, h) * 0.3 + pulse;
  const hw = w / 2 + o, hh = h / 2 + o;
  ctx.save();
  // kilitlenirken kısa titreşim
  if (lock < 1) ctx.globalAlpha *= 0.5 + 0.5 * (Math.sin(p.lt * 60) > -0.2 ? 1 : 0.3);
  ctx.strokeStyle = c;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = fade(c, 0.6);
  ctx.shadowBlur = 10;
  ctx.beginPath();
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
    const cx = sx * hw, cy = sy * hh;
    ctx.moveTo(cx, cy - sy * L);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - sx * L, cy);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (el.cross) {
    const k = Math.min(w, h) * 0.06;
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-k, 0); ctx.lineTo(-k * 0.35, 0);
    ctx.moveTo(k * 0.35, 0); ctx.lineTo(k, 0);
    ctx.moveTo(0, -k); ctx.lineTo(0, -k * 0.35);
    ctx.moveTo(0, k * 0.35); ctx.lineTo(0, k);
    ctx.stroke();
    ctx.globalAlpha /= 0.55;
  }
  if (el.label) {
    const ls = num(el.labelSize, 20);
    ctx.font = capsFont(ls);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = c;
    ctx.globalAlpha *= 0.85 * lock;
    fillT(ctx, upper(el.label), -hw, -hh - ls * 0.7, ls * 0.22, 'left');
  }
  ctx.restore();
}

// ---------------------------------------------------------------- badge
// Ok ile bağlı hap dizisi: "yavaşlar → kızarır → kaybolur" (sırayla belirir).
function drawArrow(ctx, x1, y1, x2, y2, c, k) {
  const ex = lerp(x1, x2, k), ey = lerp(y1, y2, k);
  ctx.save();
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(ex, ey);
  if (k > 0.6) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const hs = 7;
    ctx.moveTo(ex - Math.cos(a - 0.6) * hs, ey - Math.sin(a - 0.6) * hs);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - Math.cos(a + 0.6) * hs, ey - Math.sin(a + 0.6) * hs);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBadge(ctx, el, env, p) {
  const th = env.theme;
  const raw = Array.isArray(el.items) ? el.items : el.text ? [el.text] : [];
  const items = raw
    .map((it) => (it && typeof it === 'object' ? { text: String(it.text ?? ''), icon: it.icon, color: it.color } : { text: String(it ?? '') }))
    .filter((it) => it.text);
  if (!items.length) return;
  let size = num(el.size, 30);
  const col_ = el.direction === 'column';
  const stagger = num(el.stagger, 0.45);
  const active = Number.isFinite(Number(el.active)) ? Number(el.active) : -1;
  const arrowC = col(el.arrowColor, th, fade(th.text, 0.45));

  const measure = (s) => items.map((it) => pillMetrics(ctx, it.text, s, it.icon || el.icon || 'none'));
  let ms = measure(size);
  let gapF = 2.4; // ok boşluğu (size katı)
  const maxW = num(el.maxWidth, 960);
  if (!col_) {
    const total = ms.reduce((a, m) => a + m.w, 0) + (items.length - 1) * size * gapF;
    if (total > maxW) {
      size *= maxW / total;
      ms = measure(size);
    }
  }
  const gap = size * gapF;
  const total = col_
    ? ms.reduce((a, m) => a + m.h, 0) + (items.length - 1) * size * 1.6
    : ms.reduce((a, m) => a + m.w, 0) + (items.length - 1) * gap;
  let cursor = -total / 2;
  const centers = ms.map((m) => {
    const len = col_ ? m.h : m.w;
    const c = cursor + len / 2;
    cursor += len + (col_ ? size * 1.6 : gap);
    return c;
  });

  ms.forEach((m, i) => {
    const it = items[i];
    const t0 = i * stagger;
    const a = easeOutCubic(clamp((p.lt - t0) / 0.4));
    if (i > 0) {
      const ka = easeOutCubic(clamp((p.lt - t0 + 0.2) / 0.3));
      if (ka > 0) {
        const pm = ms[i - 1];
        const pad = size * 0.4;
        if (col_) drawArrow(ctx, 0, centers[i - 1] + pm.h / 2 + pad * 0.6, 0, centers[i] - m.h / 2 - pad * 0.6, arrowC, ka);
        else drawArrow(ctx, centers[i - 1] + pm.w / 2 + pad, 0, centers[i] - m.w / 2 - pad, 0, arrowC, ka);
      }
    }
    if (a <= 0) return;
    const isActive = i === active;
    const ic = it.color ? col(it.color, th, th.text) : null;
    const accentC = ic || th.accent2;
    ctx.save();
    ctx.globalAlpha *= a;
    const off = (1 - a) * size * 0.6;
    drawPill(ctx, col_ ? 0 : centers[i], col_ ? centers[i] : off, {
      text: it.text,
      size,
      icon: it.icon || el.icon || 'none',
      textColor: isActive || ic ? lighten(accentC, 0.25) : fade(th.text, 0.85),
      iconColor: accentC,
      fill: isActive ? fade(accentC, 0.16) : col(el.fill, th, 'rgba(255,255,255,0.07)'),
      stroke: isActive || ic ? fade(accentC, 0.6) : col(el.stroke, th, fade(th.text, 0.22)),
    }, p.lt - t0, m);
    ctx.restore();
  });
}

// ---------------------------------------------------------------- dışa aktarım
export const DRAWERS = {
  label: drawLabel,
  panel: drawPanel,
  clock: drawClock,
  spectrum: drawSpectrum,
  sine: drawSine,
  readout: drawReadout,
  bracket: drawBracket,
  badge: drawBadge,
};

// LLM plan istemine eklenebilecek kısa DSL belgesi (bir satır = bir tür).
export const HUD_DOC = `- label: küçük cam etiket {text, size=30, color, fill, stroke, icon:'none'|'dot'|'rec'|'eye'|'check'|'clock'|'warn'|'pin'|'coin'|'star', solid:true (dolu hap), toX,toY (mutlak tuval noktası; oraya ince çizgi çizilir)}
- panel: cam HUD kartı, yalnızca çerçeve {w=820,h=860,title, rec:true (yanıp sönen REC), bars:true (sinyal), brackets:true (köşe parantez), scan:true (tarama), tint:'accent' (renk tonu), footer, radius=36, fill, stroke}
- clock: analog kadran {r=110, speed=0.25 (tur/sn, 0=donmuş), toSpeed+duration (yavaşlar/hızlanır), title (üstte), label (altta dolu hap, örn. "yavaş"), color}
- spectrum: mavi→mor→kırmızı çubuk {w=760,h=30, from=0.08 → value=0.82 (0..1) duration=2.2, leftLabel,rightLabel, markerLabel, showValue:true (%), stops:[renkler]}
- sine: hareketli dalga {w=760, amp=60, wavelength=150 → toWavelength (gerilir) duration=2.6, color → toColor, lineWidth=5, speed=0.6, label (altta)}
- readout: sayısal gösterge {label, from=0, to=100, decimals, prefix ('%' TR), suffix (' km'), duration=2, size=72, w (verilirse satır düzeni: etiket solda, değer sağda), bar:false, max}
- bracket: vizör köşeleri, kilitlenir+nabız {w=300,h=300, color, cross:true, label (sol üstte)}
- badge: okla bağlı hap akışı {items:["yavaşlar","kızarır","kaybolur"] veya [{text,icon,color}], size=30, stagger=0.45, active (vurgulu indeks), direction:'row'|'column', maxWidth=960}`;
