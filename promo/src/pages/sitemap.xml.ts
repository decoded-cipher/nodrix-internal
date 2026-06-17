import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Static top-level pages. Add new ones here.
const staticRoutes: { path: string; priority: string }[] = [
  { path: '', priority: '1.0' },
  { path: 'docs', priority: '0.8' },
  { path: 'widgets', priority: '0.8' },
  { path: 'guides', priority: '0.8' },
  { path: 'blog', priority: '0.8' },
  { path: 'roadmap', priority: '0.6' },
  { path: 'changelog', priority: '0.6' },
  { path: 'privacy', priority: '0.3' },
  { path: 'terms', priority: '0.3' },
];

export const GET: APIRoute = async ({ site }) => {
  // Only published guides belong in the sitemap — drafts render behind noindex.
  const guides = await getCollection('guides');
  const guideRoutes = guides
    .filter((g) => !g.data.draft)
    .map((g) => ({ path: `guides/${g.id}`, priority: '0.7' }));

  const blog = await getCollection('blog');
  const blogRoutes = blog
    .filter((p) => !p.data.draft)
    .map((p) => ({ path: `blog/${p.id}`, priority: '0.7' }));

  const lastmod = new Date().toISOString().split('T')[0];
  const urls = [...staticRoutes, ...guideRoutes, ...blogRoutes]
    .map(({ path, priority }) => {
      const loc = new URL(path, site).href;
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
