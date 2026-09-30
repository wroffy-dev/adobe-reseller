import { z } from 'zod';
import { formBoolean } from './boolean';
import { pageSlug, slugify } from '@/lib/utils/slug';
import { normaliseKeywords } from '@/lib/cities/defaults';

export const contentStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']);

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const pageInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    slug: z
      .string()
      .max(300)
      .transform((v) => pageSlug(v)),
    status: contentStatusSchema.default('DRAFT'),
    /** Optional taxonomy; an empty string from a <select> means uncategorised. */
    categoryId: z
      .string()
      .max(40)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    publishedAt: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? new Date(v) : null))
      .refine((d) => d === null || !Number.isNaN(d.getTime()), 'Enter a valid date'),
    isHomepage: formBoolean(false),
    showHeader: formBoolean(true),
    showFooter: formBoolean(true),

    seoTitle: optionalString(200),
    seoDescription: optionalString(400),
    canonicalUrl: optionalString(500),
    noIndex: formBoolean(false),
    noFollow: formBoolean(false),
    ogTitle: optionalString(200),
    ogDescription: optionalString(400),
    ogImageId: optionalString(40),
    twitterTitle: optionalString(200),
    twitterDescription: optionalString(400),
    twitterImageId: optionalString(40),
    /** Up to three target phrases, read by SEO Intelligence and meta keywords. */
    primaryKeywords: z
      .array(z.string().max(120))
      .max(10)
      .default([])
      .transform((values) => normaliseKeywords(values)),
  })
  .refine((data) => data.status !== 'SCHEDULED' || data.publishedAt !== null, {
    message: 'A scheduled page needs a publish date',
    path: ['publishedAt'],
  });

export type PageInput = z.infer<typeof pageInputSchema>;

export const sectionInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120).nullable().optional(),
  content: z.record(z.string(), z.unknown()).default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
  isVisible: z.boolean().default(true),
  sortOrder: z.number().int(),
});

export const sectionOrderSchema = z.object({
  pageId: z.string().min(1),
  order: z.array(z.string().min(1)).max(200),
});

/** A page category. Slug uniqueness and cycle safety are enforced in the action. */
export const pageCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  slug: z
    .string()
    .max(160)
    .transform((v) => slugify(v)),
  description: z
    .string()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? v.trim() : null)),
  parentId: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export type PageCategoryInput = z.infer<typeof pageCategorySchema>;

/** Reordering payload: the categories in their new order. */
export const pageCategoryOrderSchema = z.object({
  ids: z.array(z.string().min(1)).max(500),
});
