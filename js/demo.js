// Açılışta gösterilen örnek proje: "The Thing" (1945 dinleme cihazı).
// Ses yok; kelime zamanları tahmini. Görseller elle çizilmiş SVG'ler.
import { estimateWords, segmentsFromWords } from './script.js';

export const DEMO_SCRIPT = `[quietly curious]
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

[lower, mysterious]
İşin sırrı, dışarıdan gönderilen radyo dalgalarındaydı.

Sovyetler, dışarıdaki bir vericiden armaya radyo sinyali gönderiyordu.

[measured, explanatory]
Odadaki konuşmalar, cihazın içindeki ince metal zarı titreştiriyordu.

Bu titreşimler, geri yansıyan radyo sinyalini değiştiriyordu.

Dışarıdaki alıcı da bu değişimleri yeniden sese dönüştürüyordu!

[slightly amazed]
Yani cihaz, odadaki konuşmaları uzaktan dinletebiliyordu!

Üstelik radyo sinyali kapatıldığında… neredeyse tespit edilemiyordu.

[dramatic pause]

[concluding, mysterious]
1952 yılında sır ortaya çıktı.

Bir düşünsene…

Yedi yıl boyunca duvarda duran bir hediye…

Aslında odadaki konuşmaların gizli dinleyicisiydi!`;

const notches = Array.from({ length: 24 }, (_, i) => `<use href="#n" transform="rotate(${i * 15} 300 300)"/>`).join('');
const stars = [[300, 118], [262, 128], [338, 128], [232, 150], [368, 150], [280, 150], [320, 150], [254, 172], [346, 172]]
  .map(([x, y]) => `<path transform="translate(${x} ${y})" d="M0-9 2.6-3 9-2.8 4-1 5.6 6.5 0 2.6-5.6 6.5-4-1-9-2.8-2.6-3Z" fill="#fff1d2"/>`)
  .join('');

const SEAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
<defs>
<radialGradient id="w" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#e6ad6c"/><stop offset=".55" stop-color="#b8733a"/><stop offset="1" stop-color="#6a3816"/></radialGradient>
<radialGradient id="w2" cx="45%" cy="35%" r="65%"><stop offset="0" stop-color="#f4cb92"/><stop offset="1" stop-color="#b9783e"/></radialGradient>
<linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93552a"/><stop offset="1" stop-color="#55290f"/></linearGradient>
<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7dcae"/><stop offset="1" stop-color="#c98b4d"/></linearGradient>
<clipPath id="sc"><path d="M255 262H345V322C345 360 300 386 300 386S255 360 255 322Z"/></clipPath>
<g id="n"><path d="M300 18V50" stroke="#5a2c0e" stroke-width="7" stroke-linecap="round" opacity=".55"/></g>
<g id="wing"><path d="M270 252C222 200 170 162 104 140L116 176 96 190 122 214 100 236 132 256 114 280 150 292 138 318 182 318 180 342 264 332Z" fill="url(#e)"/>
<path d="M240 232C200 214 160 196 126 186M236 258C196 248 158 236 120 232M234 286C200 282 168 278 140 276M238 312C214 312 196 314 176 320" stroke="#c88a50" stroke-width="4" fill="none" opacity=".5" stroke-linecap="round"/></g>
</defs>
<circle cx="300" cy="300" r="288" fill="url(#w)"/>
<circle cx="300" cy="300" r="284" fill="none" stroke="#4a240b" stroke-width="10"/>
${notches}
<circle cx="300" cy="300" r="232" fill="url(#w2)" stroke="#7a4420" stroke-width="8"/>
<g fill="none" stroke="#9a5d2c" stroke-width="3" opacity=".28"><path d="M90 250C200 220 400 280 510 240"/><path d="M80 330C220 300 380 360 520 320"/><path d="M110 410C230 390 370 430 490 400"/><path d="M120 180C230 160 370 200 480 170"/></g>
${stars}
<use href="#wing"/><use href="#wing" transform="translate(600 0) scale(-1 1)"/>
<path d="M276 372 300 440 324 372Z" fill="url(#e)"/><path d="M288 380 300 430M312 380 300 430" stroke="#c88a50" stroke-width="3" opacity=".5"/>
<ellipse cx="300" cy="300" rx="54" ry="88" fill="url(#e)"/>
<ellipse cx="294" cy="236" rx="30" ry="24" fill="#f2e1c0"/>
<circle cx="286" cy="208" r="30" fill="#f6e8cc"/>
<path d="M262 200 232 213 262 220Z" fill="#e9a630"/>
<circle cx="279" cy="200" r="4.5" fill="#2a1406"/>
<path d="M255 262H345V322C345 360 300 386 300 386S255 360 255 322Z" fill="url(#sh)" stroke="#55290f" stroke-width="5"/>
<g clip-path="url(#sc)"><rect x="255" y="262" width="90" height="24" fill="#d39a5e"/><g stroke="#a1612c" stroke-width="6">
<path d="M266 286V390M277 286V390M288 286V390M299 286V390M310 286V390M321 286V390M332 286V390M343 286V390"/></g></g>
<path d="M232 380C214 396 204 414 200 432" stroke="#55290f" stroke-width="6" fill="none" stroke-linecap="round"/>
<g fill="#7a4a1e"><ellipse cx="212" cy="398" rx="12" ry="6" transform="rotate(-40 212 398)"/><ellipse cx="204" cy="416" rx="12" ry="6" transform="rotate(30 204 416)"/><ellipse cx="226" cy="388" rx="11" ry="5" transform="rotate(40 226 388)"/></g>
<g stroke="#55290f" stroke-width="5" stroke-linecap="round"><path d="M366 378 404 430M374 372 414 420M358 384 392 438"/></g>
<g fill="#55290f"><path d="M404 430 396 418 410 420Z"/><path d="M414 420 404 410 418 410Z"/><path d="M392 438 384 426 398 428Z"/></g>
</svg>`;

const OFFICE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 760" width="900" height="760">
<defs>
<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3a26"/><stop offset="1" stop-color="#2e1d12"/></linearGradient>
<linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3a78"/><stop offset="1" stop-color="#3d6fc0"/></linearGradient>
<linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5326"/><stop offset="1" stop-color="#4a2a12"/></linearGradient>
<radialGradient id="lamp" cx="50%" cy="0%" r="80%"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
<radialGradient id="pl" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#e8b070"/><stop offset="1" stop-color="#8a4f22"/></radialGradient>
</defs>
<rect x="20" y="20" width="860" height="720" rx="36" fill="url(#wall)"/>
<g stroke="#2a190e" stroke-width="5" opacity=".7"><path d="M150 20V520M300 20V520M600 20V520M750 20V520"/></g>
<g fill="none" stroke="#7a5236" stroke-width="3" opacity=".35"><rect x="40" y="60" width="90" height="420" rx="8"/><rect x="170" y="60" width="110" height="420" rx="8"/><rect x="620" y="60" width="110" height="420" rx="8"/></g>
<rect x="640" y="90" width="200" height="280" rx="14" fill="url(#win)" stroke="#2a190e" stroke-width="10"/>
<path d="M740 90V370M640 230H840" stroke="#2a190e" stroke-width="8"/>
<circle cx="800" cy="135" r="16" fill="#f4f1d0" opacity=".9"/>
<g fill="#ffffff" opacity=".7"><circle cx="680" cy="130" r="2.5"/><circle cx="710" cy="180" r="2"/><circle cx="780" cy="200" r="2"/><circle cx="670" cy="300" r="2"/></g>
<path d="M620 80C650 160 640 300 626 390H600V80Z" fill="#7a1f2a"/><path d="M860 80C830 160 840 300 854 390H880V80Z" fill="#7a1f2a"/>
<circle cx="390" cy="230" r="118" fill="#000" opacity=".25"/>
<circle cx="385" cy="222" r="112" fill="url(#pl)" stroke="#4a240b" stroke-width="8"/>
<circle cx="385" cy="222" r="84" fill="none" stroke="#7a4420" stroke-width="5"/>
<path d="M385 175C360 160 330 150 300 148L322 200 360 210ZM385 175C410 160 440 150 470 148L448 200 410 210Z" fill="#6a3714"/>
<ellipse cx="385" cy="222" rx="22" ry="40" fill="#6a3714"/><circle cx="380" cy="178" r="13" fill="#f2e1c0"/>
<path d="M366 210H404V236C404 252 385 262 385 262S366 252 366 236Z" fill="#f2cf98"/>
<rect x="20" y="520" width="860" height="220" fill="#24160d"/>
<path d="M90 560H810L840 640H60Z" fill="url(#desk)"/>
<rect x="60" y="640" width="780" height="26" fill="#3a2010"/>
<rect x="100" y="666" width="40" height="74" fill="#3a2010"/><rect x="760" y="666" width="40" height="74" fill="#3a2010"/>
<path d="M150 380 260 380 300 560 110 560Z" fill="url(#lamp)"/>
<path d="M170 340H240L262 390H148Z" fill="#2f6b4a"/><rect x="200" y="390" width="10" height="160" fill="#c9a24a"/><ellipse cx="205" cy="556" rx="42" ry="10" fill="#c9a24a"/>
<rect x="420" y="530" width="150" height="34" rx="4" fill="#efe6d0"/><rect x="430" y="520" width="150" height="34" rx="4" fill="#f8f2e2" transform="rotate(-4 505 537)"/>
<rect x="640" y="500" width="60" height="62" rx="6" fill="#20242e"/><circle cx="670" cy="520" r="12" fill="none" stroke="#c9a24a" stroke-width="4"/>
</svg>`;

const DEVICE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 760" width="620" height="760">
<defs>
<linearGradient id="m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f7890"/><stop offset=".35" stop-color="#eef2f8"/><stop offset=".6" stop-color="#b7bfcf"/><stop offset="1" stop-color="#4c556b"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8861a"/><stop offset=".45" stop-color="#ffe7a0"/><stop offset="1" stop-color="#a8740f"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd25e" stop-opacity=".55"/><stop offset="1" stop-color="#ffd25e" stop-opacity="0"/></radialGradient>
</defs>
<ellipse cx="310" cy="130" rx="190" ry="90" fill="url(#glow)"/>
<ellipse cx="310" cy="130" rx="130" ry="34" fill="url(#g)" stroke="#7a5208" stroke-width="4"/>
<ellipse cx="310" cy="126" rx="96" ry="22" fill="none" stroke="#fff4c8" stroke-width="3" opacity=".7"/>
<ellipse cx="310" cy="130" rx="60" ry="14" fill="none" stroke="#fff4c8" stroke-width="2" opacity=".5"/>
<path d="M180 150V215M440 150V215" stroke="#9fb4ff" stroke-width="3" stroke-dasharray="10 10" opacity=".7"/>
<path d="M180 240V470C180 500 240 520 310 520S440 500 440 470V240Z" fill="url(#m)"/>
<ellipse cx="310" cy="240" rx="130" ry="34" fill="#cfd6e3" stroke="#5a637a" stroke-width="4"/>
<ellipse cx="310" cy="240" rx="100" ry="24" fill="#2b3245"/>
<ellipse cx="310" cy="244" rx="70" ry="14" fill="#11151f"/>
<g stroke="#ffffff" stroke-width="3" opacity=".35"><path d="M220 280V480M250 280V495"/></g>
<g stroke="#3d4559" stroke-width="2" opacity=".5"><path d="M180 330C240 350 380 350 440 330M180 410C240 430 380 430 440 410"/></g>
<rect x="301" y="510" width="18" height="200" rx="6" fill="url(#m)"/>
<circle cx="310" cy="718" r="18" fill="url(#m)" stroke="#4c556b" stroke-width="3"/>
<path d="M330 560 380 560" stroke="#9fb4ff" stroke-width="3" stroke-dasharray="8 8" opacity=".6"/>
</svg>`;

const VAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360" width="480" height="360">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d7a64"/><stop offset="1" stop-color="#2f4234"/></linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfe0ff"/><stop offset="1" stop-color="#4a77a8"/></linearGradient>
<linearGradient id="d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f4f8"/><stop offset="1" stop-color="#8c94a6"/></linearGradient>
</defs>
<ellipse cx="240" cy="330" rx="210" ry="16" fill="#000" opacity=".35"/>
<path d="M40 150H330L400 200 440 210V300H40Z" fill="url(#b)" stroke="#1d2a20" stroke-width="5" stroke-linejoin="round"/>
<path d="M340 160 395 205H340Z" fill="url(#gl)" stroke="#1d2a20" stroke-width="4"/>
<rect x="70" y="175" width="90" height="50" rx="8" fill="#22302a"/><rect x="180" y="175" width="120" height="50" rx="8" fill="#22302a"/>
<path d="M40 248H440" stroke="#1d2a20" stroke-width="4"/><rect x="420" y="250" width="22" height="16" rx="4" fill="#ffd36b"/>
<path d="M120 150 150 120H170L140 150Z" fill="#3a4a3f"/>
<rect x="150" y="104" width="12" height="46" fill="#8c94a6"/>
<path d="M120 40C150 50 190 80 210 118L140 128Z" fill="url(#d)" stroke="#5b6375" stroke-width="4" stroke-linejoin="round"/>
<path d="M165 84 210 52" stroke="#8c94a6" stroke-width="5" stroke-linecap="round"/><circle cx="212" cy="50" r="8" fill="#ff5d6c"/>
<g><circle cx="120" cy="300" r="38" fill="#14181f"/><circle cx="120" cy="300" r="16" fill="#9aa3b5"/><circle cx="360" cy="300" r="38" fill="#14181f"/><circle cx="360" cy="300" r="16" fill="#9aa3b5"/></g>
<path d="M60 236 Q 70 226 90 236" stroke="#c9d8c9" stroke-width="3" fill="none" opacity=".5"/>
</svg>`;

const RECEIVER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 440" width="460" height="440">
<defs>
<linearGradient id="bx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5470"/><stop offset="1" stop-color="#232a3c"/></linearGradient>
<linearGradient id="hp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f4f"/><stop offset="1" stop-color="#16191f"/></linearGradient>
<radialGradient id="sc" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#1f6b4a"/><stop offset="1" stop-color="#0b2a1f"/></radialGradient>
</defs>
<path d="M120 150C120 40 340 40 340 150" fill="none" stroke="url(#hp)" stroke-width="22" stroke-linecap="round"/>
<rect x="88" y="130" width="64" height="96" rx="28" fill="url(#hp)"/><rect x="308" y="130" width="64" height="96" rx="28" fill="url(#hp)"/>
<rect x="100" y="148" width="40" height="60" rx="18" fill="#c94a5a"/><rect x="320" y="148" width="40" height="60" rx="18" fill="#c94a5a"/>
<rect x="30" y="240" width="400" height="180" rx="22" fill="url(#bx)" stroke="#141826" stroke-width="5"/>
<rect x="56" y="266" width="190" height="128" rx="14" fill="url(#sc)" stroke="#0a1410" stroke-width="5"/>
<path d="M66 330C80 300 92 360 106 330S132 290 146 330 172 370 186 330 212 300 236 330" fill="none" stroke="#6dffb0" stroke-width="5" stroke-linecap="round"/>
<g fill="#cfd6e3"><circle cx="300" cy="300" r="26"/><circle cx="372" cy="300" r="26"/></g>
<g stroke="#232a3c" stroke-width="5" stroke-linecap="round"><path d="M300 300 312 284M372 300 360 284"/></g>
<rect x="278" y="350" width="120" height="16" rx="8" fill="#141826"/><rect x="278" y="350" width="70" height="16" rx="8" fill="#ffc83d"/>
<circle cx="410" cy="262" r="6" fill="#6dffb0"/>
</svg>`;

const BATTERY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
<defs><linearGradient id="bt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2b7a52"/><stop offset=".45" stop-color="#7ef0b0"/><stop offset="1" stop-color="#1d5a3c"/></linearGradient></defs>
<rect x="120" y="20" width="60" height="34" rx="8" fill="#c8ced9"/>
<rect x="60" y="50" width="180" height="340" rx="30" fill="url(#bt)" stroke="#123824" stroke-width="6"/>
<rect x="60" y="50" width="180" height="90" rx="30" fill="#e7ecf3" opacity=".9"/>
<path d="M162 170 112 260H150L136 340 192 236H152Z" fill="#ffe36b" stroke="#a67c00" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

const PLUG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
<defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b6478"/><stop offset=".45" stop-color="#e8ecf4"/><stop offset="1" stop-color="#4a5266"/></linearGradient></defs>
<rect x="104" y="20" width="22" height="90" rx="6" fill="#d9a63a"/><rect x="174" y="20" width="22" height="90" rx="6" fill="#d9a63a"/>
<path d="M70 100H230V200C230 250 190 270 150 270S70 250 70 200Z" fill="url(#pg)" stroke="#2b3142" stroke-width="6"/>
<path d="M150 270C150 330 90 330 90 400" fill="none" stroke="#1d2230" stroke-width="22" stroke-linecap="round"/>
</svg>`;

export const DEMO_ARTS = {
  seal: { prompt: 'Carved wooden Great Seal of the United States plaque', w: 600, h: 600, svg: SEAL },
  office: { prompt: "Ambassador's study at night with the seal on the wall", w: 900, h: 760, svg: OFFICE },
  device: { prompt: 'Exploded view of the passive cavity bug: membrane, cavity, antenna', w: 620, h: 760, svg: DEVICE },
  van: { prompt: 'Soviet van with a dish antenna', w: 480, h: 360, svg: VAN },
  receiver: { prompt: 'Headphones and a radio receiver with an oscilloscope', w: 460, h: 440, svg: RECEIVER },
  battery: { prompt: 'Battery', w: 300, h: 420, svg: BATTERY },
  plug: { prompt: 'Power plug', w: 300, h: 420, svg: PLUG },
};

const X = (x, y, s, cue) => [
  { type: 'shape', shape: 'line', x: x - s, y: y - s, x2: x + s, y2: y + s, stroke: 'accent', lineWidth: 26, in: 'draw', inDur: 0.25, cue, glow: true },
  { type: 'shape', shape: 'line', x: x + s, y: y - s, x2: x - s, y2: y + s, stroke: 'accent', lineWidth: 26, in: 'draw', inDur: 0.25, cue, offset: 0.15, glow: true },
];

export const DEMO_PLAN = {
  theme: { accent: '#ff4d6d', accent2: '#ffc83d' },
  ambience: null,
  scenes: [
    { from: 0, to: 0, transition: 'zoom', camera: { zoom: [1, 1.06] }, elements: [
      { type: 'particles', count: 36 },
      { type: 'text', text: 'BU HEDİYE\n*7 YIL* DİNLEDİ', size: 104, color: 'accent', glow: true, y: 300, in: 'pop' },
      { type: 'art', id: 'seal', x: 540, y: 820, w: 620, h: 620, loop: 'float' },
      { type: 'text', text: '1945', font: 'number', size: 120, color: 'accent2', glow: true, y: 1200, in: 'stamp', cue: '1945' },
    ] },
    { from: 1, to: 1, transition: 'flash', camera: { zoom: [1.05, 1.12] }, elements: [
      { type: 'waves', x: 540, y: 820, ring: true, count: 5, length: 520, speed: 0.5, color: 'accent', cue: 'dinleme' },
      { type: 'art', id: 'seal', x: 540, y: 820, w: 560, h: 560, in: 'none', loop: 'pulse' },
      { type: 'text', text: 'DİNLEME CİHAZI!', size: 108, color: 'accent', glow: true, y: 300, in: 'stamp', cue: 'dinleme' },
      { type: 'shake', cue: 'dinleme', offset: 0.25, amp: 16 },
      { type: 'equalizer', y: 1190, w: 460, h: 110, cue: 'hediye' },
    ] },
    { from: 2, to: 3, transition: 'slide', camera: { zoom: [1, 1.07] }, elements: [
      { type: 'text', text: 'BÜYÜKELÇİNİN *ODASI*', size: 84, glow: 'accent2', y: 260, in: 'slideDown' },
      { type: 'art', id: 'office', x: 540, y: 790, w: 900, h: 760, in: 'fade' },
      { type: 'shape', shape: 'ring', x: 525, y: 642, r: 140, stroke: 'accent2', lineWidth: 8, in: 'draw', cue: 'asıldı', glow: true },
      { type: 'counter', from: 0, to: 7, duration: 1.2, suffix: ' YIL', size: 150, color: 'accent', y: 1210, cue: 'yedi', in: 'pop' },
    ] },
    { from: 4, to: 5, transition: 'zoom', camera: { zoom: [1, 1.05] }, elements: [
      { type: 'text', text: 'NASIL FARK\nEDİLMEDİ?', size: 100, color: 'text', glow: 'accent', y: 330, in: 'pop', until: 2.4 },
      { type: 'text', text: 'PİL YOK · KABLO YOK', size: 76, color: 'accent2', glow: true, y: 300, cue: 'pili', in: 'slideDown' },
      { type: 'art', id: 'battery', x: 330, y: 840, w: 300, h: 420, cue: 'pili', offset: -0.3, in: 'pop', loop: 'float' },
      ...X(330, 840, 130, 'vardı'),
      { type: 'art', id: 'plug', x: 750, y: 840, w: 300, h: 420, cue: 'elektrik', offset: -0.3, in: 'pop', loop: 'float', loopSpeed: 1.2 },
      ...X(750, 840, 130, 'kablosu'),
    ] },
    { from: 6, to: 7, transition: 'fade', camera: { zoom: [1, 1.06] }, elements: [
      { type: 'text', text: 'RADYO *DALGALARI*', size: 92, glow: 'accent', y: 260, in: 'type' },
      { type: 'art', id: 'seal', x: 780, y: 620, w: 380, h: 380, in: 'fade', loop: 'sway' },
      { type: 'art', id: 'van', x: 300, y: 1090, w: 460, h: 345, in: 'slideRight', cue: 'vericiden', offset: -0.4 },
      { type: 'waves', x: 360, y: 980, tx: 780, ty: 620, count: 5, length: 560, spread: 60, speed: 0.7, color: 'accent2', cue: 'sinyali', offset: -0.5 },
    ] },
    { from: 8, to: 8, transition: 'zoom', camera: { zoom: [1.02, 1.1] }, elements: [
      { type: 'text', text: 'İNCE *METAL ZAR*', size: 88, glow: 'accent', y: 240, in: 'slideDown' },
      { type: 'art', id: 'device', x: 540, y: 780, w: 560, h: 686, in: 'zoom', loop: 'vibrate', loopSpeed: 0.8, cue: 'cihazın' },
      { type: 'equalizer', x: 220, y: 560, w: 200, h: 120, bars: 7, color: 'accent', cue: 'konuşmalar' },
      { type: 'shape', shape: 'arrow', x: 300, y: 560, x2: 410, y2: 520, stroke: 'accent', lineWidth: 8, in: 'draw', cue: 'zarı' },
    ] },
    { from: 9, to: 10, transition: 'slide', camera: { zoom: [1, 1.05] }, elements: [
      { type: 'text', text: 'SİNYAL → *SES*', size: 100, glow: 'accent', y: 260, in: 'pop' },
      { type: 'art', id: 'seal', x: 300, y: 640, w: 360, h: 360, in: 'fade', loop: 'vibrate', loopSpeed: 0.5 },
      { type: 'waves', x: 420, y: 720, tx: 760, ty: 1000, count: 4, length: 420, spread: 50, speed: 0.8, color: 'accent', cue: 'yansıyan' },
      { type: 'art', id: 'receiver', x: 760, y: 1010, w: 400, h: 383, in: 'slideLeft', cue: 'alıcı', offset: -0.3 },
      { type: 'equalizer', x: 760, y: 1250, w: 320, h: 70, bars: 10, cue: 'sese' },
    ] },
    { from: 11, to: 11, transition: 'zoom', camera: { zoom: [1, 1.08] }, elements: [
      { type: 'text', text: 'UZAKTAN\n*DİNLEME*', size: 120, color: 'text', glow: 'accent', y: 330, in: 'stamp', cue: 'uzaktan' },
      { type: 'art', id: 'receiver', x: 540, y: 860, w: 560, h: 536, in: 'pop', loop: 'pulse' },
      { type: 'waves', x: 540, y: 760, ring: true, count: 4, length: 420, color: 'accent2', speed: 0.6 },
    ] },
    { from: 12, to: 12, transition: 'fade', camera: { zoom: [1.05, 1] }, elements: [
      { type: 'art', id: 'seal', x: 540, y: 790, w: 540, h: 540, in: 'fade', opacity: 0.85 },
      { type: 'waves', x: 540, y: 790, ring: true, count: 4, length: 460, color: 'accent', speed: 0.5, until: 2.0 },
      { type: 'text', text: 'SİNYAL KAPALI', size: 90, color: 'text', glow: 'accent', y: 280, in: 'slideDown', cue: 'kapatıldığında' },
      { type: 'text', text: 'TESPİT EDİLEMEZ', size: 70, color: 'accent2', y: 1200, in: 'pop', cue: 'tespit', box: { fill: 'rgba(8,10,20,0.9)', stroke: 'accent2', radius: 60 } },
    ] },
    { from: 13, to: 13, transition: 'flash', camera: { zoom: [1.1, 1] }, elements: [
      { type: 'particles', count: 60, color: 'rgba(255,200,61,0.9)' },
      { type: 'text', text: '1952', font: 'number', size: 320, color: 'accent2', glow: true, y: 780, in: 'stamp', cue: '1952' },
      { type: 'shake', cue: '1952', offset: 0.28, amp: 22 },
      { type: 'flash', cue: '1952', offset: 0.25 },
      { type: 'text', text: 'SIR ORTAYA ÇIKTI', size: 86, color: 'text', glow: 'accent', y: 1080, in: 'slideUp', cue: 'sır' },
    ] },
    { from: 14, to: 16, transition: 'zoom', camera: { zoom: [1, 1.1] }, elements: [
      { type: 'particles', count: 30 },
      { type: 'art', id: 'seal', x: 540, y: 800, w: 640, h: 640, in: 'zoom', loop: 'float', glow: 'accent2' },
      { type: 'waves', x: 540, y: 800, ring: true, count: 4, length: 540, color: 'accent', speed: 0.35, cue: 'duvarda' },
      { type: 'text', text: 'GİZLİ\n*DİNLEYİCİ*', size: 120, color: 'accent', glow: true, y: 300, in: 'stamp', cue: 'gizli' },
    ] },
  ],
};

export function demoProject() {
  const duration = 54;
  const words = estimateWords(DEMO_SCRIPT, duration);
  return {
    version: 1,
    demo: true,
    topic: 'Soğuk Savaş’ta Amerikan büyükelçiliğine hediye edilen ve 7 yıl boyunca fark edilmeyen dinleme cihazı (The Thing)',
    seconds: 60,
    title: 'Pilsiz dinleme cihazı',
    script: DEMO_SCRIPT,
    duration,
    words,
    segments: segmentsFromWords(words),
    plan: DEMO_PLAN,
    arts: DEMO_ARTS,
    sfx: [],
  };
}
