// Pings IndexNow (Bing, Yandex, Seznam, Naver) with what changed, after a deploy.
// Usage: bun scripts/indexnow.ts [--all] [--days N] [url|path ...]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEY = 'd2437d9bcbea5bcd38d370c86034ea22';
const SITE = 'https://nodrix.live';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const SITEMAP = fileURLToPath(new URL('../dist/sitemap.xml', import.meta.url));

const args = process.argv.slice(2);
const all = args.includes('--all');
const daysAt = args.indexOf('--days');
const days = daysAt === -1 ? 7 : Number(args[daysAt + 1]);
const daysValueAt = daysAt === -1 ? -1 : daysAt + 1;
const explicit = args.filter((a, i) => !a.startsWith('--') && i !== daysValueAt);

if (!Number.isFinite(days) || days < 0) {
  console.error('--days needs a non-negative number');
  process.exit(1);
}

function fromSitemap() {
  let xml: string;
  try {
    xml = readFileSync(SITEMAP, 'utf8');
  } catch {
    console.error('no dist/sitemap.xml — run `bun run build` first');
    process.exit(1);
  }

  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map(
    ([, loc, lastmod]) => ({ loc, lastmod }),
  );
  if (!entries.length) {
    console.error('dist/sitemap.xml has no <url> entries');
    process.exit(1);
  }
  if (all) return entries.map((e) => e.loc);

  // lastmod and cutoff are both YYYY-MM-DD, so a string compare is enough.
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0];
  return entries.filter((e) => e.lastmod >= cutoff).map((e) => e.loc);
}

const urls = explicit.length ? explicit.map((u) => new URL(u, SITE).href) : fromSitemap();

if (!urls.length) {
  console.log(`indexnow: nothing changed in the last ${days} days — skipped`);
  process.exit(0);
}

console.log(`indexnow: submitting ${urls.length} url(s)`);
for (const u of urls) console.log(`  ${u}`);

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: urls,
  }),
});

if (res.ok) {
  console.log(`indexnow: ${res.status} ${res.statusText}`);
  process.exit(0);
}

const why: Record<number, string> = {
  400: 'malformed payload',
  403: `key rejected — check ${SITE}/${KEY}.txt serves the key`,
  422: 'urls not on this host, or the key does not match',
  429: 'rate limited — too many submissions',
};
console.error(`indexnow: ${res.status} ${res.statusText}${why[res.status] ? ` — ${why[res.status]}` : ''}`);
console.error('the deploy itself succeeded; only the ping failed');
process.exit(1);
