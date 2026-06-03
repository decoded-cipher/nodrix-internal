// Dynamic OG image generator. Renders a branded, light-themed 1200x630 PNG using satori
// (element tree -> SVG) and resvg (SVG -> PNG). The visual is driven by the page's own
// data — a large board/category watermark, a category pill, and the title — so every image
// is distinct rather than sharing one illustration. Reusable for any pSEO page.
//
// Dev-only: runs locally via `bun run og:gen`; PNGs are committed under public/og/ so the
// Cloudflare build never imports satori/resvg.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';

const FONTS = new URL('../../node_modules/@expo-google-fonts/plus-jakarta-sans/', import.meta.url);
const extrabold = readFileSync(new URL('800ExtraBold/PlusJakartaSans_800ExtraBold.ttf', FONTS));
const semibold = readFileSync(new URL('600SemiBold/PlusJakartaSans_600SemiBold.ttf', FONTS));

const logo = readFileSync(new URL('../../public/dark_logo.png', import.meta.url));
const logoUri = 'data:image/png;base64,' + logo.toString('base64');

// Aurora background — soft, blurred coral glows echoing the home-page hero. Built as a real
// SVG (radial gradients + gaussian blur) and pre-rasterized with resvg, because satori's own
// radial gradients render their transparent stop as a dark blob. Computed once, reused.
const AURORA = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
      <radialGradient id="g1"><stop offset="0%" stop-color="#ff6a45" stop-opacity="0.34"/><stop offset="70%" stop-color="#ff6a45" stop-opacity="0"/></radialGradient>
      <radialGradient id="g2"><stop offset="0%" stop-color="#ffa489" stop-opacity="0.32"/><stop offset="70%" stop-color="#ffa489" stop-opacity="0"/></radialGradient>
      <radialGradient id="g3"><stop offset="0%" stop-color="#ff7d5b" stop-opacity="0.26"/><stop offset="72%" stop-color="#ff7d5b" stop-opacity="0"/></radialGradient>
      <filter id="b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="70"/></filter>
    </defs>
    <rect width="1200" height="630" fill="#ffffff"/>
    <g filter="url(#b)">
      <circle cx="120" cy="-20" r="340" fill="url(#g1)"/>
      <circle cx="1160" cy="40" r="300" fill="url(#g2)"/>
      <circle cx="640" cy="-120" r="260" fill="url(#g3)"/>
      <circle cx="1080" cy="600" r="270" fill="url(#g3)"/>
      <circle cx="40" cy="640" r="230" fill="url(#g2)"/>
    </g>
  </svg>`;
  return 'data:image/png;base64,' + Buffer.from(new Resvg(svg).render().asPng()).toString('base64');
})();

type Style = Record<string, string | number>;
type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Style, children?: unknown): El => ({ type, props: { style, children } });

const pill = (text: string): El =>
  h(
    'div',
    {
      display: 'flex',
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: '#c6381c',
      backgroundColor: '#fff4f1',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#ffd2c4',
      borderRadius: 9999,
      paddingTop: 9,
      paddingBottom: 9,
      paddingLeft: 20,
      paddingRight: 20,
    },
    text,
  );

export type OgInput = { title: string; category?: string; board?: string; tagline?: string };

export async function ogImagePng({
  title,
  category,
  board,
  tagline = 'Your own IoT cloud, on Cloudflare',
}: OgInput): Promise<Buffer> {
  // Large faint watermark — the board only (category already shows in the pill).
  const watermark = board ? board.toUpperCase() : '';
  const wsize = watermark.length <= 6 ? 250 : watermark.length <= 9 ? 200 : 150;

  const tree = h(
    'div',
    {
      display: 'flex',
      width: 1200,
      height: 630,
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: '#ffffff',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#e9e9ec',
      fontFamily: 'Plus Jakarta Sans',
    },
    [
      // aurora background, full bleed
      { type: 'img', props: { src: AURORA, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0 } } },
      // data-driven watermark, bottom-right (above aurora, behind content)
      watermark
        ? h('div', { display: 'flex', position: 'absolute', right: 56, bottom: -8, fontSize: wsize, fontWeight: 800, letterSpacing: -4, color: 'rgba(17,17,17,0.05)' }, watermark)
        : h('div', { display: 'flex' }),
      // content
      h('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, padding: 72 }, [
        h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
          { type: 'img', props: { src: logoUri, width: 170, height: 50 } },
          category ? pill(category) : h('div', { display: 'flex' }),
        ]),
        h('div', { display: 'flex', flexGrow: 1 }),
        h('div', { display: 'flex', width: 76, height: 7, borderRadius: 9999, backgroundColor: '#ff6a45' }),
        h('div', { display: 'flex', fontSize: 64, fontWeight: 800, color: '#141414', lineHeight: 1.08, letterSpacing: -1.5, marginTop: 26, maxWidth: 930 }, title),
        h('div', { display: 'flex', flexGrow: 1 }),
        h('div', { display: 'flex', alignItems: 'center' }, [
          h('div', { display: 'flex', fontSize: 24, fontWeight: 600, color: '#404040' }, 'nodrix.live'),
          h('div', { display: 'flex', width: 5, height: 5, borderRadius: 9999, backgroundColor: '#d4d4d4', marginLeft: 14, marginRight: 14 }),
          h('div', { display: 'flex', fontSize: 24, color: '#737373' }, tagline),
        ]),
      ]),
      // coral edge strip along the bottom
      h('div', { display: 'flex', position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, backgroundImage: 'linear-gradient(90deg, #ff6a45, #ffb59c)' }),
    ],
  );

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Plus Jakarta Sans', data: extrabold, weight: 800, style: 'normal' },
      { name: 'Plus Jakarta Sans', data: semibold, weight: 600, style: 'normal' },
    ],
  });

  return Buffer.from(new Resvg(svg).render().asPng());
}
