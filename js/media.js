// Ses karıştırma, görsel ön yükleme ve MP4 dışa aktarımı.
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';
import { W, H, renderFrame, FONTS } from './engine.js';

export const SAMPLE_RATE = 48000;

let sharedCtx;
export function audioCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sharedCtx;
}

export async function decodeAudio(arrayBuffer) {
  return await audioCtx().decodeAudioData(arrayBuffer.slice(0));
}

// Seslendirme + efektler + ortam sesi → tek stereo AudioBuffer.
export async function mixAudio({ duration, voice, sfx = [], ambience, ambienceVolume = 0.12 }) {
  const len = Math.max(1, Math.ceil(duration * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, len, SAMPLE_RATE);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);

  if (voice) {
    const src = ctx.createBufferSource();
    src.buffer = voice;
    src.connect(comp);
    src.start(0);
  }
  sfx.forEach((s) => {
    if (!s.buffer || !Number.isFinite(s.time)) return;
    const src = ctx.createBufferSource();
    src.buffer = s.buffer;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, Math.max(0, s.volume ?? 0.6));
    src.connect(g).connect(comp);
    src.start(Math.max(0, s.time));
  });
  if (ambience) {
    const src = ctx.createBufferSource();
    src.buffer = ambience;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(ambienceVolume, 1.2);
    g.gain.setValueAtTime(ambienceVolume, Math.max(1.3, duration - 1.5));
    g.gain.linearRampToValueAtTime(0, duration);
    src.connect(g).connect(comp);
    src.start(0);
  }
  return await ctx.startRendering();
}

export async function loadFonts() {
  if (!document.fonts) return;
  const specs = ['900 80px Nunito', '800 80px Nunito', '700 80px "Barlow Condensed"', '600 20px Nunito'];
  await Promise.all(specs.map((s) => document.fonts.load(s, 'ğüşıöçİ 0123').catch(() => {})));
}

export function svgToImage(svg) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG görsel açılamadı'));
    };
    img.src = url;
  });
}

export async function loadImages(arts) {
  const out = {};
  await Promise.all(
    Object.entries(arts || {}).map(async ([id, a]) => {
      if (!a.svg) return;
      try {
        out[id] = await svgToImage(a.svg);
      } catch (_) {
        /* bozuk çizim yer tutucu olarak kalır */
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------- dışa aktarım
async function pickVideoConfig(fps) {
  if (typeof VideoEncoder === 'undefined') return null;
  const tries = [
    ['avc1.640033', 'avc'], ['avc1.640032', 'avc'], ['avc1.4d0033', 'avc'], ['avc1.42003e', 'avc'],
    ['vp09.00.40.08', 'vp9'],
  ];
  for (const [codec, kind] of tries) {
    const cfg = { codec, width: W, height: H, bitrate: 9_000_000, framerate: fps };
    if (kind === 'avc') cfg.avc = { format: 'avc' };
    try {
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r.supported) return { cfg, kind };
    } catch (_) { /* sıradaki */ }
  }
  return null;
}

async function pickAudioConfig() {
  if (typeof AudioEncoder === 'undefined') return null;
  const tries = [
    [{ codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192000 }, 'aac'],
    [{ codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 160000 }, 'opus'],
  ];
  for (const [cfg, kind] of tries) {
    try {
      const r = await AudioEncoder.isConfigSupported(cfg);
      if (r.supported) return { cfg, kind };
    } catch (_) { /* sıradaki */ }
  }
  return null;
}

// env: engine.buildEnv çıktısı; audio: karışık AudioBuffer (ya da null)
export async function exportVideo({ env, audio, fps = 30, onProgress, signal }) {
  await loadFonts();
  const video = await pickVideoConfig(fps);
  const aud = audio ? await pickAudioConfig() : null;
  if (!video || (audio && !aud)) {
    return await exportRealtime({ env, audio, fps, onProgress, signal });
  }
  const duration = env.duration;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: video.kind, width: W, height: H, frameRate: fps },
    audio: aud ? { codec: aud.kind, numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let failure = null;
  const venc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  venc.configure(video.cfg);

  // ses
  if (aud) {
    const aenc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { failure = e; },
    });
    aenc.configure(aud.cfg);
    const frames = audio.length;
    const L = audio.getChannelData(0);
    const R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
    const block = 4800;
    for (let off = 0; off < frames; off += block) {
      const n = Math.min(block, frames - off);
      const data = new Float32Array(n * 2);
      data.set(L.subarray(off, off + n), 0);
      data.set(R.subarray(off, off + n), n);
      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((off / SAMPLE_RATE) * 1e6),
        data,
      });
      aenc.encode(ad);
      ad.close();
    }
    await aenc.flush();
    aenc.close();
  }

  // görüntü
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const total = Math.ceil(duration * fps);
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException('İptal edildi', 'AbortError');
    if (failure) throw failure;
    const t = i / fps;
    renderFrame(ctx, t, env);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    if (venc.encodeQueueSize > 6) {
      await new Promise((r) => {
        const check = () => (venc.encodeQueueSize <= 3 ? r() : setTimeout(check, 5));
        check();
      });
    }
    if (i % 10 === 0) {
      onProgress?.(i / total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await venc.flush();
  venc.close();
  if (failure) throw failure;
  muxer.finalize();
  onProgress?.(1);
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
}

// WebCodecs yoksa: gerçek zamanlı kayıt (video süresi kadar sürer).
async function exportRealtime({ env, audio, fps, onProgress, signal }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('Bu tarayıcı video kaydını desteklemiyor. Chrome ya da Edge deneyin.');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(fps);
  let src;
  if (audio) {
    const ac = audioCtx();
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    src = ac.createBufferSource();
    src.buffer = audio;
    src.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }
  const types = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 9_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  const ac = audioCtx();
  const t0 = ac.currentTime + 0.1;
  src?.start(t0);
  await new Promise((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        rec.stop();
        src?.stop();
        reject(new DOMException('İptal edildi', 'AbortError'));
        return;
      }
      const t = Math.max(0, ac.currentTime - t0);
      renderFrame(ctx, t, env);
      onProgress?.(t / env.duration);
      if (t >= env.duration) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  const type = rec.mimeType || mimeType || 'video/webm';
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}

export { FONTS };
