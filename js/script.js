// Metin işleme: seslendirme metnini temizleme, kelime zamanlamaları ve cümle parçaları.

// Seslendirmeye gidecek metin: [etiketler] ve satır sonları kalır, markdown gider.
export function cleanForTTS(script) {
  return String(script || '')
    .replace(/\r/g, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/^\s*["“”]+|["“”]+\s*$/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Etiketsiz düz metin (altyazı tahmini ve sahne planı için).
export function stripTags(text) {
  return String(text || '').replace(/\[[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function displayOf(token) {
  return token
    .replace(/[.,;:…"“”'‘’()«»]/g, '')
    .replace(/^[-–—]+|[-–—]+$/g, '')
    .trim();
}

const SENTENCE_END = /[.!?…]["”']?$/;

// ElevenLabs "with-timestamps" yanıtındaki karakter hizalamasından kelimeler üretir.
export function wordsFromAlignment(alignment) {
  const chars = alignment?.characters || [];
  const starts = alignment?.character_start_times_seconds || [];
  const ends = alignment?.character_end_times_seconds || [];
  const words = [];
  let depth = 0;
  let cur = null;
  let pendingBreak = false;
  let newlines = 0;
  const finish = () => {
    if (cur && cur.text) {
      cur.display = displayOf(cur.text);
      words.push(cur);
    }
    cur = null;
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '[') {
      finish();
      depth++;
      pendingBreak = true;
      continue;
    }
    if (c === ']') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    if (/\s/.test(c)) {
      if (c === '\n') newlines++;
      finish();
      continue;
    }
    if (!cur) {
      if (words.length && (pendingBreak || newlines > 0)) words[words.length - 1].breakAfter = true;
      pendingBreak = false;
      newlines = 0;
      cur = { text: '', start: starts[i] ?? 0, end: ends[i] ?? 0 };
    }
    cur.text += c;
    cur.end = ends[i] ?? cur.end;
  }
  finish();
  return finalizeWords(words);
}

function finalizeWords(words) {
  const out = words.filter((w) => w.display);
  out.forEach((w, i) => {
    // parça sonu: satır sonu, etiket ya da . ! ? ; "…" sadece altyazıyı böler
    w.sentenceEnd = !!w.breakAfter || /[.!?]["”']?$/.test(w.text) || i === out.length - 1;
    if (SENTENCE_END.test(w.text)) w.breakAfter = true;
    if (w.end < w.start) w.end = w.start + 0.05;
  });
  return out;
}

// Zaman bilgisi yoksa: kelime uzunluğu ve noktalamaya göre süreyi paylaştır.
export function estimateWords(script, duration) {
  const text = cleanForTTS(script);
  const tokens = [];
  let breakNext = false;
  text.split(/(\[[^\]]*\]|\n+|\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\[.*\]$/.test(part) || /\n/.test(part)) {
      breakNext = true;
      return;
    }
    if (/^\s+$/.test(part)) return;
    if (breakNext && tokens.length) tokens[tokens.length - 1].breakAfter = true;
    breakNext = false;
    tokens.push({ text: part });
  });
  const weightOf = (t) => t.text.length + 2 + (SENTENCE_END.test(t.text) ? 6 : /[,;:]$/.test(t.text) ? 3 : 0) + (t.breakAfter ? 4 : 0);
  const total = tokens.reduce((a, t) => a + weightOf(t), 0) || 1;
  const usable = Math.max(1, duration - 0.4);
  let tcur = 0.2;
  tokens.forEach((t) => {
    const share = (weightOf(t) / total) * usable;
    const speak = share * ((t.text.length + 2) / weightOf(t));
    t.start = tcur;
    t.end = tcur + speak;
    t.display = displayOf(t.text);
    tcur += share;
  });
  return finalizeWords(tokens);
}

// Kelimeleri cümle/paragraf parçalarına böler.
export function segmentsFromWords(words) {
  const segs = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    segs.push({
      text: cur.map((w) => w.text).join(' '),
      start: cur[0].start,
      end: cur[cur.length - 1].end,
      first: words.indexOf(cur[0]),
      last: words.indexOf(cur[cur.length - 1]),
    });
    cur = [];
  };
  words.forEach((w) => {
    cur.push(w);
    if (w.sentenceEnd) flush();
  });
  flush();
  return segs;
}
