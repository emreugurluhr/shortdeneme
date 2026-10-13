// Anahtar kare (keyframe) yardımcıları. Bir öğe alanı düz değer ya da
// [[t, değer], [t, değer, 'lin'|'step'], ...] dizisi olabilir.
//   kv(v, t): t anındaki değer. İlk anahtardan önce ilk değer, sonuncudan sonra son değer
//   tutulur; aradaki sayılar smoothstep ile (3. alan 'lin' → doğrusal, 'step' → basamak)
//   geçer. Yazı değerleri anahtar anında basamakla değişir; renkler 0.4 sn'de karışır.
// Saf ve belirlenimcidir.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

export function isKeys(v) {
  return Array.isArray(v) && v.length > 0 && v.every((e) => Array.isArray(e) && e.length >= 2 && Number.isFinite(Number(e[0])));
}

const COLOR_CACHE = new Map();
export function parseColor(c) {
  if (typeof c !== 'string') return null;
  if (COLOR_CACHE.has(c)) return COLOR_CACHE.get(c);
  let out = null;
  const s = c.trim().toLowerCase();
  let m;
  if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    if (h.length === 6 || h.length === 8) {
      out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
  } else if ((m = /^rgba?\(([^)]+)\)$/.exec(s))) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) out = [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
  }
  if (COLOR_CACHE.size > 1024) COLOR_CACHE.clear();
  COLOR_CACHE.set(c, out);
  return out;
}

export function mixColor(c1, c2, t) {
  const a = parseColor(c1), b = parseColor(c2);
  if (!a || !b) return t < 0.5 ? c1 : c2;
  return `rgba(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))},${+lerp(a[3], b[3], t).toFixed(3)})`;
}

export function fadeColor(c, a) {
  const p = parseColor(c);
  if (!p) return c;
  return `rgba(${p[0]},${p[1]},${p[2]},${+(p[3] * a).toFixed(3)})`;
}

const COLOR_FADE = 0.4;

export function kv(v, t) {
  if (!isKeys(v)) return v;
  const n = v.length;
  if (n === 1) return v[0][1];
  const first = v[0][1];
  if (typeof first === 'number' || (typeof first === 'string' && first.trim() !== '' && Number.isFinite(Number(first)) && !parseColor(first))) {
    const T = (i) => Number(v[i][0]);
    const V = (i) => Number(v[i][1]);
    if (t <= T(0)) return V(0);
    if (t >= T(n - 1)) return V(n - 1);
    let i = 0;
    while (i < n - 2 && t >= T(i + 1)) i++;
    const t0 = T(i), t1 = T(i + 1);
    if (t1 <= t0) return V(i + 1);
    const mode = v[i + 1][2] || v[i][2];
    const u = clamp((t - t0) / (t1 - t0));
    if (mode === 'step') return u < 1 ? V(i) : V(i + 1);
    return lerp(V(i), V(i + 1), mode === 'lin' ? u : smooth(u));
  }
  // yazı / renk: son geçilen anahtar; renkte bir öncekinden yumuşak geçiş
  let j = -1;
  for (let i = 0; i < n; i++) if (t >= Number(v[i][0])) j = i;
  if (j < 0) return v[0][1];
  const cur = v[j][1];
  if (j > 0 && parseColor(cur) && parseColor(v[j - 1][1])) {
    const u = (t - Number(v[j][0])) / COLOR_FADE;
    if (u < 1) return mixColor(v[j - 1][1], cur, smooth(clamp(u)));
  }
  return cur;
}

// Basamaklı (yazı) anahtarlar için geçiş bilgisi: { cur, prev, since } (since: son anahtardan beri sn)
export function kvStep(v, t) {
  if (!isKeys(v)) return { cur: v, prev: v, since: Infinity };
  let j = -1;
  for (let i = 0; i < v.length; i++) if (t >= Number(v[i][0])) j = i;
  if (j < 0) return { cur: v[0][1], prev: v[0][1], since: Infinity };
  return { cur: v[j][1], prev: j > 0 ? v[j - 1][1] : v[j][1], since: j > 0 ? t - Number(v[j][0]) : Infinity };
}
