import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Rehype: outbound links in markdown open in a new tab and carry ?ref=nodrix.live
// for attribution. Internal (relative or same-host) links are left untouched.
const SITE_HOST = 'nodrix.live';
function externalLinks() {
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'a' && node.properties && node.properties.href) {
      const href = String(node.properties.href);
      if (/^https?:\/\//i.test(href)) {
        let url = null;
        try {
          url = new URL(href);
        } catch {
          url = null;
        }
        if (url && url.hostname !== SITE_HOST && !url.hostname.endsWith('.' + SITE_HOST)) {
          node.properties.target = '_blank';
          node.properties.rel = 'noopener'; // keep the Referer so ?ref isn't the only attribution signal
          if (!url.searchParams.has('ref')) {
            url.searchParams.set('ref', SITE_HOST);
            node.properties.href = url.toString();
          }
        }
      }
    }
    if (node.children) for (const child of node.children) walk(child);
  };
  return (tree) => walk(tree);
}

export default defineConfig({
  site: 'https://nodrix.live',
  // No trailing slash: `file` format serves /docs; Cloudflare 308s /docs/ → /docs.
  trailingSlash: 'never',
  build: { format: 'file' },
  markdown: {
    rehypePlugins: [externalLinks],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
