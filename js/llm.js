// Yapay zekâ çağrıları: senaryo yazma, sahne planı ve SVG çizimleri.
// Sağlayıcılar: Claude, ChatGPT, OpenCode Go, Gemini ve OpenAI uyumlu diğerleri.
// Hepsi doğrudan tarayıcıdan çağrılır; anahtarlar sadece bu tarayıcıda durur.

import { apiFetch } from './net.js';
import { HUD_DOC } from './elements/hud.js';
import { SCENERY_DOC } from './elements/scenery.js';
import { PHYSICS_DOC } from './elements/physics.js';
import { ART_STYLE_DOC } from './artguide.js';
import { LINT_DOC } from './layout.js';

// ---------------------------------------------------------------- sağlayıcılar
async function callClaude({ apiKey, model, prompt, maxTokens = 32000, effort = 'medium', signal, onText }) {
  const body = {
    model,
    max_tokens: maxTokens,
    stream: true,
    output_config: { effort },
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  };
  const send = (b, beta) =>
    apiFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        ...(beta ? { 'anthropic-beta': beta } : {}),
      },
      body: JSON.stringify(b),
    });
  let res = await send(body, 'server-side-fallback-2026-07-01');
  if (res.status === 400) {
    // Model ya da hesap yedek model özelliğini desteklemiyorsa onsuz dene.
    const { fallbacks, ...plain } = body;
    res = await send(plain, null);
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch (_) { /* boş */ }
    const hint = { 401: 'Claude API anahtarı geçersiz.', 403: 'Anahtarın bu modele erişimi yok.', 404: 'Model adı bulunamadı.', 429: 'Çok fazla istek ya da kredi limiti.', 529: 'Claude şu an yoğun, biraz sonra deneyin.' }[res.status] || '';
    throw new Error(`Claude (${res.status}): ${hint} ${msg}`.trim());
  }
  // SSE akışını oku, sadece metin parçalarını topla
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', stop = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5)); } catch (_) { continue; }
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        text += ev.delta.text;
        onText?.(text);
      } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
        stop = ev.delta.stop_reason;
      } else if (ev.type === 'error') {
        throw new Error(`Claude: ${ev.error?.message || 'akış hatası'}`);
      }
    }
  }
  if (stop === 'refusal') throw new Error('Claude bu isteği yanıtlamadı. Konuyu farklı ifade etmeyi deneyin.');
  if (stop === 'max_tokens') throw new Error('Yanıt çok uzun olduğu için yarıda kesildi. Tekrar deneyin.');
  return text;
}

async function callGemini({ apiKey, model, prompt, maxTokens = 32000, signal }) {
  const res = await apiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
      }),
    },
  );
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch (_) { /* boş */ }
    throw new Error(`Gemini (${res.status}): ${msg}`);
  }
  const j = await res.json();
  return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

// Sağlayıcı listesi. Yeni bir OpenAI uyumlu servis eklemek için buraya bir satır yeterli.
export const PROVIDERS = {
  claude: { label: 'Claude (Anthropic)', kind: 'anthropic', model: 'claude-opus-5-5', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'ChatGPT (OpenAI)', kind: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-5', tokenParam: 'max_completion_tokens', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys', models: ['gpt-5', 'gpt-5-mini'] },
  opencode: { label: 'OpenCode Go', kind: 'openai', base: 'https://opencode.ai/zen/go/v1', model: 'deepseek-v4.1-flash', keyHint: 'OpenCode API anahtarı', keyUrl: 'https://opencode.ai/auth',
    // liste alınamazsa gösterilecek bilinen modeller
    models: ['deepseek-v4.1-flash', 'deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2', 'glm-5.1', 'kimi-k2.7-code', 'kimi-k2.6', 'qwen3.7-max', 'qwen3.7-plus', 'minimax-m2.7', 'mimo-v2.5-pro'] },
  gemini: { label: 'Gemini (Google)', kind: 'gemini', model: 'gemini-2.5-pro', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
  custom: { label: 'Diğer (OpenAI uyumlu)', kind: 'openai', base: '', model: '', keyHint: 'API anahtarı', keyUrl: '' },
};

// Ayarlardan seçili sağlayıcının bilgilerini çıkarır.
export function providerConfig(settings) {
  const id = PROVIDERS[settings.provider] ? settings.provider : 'claude';
  const def = PROVIDERS[id];
  return {
    id,
    ...def,
    key: settings[`${id}Key`] || '',
    model: settings[`${id}Model`] || def.model,
    base: (settings[`${id}Base`] || def.base || '').replace(/\/+$/, ''),
  };
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// Servise özel başlıklar. OpenCode Go (Eylül 2026'dan beri) her konuşma için bir
// x-opencode-session kimliği ister; her çağrı ayrı bir konuşma olduğu için her seferinde yenisi üretilir.
function extraHeaders(cfg) {
  return /(^|\.)opencode\.ai$/.test(new URL(cfg.base).hostname) ? { 'x-opencode-session': newId() } : {};
}

// OpenAI uyumlu Chat Completions (ChatGPT, OpenCode Go, diğerleri), akış ile.
async function callOpenAICompatible({ cfg, prompt, maxTokens = 32000, signal, onText }) {
  if (!cfg.base) throw new Error(`${cfg.label}: Ayarlar’a API adresini (base URL) girin.`);
  const body = {
    model: cfg.model,
    stream: true,
    messages: [{ role: 'user', content: prompt }],
    [cfg.tokenParam || 'max_tokens']: maxTokens,
  };
  const send = (b) =>
    apiFetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}`, ...extraHeaders(cfg) },
      body: JSON.stringify(b),
    });
  let res = await send(body);
  if (res.status === 400) {
    // Bazı modeller çıktı sınırı parametresini ya da bu kadar büyük değeri kabul etmez.
    const { max_tokens, max_completion_tokens, ...plain } = body;
    res = await send(plain);
  }
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = j.error?.message || j.message || JSON.stringify(j); } catch (_) { /* boş */ }
    const hint = { 401: 'API anahtarı geçersiz.', 403: 'Anahtarın bu modele erişimi yok.', 404: 'Model adı ya da API adresi bulunamadı.', 429: 'Çok fazla istek ya da kullanım limiti doldu.' }[res.status] || '';
    throw new Error(`${cfg.label} (${res.status}): ${hint} ${msg}`.trim());
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', finish = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let ev;
      try { ev = JSON.parse(data); } catch (_) { continue; }
      if (ev.error) throw new Error(`${cfg.label}: ${ev.error.message || 'akış hatası'}`);
      const ch = ev.choices?.[0];
      const piece = ch?.delta?.content;
      if (typeof piece === 'string' && piece) {
        text += piece;
        onText?.(text);
      }
      if (ch?.finish_reason) finish = ch.finish_reason;
    }
  }
  if (finish === 'length') throw new Error(`${cfg.label}: yanıt çok uzun olduğu için yarıda kesildi. Tekrar deneyin ya da daha büyük çıktı sınırı olan bir model seçin.`);
  if (finish === 'content_filter') throw new Error(`${cfg.label} bu isteği yanıtlamadı. Konuyu farklı ifade etmeyi deneyin.`);
  if (!text.trim()) throw new Error(`${cfg.label} boş yanıt döndürdü. Başka bir model deneyin.`);
  return text;
}

// Sağlayıcının model listesini getirir (Ayarlar’daki "Modelleri getir").
export async function listModels(settings) {
  const cfg = providerConfig(settings);
  if (!cfg.key) throw new Error('Önce API anahtarını girin.');
  let url, headers = {};
  if (cfg.kind === 'anthropic') {
    url = 'https://api.anthropic.com/v1/models?limit=100';
    headers = { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  } else if (cfg.kind === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';
    headers = { 'x-goog-api-key': cfg.key };
  } else {
    if (!cfg.base) throw new Error('Önce API adresini girin.');
    url = `${cfg.base}/models`;
    headers = { authorization: `Bearer ${cfg.key}`, ...extraHeaders(cfg) };
  }
  const res = await apiFetch(url, { headers });
  if (!res.ok) throw new Error(`Model listesi alınamadı (${res.status}).`);
  const j = await res.json();
  const items = j.data || j.models || [];
  return items
    .map((m) => String(m.id || m.name || '').replace(/^models\//, ''))
    .filter(Boolean)
    .sort();
}

export async function ask(settings, prompt, opts = {}) {
  const cfg = providerConfig(settings);
  if (!cfg.key) throw new Error(`Ayarlar’dan ${cfg.label} API anahtarını girin.`);
  if (cfg.kind === 'gemini') return callGemini({ apiKey: cfg.key, model: cfg.model, prompt, ...opts });
  if (cfg.kind === 'openai') return callOpenAICompatible({ cfg, prompt, ...opts });
  return callClaude({ apiKey: cfg.key, model: cfg.model, prompt, ...opts });
}

// Yanıttan JSON çıkar: düz JSON, kod bloğu ya da ilk { … son }.
export function parseJSON(text) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch (_) { return undefined; } };
  let v = tryParse(text.trim());
  if (v !== undefined) return v;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { v = tryParse(fence[1].trim()); if (v !== undefined) return v; }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { v = tryParse(text.slice(a, b + 1)); if (v !== undefined) return v; }
  throw new Error('Yapay zekânın yanıtı okunamadı (JSON bozuk). Tekrar deneyin.');
}

export async function askJSON(settings, prompt, opts) {
  const text = await ask(settings, prompt, opts);
  return parseJSON(text);
}

// ---------------------------------------------------------------- komutlar
const STYLE_EXAMPLE = `[quietly curious]
1945 yılında Sovyetler, Amerika'nın Moskova Büyükelçisine ahşaptan yapılmış bir arma hediye etti.

[short pause]

[dramatic, intriguing]
Ama kimse bilmiyordu ki… bu hediye aslında bir dinleme cihazıydı!

[measured, storytelling]
Amerikan kartalının işlendiği arma, Büyükelçinin çalışma odasına asıldı.

Ve tam yedi yıl boyunca orada kaldı!

[building curiosity]
Peki kimse nasıl fark etmedi?

Çünkü cihazın ne pili vardı… ne de elektrik kablosu!

[short pause]

[concluding, mysterious]
1952 yılında sır ortaya çıktı.

Bir düşünsene…

Yedi yıl boyunca duvarda duran bir hediye…

Aslında odadaki konuşmaların gizli dinleyicisiydi!`;

export function scriptPrompt(topic, seconds, language = 'Türkçe') {
  const words = Math.round(seconds * 2.3);
  return `Sen viral YouTube Shorts / Instagram Reels senaristisin. Aşağıdaki konu için ${language} bir seslendirme metni yaz.

KONU: ${topic}

KURALLAR
- Süre: yaklaşık ${seconds} saniye → ${Math.round(words * 0.9)}–${Math.round(words * 1.05)} kelime (etiketler hariç).
- Metin ElevenLabs v4 ile seslendirilecek. Duygu ve ton için köşeli parantez içinde İngilizce ses etiketleri kullan: [quietly curious], [dramatic, intriguing], [measured, storytelling], [building curiosity], [lower, mysterious], [slightly amazed], [excited], [whispers], [short pause], [dramatic pause] gibi. Etiketi, etkilediği satırın hemen üstüne kendi satırına yaz.
- İlk cümle izleyiciyi ilk 2 saniyede yakalamalı (şaşırtıcı bir gerçek, soru ya da çelişki).
- Kısa cümleler, her cümle ayrı satırda, paragraflar arasında boş satır. Merak boşlukları ve "…" ile gerilim kur.
- Rakamları, yılları, ölçüleri somut ver. Uydurma bilgi yazma; emin olmadığın ayrıntıyı ekleme.
- Sonu akılda kalan bir vurguyla bitsin (ör. "Bir düşünsene…").
- Markdown, emoji, kalın yazı, başlık KULLANMA.

ÜSLUP ÖRNEĞİ (sadece biçim için, içeriği kopyalama):
${STYLE_EXAMPLE}

Yanıtı SADECE şu JSON olarak ver:
{"title": "kısa video başlığı", "script": "etiketli seslendirme metni (\\n ile satırlar)"}`;
}

// ---------------------------------------------------------------- sahne dili
// Öğe türlerinin tek satırlık belgeleri modüllerin kendisinden gelir; böylece motor
// ile istem hep aynı kalır.
const COMMON = `ÇİZİM DİLİ — tuval 1080 x 1920 (9:16). x,y öğenin MERKEZİ (piksel).
Ortak alanlar (hepsi isteğe bağlı):
  cue: "kelime" → öğe bu kelime söylendiği an belirir (at yerine TERCİH ET) | offset: cue'ya eklenecek sn | at: sahne başından sn
  until: sahne başına göre sn, öğe bu anda kaybolur | out: "fade" | "zoom" | "slideUp" | outTo: 0..1 (until'den sonra tamamen gitmez, bu opaklığa yavaşça silikleşir — "ortadan kayboldu" anları için)
  in: "fade" | "pop" | "zoom" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "stamp" | "type" (daktilo, sadece text) | "draw" (çizgi/halka) | "spin" | "none"
  loop: "float" | "sway" | "pulse" | "rotate" | "spin" | "blink" | "shake" | "vibrate"   loopSpeed: çarpan | inDur: giriş süresi
  scale, rotation (derece), opacity
  Renk: "accent" | "accent2" | "text" | "bg" | "bg2" | "#hex" | "rgba(...)"`;

const CORE_DOC = `TEMEL ÖĞELER
- art {art:"İngilizce somut çizim tarifi", w, h, glow?}: yapay zekânın çizdiği SVG illüstrasyon (kişi, nesne, mekân, araç). Sahnenin ODAK görseli. Görselin içinde yazı olmaz.
- text {text, size, color, font:"display"|"number", weight, maxWidth=940, upper?, glow?, stroke?, box?:{fill,stroke,radius}}: "*kelime*" o kısmı accent2 yapar. SADECE kısa başlık / yıl / isim için (aşağıdaki tipografi kurallarına bak).
- counter {from, to, duration=1.6, prefix, suffix, decimals, size}: sayarak artan büyük sayı (yıl için KULLANMA; yıl düz text olur).
- gear {r, teeth, speed (tur/sn, eksi ters), style:"metal"|"gold"|"wood"|"dark"}: dönen dişli.
- waves {tx,ty (hedef nokta) | angle, count=4, length=420, spread=70, color, ring?:bool}: radyo/ses/sinyal dalgaları.
- meter {w=30, h=360–600, from, value:0..1, duration, color, horizontal?, marks:[{label,v}] (etiket dikeyde çubuğun SOLUNDA)}: ince cam kapsül, dolan/boşalan seviye (enerji, yakıt, risk).
- chips {items:["50","×","50"], size=56, cols=6, stagger}: tek tek beliren sayı hapları.
- shape {shape:"circle"|"rect"|"ring"|"line"|"arrow", r, w, h, radius, x2,y2 (line/arrow bitişi), fill, stroke, lineWidth, dash:[20,14], flow, glow}: in:"draw" ile çizilerek gelir.
- equalizer {w, h, bars, color}: ses/konuşma çubukları. particles {count, color, size, w, h}: toz, kıvılcım, kar, atmosfer.
- flash {cue, duration=0.35, color}: ekran parlaması. shake {cue, duration=0.4, amp=18}: kamera sarsıntısı. (İkisi de nadiren, sadece dramatik anda.)`;

const DSL = `${COMMON}

${CORE_DOC}

HUD BİLEŞENLERİ (küçük, zarif, "belgesel/teleskop arayüzü" havası — açıklamaları bunlarla yap)
${HUD_DOC}

${SCENERY_DOC}

${PHYSICS_DOC}

ÇİZİM STİLİ
${ART_STYLE_DOC}

SAHNE ALANLARI
  {"from":0,"to":1,"background"?:"…" (sadece bu sahnede farklı arka plan gerekiyorsa),"transition":"fade"|"zoom"|"slide"|"flash"|"none","camera":{"zoom":[1,1.06],"panX":0,"panY":0},"elements":[...],
   "sfx":[{"cue":"kelime","prompt":"short English sound effect description","duration":1.5,"volume":0.6}]}
  Kalıcı düzenek (isteğe bağlı): plan.stage = [öğeler] her sahnede, sahne öğelerinden önce çizilir; zamanları mutlak sn
  (at / [[t,v],...] anahtar dizileri). O zaman sahneler "transition":"none" ve anahtar kareli kamera kullanır:
  "camera":{"from":{"cx":540,"cy":960,"zoom":1},"to":{"cx":540,"cy":700,"zoom":1.4},"at":0,"dur":1.2,"ease":"inOut"|"out"|"linear"}
  (dünya noktası cx,cy ekran merkezine gelir; her sahnenin from'u öncekinin to'suna eşit olmalı).
  Her öğede "fixed":true → kameradan bağımsız, ekran koordinatı (başlık, alt şema). opacity/x/y/scale da anahtar dizisi olabilir.`;

const LAYOUT = `TASARIM KURALLARI (çok önemli — amatör görünen videoların sebebi bunlara uymamak)
Ekran ve yerleşim
- Güvenli alan x 80–1000, y 160–1700. y 1290–1510 ALTYAZI BANDIDIR: oraya hiçbir öğe koyma.
- Odak görsel genelde y 480–1150 aralığında ve büyük (art 640–900 px). Küçük etiketler odak görselin çevresinde, onu kapatmadan.
- Öğeler üst üste binmesin; yazı asla görselin üstüne gelmesin.
Tipografi disiplini
- Altyazı seslendirmeyi zaten kelime kelime gösteriyor: anlatılan cümleyi ekrana ASLA tekrar yazma.
- Sahne başına EN FAZLA BİR başlık (text, size 72–110, en fazla 4 kelime) ve sadece yeni bilgi katıyorsa: bir isim, yıl, rakam, kilit terim. Çoğu sahnede başlık OLMASIN.
- Başlık, altyazının o an gösterdiği kelimeyi kopyalamasın (ör. "Kaparo alındı" söylenirken ekrana "KAPARO" yazmak tekrar olur); aynı bilgiyi panel başlığında ya da label'da zaten verdiysen ikinci kez yazma. İstisna: kapak karesindeki isim.
- Açıklamalar için küçük "label" hapları (size 26–34, ikon + gerekirse toX/toY ile görsele bağlı ince çizgi), "readout" göstergesi, "panel" başlığı kullan. Aynı anda en fazla 3 yazılı öğe.
- glow sadece tek bir vurguda; büyük harfli, kutulu, parlayan yazı yığını YAPMA.
Kompozisyon
- Her sahne TEK güçlü odak görsel etrafında kurulur (art, orb, accretion, silhouette, gear, clock…) + 1–3 destek öğesi (label, readout, bracket, badge, rays, particles).
- Sahneden sahneye kompozisyonu değiştir: (A) panel içinde görsel + REC/köşe parantez (gözlem/kanıt anları), (B) tam ekran büyük görsel + çizgiyle bağlı 1–2 label, (C) veri sahnesi: readout/spectrum/clock/sine + küçük görsel, (D) siluet/manzara + rays + tek label (yer/atmosfer), (E) badge akışı (süreç/sıra: "teklif → kaparo → kayıp").
- Görseller sabit durmasın: art'a loop "float"/"sway", kamera zoom [1,1.04–1.1]; sakin, sinematik hareket.
- Sahne hiçbir anda boş kalmasın: odak görsele "until" verme; bir şey "kayboluyorsa" until + outTo:0.3 ile silikleştir ya da yerine yeni görseli getir.
- Üst kenar (y 160–360) başlık/etiket içindir; odak görseli oraya taşırma. Sahnelerin çoğunda üst bölgede tek küçük label ya da hiçbir şey olsun — her sahneye üstte bir yazı koyma.
- Konuşmayla senkron ol: isim, yıl, rakam söylendiği an (cue) ekranda belirsin. Öğeleri sahne boyunca kademeli getir, hepsini aynı anda değil.`;

// Zayıf modellerin örnek alması için tek, kompakt ve kaliteli sahne.
const EXAMPLE_SCENE = `ÖRNEK SAHNE (başka bir videodan; seslendirme parçası 3: "Gemi, buzdağına çarptıktan sadece 160 dakika sonra battı."). Konuyu değil, kaliteyi ve yapıyı örnek al: tek odak görsel, onu çerçeveleyen panel, görsele bağlı küçük etiket, söylendiği an beliren gösterge, tekrar edilen cümle YOK.
{"from":3,"to":3,"transition":"fade","camera":{"zoom":[1,1.06]},"elements":[
 {"type":"rays","x":540,"y":170,"angle":90,"spread":34,"length":1000,"color":"accent2","at":0},
 {"type":"panel","x":540,"y":760,"w":860,"h":880,"title":"KUZEY ATLANTİK · 1912","rec":true,"brackets":true,"scan":true,"at":0},
 {"type":"art","art":"side view of the RMS Titanic at night, bow tilting down into dark icy water, four tan funnels with black tops, rows of warm lit portholes, a jagged pale-blue iceberg on the right, cold moonlight rim light","w":760,"h":540,"x":540,"y":740,"in":"zoom","loop":"float","at":0.2},
 {"type":"label","text":"buzdağı","icon":"warn","x":820,"y":480,"toX":800,"toY":660,"cue":"buzdağına"},
 {"type":"readout","label":"batış süresi","from":0,"to":160,"suffix":" dk","x":540,"y":1110,"w":700,"bar":true,"max":180,"cue":"160"}
],"sfx":[{"cue":"buzdağına","prompt":"deep metal hull scraping against ice, low rumble","duration":2,"volume":0.6}]}`;

const BACKGROUND_RULES = `ARKA PLAN VE STİL SEÇİMİ (zorunlu, konuya göre)
- "background": tarih / biyografi / 1900'ler → "vintage"; İstanbul ve şehir hikâyeleri, suç, dolandırıcılık, gece → "city-night"; uzay, astronomi → "space"; bilim, teknoloji, mühendislik, icat → "lab"; deniz, keşif → "ocean"; doğa, seyahat, duygusal → "sunset"; psikoloji, para, soyut fikir → "abstract"; hiçbiri uymuyorsa "grid".
- "artStyle": tarih / eski şehir → "retro" ya da "engraving"; bilim / uzay → "flat"; gece / siber / neon şehir → "neon".
- "theme": arka plana uyan, birbirini tamamlayan iki parlak vurgu rengi (vintage: kiremit + hardal; space: turuncu + camgöbeği; city-night: altın + mercan; lab: camgöbeği + turuncu).`;

export function planPrompt({ title, segments, duration, maxSfx }) {
  const segText = segments
    .map((s, i) => `${i}. [${s.start.toFixed(2)}–${s.end.toFixed(2)} sn] ${s.text}`)
    .join('\n');
  return `Sen ödüllü bir motion graphics yönetmenisin (Kurzgesagt / belgesel infografik kalitesi). Seslendirmesi hazır, ${duration.toFixed(1)} saniyelik dikey (9:16) bir Shorts videosunun TÜM sahnelerini aşağıdaki çizim diliyle tasarla.

VİDEO: ${title || ''}

SESLENDİRME PARÇALARI (numara, zaman, metin):
${segText}

${DSL}

${LAYOUT}

${BACKGROUND_RULES}

${EXAMPLE_SCENE}

${LINT_DOC}

GÖREV
- Parçaları sırayla sahnelere böl: her sahne "from".."to" parça numaralarını kapsar (1–3 parça). Tüm parçalar kapsanmalı, sıra bozulmamalı. Toplam 7–14 sahne.
- Her sahne konuyu GÖRSEL olarak anlatsın: anlatılan kişiyi/nesneyi/mekânı/mekanizmayı göster. Soyut cümlelerde metafor kullan.
- İlk sahne kapak karesidir: güçlü odak görsel "at":0 ile hemen görünsün; istersen en fazla 4 kelimelik tek başlık (videonun ilk karesi boş olmasın).
- Toplam "art" öğesi en fazla 10 (her biri pahalı); geri kalanı hazır öğelerle yap. Aynı kişi/nesne birden fazla sahnede görünecekse aynı "art" tarifini AYNEN tekrar kullan (bir kez çizilir, karakter tutarlı kalır).
- Ses efektleri: tüm videoda toplam en fazla ${maxSfx} sfx. Sadece gerçekten etkili anlara (whoosh, darbe, kâğıt hışırtısı, mekanik tık, kalp atışı vb.). "prompt" İngilizce ve kısa.
- "ambience": videonun altında çok kısık çalacak ortam sesi (İngilizce tarif) ya da null.

Yanıtı SADECE şu JSON olarak ver, açıklama yazma (background / artStyle / theme değerlerini KONUYA GÖRE seç; aşağıdaki sadece biçim örneği):
{"background":"vintage","artStyle":"retro","theme":{"accent":"#e4572e","accent2":"#f2c14e"},"ambience":"distant harbor ambience, soft wind","scenes":[{"from":0,"to":0,"transition":"zoom","camera":{"zoom":[1,1.06]},"elements":[...],"sfx":[...]}]}`;
}

export function scenePrompt({ scene, segments, plan, index }) {
  const segText = segments.map((s, i) => `${i}. [${s.start.toFixed(2)}–${s.end.toFixed(2)} sn] ${s.text}`).join('\n');
  return `Sen ödüllü bir motion graphics yönetmenisin. Bir Shorts videosunun ${index + 1}. sahnesini YENİDEN, daha profesyonel tasarla: tek güçlü odak görsel, 1–3 küçük açıklama öğesi, cümle tekrarı yok.

TÜM PARÇALAR:
${segText}

MEVCUT SAHNE (from/to aynı kalmalı):
${JSON.stringify(scene)}

VİDEO AYARLARI: arka plan "${plan.background || 'grid'}", çizim stili "${plan.artStyle || 'flat'}", tema ${JSON.stringify(plan.theme || {})}

${DSL}

${LAYOUT}

${EXAMPLE_SCENE}

Yanıtı SADECE tek bir sahne JSON'u olarak ver: {"from":..,"to":..,"transition":..,"camera":..,"elements":[...],"sfx":[...]}`;
}

// Çizim istemi artık js/artguide.js içinde (sanat yönetmeni rehberi + örnekler).
export { artPrompt, critiquePrompt, artIssues, ART_STYLES } from './artguide.js';

export function extractSVG(text) {
  const m = text.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) throw new Error('Çizim yanıtında SVG bulunamadı.');
  return sanitizeSVG(m[0]);
}

export function sanitizeSVG(svg) {
  let s = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*["'])(?!#)[^"']*(["'])/gi, '$1#$2');
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}
