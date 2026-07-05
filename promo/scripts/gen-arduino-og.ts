// OG card for the Arduino library product page (public/og/products/arduino-library.png).
// A split card: the pitch on the left, and on the right a floating code editor showing the
// flagship NODRIX_WRITE sketch — so the card shows the library's value (a few lines) instead
// of naming it. Mirrors the site card's build (scripts/gen-site-og.ts) but code, not dashboard.
// Pre-rendered and committed; run `bun run og:arduino` after a design or version change.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PJS = new URL('../node_modules/@expo-google-fonts/plus-jakarta-sans/', import.meta.url);
const extrabold = readFileSync(new URL('800ExtraBold/PlusJakartaSans_800ExtraBold.ttf', PJS));
const semibold = readFileSync(new URL('600SemiBold/PlusJakartaSans_600SemiBold.ttf', PJS));
const medium = readFileSync(new URL('500Medium/PlusJakartaSans_500Medium.ttf', PJS));
const monoReg = readFileSync(resolve(HERE, 'assets/JetBrainsMono-Regular.ttf'));
const monoBold = readFileSync(resolve(HERE, 'assets/JetBrainsMono-Bold.ttf'));

const W = 1200;
const H = 630;

// Brand palette (mirrors gen-site-og.ts / global.css).
const C = {
  coral: '#ff6a45',
  coralStrong: '#ed4a26',
  coralDeep: '#c6381c',
  coralLight: '#ffb59c',
  coral50: '#fff4f1',
  ink: '#171717',
  sub: '#525252',
  faint: '#8a847f',
  line: '#ece6e1',
};

// Editor palette — a dark panel with a GitHub-dark-ish syntax theme; the library's own
// API (Nodrix / NODRIX_WRITE) is lifted to brand coral so it reads as the hero.
const K = {
  bg: '#0f141a',
  head: '#181e26',
  border: '#2b323c',
  plain: '#c9d1d9',
  comment: '#8b949e',
  str: '#a5d6ff',
  kw: '#ff7b72',
  brand: '#ff8a63',
  fn: '#d2a8ff',
};

const logo = readFileSync(resolve(HERE, '../public/dark_logo.png'));
const logoUri = 'data:image/png;base64,' + logo.toString('base64');

const svgUri = (svg: string) => 'data:image/png;base64,' + Buffer.from(new Resvg(svg).render().asPng()).toString('base64');

type Style = Record<string, string | number>;
type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Style, children?: unknown): El => ({ type, props: { style, children } });
const img = (src: string, width: number, height: number, style: Style = {}): El =>
  ({ type: 'img', props: { src, width, height, style } });

// Warm backdrop: near-white base, a faint dot-grid, and a coral halo behind the code panel.
const BACKDROP = (() => {
  const dots: string[] = [];
  for (let y = 16; y < H; y += 30) for (let x = 16; x < W; x += 30) dots.push(`<circle cx="${x}" cy="${y}" r="1.5"/>`);
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdfc"/><stop offset="1" stop-color="#fdf5f1"/></linearGradient>
      <radialGradient id="halo" cx="74%" cy="50%" r="58%">
        <stop offset="0%" stop-color="${C.coral}" stop-opacity="0.22"/>
        <stop offset="55%" stop-color="${C.coral}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${C.coral}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="warm" cx="14%" cy="24%" r="46%">
        <stop offset="0%" stop-color="${C.coralLight}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${C.coralLight}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <g fill="#1c1410" fill-opacity="0.035">${dots.join('')}</g>
    <rect width="${W}" height="${H}" fill="url(#warm)"/>
    <rect width="${W}" height="${H}" fill="url(#halo)"/>
  </svg>`);
})();

// ── Left: the pitch ─────────────────────────────────────────────────────────────────────
const pill = (text: string, accent: boolean): El =>
  h(
    'div',
    {
      display: 'flex',
      fontSize: 17,
      fontWeight: 700,
      color: accent ? C.coralDeep : C.sub,
      backgroundColor: accent ? C.coral50 : '#f4f1ee',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: accent ? '#ffd2c4' : C.line,
      borderRadius: 9999,
      paddingTop: 7,
      paddingBottom: 7,
      paddingLeft: 16,
      paddingRight: 16,
      marginRight: 10,
      marginBottom: 10,
    },
    text,
  );

const left = h(
  'div',
  { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 500, paddingLeft: 68, paddingRight: 8 },
  [
    img(logoUri, 188, 56, { marginBottom: 30 }),
    h('div', { display: 'flex', fontSize: 16, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: C.coralDeep, marginBottom: 16 }, 'Arduino Library'),
    h('div', { display: 'flex', flexDirection: 'column', fontSize: 44, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.1, color: C.ink }, [
      h('div', { display: 'flex' }, 'Skip the boilerplate.'),
      h('div', { display: 'flex', color: C.coralStrong }, 'Ship the sketch.'),
    ]),
    h('div', { display: 'flex', fontSize: 21, fontWeight: 500, lineHeight: 1.4, color: C.sub, marginTop: 20, maxWidth: 400 }, 'Hides WiFi, TLS, and the protocol behind a tiny API.'),
    h('div', { display: 'flex', flexWrap: 'wrap', maxWidth: 420, marginTop: 26 }, [
      pill('ESP32 · ESP8266', true),
      pill('C++', false),
      pill('MIT', false),
      pill('v0.1.0', false),
    ]),
  ],
);

// ── Right: the floating code editor ─────────────────────────────────────────────────────
type Tok = [string, string] | [string, string, boolean];
const CODE: Tok[][] = [
  [['#include ', K.kw], ['<Nodrix.h>', K.str]],
  [[' ', K.plain]],
  [['// a dashboard toggle calls this', K.comment]],
  [['NODRIX_WRITE', K.brand, true], ['(', K.plain], ['"led"', K.str], [') {', K.plain]],
  [['  digitalWrite', K.fn], ['(LED, value.asBool());', K.plain]],
  [['  Nodrix', K.brand], ['.send(', K.plain], ['"led"', K.str], [', value.asBool());', K.plain]],
  [['}', K.plain]],
  [[' ', K.plain]],
  [['void ', K.kw], ['loop', K.fn], ['() {', K.plain]],
  [['  Nodrix', K.brand], ['.run();', K.plain]],
  [['}', K.plain]],
];

const codeLine = (toks: Tok[]): El =>
  h(
    'div',
    { display: 'flex', height: 38, alignItems: 'center' },
    toks.map(([t, color, bold]) =>
      h('div', { display: 'flex', whiteSpace: 'pre', fontFamily: 'JetBrains Mono', fontSize: 24, fontWeight: bold ? 700 : 400, color, lineHeight: 1 }, t),
    ),
  );

const dot = (c: string, ml: number): El => h('div', { display: 'flex', width: 12, height: 12, borderRadius: 9999, backgroundColor: c, marginLeft: ml }, '');

const panel = h(
  'div',
  {
    display: 'flex',
    flexDirection: 'column',
    width: 588,
    backgroundColor: K.bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: K.border,
    borderRadius: 18,
    overflow: 'hidden',
    boxShadow: '0 30px 64px rgba(237,74,38,0.22), 0 14px 30px rgba(15,20,26,0.30)',
  },
  [
    h('div', { display: 'flex', alignItems: 'center', height: 46, paddingLeft: 22, paddingRight: 22, backgroundColor: K.head, borderBottomWidth: 1, borderBottomStyle: 'solid', borderColor: K.border }, [
      dot('#ff6a5f', 0),
      dot('#ffbd44', 8),
      dot('#3fb950', 8),
      h('div', { display: 'flex', fontFamily: 'JetBrains Mono', fontSize: 16, color: '#8b949e', marginLeft: 18 }, 'LedControl.ino'),
    ]),
    h('div', { display: 'flex', flexDirection: 'column', paddingTop: 20, paddingBottom: 22, paddingLeft: 24, paddingRight: 20 }, CODE.map(codeLine)),
  ],
);

const right = h('div', { display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'flex-end', paddingRight: 54 }, panel);

const tree = h(
  'div',
  { display: 'flex', width: W, height: H, position: 'relative', overflow: 'hidden', backgroundColor: '#fffdfc', fontFamily: 'Plus Jakarta Sans' },
  [
    img(BACKDROP, W, H, { position: 'absolute', top: 0, left: 0 }),
    h('div', { display: 'flex', width: W, height: H }, [left, right]),
    // coral edge strip along the bottom
    h('div', { display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, backgroundImage: 'linear-gradient(90deg, #ff6a45, #ffb59c)' }, ''),
  ],
);

const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
  width: W,
  height: H,
  fonts: [
    { name: 'Plus Jakarta Sans', data: extrabold, weight: 800, style: 'normal' },
    { name: 'Plus Jakarta Sans', data: semibold, weight: 600, style: 'normal' },
    { name: 'Plus Jakarta Sans', data: medium, weight: 500, style: 'normal' },
    { name: 'JetBrains Mono', data: monoReg, weight: 400, style: 'normal' },
    { name: 'JetBrains Mono', data: monoBold, weight: 700, style: 'normal' },
  ],
});

const OUT = resolve(HERE, '../public/og/products');
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'arduino-library.png'), Buffer.from(new Resvg(svg).render().asPng()));
console.log('og: arduino library card -> public/og/products/arduino-library.png');
