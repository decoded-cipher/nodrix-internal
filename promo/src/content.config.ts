import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Long-form guides — the authored content track. Frontmatter carries the structured
// bits (SEO, FAQ, cross-links); the MDX body is the article itself.
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.enum(['hardware', 'project', 'comparison', 'concept']),
    board: z.string().optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    datePublished: z.coerce.date(),
    dateUpdated: z.coerce.date().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    related: z
      .array(z.object({ href: z.string(), label: z.string(), desc: z.string().optional() }))
      .default([]),
    // Draft guides render behind noindex and stay out of the sitemap until published.
    draft: z.boolean().default(false),
  }),
});

export const collections = { guides };
