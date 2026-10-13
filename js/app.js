// Shorts Atölyesi — arayüz ve üretim akışı.
import { W, H, renderFrame, buildEnv, elementStart } from './engine.js';
import { cleanForTTS, stripTags, wordsFromAlignment, estimateWords, segmentsFromWords } from './script.js';
import { textToSpeech, soundEffect, voiceName } from './eleven.js';
import { ask, askJSON, scriptPrompt, planPrompt, scenePrompt, artPrompt, extractSVG, PROVIDERS, providerConfig, listModels } from './llm.js';
import { audioCtx, decodeAudio, mixAudio, loadFonts, loadImages, svgToImage, exportVideo } from './media.js';
import { loadSettings, saveSettings, saveProject, loadProject } from './store.js';
import { demoProject } from './demo.js';

const $ = (id) => document.getElementById(id);

const state = {
  settings: loadSettings(),
  project: null,
  images: {},
  env: null,
  busy: false,
  // çözülmüş sesler (ArrayBuffer → AudioBuffer önbelleği)
  voiceBuf: null,
  sfxBufs: new Map(),
  ambienceBuf: null,
  mixed: null,
  // oynatıcı
  playing: false,
  t: 0,
  clock: null,
  source: null,
  downloadUrl: null,
};

// ---------------------------------------------------------------- yardımcılar
function fmt(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

let toastTimer;
function toast(msg, isErr = false) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('err', isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isErr ? 9000 : 4000);
}

function setStatus(n, msg, kind = '') {
  const el = $(`status${n}`);
  el.textContent = msg || '';
  el.className = `status ${kind}`;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

function requireEleven() {
  if (!state.settings.elevenKey) {
    openSettings();
    throw new Error('Önce Ayarlar’a ElevenLabs API anahtarınızı girin.');
  }
}

function requireAI() {
  const cfg = providerConfig(state.settings);
  if (!cfg.key || (cfg.kind === 'openai' && !cfg.base)) {
    openSettings();
    throw new Error(`Senaryo ve çizim için Ayarlar’a ${cfg.label} API anahtarınızı girin.`);
  }
}

async function run(label, fn) {
  if (state.busy) return;
  state.busy = true;
  updateButtons();
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), true);
  } finally {
    state.busy = false;
    updateButtons();
  }
}

function persist() {
  return saveProject(state.project);
}

// ---------------------------------------------------------------- proje → ekran
function rebuildEnv() {
  const p = state.project;
  p.settings = { captions: state.settings.captions, captionWords: Number(state.settings.captionWords) || 3 };
  state.env = buildEnv(p, state.images);
  $('seek').max = 1000;
  drawPreview(Math.min(state.t, state.env.duration));
}

function updateButtons() {
  const p = state.project;
  const b = state.busy;
  $('writeBtn').disabled = b;
  $('allBtn').disabled = b;
  $('voiceBtn').disabled = b || !$('script').value.trim();
  $('directBtn').disabled = b || !p.words?.length || p.demo;
  $('sfxBtn').disabled = b || !p.plan?.scenes?.length || p.demo;
  $('exportBtn').disabled = b || !p.plan?.scenes?.length;
  $('newBtn').disabled = b;
  document.querySelectorAll('.redo').forEach((x) => (x.disabled = b || p.demo));
  $('card1').classList.toggle('done', !!p.script);
  $('card2').classList.toggle('done', !!p.voice);
  $('card3').classList.toggle('done', !!p.plan?.scenes?.length);
}

function updateMeta() {
  const text = stripTags(cleanForTTS($('script').value));
  const words = text ? text.split(/\s+/).length : 0;
  $('wordCount').textContent = words;
  $('charCount').textContent = cleanForTTS($('script').value).length;
  $('estDur').textContent = Math.round(words / 2.3);
}

function renderAll() {
  const p = state.project;
  $('topic').value = p.topic || '';
  $('seconds').value = String(p.seconds || 60);
  $('script').value = p.script || '';
  $('badge').hidden = !p.demo;
  updateMeta();
  const audio = $('voiceAudio');
  if (p.voice?.audio) {
    if (audio.dataset.src) URL.revokeObjectURL(audio.dataset.src);
    const url = URL.createObjectURL(new Blob([p.voice.audio], { type: 'audio/mpeg' }));
    audio.src = url;
    audio.dataset.src = url;
    audio.hidden = false;
    setStatus(2, `Seslendirme hazır · ${p.duration.toFixed(1)} sn · ${p.words.length} kelime${p.voice.alignment ? '' : ' (zamanlama tahmini)'}`, 'ok');
  } else {
    audio.hidden = true;
    setStatus(2, p.demo ? 'Örnek projede ses yok; altyazı zamanları tahmini.' : '');
  }
  rebuildEnv();
  renderScenes();
  renderSfx();
  updateButtons();
}

function renderScenes() {
  const box = $('scenes');
  box.textContent = '';
  const tl = state.env?.timeline?.scenes || [];
  const segs = state.project.segments || [];
  tl.forEach((sc, i) => {
    const card = document.createElement('div');
    card.className = 'scene';
    const cv = document.createElement('canvas');
    cv.width = 180;
    cv.height = 320;
    cv.title = 'Bu sahneye git';
    cv.addEventListener('click', () => seekTo(sc.start + 0.4));
    const body = document.createElement('div');
    body.className = 's-body';
    const time = document.createElement('span');
    time.className = 's-time';
    time.textContent = `${i + 1}. sahne · ${fmt(sc.start)}–${fmt(sc.end)}`;
    const txt = document.createElement('span');
    txt.className = 's-text';
    const from = sc.scene.from ?? 0, to = sc.scene.to ?? from;
    txt.textContent = segs.slice(from, to + 1).map((s) => s.text).join(' ');
    const actions = document.createElement('div');
    actions.className = 's-actions';
    const redo = document.createElement('button');
    redo.className = 'btn small redo';
    redo.type = 'button';
    redo.textContent = 'Yeniden tasarla';
    redo.addEventListener('click', () => run('redo', () => redoScene(sc.index)));
    actions.append(redo);
    const missing = (sc.scene.elements || []).filter((e) => e.type === 'art' && !state.images[e.id]);
    if (missing.length && !state.project.demo) {
      const st = document.createElement('span');
      st.className = 'status';
      st.textContent = missing.some((e) => state.project.arts?.[e.id]?.error) ? 'çizim başarısız' : 'çiziliyor…';
      actions.append(st);
    }
    body.append(time, txt, actions);
    card.append(cv, body);
    box.append(card);
    drawThumb(cv, sc);
  });
}

function drawThumb(cv, sc) {
  const ctx = cv.getContext('2d');
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  // öğelerin çoğu belirdikten sonraki bir anı göster
  const len = sc.end - sc.start;
  const last = Math.max(0, ...(sc.scene.elements || []).map((e) => elementStart(e, sc)).filter((x) => x < len - 0.3));
  const t = sc.start + Math.min(len - 0.35, last + 0.9);
  renderFrame(ctx, t, { ...state.env, captions: { groups: [] } });
}

function renderSfx() {
  const ul = $('sfxList');
  ul.textContent = '';
  const p = state.project;
  const items = [...(p.sfx || [])];
  if (p.ambience) items.push({ ...p.ambience, time: null, isAmb: true });
  items.forEach((s) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = `dot ${s.audio ? 'ok' : s.error ? 'err' : s.running ? 'run' : ''}`;
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = s.isAmb ? `Ortam sesi — ${s.prompt}` : `${s.time.toFixed(1)} sn — ${s.prompt}`;
    li.append(dot, lbl);
    ul.append(li);
  });
}

// ---------------------------------------------------------------- önizleme
const pctx = $('preview').getContext('2d');
function drawPreview(t) {
  if (!state.env) return;
  const cv = $('preview');
  pctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  renderFrame(pctx, t, state.env);
  const d = state.env.duration;
  $('time').textContent = `${fmt(t)} / ${fmt(d)}`;
  $('seek').value = String(Math.round((t / d) * 1000));
}

async function ensureMixed() {
  const p = state.project;
  if (!p.voice?.audio) return null;
  if (state.mixed) return state.mixed;
  if (!state.voiceBuf) state.voiceBuf = await decodeAudio(p.voice.audio);
  const sfx = [];
  for (const s of p.sfx || []) {
    if (!s.audio) continue;
    if (!state.sfxBufs.has(s.audio)) {
      try { state.sfxBufs.set(s.audio, await decodeAudio(s.audio)); } catch (_) { continue; }
    }
    sfx.push({ buffer: state.sfxBufs.get(s.audio), time: s.time, volume: s.volume });
  }
  if (p.ambience?.audio && state.settings.ambience && !state.ambienceBuf) {
    try { state.ambienceBuf = await decodeAudio(p.ambience.audio); } catch (_) { /* ortam sesi atlanır */ }
  }
  state.mixed = await mixAudio({
    duration: state.env.duration,
    voice: state.voiceBuf,
    sfx,
    ambience: state.settings.ambience ? state.ambienceBuf : null,
  });
  return state.mixed;
}

function invalidateAudio() {
  state.mixed = null;
}

async function play() {
  if (state.playing) return pause();
  if (state.t >= state.env.duration - 0.05) state.t = 0;
  const ac = audioCtx();
  await ac.resume();
  let mixed = null;
  try { mixed = await ensureMixed(); } catch (e) { toast('Ses hazırlanamadı: ' + e.message, true); }
  state.playing = true;
  setPlayIcon();
  const offset = state.t;
  if (mixed) {
    const src = ac.createBufferSource();
    src.buffer = mixed;
    src.connect(ac.destination);
    src.start(0, offset);
    state.source = src;
    const t0 = ac.currentTime;
    state.clock = () => offset + (ac.currentTime - t0);
  } else {
    const t0 = performance.now();
    state.clock = () => offset + (performance.now() - t0) / 1000;
  }
  const tick = () => {
    if (!state.playing) return;
    state.t = state.clock();
    if (state.t >= state.env.duration) {
      state.t = state.env.duration;
      pause();
      drawPreview(state.t);
      return;
    }
    drawPreview(state.t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function pause() {
  state.playing = false;
  try { state.source?.stop(); } catch (_) { /* zaten durdu */ }
  state.source = null;
  setPlayIcon();
}

function setPlayIcon() {
  $('playIcon').innerHTML = state.playing
    ? '<path d="M5 3h4v14H5zM11 3h4v14h-4z" fill="currentColor"/>'
    : '<path d="M5 3l12 7-12 7z" fill="currentColor"/>';
  $('playBtn').setAttribute('aria-label', state.playing ? 'Durdur' : 'Oynat');
}

function seekTo(t) {
  const wasPlaying = state.playing;
  if (wasPlaying) pause();
  state.t = Math.max(0, Math.min(t, state.env.duration));
  drawPreview(state.t);
  if (wasPlaying) play();
}

// ---------------------------------------------------------------- adımlar
function resetDownstream({ keepVoice = false } = {}) {
  const p = state.project;
  if (!keepVoice) {
    p.voice = null;
    p.words = [];
    p.segments = [];
    p.duration = 0;
    state.voiceBuf = null;
  }
  p.plan = null;
  p.sfx = [];
  p.ambience = null;
  state.ambienceBuf = null;
  invalidateAudio();
}

async function writeScript() {
  requireAI();
  const p = state.project;
  p.topic = $('topic').value.trim();
  p.seconds = Number($('seconds').value);
  if (!p.topic) throw new Error('Önce bir konu yazın.');
  setStatus(1, 'Senaryo yazılıyor…');
  const res = await askJSON(state.settings, scriptPrompt(p.topic, p.seconds), { maxTokens: 8000, effort: 'medium' });
  if (!res.script) throw new Error('Senaryo boş geldi, tekrar deneyin.');
  Object.assign(p, { demo: false, title: res.title || p.topic.slice(0, 60), script: String(res.script).replace(/\\n/g, '\n') });
  resetDownstream();
  p.arts = {};
  await persist();
  setStatus(1, `Senaryo hazır: “${p.title}”`, 'ok');
  renderAll();
}

async function voice() {
  requireEleven();
  const p = state.project;
  p.script = $('script').value;
  if (!p.script.trim()) throw new Error('Seslendirilecek metin boş.');
  if (p.demo) {
    p.demo = false;
    p.arts = {};
    p.title = p.title || 'Shorts';
  }
  const text = cleanForTTS(p.script);
  setStatus(2, 'Seslendiriliyor… (ElevenLabs)');
  const s = state.settings;
  const { audio, alignment } = await textToSpeech({
    apiKey: s.elevenKey,
    voiceId: s.voiceId.trim(),
    modelId: s.modelId.trim(),
    text,
    stability: Number(s.stability),
  });
  resetDownstream();
  state.voiceBuf = await decodeAudio(audio);
  const duration = state.voiceBuf.duration;
  let words = alignment ? wordsFromAlignment(alignment) : [];
  const expected = stripTags(text).split(/\s+/).filter(Boolean).length;
  if (words.length < expected * 0.6) words = estimateWords(p.script, duration);
  p.voice = { audio, alignment: alignment ? true : false, text };
  p.words = words;
  p.segments = segmentsFromWords(words);
  p.duration = duration + 0.6;
  await persist();
  renderAll();
}

function normalizePlan(plan) {
  const n = state.project.segments.length;
  const scenes = (Array.isArray(plan?.scenes) ? plan.scenes : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const from = Math.max(0, Math.min(n - 1, Math.round(Number(s.from) || 0)));
      const to = Math.max(from, Math.min(n - 1, Math.round(Number(s.to ?? from))));
      return { ...s, from, to, elements: Array.isArray(s.elements) ? s.elements.filter((e) => e && e.type) : [], sfx: Array.isArray(s.sfx) ? s.sfx : [] };
    })
    .sort((a, b) => a.from - b.from)
    .filter((s, i, arr) => i === 0 || s.from !== arr[i - 1].from);
  if (!scenes.length) throw new Error('Sahne planı boş geldi, tekrar deneyin.');
  scenes[0].from = 0;
  const theme = {};
  if (/^#[0-9a-f]{6}$/i.test(plan.theme?.accent || '')) theme.accent = plan.theme.accent;
  if (/^#[0-9a-f]{6}$/i.test(plan.theme?.accent2 || '')) theme.accent2 = plan.theme.accent2;
  return { theme, ambience: typeof plan.ambience === 'string' ? plan.ambience : null, scenes };
}

function assignArts(scenes, salt = '') {
  const p = state.project;
  p.arts = p.arts || {};
  scenes.forEach((sc) =>
    sc.elements.forEach((el) => {
      if (el.type !== 'art') return;
      const prompt = String(el.art || el.prompt || 'abstract glowing object');
      const w = Math.max(80, Math.min(1080, Number(el.w) || 600));
      const h = Math.max(80, Math.min(1500, Number(el.h) || 600));
      const id = 'a' + hashStr(prompt + salt);
      el.id = id;
      el.w = w;
      el.h = h;
      if (!p.arts[id]) p.arts[id] = { prompt, w, h };
    }),
  );
}

async function drawArts() {
  const p = state.project;
  const todo = Object.entries(p.arts || {}).filter(([, a]) => !a.svg);
  if (!todo.length) return;
  let done = 0, failed = 0;
  setStatus(3, `Görseller çiziliyor… 0/${todo.length}`);
  await pool(todo, 3, async ([id, a]) => {
    try {
      a.error = null;
      const text = await ask(state.settings, artPrompt({ art: a.prompt, w: a.w, h: a.h, theme: p.plan.theme }), { maxTokens: 24000, effort: 'medium' });
      a.svg = extractSVG(text);
      state.images[id] = await svgToImage(a.svg);
    } catch (e) {
      console.warn('çizim', id, e);
      a.error = e.message;
      failed++;
    }
    done++;
    setStatus(3, `Görseller çiziliyor… ${done}/${todo.length}`);
    rebuildEnv();
    renderScenes();
    updateButtons();
  });
  await persist();
  if (failed) setStatus(3, `${failed} görsel çizilemedi. "Yeniden tasarla" ile o sahneyi tekrar deneyin.`, 'err');
  else setStatus(3, 'Sahneler ve görseller hazır.', 'ok');
}

async function direct() {
  requireAI();
  const p = state.project;
  if (!p.words?.length) throw new Error('Önce metni seslendirin.');
  setStatus(3, 'Sahneler tasarlanıyor… (bu adım 1–2 dakika sürebilir)');
  const raw = await askJSON(
    state.settings,
    planPrompt({ title: p.title, segments: p.segments, duration: p.duration, maxSfx: Number(state.settings.maxSfx) || 0 }),
    { maxTokens: 32000, effort: 'medium' },
  );
  const plan = normalizePlan(raw);
  assignArts(plan.scenes);
  p.plan = plan;
  p.sfx = [];
  p.ambience = null;
  state.ambienceBuf = null;
  invalidateAudio();
  await persist();
  renderAll();
  await drawArts();
}

async function redoScene(index) {
  requireAI();
  const p = state.project;
  const old = p.plan.scenes[index];
  setStatus(3, `${index + 1}. sahne yeniden tasarlanıyor…`);
  const raw = await askJSON(state.settings, scenePrompt({ scene: old, segments: p.segments, plan: p.plan, index }), { maxTokens: 16000, effort: 'medium' });
  const sc = { ...raw, from: old.from, to: old.to, elements: Array.isArray(raw.elements) ? raw.elements.filter((e) => e && e.type) : [], sfx: Array.isArray(raw.sfx) ? raw.sfx : old.sfx || [] };
  // bu sahnenin görselleri baştan çizilsin diye yeni kimlik ver
  assignArts([sc], ':' + Date.now());
  p.plan.scenes[index] = sc;
  await persist();
  renderAll();
  await drawArts();
  seekTo(state.env.timeline.scenes.find((s) => s.index === index)?.start + 0.4 || 0);
}

function collectSfx() {
  const p = state.project;
  const tl = state.env.timeline.scenes;
  const out = [];
  tl.forEach((sc) =>
    (sc.scene.sfx || []).forEach((s) => {
      if (!s?.prompt) return;
      const rel = elementStart(s, sc);
      out.push({
        prompt: String(s.prompt).slice(0, 300),
        time: Math.min(sc.start + rel, p.duration - 0.3),
        duration: Math.max(0.5, Math.min(6, Number(s.duration) || 1.5)),
        volume: Math.max(0.1, Math.min(1, Number(s.volume) || 0.6)),
      });
    }),
  );
  return out.slice(0, Math.max(0, Number(state.settings.maxSfx) || 0));
}

async function makeSfx() {
  requireEleven();
  const p = state.project;
  if (!p.plan?.scenes?.length) throw new Error('Önce sahneleri tasarlayın.');
  const s = state.settings;
  const old = new Map((p.sfx || []).filter((x) => x.audio).map((x) => [x.prompt + '|' + x.duration, x.audio]));
  p.sfx = collectSfx().map((x) => ({ ...x, audio: old.get(x.prompt + '|' + x.duration) || null }));
  if (s.ambience && p.plan.ambience && !p.ambience?.audio) p.ambience = { prompt: p.plan.ambience, audio: null };
  const jobs = [...p.sfx.filter((x) => !x.audio)];
  if (p.ambience && !p.ambience.audio) jobs.push(p.ambience);
  if (!jobs.length) {
    setStatus(3, 'Efekt sesleri hazır.', 'ok');
    return;
  }
  let done = 0, failed = 0;
  setStatus(3, `Efekt sesleri üretiliyor… 0/${jobs.length}`);
  renderSfx();
  await pool(jobs, 2, async (job) => {
    job.running = true;
    job.error = null;
    renderSfx();
    try {
      const isAmb = job === p.ambience;
      job.audio = await soundEffect({ apiKey: s.elevenKey, prompt: job.prompt, duration: isAmb ? 20 : job.duration, loop: isAmb });
    } catch (e) {
      job.error = e.message;
      failed++;
      if (/401|403|402/.test(e.message)) toast(e.message, true);
    }
    job.running = false;
    done++;
    setStatus(3, `Efekt sesleri üretiliyor… ${done}/${jobs.length}`);
    renderSfx();
  });
  state.ambienceBuf = null;
  invalidateAudio();
  await persist();
  setStatus(3, failed ? `${failed} efekt sesi üretilemedi; video onlarsız da oluşturulabilir.` : 'Sahneler, görseller ve efekt sesleri hazır.', failed ? 'err' : 'ok');
}

async function makeVideo() {
  const p = state.project;
  if (!p.plan?.scenes?.length) throw new Error('Önce sahneleri tasarlayın.');
  pause();
  setStatus(4, 'Ses karıştırılıyor…');
  const mixed = await ensureMixed();
  $('exportProg').hidden = false;
  $('exportProg').value = 0;
  $('downloadLink').hidden = true;
  setStatus(4, 'Video oluşturuluyor… sekmeyi kapatmayın.');
  const t0 = performance.now();
  const { blob, ext } = await exportVideo({
    env: state.env,
    audio: mixed,
    onProgress: (k) => {
      $('exportProg').value = k;
      setStatus(4, `Video oluşturuluyor… %${Math.round(k * 100)}`);
    },
  });
  $('exportProg').hidden = true;
  if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
  state.downloadUrl = URL.createObjectURL(blob);
  const name = `${(p.title || 'shorts').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'shorts'}.${ext}`;
  const a = $('downloadLink');
  a.href = state.downloadUrl;
  a.download = name;
  a.textContent = `⬇ ${name} indir (${(blob.size / 1048576).toFixed(1)} MB)`;
  a.hidden = false;
  a.click();
  setStatus(4, `Video hazır (${((performance.now() - t0) / 1000).toFixed(0)} sn).${p.voice ? '' : ' Not: bu örnek projede ses yok.'}`, 'ok');
}

async function doAll() {
  const p = state.project;
  const topic = $('topic').value.trim();
  const scriptNow = $('script').value.trim();
  if (topic && (topic !== p.topic || !scriptNow || p.demo)) await writeScript();
  else if (!scriptNow) throw new Error('Bir konu yazın ya da hazır metninizi 2. adıma yapıştırın.');
  if (!p.voice || $('script').value !== p.script) await voice();
  if (!p.plan?.scenes?.length) await direct();
  else await drawArts();
  await makeSfx();
  await makeVideo();
}

// ---------------------------------------------------------------- ayarlar
const settingFields = ['elevenKey', 'voiceId', 'modelId', 'stability', 'maxSfx', 'captionWords'];
// Pencere açıkken düzenlenen kopya: sağlayıcı değiştirince alanlar burada saklanır.
let draft = null;
let shownProvider = null;

$('provider').append(
  ...Object.entries(PROVIDERS).map(([id, p]) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = p.label;
    return o;
  }),
);

function stashProvider() {
  if (!shownProvider) return;
  draft[`${shownProvider}Key`] = $('aiKey').value.trim();
  draft[`${shownProvider}Model`] = $('aiModel').value.trim();
  if (PROVIDERS[shownProvider].kind === 'openai') draft[`${shownProvider}Base`] = $('aiBase').value.trim();
}

function showProvider(id) {
  shownProvider = id;
  const cfg = providerConfig({ ...draft, provider: id });
  $('aiKey').value = cfg.key;
  $('aiKey').placeholder = cfg.keyHint || '';
  $('aiModel').value = cfg.model;
  $('aiBase').value = cfg.base;
  $('aiBaseRow').hidden = cfg.kind !== 'openai';
  $('aiModels').textContent = '';
  const notes = {
    claude: 'Görsel çiziminde en iyi sonucu verir.',
    openai: 'ChatGPT aboneliği değil, platform.openai.com üzerinden ayrı bir API anahtarı gerekir.',
    opencode: 'OpenCode Go aboneliğinizin API anahtarı. Görsel kalitesi modele göre değişir; "Modelleri getir" ile listeden seçebilirsiniz.',
    gemini: 'Ücretsiz kotası olan bir seçenek.',
    custom: 'OpenAI uyumlu herhangi bir servis: API adresini /v1 ile biten şekilde girin.',
  };
  $('aiNote').textContent = notes[id] || '';
  if (cfg.keyUrl) {
    const a = document.createElement('a');
    a.href = cfg.keyUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = ' Anahtar al →';
    $('aiNote').append(a);
  }
}

function openSettings() {
  const s = state.settings;
  draft = { ...s };
  settingFields.forEach((k) => ($(k).value = s[k] ?? ''));
  $('ambience').checked = !!s.ambience;
  $('captions').checked = s.captions !== false;
  $('provider').value = PROVIDERS[s.provider] ? s.provider : 'claude';
  shownProvider = null;
  showProvider($('provider').value);
  $('settings').showModal();
}

$('provider').addEventListener('change', () => {
  stashProvider();
  showProvider($('provider').value);
});

$('fetchModels').addEventListener('click', async () => {
  stashProvider();
  const btn = $('fetchModels');
  btn.disabled = true;
  btn.textContent = 'Getiriliyor…';
  try {
    const models = await listModels({ ...draft, provider: shownProvider });
    $('aiModels').textContent = '';
    models.forEach((m) => {
      const o = document.createElement('option');
      o.value = m;
      $('aiModels').append(o);
    });
    $('aiNote').textContent = `${models.length} model bulundu. Model kutusuna tıklayıp listeden seçin.`;
  } catch (e) {
    $('aiNote').textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Modelleri getir';
  }
});

$('settings').addEventListener('close', async () => {
  if ($('settings').returnValue !== 'save') return;
  stashProvider();
  const s = { ...draft };
  settingFields.forEach((k) => (s[k] = $(k).value.trim()));
  s.provider = $('provider').value;
  s.stability = Number(s.stability);
  s.maxSfx = Math.max(0, Math.min(15, Number(s.maxSfx) || 0));
  s.captionWords = Math.max(1, Math.min(5, Number(s.captionWords) || 3));
  s.ambience = $('ambience').checked;
  s.captions = $('captions').checked;
  state.settings = s;
  if (!saveSettings(s)) toast('Ayarlar bu tarayıcıda kaydedilemedi (gizli sekme olabilir).', true);
  else toast(`Ayarlar kaydedildi · ${PROVIDERS[s.provider].label}`);
  invalidateAudio();
  rebuildEnv();
  if (s.elevenKey && s.voiceId) {
    try {
      const name = await voiceName({ apiKey: s.elevenKey, voiceId: s.voiceId });
      toast(`Ses bulundu: ${name}`);
    } catch (_) { /* Voices izni yoksa sessizce geç */ }
  }
});

// ---------------------------------------------------------------- olaylar
$('settingsBtn').addEventListener('click', openSettings);
$('playBtn').addEventListener('click', () => play());
$('seek').addEventListener('input', (e) => seekTo((Number(e.target.value) / 1000) * state.env.duration));
$('script').addEventListener('input', () => { updateMeta(); updateButtons(); });
$('writeBtn').addEventListener('click', () => run('write', writeScript));
$('voiceBtn').addEventListener('click', () => run('voice', voice));
$('directBtn').addEventListener('click', () => run('direct', direct));
$('sfxBtn').addEventListener('click', () => run('sfx', makeSfx));
$('exportBtn').addEventListener('click', () => run('export', makeVideo));
$('allBtn').addEventListener('click', () => run('all', doAll));
$('newBtn').addEventListener('click', async () => {
  if (!confirm('Mevcut proje silinsin ve boş bir proje açılsın mı?')) return;
  pause();
  state.project = { version: 1, topic: '', seconds: 60, script: '', words: [], segments: [], duration: 10, plan: null, arts: {}, sfx: [] };
  state.images = {};
  state.voiceBuf = null;
  state.ambienceBuf = null;
  state.sfxBufs.clear();
  invalidateAudio();
  state.t = 0;
  await persist();
  renderAll();
  $('topic').focus();
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    play();
  }
});

// ---------------------------------------------------------------- başlangıç
(async function init() {
  await loadFonts();
  state.project = (await loadProject()) || demoProject();
  state.images = await loadImages(state.project.arts);
  renderAll();
  if (!state.settings.elevenKey && !state.project.demo) setStatus(1, 'Başlamak için Ayarlar’dan API anahtarlarınızı girin.');
})();
