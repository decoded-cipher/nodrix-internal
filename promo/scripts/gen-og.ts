// Local OG / feature-image generator. Run with `bun run og:gen` whenever guide content
// changes, then commit the PNGs in public/og/. These images are pre-generated and
// committed, so the Cloudflare build never needs the (dev-only) satori/resvg tooling.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { ogImagePng } from '../src/lib/og';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GUIDES_DIR = resolve(HERE, '../src/content/guides');
const OUT_DIR = resolve(HERE, '../public/og/guides');

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md'));
for (const file of files) {
  const slug = basename(file, '.md');
  const { data } = matter(readFileSync(resolve(GUIDES_DIR, file), 'utf8'));
  const png = await ogImagePng({
    title: String(data.title),
    category: data.category ? String(data.category) : undefined,
    board: data.board ? String(data.board) : undefined,
  });
  writeFileSync(resolve(OUT_DIR, `${slug}.png`), png);
  console.log(`og: ${slug}.png`);
}
console.log(`Generated ${files.length} OG image(s) -> public/og/guides/`);
