import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const GET: APIRoute = async ({ site }) => {
  const posts = (await getCollection('blog'))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.datePublished.getTime() - a.data.datePublished.getTime());

  const items = posts
    .map((p) => {
      const link = new URL(`blog/${p.id}`, site!).href;
      const date = (p.data.dateUpdated ?? p.data.datePublished).toUTCString();
      return `    <item>\n      <title>${esc(p.data.title)}</title>\n      <link>${link}</link>\n      <guid>${link}</guid>\n      <pubDate>${date}</pubDate>\n      <description>${esc(p.data.description)}</description>\n    </item>`;
    })
    .join('\n');

  const self = new URL('blog/rss.xml', site!).href;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>nodrix blog</title>\n    <link>${new URL('blog', site!).href}</link>\n    <atom:link href="${self}" rel="self" type="application/rss+xml"/>\n    <description>Release notes, build-in-public engineering stories, and case studies from the team building nodrix.</description>\n    <language>en</language>\n${items}\n  </channel>\n</rss>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
