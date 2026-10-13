// Yapay zekâ çağrıları: senaryo yazma, sahne planı ve SVG çizimleri.
// Sağlayıcılar: Claude, ChatGPT, OpenCode Go, Gemini ve OpenAI uyumlu diğerleri.
// Hepsi doğrudan tarayıcıdan çağrılır; anahtarlar sadece bu tarayıcıda durur.

import { apiFetch } from './net.js';

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

const DSL = `ÇİZİM DİLİ (tuval 1080 x 1920, x,y öğenin MERKEZİ, piksel)
Ortak alanlar (hepsi isteğe bağlı):
  at: sahne başından itibaren saniye | cue: "kelime" (bu kelime söylendiği an belirir; at yerine tercih et) | offset: cue'ya eklenecek saniye
  until: sahne başına göre saniye, öğe bu anda kaybolur
  in: "fade" | "pop" | "zoom" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "stamp" (büyükten çakılır + sarsılır) | "type" (daktilo, sadece text) | "draw" (çizgi/halka çizilerek gelir) | "spin" | "none"
  inDur: giriş süresi (sn)
  loop: "rotate" | "spin" | "pulse" | "float" | "sway" | "shake" | "vibrate" | "blink"   loopSpeed: çarpan
  scale, rotation (derece), opacity
  Renklerde "accent" (kırmızı-pembe), "accent2" (altın sarısı), "text" (beyaz) ya da #hex kullanılabilir.

ÖĞE TÜRLERİ
  {"type":"art","art":"çizilecek görselin ayrıntılı İngilizce tarifi","w":700,"h":700,"x":540,"y":820, ...}
      → Ayrı bir çizer bu tarifi zengin bir SVG illüstrasyona çevirir. Ana görseller için kullan (nesneler, yerler, kişiler, araçlar, haritalar).
        Tarif: konu, kompozisyon, malzeme/doku, ışık, renkler. Görselin içinde YAZI OLMAYACAK. glow:true ile ışıltı.
  {"type":"text","text":"IŞIKTAN HIZLI!","size":110,"color":"accent","glow":true,"upper":true,"font":"display"|"number","weight":900,"maxWidth":940,"box":{"fill":"#0a0e1e","stroke":"accent2","radius":60}}
      → "*kelime*" yazarsan o kısım accent2 renginde olur. stroke:true dış çizgi ekler.
  {"type":"counter","from":0,"to":1350000,"duration":1.8,"suffix":" km/s","prefix":"","decimals":0,"size":120,"color":"accent"}
  {"type":"gear","r":140,"teeth":18,"speed":0.2,"style":"metal"|"gold"|"wood"|"dark"}  (speed: tur/sn, eksi = ters yön; birbirine değen dişliler zıt yönde döner)
  {"type":"waves","x":300,"y":900,"tx":800,"ty":900,"count":4,"length":500,"spread":70,"color":"accent","ring":false}  (radyo/ses/sinyal dalgaları; ring:true = halka halka yayılır)
  {"type":"meter","h":760,"w":46,"from":0,"value":0.9,"duration":2,"color":"accent","marks":[{"label":"ses","v":0.1},{"label":"ışık","v":0.85}],"horizontal":false}
  {"type":"chips","items":["50","×","50","×","50"],"cols":6,"size":56,"stagger":0.1}  (çarpım/sıra gösterimi, tek tek belirir)
  {"type":"shape","shape":"circle"|"rect"|"ring"|"line"|"arrow","r":100,"w":300,"h":200,"radius":24,"x2":900,"y2":500,"fill":"#hex","stroke":"accent","lineWidth":6,"dash":[20,14],"flow":1,"glow":true}
      (line/arrow: x,y başlangıç, x2,y2 bitiş; in:"draw" ile çizilerek gelir; dash+flow ile akan kesikli çizgi)
  {"type":"equalizer","w":520,"h":220,"bars":14,"color":"accent2"}  (ses/konuşma/dinleme)
  {"type":"particles","count":40,"color":"rgba(255,220,150,0.8)","x":540,"y":960,"w":1080,"h":1920}  (toz, kıvılcım, atmosfer)
  {"type":"flash","cue":"…","duration":0.35,"color":"#ffffff"}  (ekran parlaması — dramatik an)
  {"type":"shake","cue":"…","duration":0.4,"amp":18}  (kamera sarsıntısı — patlama, çarpma, şok)

SAHNE ALANLARI
  {"from":0,"to":1,"transition":"zoom"|"fade"|"slide"|"flash","camera":{"zoom":[1,1.08],"panX":0,"panY":0},"elements":[...],
   "sfx":[{"cue":"kelime","prompt":"short English sound effect description","duration":1.5,"volume":0.6}]}`;

const LAYOUT = `YERLEŞİM KURALLARI (çok önemli)
- Güvenli alan: x 80–1000. Üstte y<140 ve altta y>1700 boş kalsın (platform arayüzü).
- y 1300–1500 arası ALTYAZI bandıdır: buraya hiçbir öğe koyma.
- Ana görsel genelde y 500–1150 arasında; başlık/vurgu metni y 220–420; sayaç ve açıklama y 1150–1290 ya da 1550–1680.
- Her sahnede 1 güçlü odak + 1–3 destek öğesi. Kalabalık yapma; öğeler üst üste binmesin.
- Görseller sabit durmasın: art öğelerine loop ("float", "sway", "rotate", "pulse") ver, kamera zoom'u kullan.
- Konuşulan kelimeyle senkron ol: önemli rakam, yıl, isim söylendiği an (cue) ekranda belirsin.
- Stil: koyu lacivert ızgaralı arka plan üzerine canlı, parlak, premium "explainer" motion graphics (Kurzgesagt / infografik havası).`;

export function planPrompt({ title, segments, duration, maxSfx }) {
  const segText = segments
    .map((s, i) => `${i}. [${s.start.toFixed(2)}–${s.end.toFixed(2)} sn] ${s.text}`)
    .join('\n');
  return `Sen bir motion graphics yönetmenisin. Seslendirmesi hazır, ${duration.toFixed(1)} saniyelik dikey (9:16) bir Shorts videosunun TÜM sahnelerini aşağıdaki çizim diliyle tasarla.

VİDEO: ${title || ''}

SESLENDİRME PARÇALARI (numara, zaman, metin):
${segText}

${DSL}

${LAYOUT}

GÖREV
- Parçaları sırayla sahnelere böl: her sahne "from".."to" parça numaralarını kapsar (1–3 parça). Tüm parçalar kapsanmalı, sıra bozulmamalı. Toplam 7–14 sahne.
- Her sahne konuyu GÖRSEL olarak anlatsın: anlatılan nesneyi/mekânı/mekanizmayı göster. Soyut cümlelerde metafor kullan.
- İlk sahne güçlü bir kanca: büyük parlayan başlık + çarpıcı görsel, ikisi de "at":0 (videonun ilk karesi boş olmasın; bu kare kapak gibi görünür).
- Toplam "art" öğesi en fazla 10 olsun (her biri pahalı); diğer her şeyi hazır öğelerle yap. Aynı nesne birden fazla sahnede görünecekse aynı "art" tarifini aynen tekrar kullan (bir kez çizilir).
- Ses efektleri: tüm videoda toplam en fazla ${maxSfx} sfx. Sadece gerçekten etkili anlara (whoosh, darbe, radyo cızırtısı, mekanik tık, kalp atışı vb.). "prompt" İngilizce ve kısa olsun.
- "ambience": videonun altında çok kısık çalacak ortam sesi (İngilizce tarif) ya da null.
- theme: konuya uygun accent / accent2 renkleri (koyu arka planda parlayan, birbirini tamamlayan).

Yanıtı SADECE şu JSON olarak ver, açıklama yazma:
{"theme":{"accent":"#ff4d6d","accent2":"#ffc83d"},"ambience":"dark suspenseful cinematic drone","scenes":[{"from":0,"to":0,"transition":"zoom","camera":{"zoom":[1,1.06]},"elements":[...],"sfx":[...]}]}`;
}

export function scenePrompt({ scene, segments, plan, index }) {
  const segText = segments.map((s, i) => `${i}. [${s.start.toFixed(2)}–${s.end.toFixed(2)} sn] ${s.text}`).join('\n');
  return `Sen bir motion graphics yönetmenisin. Bir Shorts videosunun ${index + 1}. sahnesini YENİDEN, daha etkileyici tasarla.

TÜM PARÇALAR:
${segText}

MEVCUT SAHNE (from/to aynı kalmalı):
${JSON.stringify(scene)}

TEMA: ${JSON.stringify(plan.theme || {})}

${DSL}

${LAYOUT}

Yanıtı SADECE tek bir sahne JSON'u olarak ver: {"from":..,"to":..,"transition":..,"camera":..,"elements":[...],"sfx":[...]}`;
}

export function artPrompt({ art, w, h, theme }) {
  return `Bir dikey Shorts videosunda kullanılacak tek bir illüstrasyonu SVG olarak çiz.

TARİF: ${art}

TEKNİK ŞARTLAR
- Kök: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
- Arka plan ŞEFFAF (tam kare dolgu yok). Görsel koyu lacivert (#0b1530) bir sahnenin üzerine bindirilecek; kenarları yumuşak, kendi gölgesi/parlaması olsun.
- Stil: premium flat-vector "explainer" illüstrasyonu (Kurzgesagt tarzı): zengin linearGradient/radialGradient, yumuşak gölgeler, ışık vurguları, doku için ince tekrar eden çizgiler (ahşap damarı, metal çizgileri vb.), net siluet. Düz, sıkıcı ikon gibi olmasın; derinlik ve ayrıntı olsun.
- Renk uyumu: vurgu renkleri ${theme?.accent || '#ff4d6d'} ve ${theme?.accent2 || '#ffc83d'} ile uyumlu, sıcak ışıklar.
- Görselin içinde YAZI, harf, rakam OLMASIN (ayrıca istenmediyse).
- <script>, <foreignObject>, <image>, dış bağlantı, CSS animasyonu KULLANMA. <filter> (feGaussianBlur, feDropShadow) kullanabilirsin.
- Boyut: en fazla ~25 KB. Gereksiz tekrar eden yol verisi yazma.

Yanıt olarak SADECE SVG kodunu ver (\`\`\`svg bloğu içinde ya da düz).`;
}

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
