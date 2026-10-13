// ElevenLabs: seslendirme (kelime zamanlarıyla) ve efekt sesleri.

import { apiFetch } from './net.js';

const API = 'https://api.elevenlabs.io/v1';

async function errorText(res) {
  let body = '';
  try {
    body = await res.text();
    const j = JSON.parse(body);
    body = j.detail?.message || j.detail?.status || (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail || j));
  } catch (_) { /* düz metin */ }
  const hints = {
    401: 'API anahtarı geçersiz ya da bu işlem için izni yok.',
    402: 'ElevenLabs krediniz yetersiz.',
    403: 'Anahtarın bu işlem için izni yok (Text to Speech / Sound Effects izinlerini kontrol edin).',
    404: 'Ses ID bulunamadı.',
    422: 'ElevenLabs isteği kabul etmedi.',
    429: 'Çok fazla istek; biraz bekleyip tekrar deneyin.',
  };
  return `ElevenLabs (${res.status}): ${hints[res.status] || ''} ${body}`.trim();
}

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Döner: { audio: ArrayBuffer (mp3), alignment | null }
export async function textToSpeech({ apiKey, voiceId, modelId, text, stability, signal }) {
  const base = { text, model_id: modelId };
  const withSettings = Number.isFinite(stability)
    ? { ...base, voice_settings: { stability, similarity_boost: 0.75, use_speaker_boost: true } }
    : base;
  const headers = { 'xi-api-key': apiKey, 'Content-Type': 'application/json' };
  const url = `${API}/text-to-speech/${encodeURIComponent(voiceId)}`;

  const attempt = async (body, timestamps) => {
    const res = await apiFetch(`${url}${timestamps ? '/with-timestamps' : ''}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    return res;
  };

  // 1) zaman damgalı + ayarlı, 2) zaman damgalı ayarsız, 3) düz ses
  let res = await attempt(withSettings, true);
  if (!res.ok && (res.status === 400 || res.status === 422) && withSettings !== base) {
    res = await attempt(base, true);
  }
  if (res.ok) {
    const j = await res.json();
    return { audio: b64ToBuffer(j.audio_base64), alignment: j.alignment || j.normalized_alignment || null };
  }
  if (res.status === 400 || res.status === 422) {
    const plain = await attempt(base, false);
    if (plain.ok) return { audio: await plain.arrayBuffer(), alignment: null };
    throw new Error(await errorText(plain));
  }
  throw new Error(await errorText(res));
}

export async function soundEffect({ apiKey, prompt, duration, loop, signal }) {
  const body = { text: prompt, prompt_influence: 0.45 };
  if (Number.isFinite(duration)) body.duration_seconds = Math.min(22, Math.max(0.5, duration));
  if (loop) body.loop = true;
  const go = (b) =>
    apiFetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
      signal,
    });
  let res = await go(body);
  if (!res.ok && loop && (res.status === 400 || res.status === 422)) {
    delete body.loop;
    res = await go(body);
  }
  if (!res.ok) throw new Error(await errorText(res));
  return await res.arrayBuffer();
}

export async function voiceName({ apiKey, voiceId }) {
  const res = await apiFetch(`${API}/voices/${encodeURIComponent(voiceId)}`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(await errorText(res));
  const j = await res.json();
  return j.name;
}
