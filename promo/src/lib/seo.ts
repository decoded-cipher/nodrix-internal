// Small JSON-LD builders shared by the generated landing pages.
// Each returns a plain schema.org node; compose them into a @graph with `jsonLdGraph`.

export type Crumb = { name: string; path: string };
export type QA = { q: string; a: string };

export function breadcrumb(site: URL, items: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: new URL(it.path, site).href,
    })),
  };
}

export function faqPage(items: QA[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

export function itemList(name: string, description: string, items: { name: string; description?: string }[]) {
  return {
    '@type': 'ItemList',
    name,
    description,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.description ? { description: it.description } : {}),
    })),
  };
}

// Serialize a set of nodes into one JSON-LD @graph string for a <script> tag.
export function jsonLdGraph(...nodes: object[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}

// Estimate reading time from raw markdown body (~200 wpm). Computed, never hand-set.
export function readingTime(body: string): string {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}
