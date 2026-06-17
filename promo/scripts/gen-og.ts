// Local OG / feature-image generator. Run with `bun run og:gen` whenever guide content
// changes, then commit the PNGs in public/og/. These images are pre-generated and
// committed, so the Cloudflare build never needs the (dev-only) satori/resvg tooling.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { ogImagePng, blogOgImagePng } from '../src/lib/og';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GUIDES_DIR = resolve(HERE, '../src/content/guides');
const GUIDES_OUT = resolve(HERE, '../public/og/guides');
const BLOG_DIR = resolve(HERE, '../src/content/blog');
const BLOG_OUT = resolve(HERE, '../public/og/blog');

mkdirSync(GUIDES_OUT, { recursive: true });
mkdirSync(BLOG_OUT, { recursive: true });

const fmtOgDate = (d: unknown): string =>
  d ? new Date(d as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

const guideFiles = readdirSync(GUIDES_DIR).filter((f) => f.endsWith('.md'));
for (const file of guideFiles) {
  const slug = basename(file, '.md');
  const { data } = matter(readFileSync(resolve(GUIDES_DIR, file), 'utf8'));
  // Top-right badges: the board, then difficulty (only on build-style guides, so a
  // comparison/concept page doesn't get a stray "Beginner" badge).
  const tags: string[] = [];
  if (data.board) tags.push(String(data.board));
  if ((data.category === 'hardware' || data.category === 'project') && data.difficulty) {
    tags.push(String(data.difficulty));
  }
  const png = await ogImagePng({
    title: String(data.title),
    category: data.category ? String(data.category) : undefined,
    tags,
  });
  writeFileSync(resolve(GUIDES_OUT, `${slug}.png`), png);
  console.log(`og: guides/${slug}.png`);
}
console.log(`Generated ${guideFiles.length} OG image(s) -> public/og/guides/`);

// Blog posts: a distinct dark, byline-forward card (see blogOgImagePng).
const blogFiles = readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md'));
for (const file of blogFiles) {
  const slug = basename(file, '.md');
  const { data } = matter(readFileSync(resolve(BLOG_DIR, file), 'utf8'));
  const byline = data.author?.name ? String(data.author.name) : 'nodrix';
  const meta = [data.author?.role ? String(data.author.role) : null, fmtOgDate(data.datePublished)]
    .filter(Boolean)
    .join(' · ');
  const png = await blogOgImagePng({
    title: String(data.title),
    type: data.type ? String(data.type) : undefined,
    byline,
    meta,
  });
  writeFileSync(resolve(BLOG_OUT, `${slug}.png`), png);
  console.log(`og: blog/${slug}.png`);
}
console.log(`Generated ${blogFiles.length} OG image(s) -> public/og/blog/`);
