import { z } from 'zod';
import type { FieldDescriptor } from './fields';
import type { FormFieldGroup } from './form-style';

/**
 * Block registry types, kept separate from the registry itself.
 *
 * `blocks.ts` and `blog-blocks.ts` both build definitions, and both need these
 * types — a shared module is what stops the two from importing each other.
 */

export const BLOCK_GROUPS = [
  'Content',
  'Cards & media',
  'Products',
  'Conversion',
  'Social proof',
  'Blog',
  'Article',
  'Sidebar',
  'Footer',
] as const;

export type BlockGroup = (typeof BLOCK_GROUPS)[number];

/**
 * Where a block may be added.
 *
 * A block with no `surfaces` belongs to pages only, which is what every block
 * written before the blog builder existed means — so nothing had to be
 * annotated to keep the page picker exactly as it was.
 */
export const BLOCK_SURFACES = [
  'page',
  'blogListing',
  'blogArticle',
  'blogSidebar',
  'productDetail',
  'productSidebar',
] as const;
export type BlockSurface = (typeof BLOCK_SURFACES)[number];

export const BLOCK_SURFACE_LABELS: Record<BlockSurface, string> = {
  page: 'Page',
  blogListing: 'Blog listing page',
  blogArticle: 'Blog article',
  blogSidebar: 'Blog sidebar',
  productDetail: 'Product page',
  productSidebar: 'Product sidebar',
};

/**
 * Surfaces that offer every page block as well as their own.
 *
 * A product page is a page with a product attached, so everything that can be
 * built on a page — a hero, a FAQ, a testimonial rail, a slider — can be built
 * on one, including blocks written after this list. The sidebar is not on it:
 * a narrow column is a different shape, so it offers only the blocks that
 * opted into it by name.
 */
export const PAGE_BLOCK_SURFACES: readonly BlockSurface[] = ['productDetail'];

export type BlockDefinition = {
  type: string;
  label: string;
  description: string;
  group: BlockGroup;
  icon: string;
  schema: z.ZodTypeAny;
  fields: FieldDescriptor[];
  /**
   * The Form tab, for a block that embeds a form: restyles that one placement
   * of it. Absent on every block without a form, so the tab does not show.
   */
  formFields?: FormFieldGroup[];
  /** Surfaces whose "Add section" picker offers this block. Defaults to pages. */
  surfaces?: BlockSurface[];
  /**
   * Part of a surface's fixed anatomy rather than something to stack freely:
   * it can be reordered, hidden and styled, but only one may exist and it
   * cannot be duplicated or deleted.
   */
  singleton?: boolean;
  /**
   * Superseded by a richer block. Still rendered and still editable so existing
   * pages keep working — just hidden from the "Add section" picker.
   */
  deprecated?: boolean;
  supersededBy?: string;
};

/** Label + link pair, used by nearly every block that offers a button. */
export const linkFields = (prefix: string, label: string): FieldDescriptor[] => [
  { kind: 'text', name: `${prefix}Label`, label: `${label} label`, width: 'half' },
  {
    kind: 'url',
    name: `${prefix}Url`,
    label: `${label} link`,
    width: 'half',
    placeholder: '/contact',
  },
];

/**
 * Per-breakpoint column counts, for a grid block that already has `columns`.
 *
 * `columns` is what the block wants on a wide screen; these two say what it
 * wants on the narrower ones, where 0 means "narrow it for me" — the same
 * automatic step down a grid took before anybody asked for anything. The
 * design panel's Responsive tab still overrides all three, because that is a
 * per-section override rather than what the block is for.
 */
export const responsiveColumnsSchema = {
  tabletColumns: z.coerce.number().int().min(0).max(6).catch(0).default(0),
  mobileColumns: z.coerce.number().int().min(0).max(6).catch(0).default(0),
};

export const responsiveColumnFields: FieldDescriptor[] = [
  {
    kind: 'number',
    name: 'tabletColumns',
    label: 'Columns on tablet',
    width: 'half',
    min: 0,
    max: 6,
    help: '0 narrows it for you.',
  },
  {
    kind: 'number',
    name: 'mobileColumns',
    label: 'Columns on mobile',
    width: 'half',
    min: 0,
    max: 6,
    help: '0 puts one per row.',
  },
];
