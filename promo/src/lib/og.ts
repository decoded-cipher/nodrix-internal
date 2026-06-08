// Dynamic OG image generator. Renders a branded, light-themed 1200x630 PNG using satori
// (element tree -> SVG) and resvg (SVG -> PNG). The visual is driven by the page's own
// data — a large category watermark, tag badges (board, difficulty, …), and the title —
// so every image is distinct rather than sharing one illustration. Reusable for any pSEO page.
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

// Aurora background — soft, blurred coral glows echoing the home-page hero. Kept to the top
// half so the crisp coral strip along the bottom edge stays clean: no blurred glow bleeds into
// or smudges it. Built as a real SVG (radial gradients + gaussian blur) and pre-rasterized with
// resvg, because satori's own radial gradients render their transparent stop as a dark blob.
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
    </g>
  </svg>`;
  return 'data:image/png;base64,' + Buffer.from(new Resvg(svg).render().asPng()).toString('base64');
})();

type Style = Record<string, string | number>;
type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Style, children?: unknown): El => ({ type, props: { style, children } });

// A small rounded tag. The first/primary tag (the board) takes the coral accent; the rest
// (difficulty, …) are neutral.
const badge = (text: string, accent: boolean, marginLeft: number): El =>
  h(
    'div',
    {
      display: 'flex',
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: accent ? '#c6381c' : '#525252',
      backgroundColor: accent ? '#fff4f1' : '#f5f5f4',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: accent ? '#ffd2c4' : '#e7e5e4',
      borderRadius: 9999,
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 18,
      paddingRight: 18,
      marginLeft,
    },
    text,
  );

// Category → the big etched word behind the content.
const WATERMARK: Record<string, string> = {
  hardware: 'GUIDE',
  project: 'PROJECT',
  comparison: 'COMPARISON',
  concept: 'CONCEPT',
};

export type OgInput = { title: string; category?: string; tags?: string[]; tagline?: string };

export async function ogImagePng({
  title,
  category,
  tags = [],
  tagline = 'Your own IoT cloud, on Cloudflare',
}: OgInput): Promise<Buffer> {
  // Large faint watermark — the category word, etched bottom-right. One fixed size across
  // every category so the etched word never changes scale (sized so the longest, COMPARISON,
  // still sits inside the frame).
  const watermark = category ? (WATERMARK[category.toLowerCase()] ?? category.toUpperCase()) : '';
  const wsize = 150;

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
          { type: 'img', props: { src: logoUri, width: 188, height: 55 } },
          tags.length
            ? h('div', { display: 'flex', alignItems: 'center' }, tags.map((t, i) => badge(t, i === 0, i === 0 ? 0 : 12)))
            : h('div', { display: 'flex' }),
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
