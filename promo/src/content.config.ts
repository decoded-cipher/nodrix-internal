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
    draft: z.boolean().default(false),
  }),
});

// Blog — the narrative track: prose release notes, build-in-public engineering
// stories, and edited "built with nodrix" case studies. Shares the guides shape;
// swaps the hardware-specific fields (category/board/difficulty) for type/author/version.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    type: z.enum(['release', 'engineering', 'case-study']),
    // Omitted → authored by nodrix. Case studies carry a byline.
    author: z.object({ name: z.string(), role: z.string().optional(), url: z.string().url().optional() }).optional(),
    // Release posts only — links the post to its /changelog entry.
    version: z.string().optional(),
    tags: z.array(z.string()).default([]),
    datePublished: z.coerce.date(),
    dateUpdated: z.coerce.date().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    related: z
      .array(z.object({ href: z.string(), label: z.string(), desc: z.string().optional() }))
      .default([]),
    draft: z.boolean().default(false),
  }),
});

// Reference docs — same rendering as guides, on their own /docs/* routes.
// A documentation track: canonical, scannable, kept in sync with the code.
const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    datePublished: z.coerce.date(),
    dateUpdated: z.coerce.date().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    related: z
      .array(z.object({ href: z.string(), label: z.string(), desc: z.string().optional() }))
      .default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { guides, blog, docs };
