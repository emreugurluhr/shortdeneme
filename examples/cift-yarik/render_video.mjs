// Kullanım: node render_video.mjs  (önce: node ../../server.js ya da http://localhost:8765 üzerinde statik sunucu)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = DIR + '/video_only.mp4';
const END = Number(process.env.END || 67.6);
const project = JSON.parse(fs.readFileSync(DIR + '/project.json', 'utf8'));
const browser = await chromium.launch({ args: ['--enable-features=WebCodecs'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[err]', e.message));
const fd = fs.openSync(OUT, 'w');
await page.exposeFunction('writeChunk', (b64, pos) => { const b = Buffer.from(b64, 'base64'); fs.writeSync(fd, b, 0, b.length, pos); });
await page.goto('http://localhost:8765/');
await page.setContent(`<html><head><link rel=stylesheet href="http://localhost:8765/css/app.css"></head><body style="margin:0;background:#000"><canvas id=c width=1080 height=1920></canvas>
<script type=module>
import { buildEnv, renderFrame } from 'http://localhost:8765/js/engine.js';
import { loadFonts, loadImages } from 'http://localhost:8765/js/media.js';
import { Muxer, ArrayBufferTarget } from 'http://localhost:8765/vendor/mp4-muxer.mjs';
function b64(u8){ let s=''; const C=0x8000; for(let i=0;i<u8.length;i+=C) s+=String.fromCharCode.apply(null,u8.subarray(i,i+C)); return btoa(s); }
window.go = async (project, END) => {
  await loadFonts();
  await document.fonts.ready;
  const images = await loadImages(project.arts);
  await Promise.all(Object.values(images).map((im) => im.decode ? im.decode().catch(()=>{}) : null));
  const env = buildEnv(project, images);
  const fps = 30, W = 1080, H = 1920;
  const cfg = { codec: 'vp09.00.40.08', width: W, height: H, bitrate: 30_000_000, framerate: fps, latencyMode: 'quality' };
  const sup = await VideoEncoder.isConfigSupported(cfg);
  console.log('vp9 supported', sup.supported, 'envdur', env.duration, 'captions', env.captions.enabled, 'images', Object.keys(images).length);
  if (!sup.supported) return { ok: false };
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'vp9', width: W, height: H, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let failure = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { failure = e; } });
  venc.configure(cfg);
  const cv = document.getElementById('c'); const ctx = cv.getContext('2d', { alpha: false });
  const total = Math.round(END * fps);
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    if (failure) throw failure;
    const t = i / fps;
    renderFrame(ctx, t, env);
    const frame = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5));
    if (i % 150 === 0) console.log('frame', i, '/', total, ((performance.now() - t0) / 1000).toFixed(0) + 's');
  }
  await venc.flush(); venc.close();
  if (failure) throw failure;
  muxer.finalize();
  const u8 = new Uint8Array(target.buffer);
  const CH = 4 << 20;
  for (let p = 0; p < u8.length; p += CH) await window.writeChunk(b64(u8.subarray(p, p + CH)), p);
  return { ok: true, bytes: u8.length, frames: total };
};
window.ready = true;
</script></body></html>`);
await page.waitForFunction(() => window.ready);
const res = await page.evaluate(([p, e]) => window.go(p, e), [project, END]);
fs.closeSync(fd);
console.log(JSON.stringify(res));
await browser.close();
