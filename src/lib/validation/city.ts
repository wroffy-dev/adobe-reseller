import { z } from 'zod';
import { pageSlug } from '@/lib/utils/slug';
import { normaliseKeywords } from '@/lib/cities/defaults';

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? v.trim() : null));

/** Up to three primary keywords, from an array of form values. */
export const keywordsSchema = z
  .array(z.string().max(120))
  .max(10)
  .default([])
  .transform((values) => normaliseKeywords(values));

export const cityInputSchema = z.object({
  countryId: z.string().min(1, 'Choose a country'),
  name: z.string().trim().min(1, 'City name is required').max(120),
  slug: z
    .string()
    .max(120)
    .transform((v) => pageSlug(v))
    .refine((v) => v.length > 0, 'Enter a URL slug'),
  /** State, province, emirate… never required. */
  region: optionalText(120),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
});

export type CityInput = z.infer<typeof cityInputSchema>;

/** The landing page made with a new city — every value editable afterwards. */
export const cityPageInputSchema = z.object({
  createPage: z.boolean().default(true),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  phrase: z.string().max(80).default(''),
  /** An existing page whose sections are copied once, with {{city}} filled in. */
  templatePageId: optionalText(40),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
  h1: optionalText(240),
  keywords: keywordsSchema,
});

export type CityPageInput = z.infer<typeof cityPageInputSchema>;

export const cityProductPagesSchema = z.object({
  cityId: z.string().min(1),
  productIds: z.array(z.string().min(1)).min(1, 'Choose at least one product').max(50),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});
