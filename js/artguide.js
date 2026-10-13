// LLM'in çizdiği SVG illüstrasyonları için "sanat yönetmeni" rehberi.
// Zayıf/hızlı modeller bile katmanlı, ışıklı, yüzü olan, okunaklı çizimler üretsin diye:
//   artPrompt()      → tek atış çizim istemi (llm.js'deki eski artPrompt'un yerine)
//   critiquePrompt() → isteğe bağlı ikinci geçiş: SVG'yi gözden geçirip düzeltilmiş tam SVG döndürür
//   ART_STYLES       → plan başına seçilebilen stil ekleri (flat | retro | neon | engraving)
//   ART_EXAMPLES     → elle çizilmiş örnek SVG'ler (few-shot + uygulamada gösterim)
//   artIssues()      → ucuz statik kontrol; sorun varsa critique geçişi tetiklenebilir

/* ---------- renk yardımcıları ---------- */
function hex(c, d) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return d;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (x) => x + x);
  return '#' + h.toLowerCase();
}
function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const r = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * k);
  return '#' + ((1 << 24) | (r(16) << 16) | (r(8) << 8) | r(0)).toString(16).slice(1);
}

/** Temadan türetilmiş, sınırlı ve uyumlu palet (hex). */
export function artPalette(theme = {}) {
  const a = hex(theme.accent, '#ff4d6d');
  const b = hex(theme.accent2, '#ffc83d');
  const bg = hex(theme.bg, '#0b1530');
  return {
    bg,
    accent: a, accentLight: mix(a, '#ffffff', 0.35), accentDark: mix(a, '#000000', 0.45),
    accent2: b, accent2Light: mix(b, '#ffffff', 0.4), accent2Dark: mix(b, '#000000', 0.45),
    cream: '#f3efe6', steel: '#8a8f9e', charcoal: '#2a2f3c', ink: '#151821',
    coolShadow: mix(bg, '#3b4f86', 0.6),
    skin: ['#f6c9a0', '#d99a6c', '#a5643e'], hair: ['#3a2416', '#1b100a'],
  };
}

/* ---------- stiller ---------- */
export const ART_STYLES = {
  flat: 'STYLE: premium flat-vector explainer (Kurzgesagt / modern editorial). Clean geometric shapes, 2-3 stop gradients on every large surface, soft rim lights, crisp silhouettes, no outlines except thin dark accents.',
  retro: 'STYLE: 1920s-1950s retro print poster. Warm muted palette (cream #f1e2c4, brick #b8202f, mustard #d9a441, teal #2f6f73, sepia #5a4232), slightly desaturated gradients, subtle halftone dots via a small <pattern> on large shapes, rounded art-deco forms. Still lit from top-left.',
  neon: 'STYLE: night neon. Dark charcoal/navy body shapes with saturated accent-colored edge lights, glowing accent strokes (feGaussianBlur glow copy under a crisp stroke), bright small highlights; most surfaces stay dark so the glow reads.',
  engraving: 'STYLE: vintage engraving / banknote illustration. Limited palette (2 inks + paper tones: #f1e2c4, #c9a86a, #5a4232, #2a1c14), parallel hatching lines via <pattern> to model shading (denser = darker), fine but not hairline (stroke-width >= 2) contours, sepia mood.',
};

/* ---------- elle çizilmiş örnekler (≤6 KB) ---------- */
const MAN_1920 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700" width="600" height="700">
<defs>
<radialGradient id="halo" cx="50%" cy="45%" r="50%"><stop offset="0" stop-color="#ffc83d" stop-opacity=".3"/><stop offset=".7" stop-color="#ffc83d" stop-opacity="0"/></radialGradient>
<radialGradient id="skin" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#f6c9a0"/><stop offset=".6" stop-color="#d99a6c"/><stop offset="1" stop-color="#a5643e"/></radialGradient>
<linearGradient id="fez" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2475a"/><stop offset=".45" stop-color="#b8202f"/><stop offset="1" stop-color="#6e0f1c"/></linearGradient>
<linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a5163"/><stop offset=".55" stop-color="#2a2f3c"/><stop offset="1" stop-color="#151821"/></linearGradient>
<linearGradient id="vest" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a06a3a"/><stop offset="1" stop-color="#5e3a1c"/></linearGradient>
<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2416"/><stop offset="1" stop-color="#1b100a"/></linearGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<path id="mus" d="M300 352C290 344 270 342 254 350C240 357 230 366 216 362C208 359 206 350 212 346C204 349 202 362 214 370C232 381 262 376 280 368C290 364 296 360 300 360Z"/>
<g id="eye"><ellipse cx="258" cy="300" rx="15" ry="10" fill="#fbf4ea"/><circle cx="261" cy="301" r="7.5" fill="#3b2414"/><circle cx="263.5" cy="298" r="2.6" fill="#fff"/><path d="M242 297C250 288 268 288 275 296" stroke="#2a170c" stroke-width="4" fill="none" stroke-linecap="round"/></g>
<ellipse id="ear" cx="207" cy="312" rx="15" ry="26"/>
<clipPath id="hc"><ellipse cx="300" cy="312" rx="92" ry="110"/></clipPath>
</defs>
<ellipse cx="300" cy="330" rx="250" ry="290" fill="url(#halo)"/>
<ellipse cx="300" cy="652" rx="210" ry="18" fill="#000" opacity=".35"/>
<path d="M300 440C240 440 200 470 150 500C110 524 92 580 88 652H512C508 580 490 524 450 500C400 470 360 440 300 440Z" fill="url(#coat)"/>
<path d="M240 470L300 652L360 470C340 460 320 456 300 456C280 456 260 460 240 470Z" fill="url(#vest)"/>
<g fill="#e8c46a"><circle cx="300" cy="540" r="5"/><circle cx="300" cy="578" r="5"/><circle cx="300" cy="616" r="5"/></g>
<path d="M300 585C320 600 345 602 362 592" stroke="#ffd25e" stroke-width="3" fill="none"/>
<path d="M262 452L300 520L338 452L320 444H280Z" fill="#f3efe6"/>
<path d="M300 486L284 470L300 478L316 470Z M300 478L292 512H308Z" fill="#7a1622"/>
<path d="M240 470L300 652L250 652L176 520C196 500 216 482 240 470Z" fill="#20242f"/>
<path d="M360 470L300 652L350 652L424 520C404 500 384 482 360 470Z" fill="#1a1d27"/>
<path d="M240 470L216 530L254 534Z" fill="#3a4152"/>
<path d="M360 470L384 530L346 534Z" fill="#2c3240"/>
<path d="M392 568L402 548L412 562L424 546L432 566Z" fill="#ffc83d"/>
<path d="M268 380H332V452C320 460 280 460 268 452Z" fill="#c7875a"/>
<path d="M268 410C285 425 315 425 332 410V380H268Z" fill="#9b5f39" opacity=".7"/>
<use href="#ear" fill="#d08e60"/><use href="#ear" fill="#b9774b" transform="translate(600 0) scale(-1 1)"/>
<path d="M204 300C198 238 238 200 300 200C362 200 402 238 396 300Z" fill="url(#hair)"/>
<g clip-path="url(#hc)"><rect x="200" y="190" width="200" height="240" fill="#ffb98a"/><ellipse cx="292" cy="315" rx="92" ry="110" fill="url(#skin)"/></g>
<path id="sb" d="M212 240C208 272 212 300 222 326C226 300 228 272 236 244Z" fill="url(#hair)"/><use href="#sb" transform="translate(600 0) scale(-1 1)"/>
<path d="M372 300C382 360 360 410 300 422C350 400 366 360 366 300Z" fill="#8e5232" opacity=".35"/>
<ellipse cx="240" cy="345" rx="18" ry="11" fill="#e0705a" opacity=".22"/><ellipse cx="360" cy="345" rx="18" ry="11" fill="#e0705a" opacity=".22"/>
<use href="#eye"/><use href="#eye" transform="translate(600 0) scale(-1 1)"/>
<path d="M236 274C248 262 268 260 282 266" stroke="#24150c" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M318 262C334 252 352 254 366 266" stroke="#24150c" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M306 296C306 316 316 330 318 342C312 348 304 346 300 344C306 330 304 314 306 296Z" fill="#a8623c" opacity=".55"/>
<path d="M284 342C290 352 310 352 318 342" stroke="#8a4c2c" stroke-width="4.5" fill="none" stroke-linecap="round"/>
<circle cx="296" cy="336" r="4" fill="#ffe6cc" opacity=".7"/>
<path d="M280 392C292 400 310 400 324 388" stroke="#6b2d22" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M292 406C298 409 306 409 312 406" stroke="#a5643e" stroke-width="3" fill="none" stroke-linecap="round"/>
<use href="#mus" fill="#2a170c"/><use href="#mus" fill="#2a170c" transform="translate(600 0) scale(-1 1)"/>
<path d="M262 354C276 350 290 352 298 356" stroke="#5a3a26" stroke-width="2.5" fill="none" opacity=".8"/>
<ellipse cx="300" cy="226" rx="96" ry="16" fill="#000" opacity=".25"/>
<path d="M206 222L222 116Q300 102 378 116L394 222Q300 240 206 222Z" fill="url(#fez)"/>
<ellipse cx="300" cy="116" rx="78" ry="14" fill="#8e1626"/>
<path d="M228 132Q234 170 226 212" stroke="#ff8a96" stroke-width="7" fill="none" stroke-linecap="round" opacity=".55"/>
<path d="M206 222Q300 240 394 222L392 208Q300 226 208 208Z" fill="#7c1222"/>
<path d="M300 112C330 120 352 150 360 186" stroke="#1d1310" stroke-width="5" fill="none"/>
<path d="M352 182L372 182L380 236L344 236Z" fill="#1d1310"/>
<g stroke="#3a2a22" stroke-width="2"><path d="M354 194L350 234M362 192L362 236M370 194L374 234"/></g>
<path d="M150 500C120 520 102 560 96 610" stroke="#8d97ad" stroke-width="5" fill="none" stroke-linecap="round" opacity=".5"/>
<path d="M228 132Q236 170 228 212" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".25" filter="url(#glow)"/>
</svg>`;

const GALATA_BRIDGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" width="900" height="600">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4f86"/><stop offset="1" stop-color="#1c2748" stop-opacity="0"/></linearGradient>
<radialGradient id="sea" cx="50%" cy="40%" r="50%"><stop offset="0" stop-color="#2d6d9a" stop-opacity=".75"/><stop offset=".6" stop-color="#1b3f66" stop-opacity=".45"/><stop offset="1" stop-color="#0d1f3a" stop-opacity="0"/></radialGradient>
<linearGradient id="deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a8f9e"/><stop offset=".4" stop-color="#4e5466"/><stop offset="1" stop-color="#252a37"/></linearGradient>
<linearGradient id="pont" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a4232"/><stop offset="1" stop-color="#2a1c14"/></linearGradient>
<linearGradient id="tram" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2475a"/><stop offset="1" stop-color="#8e1626"/></linearGradient>
<radialGradient id="lamp"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#ffc83d" stop-opacity=".7"/><stop offset="1" stop-color="#ffc83d" stop-opacity="0"/></radialGradient>
<pattern id="truss" width="40" height="30" patternUnits="userSpaceOnUse"><path d="M0 0L40 30M40 0L0 30M0 0V30" stroke="#6d7487" stroke-width="3" fill="none"/></pattern>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
<g id="minaret"><path d="M-9 0V-200L0-232L9-200V0Z"/><rect x="-14" y="-150" width="28" height="7" rx="2"/></g>
<g id="pole"><rect x="-3" y="-64" width="6" height="64" fill="#2a2f3c"/><path d="M-9-64H9L5-76H-5Z" fill="#1d212b"/><circle cy="-70" r="26" fill="url(#lamp)"/><circle cy="-70" r="5" fill="#fff6d6"/></g>
<g id="pt"><rect x="-38" y="0" width="76" height="34" rx="8" fill="url(#pont)"/><rect x="-38" y="0" width="76" height="6" rx="3" fill="#8a6a4e"/></g>
</defs>
<ellipse cx="450" cy="440" rx="430" ry="110" fill="url(#sea)"/>
<g fill="url(#sky)">
<rect x="250" y="268" width="400" height="80"/>
<path d="M262 270A54 54 0 0 1 370 270ZM530 270A54 54 0 0 1 638 270Z"/>
<rect x="352" y="244" width="196" height="26"/>
<path d="M362 246A88 88 0 0 1 538 246Z"/>
<path d="M448 158V134H452V158Z"/>
<use href="#minaret" x="292" y="348"/><use href="#minaret" x="608" y="348"/>
</g>
<path d="M370 216A88 88 0 0 1 440 160" stroke="#9fb4ea" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45"/>
<path d="M452 112A11 11 0 1 0 462 128A8.5 8.5 0 1 1 452 112Z" fill="#ffc83d" opacity=".85"/>
<g fill="#ffd27a" opacity=".4"><rect x="276" y="290" width="10" height="16" rx="5"/><rect x="306" y="290" width="10" height="16" rx="5"/><rect x="584" y="290" width="10" height="16" rx="5"/><rect x="614" y="290" width="10" height="16" rx="5"/><rect x="384" y="254" width="8" height="12" rx="4"/><rect x="420" y="254" width="8" height="12" rx="4"/><rect x="472" y="254" width="8" height="12" rx="4"/><rect x="508" y="254" width="8" height="12" rx="4"/></g>
<g fill="none" stroke="#c9d3ee" stroke-width="3" stroke-linecap="round" opacity=".6"><path d="M690 120Q700 110 710 120Q720 110 730 120"/><path d="M740 92Q748 84 756 92Q764 84 772 92"/></g>
<g stroke="#ffc83d" stroke-width="3" opacity=".22" stroke-linecap="round">
<path d="M115 452H165M275 462H325M440 450H470M575 462H625M735 452H785"/>
<path d="M130 470H150M290 482H310M590 482H610M750 470H770"/>
</g>
<use href="#pt" x="110" y="400"/><use href="#pt" x="270" y="400"/><use href="#pt" x="450" y="400"/><use href="#pt" x="630" y="400"/><use href="#pt" x="790" y="400"/>
<rect x="50" y="378" width="800" height="28" rx="4" fill="url(#deck)"/>
<rect x="50" y="378" width="800" height="4" rx="2" fill="#c3c9d6"/>
<g transform="translate(360 311)">
<rect x="0" y="0" width="180" height="58" rx="12" fill="url(#tram)"/>
<rect x="0" y="0" width="180" height="16" rx="8" fill="#f1e2c4"/>
<g fill="#ffe7a6"><rect x="14" y="22" width="26" height="20" rx="4"/><rect x="50" y="22" width="26" height="20" rx="4"/><rect x="104" y="22" width="26" height="20" rx="4"/><rect x="140" y="22" width="26" height="20" rx="4"/></g>
<rect x="84" y="20" width="12" height="38" rx="3" fill="#5c0e18"/>
<path d="M60 0L90-34L120 0" stroke="#2a2f3c" stroke-width="4" fill="none"/>
<rect x="8" y="4" width="70" height="4" rx="2" fill="#fff" opacity=".5"/>
<circle cx="36" cy="58" r="9" fill="#1d212b"/><circle cx="144" cy="58" r="9" fill="#1d212b"/>
</g>

<rect x="56" y="350" width="788" height="30" fill="url(#truss)"/>
<rect x="56" y="344" width="788" height="8" rx="4" fill="#9aa1b3"/>

<use href="#pole" x="140" y="344"/><use href="#pole" x="300" y="344"/><use href="#pole" x="600" y="344"/><use href="#pole" x="760" y="344"/>
<path d="M50 406H850" stroke="#000" stroke-width="6" opacity=".25"/>
</svg>`;

export const ART_EXAMPLES = [
  { id: 'man1920', title: "1920'ler İstanbul beyefendisi (fesli, bıyıklı büst)", desc: 'bust portrait of a sly 1920s Istanbul gentleman: red fez with black tassel, handlebar mustache, charcoal suit, brown vest, gold watch chain', w: 600, h: 700, svg: MAN_1920 },
  { id: 'bridge', title: 'Eski Galata Köprüsü (tramvay, cami silueti)', desc: 'old iron pontoon bridge at night with a red tram, glowing lamp posts, mosque silhouette with domes and two minarets behind, calm water reflections', w: 900, h: 600, svg: GALATA_BRIDGE },
];

/* ---------- istemler ---------- */
function craftGuide(w, h, pal) {
  const mx = Math.round(w * 0.06), my = Math.round(h * 0.06);
  return `SVG CRAFT GUIDE (follow every point)
1. LAYERS, in this paint order:
   a) soft cast-shadow ellipse under the subject (fill #000, opacity .25-.35) and/or a faint radial halo behind it (accent2 at opacity .25 -> 0);
   b) back shapes (things behind the subject: far buildings, back arm, back ear) in cooler, darker, lower-contrast tones (atmospheric depth);
   c) main body shapes, each large surface filled with a 2-3 stop linear/radialGradient (light -> mid -> shadow);
   d) rim light / highlights: light comes from the TOP-LEFT, so highlights sit top-left and a thin warm/accent rim sits on the right edge. Rim-light trick: draw the shape in the rim color, then draw the same shape shifted ~8px toward top-left on top, both inside a <clipPath> of the original shape;
   e) small details that make it recognizable (buttons, windows, rivets, stitches, wrinkles, reflections);
   f) optional soft glow (lamps, magic, screens): a blurred copy (feGaussianBlur stdDeviation 4-8) under a crisp shape. Use blur ONLY for glow, never for the main shapes.
2. PALETTE: max ~8 colors + their gradient shades. Suggested: accent ${pal.accent} (light ${pal.accentLight}, dark ${pal.accentDark}), accent2 ${pal.accent2} (light ${pal.accent2Light}, dark ${pal.accent2Dark}), neutrals ${pal.cream} ${pal.steel} ${pal.charcoal} ${pal.ink}, cool distance tone ${pal.coolShadow}. Accent colors on 1-2 focal spots only; the rest neutrals. The scene behind is dark (${pal.bg}), so keep the subject's main values mid-to-light and separate it from the background with a rim light or halo; avoid big areas of near-black that vanish.
3. PEOPLE: appealing flat-vector characters WITH faces, never faceless blobs. Head ≈ 1/6 of standing height (bust: head ≈ 1/3 of image height); neck, shoulders, ears. Face: two eyes (white ellipse + dark iris + tiny white catchlight), eyebrows (thick, expressive), nose hint (one shaded side + small curve at the bottom), mouth (simple curve showing the emotion), cheek blush at low opacity. Skin gradient ${pal.skin.join(' -> ')} (vary tone if described), hair ${pal.hair.join(' -> ')}. Clothes with folds/lapels/buttons. Period-accurate costume when the topic has a time/place (e.g. 1920s Istanbul: red fez with black tassel, handlebar mustache, three-piece suit, vest with watch chain; Ottoman official: long coat, sash; 1960s: narrow tie, hat). Draw symmetric parts once in <defs> and mirror with <use href="#id" transform="translate(${w} 0) scale(-1 1)"/>.
4. OBJECTS & PLACES: recognizable silhouette first (would it read as a black shape?). Add the 2-3 defining features (a bridge: deck, railing truss, pontoons/arches, lamp posts; a newspaper: folded sheet, columns of grey text-lines, a photo block; a coin: rim, embossed relief). Repeated parts (windows, posts, rivets, stars) via <use> or a small <pattern>.
5. COMPOSITION: one clear focal subject filling ~75-85% of the box, centered, slight 3/4 angle or front view. Everything (incl. strokes and glows) inside the viewBox with at least ${mx}px margin left/right and ${my}px top/bottom. Readable at small size: big shapes first, details second.
6. AVOID: giant flat single-color blobs; drawings made only of thin hairline strokes; strokes thinner than 2px; random scribbles; abstract shapes that don't depict the subject; a full-canvas background rectangle; halos, light pools, fog or glows that run past the viewBox edge (they get cut into a hard straight edge — keep their full radius inside the box); fog, mist, smoke or light beams drawn as rectangles (hard vertical edges) — use ellipses with radial gradients or blurred ellipses instead; ANY text, letters, digits, logos (use grey bars for printed text).
7. TECHNICAL: root exactly <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">. Transparent background. Allowed: path, rect, circle, ellipse, polygon, line, g, use, defs, linearGradient, radialGradient, pattern, clipPath, mask, filter (feGaussianBlur / feDropShadow only). Forbidden: <text>, <image>, <foreignObject>, <script>, CSS animation, external links. Unique short ids. Integer-ish coordinates. Total size under ~20KB — prefer a few well-shaped paths over hundreds of tiny ones.`;
}

/**
 * Tek bir illüstrasyon için çizim istemi. Dönen metinden <svg>…</svg> çıkarılır (extractSVG).
 * @param {{art:string,w:number,h:number,theme?:object,style?:string}} o
 *   style: ART_STYLES anahtarı ('flat'|'retro'|'neon'|'engraving') ya da serbest stil metni.
 */
export function artPrompt({ art, w, h, theme, style } = {}) {
  w = Math.round(Number(w) || 600);
  h = Math.round(Number(h) || 600);
  const pal = artPalette(theme || {});
  const styleText = ART_STYLES[style] || (style ? `STYLE: ${style}` : ART_STYLES.flat);
  const ex = ART_EXAMPLES.map((e, i) => `EXAMPLE ${String.fromCharCode(65 + i)} — "${e.desc}" (${e.w}x${e.h}):\n${e.svg}`).join('\n\n');
  return `You are a senior vector illustrator. Draw ONE illustration as a standalone SVG for a vertical (9:16) narrated short video. It is placed on a dark scene, inside a ${w}x${h} box; the video adds its own captions, so the image must contain no text.

SUBJECT (may be Turkish or English): ${art}

${styleText}

Before writing SVG, silently plan: (1) what exactly is in the picture and its silhouette, (2) the 3-6 layers, (3) the palette, (4) where the light hits. Then output the SVG only.

${craftGuide(w, h, pal)}

QUALITY REFERENCE — two hand-made examples showing the expected level of layering, gradients, faces and detail. Do NOT copy their subject or composition unless it matches; match their craft. Your viewBox must be 0 0 ${w} ${h}.

${ex}

Reply with ONLY the SVG code (from <svg to </svg>), no explanation.`;
}

/**
 * İkinci geçiş: mevcut SVG'yi metin olarak gözden geçirip düzeltilmiş TAM SVG ister.
 * @param {{art:string,svg:string,w:number,h:number}} o
 */
export function critiquePrompt({ art, svg, w, h } = {}) {
  w = Math.round(Number(w) || 600);
  h = Math.round(Number(h) || 600);
  const issues = artIssues(svg, w, h);
  return `You are an art director reviewing an SVG illustration made for a narrated short video. Improve it and return the corrected FULL SVG.

INTENDED SUBJECT: ${art}

Review the code mentally as if rendered, then fix:
1. Subject fidelity: does it clearly depict the subject? Is the silhouette recognizable at small size? Add the 2-3 defining features if missing.
2. People: every person has a face — eyes with iris + catchlight, eyebrows, nose hint, mouth with an emotion — plus neck, ears, believable proportions (head ≈ 1/6 body; bust: head ≈ 1/3 image height) and period-appropriate clothing. Fix faceless heads and blob bodies.
3. Layering & light: cast shadow → back shapes → main body → rim light/highlights (light from top-left) → details → optional glow. Large flat single-color areas get 2-3 stop gradients. Remove hairline-only drawing (min stroke-width 2).
4. Palette: limited and harmonious (≤ ~8 colors); accents only on focal points; the subject must separate from a dark background (rim light or soft halo).
5. Layout: root <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">; everything (incl. glows) inside the viewBox with ~6% margin; subject centered and filling ~75-85%; no full-canvas background rect (transparent background).
6. Remove ALL <text>, letters, digits, <image>, <foreignObject>, <script>, external links, CSS animations. Filters only feGaussianBlur/feDropShadow, and blur only for glow.
7. Keep it under ~20KB; reuse with <use>/<pattern>; keep ids unique; make sure every referenced id (url(#…), href="#…") exists.
${issues.length ? `\nAUTOMATIC CHECKS FOUND:\n- ${issues.join('\n- ')}\n` : ''}
CURRENT SVG:
${svg}

Reply with ONLY the improved SVG code (from <svg to </svg>), no explanation.`;
}

/**
 * Ucuz statik kontroller (render gerekmez). Boş dizi = belirgin sorun yok.
 * @returns {string[]} İngilizce sorun açıklamaları (critiquePrompt'a da eklenir)
 */
export function artIssues(svg, w, h) {
  const s = String(svg || '');
  const out = [];
  if (!/<svg[\s>]/i.test(s)) return ['no <svg> root found'];
  if (s.length > 26000) out.push(`too large (${Math.round(s.length / 1024)}KB); simplify paths, reuse with <use>`);
  if (/<text[\s>]/i.test(s)) out.push('contains <text> — remove all text');
  if (/<image[\s>]/i.test(s)) out.push('contains <image> — draw it with vector shapes');
  const vb = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)/i.exec(s);
  if (!vb) out.push('missing viewBox');
  else if (w && h && (Math.abs(+vb[3] - w) > 1 || Math.abs(+vb[4] - h) > 1)) out.push(`viewBox should be 0 0 ${w} ${h}`);
  const W = vb ? +vb[3] : w, H = vb ? +vb[4] : h;
  if (W && H) {
    const full = [...s.matchAll(/<rect\b[^>]*>/gi)].some((m) => {
      const a = (k) => { const r = new RegExp(`\\s${k}\\s*=\\s*["']([^"']+)`, 'i').exec(m[0]); return r ? r[1] : null; };
      const rw = a('width'), rh = a('height');
      const full = (v, n) => v === '100%' || parseFloat(v) >= n * 0.98;
      return rw && rh && full(rw, W) && full(rh, H) && !/fill\s*=\s*["']none/i.test(m[0]);
    });
    if (full) out.push('full-canvas background rect — background must be transparent');
    // kenardan taşan daire/elips (hale, ışık havuzu): viewBox onu sert bir kenarla keser
    // <defs> içindeki ve dönüşümlü <g> içindeki şekiller yerel koordinatlıdır: sayılmaz
    const flat = s.replace(/<defs[\s\S]*?<\/defs>/gi, '').replace(/<g\b[^>]*\stransform\s*=[^>]*>[\s\S]*?<\/g>/gi, '');
    const over = [...flat.matchAll(/<(circle|ellipse)\b[^>]*>/gi)].filter((m) => {
      const tag = m[0];
      if (/\stransform\s*=/.test(tag)) return false;
      const a = (k) => { const r = new RegExp(`\\s${k}\\s*=\\s*["']([-\\d.]+)`, 'i').exec(tag); return r ? +r[1] : null; };
      const cx = a('cx') ?? 0, cy = a('cy') ?? 0;
      const rx = m[1].toLowerCase() === 'circle' ? a('r') : a('rx'), ry = m[1].toLowerCase() === 'circle' ? a('r') : a('ry');
      if (!rx || !ry) return false;
      const tol = 0.02 * Math.max(W, H);
      return cx - rx < -tol || cx + rx > W + tol || cy - ry < -tol || cy + ry > H + tol;
    }).length;
    if (over) out.push(`${over} circle/ellipse shape(s) (halo/glow/light pool?) extend past the viewBox and will be cut with a hard straight edge — shrink them to fit inside`);
  }
  const grads = (s.match(/<(linear|radial)Gradient/gi) || []).length;
  if (grads < 2) out.push('fewer than 2 gradients — surfaces look flat; add 2-3 stop gradients');
  const shapes = (s.match(/<(path|rect|circle|ellipse|polygon)\b/gi) || []).length;
  if (shapes < 12) out.push(`only ${shapes} shapes — too crude; add layers and details`);
  const ids = new Set([...s.matchAll(/\sid\s*=\s*["']([^"']+)/gi)].map((m) => m[1]));
  const missing = [...new Set([...s.matchAll(/(?:url\(#|href\s*=\s*["']#)([^)"']+)/gi)].map((m) => m[1]))].filter((id) => !ids.has(id));
  if (missing.length) out.push(`references to missing ids: ${missing.slice(0, 6).join(', ')}`);
  return out;
}

/** Plan DSL'ine eklenecek doküman satırı (llm.js planPrompt için). */
export const ART_STYLE_DOC = `- "artStyle": "flat" | "retro" | "neon" | "engraving" (plan kökünde, tüm "art" çizimleri için tek stil; konuya göre seç: tarih/eski İstanbul → retro ya da engraving, bilim/uzay → flat, gece/siber → neon).
- "art" tarifleri İngilizce, somut ve görsel olsun: kim/ne, kıyafet ve dönem, poz/ifade, 2-3 ayırt edici ayrıntı. Örn: "bust portrait of a sly 1920s Istanbul con man, red fez, handlebar mustache, charcoal suit, holding a folded deed". Görselin içine yazı istenmez; yazıyı sahne öğeleri taşır.`;
