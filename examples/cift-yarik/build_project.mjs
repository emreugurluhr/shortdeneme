// Builds the "Çift Yarık" Shorts project (ONE RIG, THREE ERAS) and writes project.json.
// usage: node build_project.mjs            (writes project.json + prints lint notes)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { segmentsFromWords } from '/home/user/shortdeneme/js/script.js';
import { lintPlan } from '/home/user/shortdeneme/js/layout.js';
import { geomOf, presetOf, fringeXs } from '/home/user/shortdeneme/js/elements/slit.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const align = JSON.parse(fs.readFileSync(path.join(DIR, 'align.json'), 'utf8'));
const DURATION = 68.15; // 0.6 s silent hold after the question

// ------------------------------------------------------------------ words
// Same cleanup as js/script.js displayOf, but Turkish apostrophes ("1801'de") and "?" are kept.
const displayOf = (t) => t.replace(/[.,;:…"“”()«»!]/g, '').replace(/^[-–—]+|[-–—]+$/g, '').trim();
// energy-envelope corrections (10 ms RMS of voice.mp3): Jönsson line, "noktalar/göründü", "Gerçeklik…gibi"
const FIX = {
  45: [23.81, 25.1], 46: [25.22, 25.48], 47: [25.54, 26.08], 48: [26.26, 26.98], 49: [26.98, 27.24], 50: [27.24, 27.49], 51: [27.55, 28.08], 52: [28.08, 28.3],
  62: [34.81, 35.04], 63: [35.06, 35.76],
  114: [60.48, 60.98], 115: [61.28, 61.8], 116: [61.82, 62.26], 117: [62.28, 62.5],
};
const words = align.words.map((w, i, all) => {
  const [st, en] = FIX[i] || [w.start, w.end];
  const out = { text: w.text, display: displayOf(w.text), start: +st.toFixed(3), end: +en.toFixed(3) };
  if (w.lineEnd || /…$/.test(w.text) || /[.!?]["”']?$/.test(w.text)) out.breakAfter = true;
  out.sentenceEnd = !!w.lineEnd || i === all.length - 1;
  return out;
}).filter((w) => w.display);
const segments = segmentsFromWords(words);

// ------------------------------------------------------------------ helpers
// bigger rig: screen lower-centre, slits at 540, source 230 (graph bottom ≤ 1277 stays above the captions at 1.0)
const GEOM = { srcX: 540, srcY: 230, barrierY: 540, thick: 26, slits: [480, 600], a: 22, screenY: 1000, x0: 90, x1: 990 };
const G = geomOf(GEOM);
const CYAN = '#3fd8ff', AMBER = '#ffbf47', MAG = '#ff4d8d', RED = '#ff4d6d', GOLD = 'rgba(255,214,140,0.6)';
const cam = (a, b, at, dur, ease = 'inOut') => ({ from: { cx: a[0], cy: a[1], zoom: a[2] }, to: { cx: b[0], cy: b[1], zoom: b[2] }, at, dur, ease });
const hold = (a) => cam(a, a, 0, 0.1);
const r2 = (v) => Math.round(v * 1000) / 1000;

// physics: electrons ≈0.57× the light wavelength (more, finer fringes inside the beam overlap)
const PHYS = { beamSigma: 105, electron: { lambda: 16 } };
const LAM_E = presetOf('electron', PHYS).lambda;
const eFr = fringeXs(LAM_E, G).filter((f) => f.m >= -2 && f.m <= 2).map((f) => r2(f.x)); // [-2..2]
const FR = (m) => eFr[m + 2];
const BY = GEOM.barrierY, SY = GEOM.screenY, H0 = 150;
const SCREEN_TOP = SY - H0 / 2;

// ------------------------------------------------------------------ stage (absolute seconds)
const wash = (fill, opacity) => ({ type: 'shape', shape: 'rect', x: 540, y: 900, w: 4200, h: 5200, radius: 0, fill, in: 'none', opacity });
const bracketAt = (slit, at, until, color = 'accent', extra = {}) => ({ type: 'bracket', x: GEOM.slits[slit], y: BY, w: 70, h: 70, color, at, inDur: 0.12, until, outDur: 0.12, ...extra });
// "an": one particle that passes the right slit exactly on the word
const anShot = (() => {
  const l1 = Math.hypot(GEOM.slits[1] - GEOM.srcX, BY - GEOM.srcY), l2 = Math.hypot(690 - GEOM.slits[1], SY - BY);
  const t0 = 46.0, tp = 46.32;
  return { t: t0, mode: 'particle', slit: 1, landX: 690, landT: r2(t0 + (tp - t0) * (l1 + l2) / l1) };
})();
const STAGE = [
  // lab haze: darken the abstract preset, then tint per era (two states only: watched = magenta, unwatched = cyan)
  wash('#020308', [[0, 0.42], [44.13, 0.42], [44.5, 0.55], [51.79, 0.55], [52.3, 0.42], [63.12, 0.42], [63.5, 0.55], [64.6, 0.55], [65.1, 0.42]]),
  wash(AMBER, [[0, 0.05], [21.02, 0.05], [21.8, 0], [57.17, 0], [57.4, 0.05], [58.3, 0.05], [58.6, 0]]),
  wash(CYAN, [[21.02, 0], [21.8, 0.05], [44.13, 0.05], [44.5, 0], [51.8, 0], [52.4, 0.05], [57.17, 0.05], [57.4, 0], [58.46, 0], [58.7, 0.05], [61.28, 0.05], [61.45, 0], [64.47, 0], [65.0, 0.05]]),
  wash(MAG, [[44.13, 0], [44.5, 0.06], [51.8, 0.06], [52.4, 0], [61.28, 0], [61.45, 0.07], [64.47, 0.07], [65.0, 0]]),
  { type: 'particles', x: 540, y: 700, w: 900, h: 900, count: 26, size: 2, color: 'rgba(255,220,160,0.3)', in: 'none', opacity: [[0, 1], [21.02, 1], [21.8, 0]] },
  { type: 'particles', x: 540, y: 700, w: 900, h: 900, count: 26, size: 2, color: 'rgba(170,220,255,0.3)', in: 'none', at: 57.17, opacity: [[57.17, 0], [57.8, 1], [60.5, 1], [61.0, 0]] },

  { type: 'wavefield', x: 540, y: 620, geom: GEOM, physics: PHYS, in: 'none', preset: [[0, 'light'], [21.3, 'electron'], [57.17, 'light'], [58.46, 'electron']],
    color: [[0, AMBER], [21.3, CYAN], [57.17, AMBER], [58.46, CYAN]],
    // frame 0: the experiment already running (hook); the field below the slits resets in the 3.99 pause
    incident: [[0, 1], [21.02, 1], [21.3, 0], [57.17, 0], [57.4, 0.8], [58.3, 0.8], [58.46, 0]], incidentFront: -10,
    front: [[0, 700], [4.25, 700], [4.26, 0], [4.7, 120], [6.78, 150], [7.08, 490], [7.9, 700]],
    amp: [[0, 1], [3.9, 1], [4.25, 0], [4.5, 0.4], [6.78, 0.4], [7.0, 1], [17.3, 1], [17.65, 0.3], [18.48, 0.3], [18.85, 1.15], [19.87, 1.15], [20.1, 1.3], [20.6, 1], [21.02, 1], [21.3, 0],
      [51.79, 0], [52.1, 0.85], [57.17, 0.85], [60.48, 0.7], [64.47, 0.7], [65.0, 1], [66.31, 1], [66.7, 0.45]],
    beam: [[26.26, 0], [26.55, 0.75], [28.95, 0.75], [29.3, 0]],
    coherence: [[0, 1], [61.28, 1], [61.45, 0], [64.47, 0], [64.97, 1]],
    hyper: { anti: [[8.69, 0], [9.3, 0.35], [12.75, 0.35], [13.2, 0]], node: [[9.48, 0], [10.0, 0.85], [12.75, 0.85], [13.2, 0]], sweep: [{ t: 14.59, dur: 0.45 }] },
    glints: [[13.61, 0], [13.9, 1], [14.8, 1], [15.2, 0]],
    packets: [{ t0: 41.47, t1: 43.12, sigma: 50, amp: 1.3 }] },

  { type: 'detector', x: 540, y: SY, geom: GEOM, physics: PHYS, in: 'none', preset: [[0, 'light'], [22.6, 'electron'], [57.17, 'light'], [58.46, 'electron']], white: true,
    h: [[0, H0], [33.3, H0], [33.9, 250], [39.9, 250], [40.3, H0], [66.5, H0], [66.9, 180]],
    opacity: [[0, 1], [40.2, 1], [40.5, 0.3], [42.8, 0.3], [43.05, 1]],
    color: [[0, AMBER], [21.3, CYAN], [57.17, AMBER], [58.46, CYAN], [61.3, MAG], [64.6, CYAN]],
    // classical expectation: two warm light bands ("iki" left, "çizgi" right); red in the particle verdict
    ghost: [[5.16, 0], [5.3, 1], [5.77, 1], [5.95, 0.6], [6.13, 1], [6.31, 0.6], [6.5, 1], [7.08, 1], [7.2, 0], [17.72, 0], [17.9, 1], [18.17, 1], [18.48, 0]],
    ghostDelay: 0.3, ghostW: 46, ghostFill: 0.85, ghostGlow: 1.0, ghostOutline: false,
    ghostColor: [[0, 'rgba(255,226,170,0.9)'], [18.17, RED]],
    intensity: [[0, 1.15], [3.6, 1.15], [3.99, 0], [7.08, 0], [7.1, 1], [9.96, 1], [10.6, 1.15], [17.3, 1.15], [17.65, 0.7], [18.48, 0.7], [18.8, 1.15], [19.87, 1.15], [20.1, 1.35], [20.6, 1.15], [21.3, 1.0], [22.5, 0],
      [26.3, 0], [28.08, 1], [31.27, 1], [31.77, 0],
      [57.17, 0], [57.3, 1.15], [58.3, 0.85], [58.46, 0.45], [58.75, 1.15], [59.6, 1]],
    reveal: { t: 7.08, dur: 0.25, from: 6.0 },
    clearAt: [{ t: 3.99, dur: 0.3 }, { t: 23.8, dur: 0.5 }, { t: 31.27, dur: 0.5 }],
    ticks: [[10.59, 0], [11.3, 1], [12.75, 1], [13.2, 0]],
    coherence: [[46.85, 1], [47.35, 0], [51.79, 0], [52.3, 1], [61.3, 1], [61.45, 0], [64.47, 0], [64.97, 1]],
    split: [[66.78, 0], [67.0, 1]], splitColor: MAG,
    dim: [[40.12, 1], [40.4, 0.4], [43.0, 0.4], [43.2, 1], [48.4, 1], [48.7, 0.5], [50.9, 0.5], [51.2, 1]],
    runs: [
      // Tonomura: "tek tek" sweep wipes Jönsson, then the electrons arrive one per word
      { id: 'A', keys: [[31.28, 0], [31.57, 1], [31.73, 2], [33.56, 3], [33.87, 4], [34.34, 5], [34.81, 6], [35.08, 7], [35.76, 12], [37.1, 270], [38.15, 2000], [39.4, 160000]],
        coherence: 1, color: CYAN, fadeAt: 46.85, fadeTo: 0, fadeDur: 0.5, shatter: true },
      // measured: two lumps, fully formed by the end of "kayboldu"
      { id: 'B', keys: [[46.85, 0], [47.18, 3000], [47.68, 9000], [51.29, 12000]], coherence: 0, color: '#ff7fb0', fadeAt: 51.79, fadeTo: 0, fadeDur: 0.3 },
      // unwatched again: fringes rebuild on "İzlenmediğinde … dalga"
      { id: 'C', keys: [[51.9, 0], [52.66, 5000], [53.54, 12000]], coherence: 1, color: CYAN, fadeAt: 57.0, fadeTo: 0, fadeDur: 0.3 },
    ],
    hitScale: [[0, 1.8], [33.4, 3], [36.25, 3], [36.45, 1.5]], dotR0: 7,
    extraDots: [{ t: 22.42, x: FR(-1), big: true, until: 23.8 }, { t: 22.59, x: FR(2), big: true, until: 23.8 },
      { t: 43.12, x: FR(1), big: true, until: 44.13 }, { t: 50.12, x: 690, solid: true, until: 51.79 }],
    compare: [[54.61, 0], [55.0, 1], [56.8, 1], [57.17, 0]], compareTags: ['ışık', 'elektron'], compareTagSize: 28,
    readoutSize: 40, visFrom: 'coherence',
    showCount: 'A', countVis: [[31.0, 0], [31.3, 1], [40.12, 1], [40.4, 0]],
    showVis: [[38.3, 0], [38.6, 1], [40.12, 1], [40.4, 0], [45.6, 0], [45.9, 1], [51.79, 1], [52.1, 0]],
    graph: { h: 140, gap: 12, mode: [[0, 'curve'], [30, 'hist'], [38.15, 'both'], [52.9, 'curve']],
      draw: [{ t: 14.59, dur: 0.85 }, { t: 38.15, dur: 0.8 }, { t: 52.96, dur: 0.5 }],
      color: [[0, AMBER], [21.3, CYAN], [47.0, MAG], [52.9, CYAN]],
      // only while it carries information and the camera keeps it above the captions
      opacity: [[0, 0], [14.35, 0], [14.59, 1], [21.02, 1], [21.35, 0], [37.3, 0], [37.7, 1], [40.12, 1], [40.45, 0], [46.3, 0], [46.7, 1], [51.79, 1], [52.0, 0], [52.6, 0], [52.96, 1], [57.17, 1], [57.5, 0]] } },

  { type: 'barrier', x: 540, y: BY, w: 940, geom: GEOM, in: 'none',
    color: [[0, AMBER], [21.3, CYAN], [57.17, AMBER], [58.46, CYAN]], glow: [[0, 1], [21.0, 1], [21.4, 0.6], [63.12, 0.6], [64.4, 0.45], [66.6, 0.45], [66.9, 1], [67.3, 0.6], [67.7, 1]],
    pulses: [{ t: 2.4, slit: 0 }, { t: 2.72, slit: 1 }, { t: 13.33, slit: 0 }, { t: 13.61, slit: 1 }, { t: 26.98, slit: 0 }, { t: 27.24, slit: 1 }, { t: 41.47, slit: 'both' },
      { t: 57.17, slit: 'both' }, { t: 66.0, slit: 0 }, { t: 66.31, slit: 1 }, { t: 66.78, slit: 'both' }] },

  { type: 'emitter', id: 'gun', x: 540, y: GEOM.srcY, geom: GEOM, in: 'none', kind: [[0, 'lamp'], [21.25, 'gun'], [57.17, 'lamp'], [58.46, 'gun']], kindDur: 0.28, flareV: 0.45,
    color: CYAN, particleColor: '#ff7fb0', ghostSize: 12, ghostColor: '#ffd98a',
    beam: [[26.26, 0], [26.55, 0.75], [28.95, 0.75], [29.3, 0]],
    shots: [
      { t: 17.35, mode: 'ghost', slit: 0, flight: 0.6 }, { t: 17.45, mode: 'ghost', slit: 1, flight: 0.6 },
      { t: 17.55, mode: 'ghost', slit: 0, flight: 0.6 }, { t: 17.65, mode: 'ghost', slit: 1, flight: 0.6 },
      // "tek tek": one electron per word, muzzle flash, lands with a spark
      { t: 21.52, mode: 'wave', flight: 0.9, landX: FR(-1), landT: 22.42, muzzle: true, size: 12, tail: 40 },
      { t: 21.69, mode: 'wave', flight: 0.9, landX: FR(2), landT: 22.59, muzzle: true, size: 12, tail: 40 },
      { t: 21.86, mode: 'hover', hoverY: BY - 50, hoverAt: 22.52, fadeAt: 23.9 },
      // one electron: compact, slow, splits toward both slits
      { t: 40.25, mode: 'wave', hero: true, barrierT: 41.47, landX: FR(1), landT: 43.12, size: 14, tail: 40, muzzle: true },
      anShot,
      { t: 48.6, mode: 'particle', hero: true, slit: 1, landX: 690, landT: 50.12 },
      // watched by the viewer: single particles through one slit
      { t: 61.5, mode: 'particle', slit: 0, flight: 0.55 }, { t: 61.8, mode: 'particle', slit: 1, flight: 0.55 },
      { t: 62.45, mode: 'particle', slit: 1, flight: 0.55 }, { t: 62.75, mode: 'particle', slit: 0, flight: 0.55 },
      { t: 65.54, mode: 'hover', hero: true, hoverY: BY - 40, hoverAt: 66.0, splitAt: 66.78, muzzle: true },
    ],
    link: [{ run: 'A', count: 12, flight: 0.3, mode: 'wave', streamFrom: 36.6, streamAlpha: 0.25 },
      { run: 'B', count: 0, flight: 0.45, mode: 'particle', color: '#ff7fb0', streamFrom: 47.0, streamAlpha: 0.3 }] },

  // which-path detector: slides in on "Ama"
  { type: 'eye', x: 860, y: BY - 130, at: 44.13, in: 'slideLeft', inDur: 0.35, w: 240, open: [[44.13, 0.5], [45.6, 0.5], [45.73, 1], [51.79, 1], [52.14, 0]],
    scan: [[45.73, 0], [45.85, 1], [49.44, 1], [49.6, 1.35], [50.5, 1.35], [50.8, 1], [51.79, 1], [52.0, 0]], scanTo: { x: 540, y: BY, spread: 110 },
    look: 'track:emitter', tether: true, opacity: [[53.3, 1], [53.6, 0]] },
  { type: 'label', text: 'ÖLÇÜM', icon: 'rec', solid: true, fill: MAG, color: '#ffffff', size: 28, x: 860, y: BY - 32, at: 45.73, until: 51.79, outDur: 0.35, in: 'pop' },

  // superposition mini-graph (screen space, below the Shorts header)
  { type: 'superpose', fixed: true, x: 540, y: 165, w: 540, h: 120, at: 8.69, until: 10.5, outDur: 0.3,
    phase: 0, toPhase: Math.PI, phaseAt: 0.79, phaseDur: 0.35, colorA: AMBER, colorB: '#ffe9b8', colorSum: '#ffffff' },

  // the viewer's eye: opens on "bakışınla" and stays open (watched) until "bakmasan"; looks at you on "düşünsene"
  { type: 'eye', x: 830, y: BY - 130, at: 60.48, w: 220,
    open: [[60.48, 0], [61.28, 0], [61.45, 1], [64.47, 1], [64.97, 0]],
    scan: [[61.28, 0], [61.45, 1], [63.12, 1], [63.35, 0]], scanTo: { x: 540, y: BY, spread: 110 },
    look: { tx: [[0, 540], [63.2, 540], [63.5, 830]], ty: [[0, BY], [63.2, BY], [63.5, BY - 130]] }, opacity: [[65.3, 1], [65.6, 0]] },

  // "birden": both slits marked (spans the 42.22 camera cut)
  bracketAt(0, 41.9, 42.95), bracketAt(1, 41.9, 42.95),
];

// ------------------------------------------------------------------ scenes
// Element `at` / `until` are scene-local.
const SC = [];
function scene(start, camera, build) {
  const els = [];
  const L = (abs) => r2(abs - start);
  build?.(els, L);
  SC.push({ start, transition: 'none', camera, elements: els });
}
const ray = (x1, y1, x2, y2, at, until, stroke, extra = {}) => ({ type: 'shape', shape: 'line', x: x1, y: y1, x2, y2, stroke, lineWidth: 2, in: 'draw', inDur: 0.22, at, until, outDur: 0.15, ...extra });
const raysJ = (j) => (at, until, stroke, extra) => [
  ray(GEOM.srcX, GEOM.srcY, GEOM.slits[j], BY, at, until, stroke, extra), ray(GEOM.slits[j], BY, G.proj[j], SCREEN_TOP, r2(at + 0.2), until, stroke, extra),
];
const rays = raysJ(0), raysR = raysJ(1);
// corner inset: portrait on one side of the gun, year + place on the other (never over the rig)
const inset = (artId, year, place, side, at, until, o = {}) => {
  const cx = side < 0 ? 245 : 835, tx = side < 0 ? 825 : 255;
  const inA = o.in || (side < 0 ? 'slideRight' : 'slideLeft');
  const d = o.in === 'none' ? 0 : 1;
  return [
    { type: 'panel', fixed: true, x: cx, y: 340, w: 300, h: 370, brackets: true, stroke: o.stroke || 'accent', fill: 'rgba(6,10,20,0.92)', at, until, in: inA, inDur: 0.4, outDur: 0.4, loop: 'float', loopSpeed: 0.5 },
    { type: 'art', id: artId, fixed: true, x: cx, y: 334, w: 260, h: 312, at, until, in: inA, inDur: 0.4, outDur: 0.4, loop: 'float', loopSpeed: 0.5 },
    { type: 'text', text: year, fixed: true, x: tx, y: 290, size: 104, font: 'number', weight: 700, color: o.yearColor || '#d8f6ff', glow: o.glow || 'accent', at: r2(at + 0.1 * d), until, in: o.in === 'none' ? 'none' : 'fade', outDur: 0.4 },
    { type: 'label', text: place, icon: 'pin', size: 28, fixed: true, x: tx, y: 385, at: r2(at + 0.25 * d), until, in: o.in === 'none' ? 'none' : undefined, outDur: 0.4 },
  ];
};

// 0 · hook: the whole experiment already running (lamp → slits → gold fringes), Young inset, push in
scene(0, cam([540, 740, 1.0], [540, 790, 1.16], 0, 3.9, 'linear'), (e) => {
  e.push(
    ...inset('young', '1801', 'LONDRA', -1, 0, 3.3, { in: 'none', stroke: 'accent2', yearColor: '#ffe2a8', glow: 'accent2' }),
    { type: 'starburst', x: GEOM.srcX, y: GEOM.srcY, r: 400, count: 16, color: 'rgba(255,200,120,0.22)', speed: 0.05, at: 0, in: 'none', until: 3.0, outDur: 0.6, ring: false },
  );
});
// 1 · expectation: pull back while the screen wipes; warm bands + straight rays
scene(3.99, cam([540, 790, 1.16], [540, 840, 1.0], 0, 0.7), (e, L) => {
  e.push(...rays(L(5.16), L(7.08), GOLD), ...raysR(L(5.46), L(7.08), GOLD));
});
// 2 · surprise on "karşısında": fringes punch in
scene(7.08, cam([540, 840, 1.0], [540, 840, 1.12], 0, 0.3, 'out'), (e) => {
  e.push({ type: 'flash', at: 0, color: '#ffd98a', opacity: 0.25, duration: 0.25 }, { type: 'shake', at: 0, amp: 6, duration: 0.25 });
});
// 3 · counting stripes: pan along the screen on "aydınlık-karanlık"
scene(9.96, hold([540, 840, 1.12]));
scene(10.59, cam([540, 840, 1.12], [420, 880, 1.32], 0, 0.35, 'out'));
scene(10.94, cam([420, 880, 1.32], [660, 880, 1.32], 0, 0.85));
scene(11.85, cam([660, 880, 1.32], [540, 860, 1.1], 0, 0.8));
// 4 · why: two waves (slit pulses on "iki" / "dalga"), sweep along the bright hyperbolas on "girişim"
scene(12.75, cam([540, 860, 1.1], [540, 920, 1.0], 0, 1.4), (e, L) => {
  e.push({ type: 'label', text: 'Δx = λL / d', size: 28, x: 870, y: 1120, at: L(15.02), until: L(16.75) });
});
// 5 · verdict: wave (particle model collapses)
scene(16.75, cam([540, 920, 1.0], [540, 930, 1.06], 0, 4.2), (e, L) => {
  const R = { in: 'none', glow: true, lineWidth: 6, outDur: 0.2 };
  const X = (j, at) => ({ type: 'label', text: '', icon: 'x', color: RED, stroke: RED, iconColor: RED, size: 34, x: r2(G.proj[j]), y: SCREEN_TOP - 32, in: 'stamp', at, until: L(18.6), outDur: 0.2 });
  e.push(...rays(L(17.72), L(18.17), GOLD, { outDur: 0.01 }), ...raysR(L(17.72), L(18.17), GOLD, { outDur: 0.01 }),
    ...rays(L(18.17), L(18.48), RED, R).map((r) => ({ ...r, at: L(18.17) })), ...raysR(L(18.17), L(18.48), RED, R).map((r) => ({ ...r, at: L(18.17) })),
    X(0, L(18.17)), X(1, L(18.25)),
    { type: 'flash', at: L(18.17), color: RED, opacity: 0.14, duration: 0.3 },
    { type: 'shake', at: L(18.17), amp: 10, duration: 0.3 });
});
// 6 · era shift: lamp → gun under a cyan flash; gold afterglow fades while "tek tek" electrons land
scene(21.02, cam([540, 930, 1.06], [540, 810, 1.2], 0.3, 1.4), (e, L) => {
  e.push(
    { type: 'flash', at: L(21.25), color: CYAN, opacity: 0.2, duration: 0.3 },
    { type: 'bracket', x: GEOM.slits[0], y: BY, w: 70, h: 70, color: 'accent', at: L(22.52), loop: 'blink', until: L(23.81) },
    { type: 'bracket', x: GEOM.slits[1], y: BY, w: 70, h: 70, color: 'accent', at: L(22.77), loop: 'blink', until: L(23.81) },
  );
});
// 7 · 1961 Jönsson (inset; full rig stays visible, drift toward the card)
scene(23.81, cam([540, 810, 1.2], [505, 890, 1.02], 0, 1.2), (e, L) => {
  e.push(
    ...inset('jonsson', '1961', 'TÜBİNGEN', -1, 0.1, L(26.3)),
    { type: 'flash', at: 0.1, color: CYAN, opacity: 0.2, duration: 0.25 },
    { type: 'label', text: '50 kV', size: 28, x: 860, y: 740, at: L(27.6), until: L(28.95) },
    { type: 'label', text: 'λ ≈ 5 pm', size: 28, x: 860, y: 792, at: L(27.75), until: L(28.95) },
  );
});
// 8 · 1989 Tonomura (mirrored inset); Jönsson's fringes stay until "tek tek" sweeps them
scene(28.95, cam([505, 890, 1.02], [575, 900, 1.04], 0, 4.6), (e, L) => {
  e.push(
    ...inset('tonomura', '1989', 'HITACHI · TOKYO', 1, 0.05, L(31.27)),
    { type: 'flash', at: 0.05, color: CYAN, opacity: 0.2, duration: 0.25 },
    { type: 'label', text: 'biprizma ≈ çift yarık', size: 28, fixed: true, x: 250, y: 470, at: L(32.05), until: L(33.56) },
  );
});
// 9 · random dots: tall screen, big single hits
scene(33.56, cam([575, 900, 1.04], [540, 940, 1.25], 0, 0.8));
// 10 · accumulation, pull back to show screen + histogram
scene(36.25, cam([540, 940, 1.25], [540, 960, 1.0], 0, 1.4), (e, L) => {
  e.push({ type: 'flash', at: L(38.96), color: CYAN, opacity: 0.15, duration: 0.45 });
});
// 11 · one electron, both slits: close on the slits
scene(40.12, cam([540, 960, 1.0], [540, 580, 1.7], 0.2, 1.1));
// 11b · ease out on "birden" to see it land on a bright fringe ("gibi")
scene(42.22, cam([540, 580, 1.7], [540, 900, 1.05], 0, 0.5));
// 12 · measurement kills the pattern
scene(44.13, cam([540, 900, 1.05], [540, 930, 1.0], 1.2, 1.2), (e, L) => {
  e.push(
    bracketAt(0, L(44.42), L(44.71), MAG), bracketAt(1, L(44.71), L(45.15), MAG), bracketAt(0, L(45.15), L(45.5), MAG),
    { type: 'flash', at: L(46.32), color: MAG, opacity: 0.22, duration: 0.3 },
    { type: 'shake', at: L(46.32), amp: 10, duration: 0.35 },
    { type: 'flash', at: L(47.18), color: MAG, opacity: 0.2, duration: 0.2 },
  );
});
// 13 · watched = particle
scene(48.37, cam([540, 930, 1.0], [540, 920, 1.04], 0, 2.9));
// 14 · unwatched = wave
scene(51.79, cam([540, 920, 1.04], [540, 950, 1.0], 0, 1.75));
// 15 · matter is a wave too
scene(54.1, cam([540, 950, 1.0], [540, 970, 1.06], 0, 3.07), (e, L) => {
  e.push(
    { type: 'label', text: 'C₆₀ · 1999', size: 28, x: 850, y: 760, at: 0, until: L(57.0) },
    { type: 'label', text: 'de Broglie · 1924', size: 28, color: 'rgba(255,255,255,0.7)', fixed: true, x: 540, y: 335, at: 0.15, until: 3.0 },
    { type: 'text', text: '*λ* = h / p', fixed: true, x: 540, y: 428, size: 96, font: 'display', weight: 800, color: '#ffffff', glow: 'accent', until: 3.0 },
  );
});
// 16 · most famous mystery: recap light (lamp, gold) → electrons (gun, cyan); push in
scene(57.17, cam([540, 970, 1.06], [540, 880, 1.1], 0, 3.31), (e, L) => {
  e.push(
    { type: 'flash', at: L(58.46), color: CYAN, opacity: 0.15, duration: 0.3 },
    { type: 'starburst', x: 540, y: BY, r: 420, count: 16, color: 'rgba(63,216,255,0.2)', speed: 0.05, at: L(58.46), inDur: 0.5, until: 3.31, outDur: 0.3, ring: false },
  );
});
// 17 · your gaze flips reality (watched from "bakışınla")
scene(60.48, cam([540, 880, 1.1], [540, 870, 1.12], 0, 2.64));
// 18 · "Bir düşünsene…": push into the eye, it looks at you
scene(63.12, cam([540, 870, 1.12], [830, BY - 130, 2.0], 0.12, 0.5));
// 19 · "Sen bakmasan": eye closes, pull back, waves and fringes return → split screen + "?"
scene(64.26, cam([830, BY - 130, 2.0], [540, 800, 1.12], 0.35, 0.7), (e, L) => {
  const alt = [];
  for (let k = 0, t = 66.78; t < 68.15; k++, t = r2(t + 0.25)) alt.push(bracketAt(k % 2, L(t), L(Math.min(68.15, t + 0.25)), 'accent', { inDur: 0.06, outDur: 0.06 }));
  e.push(
    bracketAt(0, L(66.0), L(66.31), 'accent', { inDur: 0.2, outDur: 0.2 }),
    bracketAt(1, L(66.31), L(66.78), 'accent', { inDur: 0.2, outDur: 0.2 }),
    ...alt,
    { type: 'text', text: '?', fixed: true, x: 540, y: 880, size: 260, weight: 900, color: '#d8f6ff', glow: 'accent', at: L(66.84), in: 'pop', inDur: 0.35 },
  );
});

// ------------------------------------------------------------------ arts
const artIdx = JSON.parse(fs.readFileSync(path.join(DIR, 'art/art.json'), 'utf8'));
const PROMPTS = {
  young: 'Stylised flat-vector Regency-era natural philosopher bust in an amber oval cameo (evoking Thomas Young, 1801)',
  jonsson: 'Stylised flat-vector 1960s German physicist, no glasses, short side-parted hair, dark suit and narrow tie, holding a small electron-biprism/slit plate, vacuum tubes behind, cyan duotone (evoking Claus Jönsson, 1961)',
  tonomura: 'Stylised flat-vector 1980s Japanese physicist with an electron microscope and CRT showing fringes, cyan duotone (evoking Akira Tonomura, 1989)',
};
const arts = {};
for (const [id, a] of Object.entries(artIdx)) arts[id] = { prompt: PROMPTS[id] || id, w: a.w, h: a.h, svg: fs.readFileSync(path.join(DIR, 'art', a.file), 'utf8') };

// ------------------------------------------------------------------ project
const plan = {
  theme: { bg: '#05070f', bg2: '#0b1430', grid: 'rgba(120,200,255,0.06)', text: '#f3f6ff', accent: CYAN, accent2: AMBER },
  background: 'abstract',
  ambience: null,
  stage: STAGE,
  scenes: SC,
};
const { plan: linted, notes } = lintPlan(plan, { words, duration: DURATION, types: ['wavefield', 'detector', 'barrier', 'emitter', 'eye', 'superpose'] });

const script = fs.readFileSync(path.join(DIR, 'script.txt'), 'utf8');
const project = {
  version: 1,
  topic: 'Çift yarık deneyi: Young (1801), Jönsson (1961), Tonomura (1989) ve gözlemin girişim desenini yok etmesi',
  title: 'Çift yarık: bakınca değişen gerçeklik',
  seconds: 68,
  script,
  duration: DURATION,
  words,
  segments,
  plan: process.argv.includes('--lint') ? linted : plan, // hand-authored; lint only reviewed
  arts,
  sfx: [],
  settings: { captions: true },
};
fs.writeFileSync(path.join(DIR, 'project.json'), JSON.stringify(project));
fs.writeFileSync(path.join(DIR, 'plan_raw.json'), JSON.stringify(plan, null, 1));
fs.writeFileSync(path.join(DIR, 'plan_linted.json'), JSON.stringify(linted, null, 1));
console.log('scenes', SC.length, 'stage', STAGE.length, 'words', words.length, 'segments', segments.length);
console.log('LINT NOTES:\n' + notes.join('\n'));
