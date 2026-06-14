import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const GET: APIRoute = async ({ site }) => {
  const guides = (await getCollection('guides'))
    .filter((g) => !g.data.draft)
    .sort((a, b) => b.data.datePublished.getTime() - a.data.datePublished.getTime());

  const items = guides
    .map((g) => {
      const link = new URL(`guides/${g.id}`, site!).href;
      const date = (g.data.dateUpdated ?? g.data.datePublished).toUTCString();
      return `    <item>\n      <title>${esc(g.data.title)}</title>\n      <link>${link}</link>\n      <guid>${link}</guid>\n      <pubDate>${date}</pubDate>\n      <description>${esc(g.data.description)}</description>\n    </item>`;
    })
    .join('\n');

  const self = new URL('rss.xml', site!).href;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>nodrix guides</title>\n    <link>${new URL('guides', site!).href}</link>\n    <atom:link href="${self}" rel="self" type="application/rss+xml"/>\n    <description>Hands-on guides for connecting hardware to the cloud, building dashboards, and automating IoT with nodrix.</description>\n    <language>en</language>\n${items}\n  </channel>\n</rss>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
