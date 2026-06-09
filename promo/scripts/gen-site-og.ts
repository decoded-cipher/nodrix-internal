// Site OG image generator — the social card for nodrix.live itself (public/og.png).
// A split hero: the pitch on the left, and on the right a floating dashboard panel built
// from nodrix's own widgets (live area chart, ring gauge, metric, toggle) so the card shows
// the product instead of just naming it. Deliberately unlike the title-driven guide cards
// (scripts/gen-og.ts). Pre-rendered and committed; run `bun run og:site` after brand changes.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FONTS = new URL('../node_modules/@expo-google-fonts/plus-jakarta-sans/', import.meta.url);
const extrabold = readFileSync(new URL('800ExtraBold/PlusJakartaSans_800ExtraBold.ttf', FONTS));
const semibold = readFileSync(new URL('600SemiBold/PlusJakartaSans_600SemiBold.ttf', FONTS));
const medium = readFileSync(new URL('500Medium/PlusJakartaSans_500Medium.ttf', FONTS));

const W = 1200;
const H = 630;

// Brand palette (coral accent scale + warm neutrals), mirrors styles/global.css.
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
  panel: '#f4efec',
};

const logo = readFileSync(resolve(HERE, '../public/dark_logo.png'));
const logoUri = 'data:image/png;base64,' + logo.toString('base64');

const svgUri = (svg: string) => 'data:image/png;base64,' + Buffer.from(new Resvg(svg).render().asPng()).toString('base64');

// Soft, warm backdrop: near-white base, a faint dot-grid for technical texture, and two coral
// glows — one large behind the dashboard so it floats on a halo, one faint behind the headline.
// Pre-rasterized (resvg) so satori never has to render the transparent radial stops.
const BACKDROP = (() => {
  const dots: string[] = [];
  for (let y = 16; y < H; y += 30)
    for (let x = 16; x < W; x += 30) dots.push(`<circle cx="${x}" cy="${y}" r="1.5"/>`);
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fffdfc"/><stop offset="1" stop-color="#fdf5f1"/>
      </linearGradient>
      <radialGradient id="halo" cx="76%" cy="50%" r="58%">
        <stop offset="0%" stop-color="${C.coral}" stop-opacity="0.22"/>
        <stop offset="55%" stop-color="${C.coral}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${C.coral}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="warm" cx="16%" cy="20%" r="46%">
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

// Ring (donut) gauge — track + coral progress arc via a dashed circle rotated to start at top.
const ringSvg = (size: number, p: number) => {
  const sw = Math.round(size * 0.085);
  const r = size / 2 - sw / 2 - 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.coralStrong}"/><stop offset="1" stop-color="#ff8a63"/>
    </linearGradient></defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#efe5e0" stroke-width="${sw}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#r)" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${(p * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>
  </svg>`);
};

// Live-looking area chart — coral line with a soft gradient fill and a dot at the latest point.
const chartSvg = (w: number, h: number) => {
  const data = [0.32, 0.46, 0.4, 0.58, 0.5, 0.66, 0.55, 0.74, 0.64, 0.82, 0.76, 0.92];
  const px = 6;
  const pt = 12;
  const pb = 6;
  const xy = data.map((v, i) => [
    px + (i / (data.length - 1)) * (w - 2 * px),
    h - pb - v * (h - pt - pb),
  ]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(w - px).toFixed(1)} ${h} L${px} ${h} Z`;
  const [lx, ly] = xy[xy.length - 1];
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.coral}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${C.coral}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#a)"/>
    <path d="${line}" fill="none" stroke="${C.coral}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5.5" fill="${C.coralStrong}" stroke="#fff" stroke-width="3"/>
  </svg>`);
};

type Style = Record<string, string | number>;
type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Style, children?: unknown): El => ({ type, props: { style, children } });
const img = (src: string, width: number, height: number, style: Style = {}): El =>
  ({ type: 'img', props: { src, width, height, style } });

const card = (style: Style, children: unknown): El =>
  h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#efe8e3',
      borderRadius: 16,
      boxShadow: '0 1px 2px rgba(23,23,23,0.04)',
      ...style,
    },
    children,
  );

// ── Right: the floating dashboard panel ────────────────────────────────────────────────
// Shared tile vocabulary so every widget reads the same: a small uppercase label, a coral
// delta pill, and a big value with its unit set smaller on the baseline.
const tileLabel = (text: string): El =>
  h('div', { display: 'flex', fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#a8a29e' }, text);

const deltaPill = (text: string): El =>
  h(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      backgroundColor: C.coral50,
      borderRadius: 8,
      paddingTop: 3,
      paddingBottom: 3,
      paddingLeft: 8,
      paddingRight: 9,
      fontSize: 13,
      fontWeight: 700,
      color: C.coralDeep,
    },
    text,
  );

const valueUnit = (value: string, unit: string, size: number): El =>
  h('div', { display: 'flex', alignItems: 'flex-end' }, [
    h('div', { display: 'flex', fontSize: size, fontWeight: 800, color: C.ink, letterSpacing: -1.5, lineHeight: 1 }, value),
    h('div', { display: 'flex', fontSize: Math.round(size * 0.5), fontWeight: 700, color: C.faint, marginLeft: 3, marginBottom: Math.round(size * 0.1) }, unit),
  ]);

const chartTile = card({ padding: 18 }, [
  h('div', { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }, [
    h('div', { display: 'flex', flexDirection: 'column' }, [
      tileLabel('Soil moisture'),
      h('div', { display: 'flex', fontSize: 13, fontWeight: 500, color: C.faint, marginTop: 5 }, 'Greenhouse zone A'),
    ]),
    h('div', { display: 'flex', alignItems: 'center' }, [
      valueUnit('62', '%', 26),
      h('div', { display: 'flex', marginLeft: 10 }, deltaPill('▲ 4%')),
    ]),
  ]),
  img(chartSvg(464, 84), 464, 84, { marginTop: 12 }),
]);

const gaugeTile = card({ padding: 16, flexGrow: 1 }, [
  tileLabel('Humidity'),
  h('div', { display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    h('div', { display: 'flex', position: 'relative', width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }, [
      img(ringSvg(112, 0.72), 112, 112, { position: 'absolute', top: 0, left: 0 }),
      valueUnit('72', '%', 30),
    ]),
  ),
]);

const metricTile = card({ padding: 16, flexGrow: 1 }, [
  tileLabel('Messages / min'),
  h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, [
    h('div', { display: 'flex', fontSize: 42, fontWeight: 800, color: C.ink, letterSpacing: -2, lineHeight: 1 }, '1,248'),
    h('div', { display: 'flex', marginTop: 12 }, deltaPill('▲ 12%')),
  ]),
]);

const toggleSwitch = h(
  'div',
  { display: 'flex', width: 66, height: 36, borderRadius: 9999, backgroundColor: C.coral, padding: 4, justifyContent: 'flex-end' },
  h('div', { display: 'flex', width: 28, height: 28, borderRadius: 9999, backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }),
);

const toggleTile = card({ padding: 16, flexGrow: 1 }, [
  tileLabel('Pump'),
  h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'flex-start', justifyContent: 'center' }, [
    toggleSwitch,
    h('div', { display: 'flex', fontSize: 15, fontWeight: 700, color: C.coralStrong, marginTop: 12 }, 'On'),
  ]),
]);

// window chrome + live badge
const panelHeader = h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingLeft: 4, paddingRight: 2 }, [
  h('div', { display: 'flex', alignItems: 'center' }, [
    h('div', { display: 'flex', width: 11, height: 11, borderRadius: 9999, backgroundColor: '#ff6a45' }),
    h('div', { display: 'flex', width: 11, height: 11, borderRadius: 9999, backgroundColor: '#ffc7b4', marginLeft: 7 }),
    h('div', { display: 'flex', width: 11, height: 11, borderRadius: 9999, backgroundColor: '#e7ddd7', marginLeft: 7 }),
    h('div', { display: 'flex', fontSize: 14, fontWeight: 600, color: C.faint, marginLeft: 14 }, 'Greenhouse'),
  ]),
  h('div', { display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderStyle: 'solid', borderColor: '#efe8e3', borderRadius: 9999, paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 12 }, [
    h('div', { display: 'flex', width: 7, height: 7, borderRadius: 9999, backgroundColor: '#22c55e', marginRight: 7 }),
    h('div', { display: 'flex', fontSize: 13, fontWeight: 600, color: C.sub }, 'Live'),
  ]),
]);

const bottomRow = h('div', { display: 'flex', marginTop: 14, gap: 14 }, [gaugeTile, metricTile, toggleTile]);

const panelTree = h(
  'div',
  {
    display: 'flex',
    flexDirection: 'column',
    width: 540,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e8e1dc',
    borderRadius: 26,
    padding: 20,
    boxShadow: '0 28px 64px rgba(237,74,38,0.20), 0 14px 30px rgba(23,23,23,0.10)',
  },
  [panelHeader, chartTile, bottomRow],
);

// ── Left: the pitch ────────────────────────────────────────────────────────────────────
const headline = h(
  'div',
  { display: 'flex', flexDirection: 'column', fontSize: 58, fontWeight: 800, letterSpacing: -2, lineHeight: 1.04, color: C.ink },
  [
    h('div', { display: 'flex' }, 'Your own'),
    h('div', { display: 'flex' }, 'IoT cloud,'),
    h('div', { display: 'flex', color: C.coralStrong }, 'on Cloudflare.'),
  ],
);

const subline = h(
  'div',
  { display: 'flex', fontSize: 22, fontWeight: 500, lineHeight: 1.4, color: C.sub, marginTop: 22, maxWidth: 430 },
  'Realtime dashboards, automations, and a clean read API — deployed to your own account in one click.',
);

const deployBtn = h(
  'div',
  {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: C.coral,
    borderRadius: 12,
    paddingTop: 13,
    paddingBottom: 13,
    paddingLeft: 22,
    paddingRight: 22,
    marginTop: 32,
    boxShadow: '0 12px 26px rgba(255,106,69,0.40)',
  },
  [
    h('div', { display: 'flex', fontSize: 20, fontWeight: 700, color: '#fff' }, 'Deploy to Cloudflare'),
    h('div', { display: 'flex', fontSize: 20, fontWeight: 700, color: '#fff', marginLeft: 10 }, '→'),
  ],
);

const left = h(
  'div',
  { display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 560, paddingLeft: 70, paddingRight: 20 },
  [img(logoUri, 210, 70, { marginBottom: 34 }), headline, subline, deployBtn],
);

const right = h(
  'div',
  { display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'flex-end', paddingRight: 60 },
  panelTree,
);

const tree = h(
  'div',
  {
    display: 'flex',
    width: W,
    height: H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#fffdfc',
    fontFamily: 'Plus Jakarta Sans',
  },
  [
    img(BACKDROP, W, H, { position: 'absolute', top: 0, left: 0 }),
    h('div', { display: 'flex', width: W, height: H }, [left, right]),
  ],
);

const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
  width: W,
  height: H,
  fonts: [
    { name: 'Plus Jakarta Sans', data: extrabold, weight: 800, style: 'normal' },
    { name: 'Plus Jakarta Sans', data: semibold, weight: 600, style: 'normal' },
    { name: 'Plus Jakarta Sans', data: medium, weight: 500, style: 'normal' },
  ],
});

writeFileSync(resolve(HERE, '../public/og.png'), Buffer.from(new Resvg(svg).render().asPng()));
console.log('og: site card -> public/og.png');
