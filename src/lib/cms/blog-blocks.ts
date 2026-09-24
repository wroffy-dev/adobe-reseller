import { z } from 'zod';
import { normaliseColor } from './color';
import { panelDesignSchema } from './design';
import {
  linkFields,
  responsiveColumnsSchema,
  responsiveColumnFields,
  type BlockDefinition,
} from './block-types';
import type { FieldDescriptor } from './fields';
import { formStyleField, formStyleGroups, FORM_PICKER_HELP } from './form-style';

/**
 * Blog blocks.
 *
 * Three surfaces share this file because they share almost everything else:
 * the listing page's sections, the article page's parts and the sidebar's
 * widgets are all ordinary CMS blocks — a Zod schema plus a field list — and
 * they are merged straight into the one block registry. That is what lets the
 * blog reuse the page builder's editor, design panel, drag/drop outline and
 * renderer dispatch instead of growing a second page builder beside it.
 *
 * Nothing in here hardcodes content: every heading, label, category, form and
 * CTA is a field an administrator fills in.
 */

const cssLength = z.string().max(16).catch('').default('');

const POST_SOURCES = [
  'latest',
  'featured',
  'popular',
  'category',
  'tag',
  'manual',
  'related',
] as const;

/** The query a post list runs. Shared by every grid, carousel and widget. */
export const postSourceSchema = {
  source: z.enum(POST_SOURCES).catch('latest').default('latest'),
  categoryId: z.string().max(40).nullable().catch(null).default(null),
  /** Include posts filed under the chosen category's subcategories. */
  includeChildCategories: z.coerce.boolean().catch(true).default(true),
  tagId: z.string().max(40).nullable().catch(null).default(null),
  postIds: z.array(z.string().max(40)).max(24).catch([]).default([]),
  limit: z.coerce.number().int().min(1).max(24).catch(6).default(6),
  orderBy: z
    .enum(['publishedAt', 'updatedAt', 'title', 'views'])
    .catch('publishedAt')
    .default('publishedAt'),
  orderDir: z.enum(['desc', 'asc']).catch('desc').default('desc'),
  excludeCurrent: z.coerce.boolean().catch(true).default(true),
  excludeIds: z.array(z.string().max(40)).max(24).catch([]).default([]),
};

export const postSourceFields: FieldDescriptor[] = [
  {
    kind: 'select',
    name: 'source',
    label: 'Posts to show',
    width: 'half',
    help: 'Where this list gets its articles.',
    options: [
      { label: 'Latest posts', value: 'latest' },
      { label: 'Featured posts', value: 'featured' },
      { label: 'Popular posts', value: 'popular' },
      { label: 'A category', value: 'category' },
      { label: 'A tag', value: 'tag' },
      { label: 'Hand-picked', value: 'manual' },
      { label: 'Related to this article', value: 'related' },
    ],
  },
  { kind: 'number', name: 'limit', label: 'How many', min: 1, max: 24, width: 'half' },
  {
    kind: 'blogCategory',
    name: 'categoryId',
    label: 'Category',
    width: 'half',
    showWhen: { field: 'source', equals: ['category'] },
  },
  {
    kind: 'boolean',
    name: 'includeChildCategories',
    label: 'Include subcategories',
    width: 'half',
    showWhen: { field: 'source', equals: ['category'] },
  },
  {
    kind: 'blogTag',
    name: 'tagId',
    label: 'Tag',
    width: 'half',
    showWhen: { field: 'source', equals: ['tag'] },
  },
  {
    kind: 'blogPosts',
    name: 'postIds',
    label: 'Chosen posts',
    help: 'Shown in this order. Used by the "Hand-picked" source.',
    showWhen: { field: 'source', equals: ['manual'] },
  },
  {
    kind: 'select',
    name: 'orderBy',
    label: 'Sort by',
    width: 'half',
    options: [
      { label: 'Publish date', value: 'publishedAt' },
      { label: 'Last updated', value: 'updatedAt' },
      { label: 'Title', value: 'title' },
      { label: 'Views', value: 'views' },
    ],
  },
  {
    kind: 'select',
    name: 'orderDir',
    label: 'Sort direction',
    width: 'half',
    options: [
      { label: 'Newest / Z–A first', value: 'desc' },
      { label: 'Oldest / A–Z first', value: 'asc' },
    ],
  },
  {
    kind: 'boolean',
    name: 'excludeCurrent',
    label: 'Exclude the article being read',
    width: 'half',
    help: 'Applies on a single article page.',
  },
  { kind: 'blogPosts', name: 'excludeIds', label: 'Never show these posts' },
];

/** Per-section overrides for the global blog card settings. */
export const cardOverrideSchema = {
  /** `inherit` uses Blog → Design. The others force the item on or off. */
  cardImage: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
  cardCategory: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
  cardExcerpt: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
  cardAuthor: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
  cardDate: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
  cardReadTime: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
  cardTags: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
  cardCta: z.enum(['inherit', 'show', 'hide']).catch('inherit').default('inherit'),
};

const OVERRIDE_OPTIONS = [
  { label: 'Use blog default', value: 'inherit' },
  { label: 'Show', value: 'show' },
  { label: 'Hide', value: 'hide' },
];

export const cardOverrideFields: FieldDescriptor[] = (
  [
    ['cardImage', 'Card image'],
    ['cardCategory', 'Card category'],
    ['cardExcerpt', 'Card excerpt'],
    ['cardAuthor', 'Card author'],
    ['cardDate', 'Card date'],
    ['cardReadTime', 'Card read time'],
    ['cardTags', 'Card tags'],
    ['cardCta', 'Card button'],
  ] as const
).map(([name, label]) => ({
  kind: 'select' as const,
  name,
  label,
  width: 'half' as const,
  options: OVERRIDE_OPTIONS,
}));

/** Heading/description trio shared by most blog sections. */
const headingSchema = {
  eyebrow: z.string().max(120).catch('').default(''),
  heading: z.string().max(240).catch('').default(''),
  description: z.string().max(1200).catch('').default(''),
  showHeading: z.coerce.boolean().catch(true).default(true),
  align: z.enum(['left', 'center', 'right']).catch('left').default('left'),
};

const headingFields: FieldDescriptor[] = [
  { kind: 'boolean', name: 'showHeading', label: 'Show the heading block', width: 'half' },
  {
    kind: 'select',
    name: 'align',
    label: 'Heading alignment',
    width: 'half',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Centre', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
  { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
  { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
  { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
];

// ---------------------------------------------------------------------------
// Listing sections
// ---------------------------------------------------------------------------

const blogHeroSchema = z.object({
  heading: z.string().max(240).catch('').default('Blog'),
  subtitle: z.string().max(240).catch('').default(''),
  description: z.string().max(1200).catch('').default(''),
  showHeading: z.coerce.boolean().catch(true).default(true),
  showSubtitle: z.coerce.boolean().catch(true).default(true),
  showDescription: z.coerce.boolean().catch(true).default(true),
  showBreadcrumb: z.coerce.boolean().catch(true).default(true),
  showCta: z.coerce.boolean().catch(false).default(false),
  ctaLabel: z.string().max(60).catch('').default(''),
  ctaUrl: z.string().max(500).catch('').default(''),
  secondaryCtaLabel: z.string().max(60).catch('').default(''),
  secondaryCtaUrl: z.string().max(500).catch('').default(''),
  /** Optional image beside the copy. The background lives in the Design tab. */
  imageId: z.string().max(40).nullable().catch(null).default(null),
  imageAlt: z.string().max(200).catch('').default(''),
  imagePlacement: z.enum(['right', 'left', 'below', 'none']).catch('none').default('none'),
  imageRadius: cssLength,
  minHeight: cssLength,
  contentAlign: z.enum(['left', 'center']).catch('left').default('left'),
  /** Shows a live article count under the heading. */
  showPostCount: z.coerce.boolean().catch(false).default(false),
  postCountLabel: z.string().max(60).catch('').default('articles'),
});

const blogBreadcrumbSchema = z.object({
  homeLabel: z.string().max(60).catch('').default('Home'),
  blogLabel: z.string().max(60).catch('').default('Blog'),
  showHome: z.coerce.boolean().catch(true).default(true),
});

const blogCategoryFilterSchema = z.object({
  ...headingSchema,
  showAll: z.coerce.boolean().catch(true).default(true),
  allLabel: z.string().max(60).catch('').default('All'),
  showCounts: z.coerce.boolean().catch(true).default(false),
  style: z.enum(['pill', 'underline', 'button']).catch('pill').default('pill'),
  /** `all` follows Blog → Categories; `selected` uses the chosen list only. */
  source: z.enum(['all', 'selected']).catch('all').default('all'),
  categoryIds: z.array(z.string().max(40)).max(40).catch([]).default([]),
  includeChildren: z.coerce.boolean().catch(true).default(true),
  showEmpty: z.coerce.boolean().catch(false).default(false),
  /** Renders a search field on the same row. */
  showSearch: z.coerce.boolean().catch(false).default(false),
  searchPlaceholder: z.string().max(120).catch('').default('Search articles'),
});

const blogSearchSchema = z.object({
  ...headingSchema,
  placeholder: z.string().max(120).catch('').default('Search articles'),
  buttonLabel: z.string().max(60).catch('').default('Search'),
  showButton: z.coerce.boolean().catch(true).default(true),
  layout: z.enum(['inline', 'stacked', 'wide']).catch('inline').default('inline'),
  maxWidth: cssLength,
});

const blogFeaturedSchema = z.object({
  ...headingSchema,
  /** `auto` takes the highest-priority featured post. */
  selection: z.enum(['auto', 'manual']).catch('auto').default('auto'),
  postId: z.string().max(40).nullable().catch(null).default(null),
  layout: z.enum(['imageLeft', 'imageRight', 'overlay', 'stacked']).catch('imageLeft').default('imageLeft'),
  imageRatio: z.enum(['16/9', '4/3', '3/2', '1/1', 'auto']).catch('4/3').default('4/3'),
  showCategory: z.coerce.boolean().catch(true).default(true),
  showExcerpt: z.coerce.boolean().catch(true).default(true),
  showAuthor: z.coerce.boolean().catch(true).default(true),
  showAuthorImage: z.coerce.boolean().catch(true).default(true),
  showDate: z.coerce.boolean().catch(true).default(true),
  showReadTime: z.coerce.boolean().catch(true).default(true),
  showTags: z.coerce.boolean().catch(false).default(false),
  showCta: z.coerce.boolean().catch(true).default(true),
  ctaLabel: z.string().max(60).catch('').default('Read the article'),
  badgeLabel: z.string().max(40).catch('').default('Featured'),
  showBadge: z.coerce.boolean().catch(true).default(true),
  emptyText: z.string().max(240).catch('').default(''),
  panel: panelDesignSchema.default(panelDesignSchema.parse({})),
});

const blogGridSchema = z.object({
  ...headingSchema,
  ...postSourceSchema,
  ...cardOverrideSchema,
  columns: z.coerce.number().int().min(1).max(4).catch(3).default(3),
  /*
   * The same pair every grid block offers, where 0 means "narrow it for me".
   * It replaces a hardcoded 2 and 1 here, which is what automatic resolves to
   * anyway — so a grid nobody has touched still lays out exactly as it did.
   */
  ...responsiveColumnsSchema,
  /**
   * Makes this the page's paginated grid: it honours ?page, ?q, ?category and
   * ?tag and renders alongside the pagination section. Only the first such grid
   * on a page paginates — any others stay as fixed lists.
   */
  paginate: z.coerce.boolean().catch(false).default(false),
  showPagination: z.coerce.boolean().catch(true).default(true),
  emptyHeading: z.string().max(160).catch('').default(''),
  emptyText: z.string().max(400).catch('').default(''),
  ctaLabel: z.string().max(60).catch('').default(''),
  ctaUrl: z.string().max(500).catch('').default(''),
});

const blogPaginationSchema = z.object({
  previousLabel: z.string().max(40).catch('').default('Previous'),
  nextLabel: z.string().max(40).catch('').default('Next'),
  showNumbers: z.coerce.boolean().catch(true).default(true),
  showSummary: z.coerce.boolean().catch(false).default(false),
  align: z.enum(['left', 'center', 'right']).catch('center').default('center'),
});

const blogNewsletterSchema = z.object({
  /** This placement's Form tab. Blank keeps the form's own design. */
  formStyle: formStyleField,
  ...headingSchema,
  formSlug: z.string().max(120).catch('').default(''),
  ctaLocation: z.string().max(120).catch('').default(''),
  layout: z.enum(['inline', 'split', 'centered']).catch('inline').default('inline'),
  imageId: z.string().max(40).nullable().catch(null).default(null),
  panel: panelDesignSchema.default(panelDesignSchema.parse({})),
  footnote: z.string().max(240).catch('').default(''),
});

const dividerSchema = z.object({
  style: z.enum(['solid', 'dashed', 'dotted']).catch('solid').default('solid'),
  thickness: cssLength,
  color: z
    .string()
    .trim()
    .transform((v) => normaliseColor(v))
    .catch('')
    .default(''),
  width: z.enum(['full', 'content', 'short']).catch('full').default('full'),
});

const spacerSchema = z.object({
  height: cssLength,
  tabletHeight: cssLength,
  mobileHeight: cssLength,
});

// ---------------------------------------------------------------------------
// Article parts
// ---------------------------------------------------------------------------

const articleHeaderSchema = z.object({
  showCategory: z.coerce.boolean().catch(true).default(true),
  showSubtitle: z.coerce.boolean().catch(true).default(true),
  showExcerpt: z.coerce.boolean().catch(true).default(true),
  showAuthor: z.coerce.boolean().catch(true).default(true),
  showAuthorImage: z.coerce.boolean().catch(true).default(true),
  showDate: z.coerce.boolean().catch(true).default(true),
  showUpdatedDate: z.coerce.boolean().catch(true).default(true),
  showReadTime: z.coerce.boolean().catch(true).default(true),
  showTags: z.coerce.boolean().catch(false).default(false),
  updatedLabel: z.string().max(60).catch('').default('Updated'),
  align: z.enum(['left', 'center']).catch('left').default('left'),
});

const articleImageSchema = z.object({
  ratio: z.enum(['16/9', '4/3', '3/2', '21/9', 'auto']).catch('16/9').default('16/9'),
  radius: cssLength,
  showCaption: z.coerce.boolean().catch(true).default(true),
  /** Uses the post's thumbnail instead of its featured image when set. */
  useThumbnail: z.coerce.boolean().catch(false).default(false),
});

const articleTocSchema = z.object({
  heading: z.string().max(120).catch('').default(''),
  collapsible: z.coerce.boolean().catch(true).default(true),
  openByDefault: z.coerce.boolean().catch(true).default(true),
  includeH3: z.coerce.boolean().catch(true).default(true),
  panel: panelDesignSchema.default(panelDesignSchema.parse({})),
});

const articleContentSchema = z.object({
  /** Adds a drop-cap-free lead paragraph treatment to the excerpt. */
  showLead: z.coerce.boolean().catch(false).default(false),
  maxWidth: cssLength,
});

const articleShareSchema = z.object({
  heading: z.string().max(80).catch('').default(''),
  style: z.enum(['icon', 'label', 'button']).catch('icon').default('icon'),
  align: z.enum(['left', 'center', 'right']).catch('left').default('left'),
});

const articleAuthorSchema = z.object({
  heading: z.string().max(120).catch('').default('About the author'),
  showHeading: z.coerce.boolean().catch(false).default(false),
  showImage: z.coerce.boolean().catch(true).default(true),
  showJobTitle: z.coerce.boolean().catch(true).default(true),
  showBio: z.coerce.boolean().catch(true).default(true),
  showSocial: z.coerce.boolean().catch(true).default(true),
  panel: panelDesignSchema.default(panelDesignSchema.parse({})),
});

const articleTagsSchema = z.object({
  label: z.string().max(60).catch('').default('Tags'),
  showLabel: z.coerce.boolean().catch(true).default(true),
});

const articleRelatedSchema = z.object({
  ...headingSchema,
  ...postSourceSchema,
  ...cardOverrideSchema,
  columns: z.coerce.number().int().min(1).max(4).catch(3).default(3),
  ...responsiveColumnsSchema,
  emptyText: z.string().max(240).catch('').default(''),
});

const articlePrevNextSchema = z.object({
  previousLabel: z.string().max(60).catch('').default('Previous article'),
  nextLabel: z.string().max(60).catch('').default('Next article'),
  showImage: z.coerce.boolean().catch(false).default(false),
  /** Stay inside the article's own category when picking neighbours. */
  sameCategory: z.coerce.boolean().catch(false).default(false),
});

// ---------------------------------------------------------------------------
// Sidebar widgets
// ---------------------------------------------------------------------------

/** Chrome every widget shares: a title, a card and sticky/space behaviour. */
const widgetBase = {
  title: z.string().max(160).catch('').default(''),
  showTitle: z.coerce.boolean().catch(true).default(true),
  description: z.string().max(600).catch('').default(''),
  sticky: z.coerce.boolean().catch(false).default(false),
  panel: panelDesignSchema.default(panelDesignSchema.parse({})),
  headingColor: z
    .string()
    .trim()
    .transform((v) => normaliseColor(v))
    .catch('')
    .default(''),
  linkColor: z
    .string()
    .trim()
    .transform((v) => normaliseColor(v))
    .catch('')
    .default(''),
};

const widgetBaseFields: FieldDescriptor[] = [
  { kind: 'text', name: 'title', label: 'Widget title', width: 'half' },
  { kind: 'boolean', name: 'showTitle', label: 'Show the title', width: 'half' },
  { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
  {
    kind: 'boolean',
    name: 'sticky',
    label: 'Stick to the viewport while scrolling',
    width: 'half',
    help: 'Only applies when the sidebar itself is not already sticky.',
  },
];

/** The card styling controls, reusing the shared panel design schema. */
const widgetPanelFields: FieldDescriptor[] = [
  {
    kind: 'select',
    name: 'panel.background.type',
    label: 'Background',
    width: 'half',
    options: [
      { label: 'Transparent', value: 'none' },
      { label: 'Solid colour', value: 'solid' },
      { label: 'Gradient', value: 'gradient' },
      { label: 'Image', value: 'image' },
    ],
  },
  { kind: 'color', name: 'panel.background.color', label: 'Background colour', width: 'half' },
  {
    kind: 'color',
    name: 'panel.background.gradientFrom',
    label: 'Gradient from',
    width: 'half',
    showWhen: { field: 'panel.background.type', equals: ['gradient'] },
  },
  {
    kind: 'color',
    name: 'panel.background.gradientTo',
    label: 'Gradient to',
    width: 'half',
    showWhen: { field: 'panel.background.type', equals: ['gradient'] },
  },
  {
    kind: 'media',
    name: 'panel.background.imageId',
    label: 'Background image',
    width: 'half',
    showWhen: { field: 'panel.background.type', equals: ['image'] },
  },
  {
    kind: 'number',
    name: 'panel.background.overlayOpacity',
    label: 'Overlay opacity (%)',
    min: 0,
    max: 100,
    width: 'half',
    showWhen: { field: 'panel.background.type', equals: ['image'] },
  },
  {
    kind: 'color',
    name: 'panel.background.overlayColor',
    label: 'Overlay colour',
    width: 'half',
    showWhen: { field: 'panel.background.type', equals: ['image'] },
  },
  { kind: 'boolean', name: 'panel.borderEnabled', label: 'Border', width: 'half' },
  { kind: 'color', name: 'panel.borderColor', label: 'Border colour', width: 'half' },
  { kind: 'length', name: 'panel.borderWidth', label: 'Border width', width: 'half' },
  { kind: 'length', name: 'panel.radius', label: 'Corner radius', width: 'half' },
  {
    kind: 'select',
    name: 'panel.shadow',
    label: 'Shadow',
    width: 'half',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
      { label: 'Extra large', value: 'xl' },
    ],
  },
  { kind: 'length', name: 'panel.padding.top', label: 'Padding top', width: 'half' },
  { kind: 'length', name: 'panel.padding.bottom', label: 'Padding bottom', width: 'half' },
  { kind: 'length', name: 'panel.padding.left', label: 'Padding left', width: 'half' },
  { kind: 'length', name: 'panel.padding.right', label: 'Padding right', width: 'half' },
  { kind: 'color', name: 'headingColor', label: 'Heading colour', width: 'half' },
  { kind: 'color', name: 'panel.textColor', label: 'Text colour', width: 'half' },
  { kind: 'color', name: 'linkColor', label: 'Link colour', width: 'half' },
];

const widgetPostListSchema = z.object({
  ...widgetBase,
  ...postSourceSchema,
  layout: z.enum(['list', 'compact', 'cards']).catch('compact').default('compact'),
  showImage: z.coerce.boolean().catch(true).default(true),
  showDate: z.coerce.boolean().catch(true).default(true),
  showCategory: z.coerce.boolean().catch(false).default(false),
  showReadTime: z.coerce.boolean().catch(false).default(false),
  showExcerpt: z.coerce.boolean().catch(false).default(false),
  showNumbers: z.coerce.boolean().catch(false).default(false),
  emptyText: z.string().max(240).catch('').default(''),
});

const widgetSearchSchema = z.object({
  ...widgetBase,
  placeholder: z.string().max(120).catch('').default('Search articles'),
  buttonLabel: z.string().max(60).catch('').default('Search'),
  showButton: z.coerce.boolean().catch(false).default(false),
});

const widgetTocSchema = z.object({
  ...widgetBase,
  includeH3: z.coerce.boolean().catch(true).default(true),
  collapsible: z.coerce.boolean().catch(false).default(false),
  openByDefault: z.coerce.boolean().catch(true).default(true),
});

const widgetCategoriesSchema = z.object({
  ...widgetBase,
  source: z.enum(['all', 'selected']).catch('all').default('all'),
  categoryIds: z.array(z.string().max(40)).max(40).catch([]).default([]),
  showChildren: z.coerce.boolean().catch(true).default(true),
  showCounts: z.coerce.boolean().catch(true).default(true),
  showEmpty: z.coerce.boolean().catch(false).default(false),
  style: z.enum(['list', 'pill']).catch('list').default('list'),
  limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
});

const widgetTagsSchema = z.object({
  ...widgetBase,
  limit: z.coerce.number().int().min(1).max(60).catch(20).default(20),
  showCounts: z.coerce.boolean().catch(false).default(false),
});

const widgetFormSchema = z.object({
  /** This placement's Form tab. Blank keeps the form's own design. */
  formStyle: formStyleField,
  ...widgetBase,
  formSlug: z.string().max(120).catch('').default(''),
  ctaLocation: z.string().max(120).catch('').default(''),
  /** Uses the post's own sidebar form when it has one. */
  preferPostForm: z.coerce.boolean().catch(true).default(true),
});

const widgetCtaSchema = z.object({
  ...widgetBase,
  imageId: z.string().max(40).nullable().catch(null).default(null),
  body: z.string().max(1200).catch('').default(''),
  ctaLabel: z.string().max(60).catch('').default(''),
  ctaUrl: z.string().max(500).catch('').default(''),
  align: z.enum(['left', 'center']).catch('left').default('left'),
});

const widgetAuthorSchema = z.object({
  ...widgetBase,
  showImage: z.coerce.boolean().catch(true).default(true),
  showJobTitle: z.coerce.boolean().catch(true).default(true),
  showBio: z.coerce.boolean().catch(true).default(true),
  showSocial: z.coerce.boolean().catch(true).default(true),
  /** Falls back to this staff member on posts with no author. */
  fallbackAuthorId: z.string().max(40).nullable().catch(null).default(null),
});

const widgetImageSchema = z.object({
  ...widgetBase,
  imageId: z.string().max(40).nullable().catch(null).default(null),
  alt: z.string().max(200).catch('').default(''),
  linkUrl: z.string().max(500).catch('').default(''),
  radius: cssLength,
  caption: z.string().max(240).catch('').default(''),
});

const widgetTextSchema = z.object({
  ...widgetBase,
  body: z.string().max(20_000).catch('').default(''),
});

const widgetHeadingSchema = z.object({
  ...widgetBase,
  text: z.string().max(240).catch('').default(''),
  level: z.enum(['h2', 'h3', 'h4', 'p']).catch('h3').default('h3'),
  align: z.enum(['left', 'center', 'right']).catch('left').default('left'),
});

const widgetButtonSchema = z.object({
  ...widgetBase,
  ctaLabel: z.string().max(60).catch('').default(''),
  ctaUrl: z.string().max(500).catch('').default(''),
  variant: z.enum(['primary', 'outline', 'ghost']).catch('primary').default('primary'),
  fullWidth: z.coerce.boolean().catch(true).default(true),
});

const widgetSocialSchema = z.object({
  ...widgetBase,
  /** Blank inherits the website's social links from Settings. */
  linkedinUrl: z.string().max(500).catch('').default(''),
  twitterUrl: z.string().max(500).catch('').default(''),
  facebookUrl: z.string().max(500).catch('').default(''),
  instagramUrl: z.string().max(500).catch('').default(''),
  youtubeUrl: z.string().max(500).catch('').default(''),
  style: z.enum(['icon', 'list']).catch('icon').default('icon'),
});

const widgetProductsSchema = z.object({
  ...widgetBase,
  source: z.enum(['featured', 'latest', 'category', 'selected']).catch('featured').default('featured'),
  categoryId: z.string().max(40).nullable().catch(null).default(null),
  productIds: z.array(z.string().max(40)).max(12).catch([]).default([]),
  limit: z.coerce.number().int().min(1).max(8).catch(3).default(3),
  showImage: z.coerce.boolean().catch(true).default(true),
  showPrice: z.coerce.boolean().catch(true).default(true),
  ctaLabel: z.string().max(60).catch('').default('View plan'),
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const postListWidgetFields = (extra: FieldDescriptor[] = []): FieldDescriptor[] => [
  ...widgetBaseFields,
  ...postSourceFields,
  {
    kind: 'select',
    name: 'layout',
    label: 'Layout',
    width: 'half',
    options: [
      { label: 'Compact rows', value: 'compact' },
      { label: 'Text list', value: 'list' },
      { label: 'Small cards', value: 'cards' },
    ],
  },
  { kind: 'boolean', name: 'showImage', label: 'Show thumbnails', width: 'half' },
  { kind: 'boolean', name: 'showDate', label: 'Show dates', width: 'half' },
  { kind: 'boolean', name: 'showCategory', label: 'Show category', width: 'half' },
  { kind: 'boolean', name: 'showReadTime', label: 'Show read time', width: 'half' },
  { kind: 'boolean', name: 'showExcerpt', label: 'Show excerpt', width: 'half' },
  { kind: 'boolean', name: 'showNumbers', label: 'Number the list', width: 'half' },
  { kind: 'text', name: 'emptyText', label: 'Text when there is nothing to show' },
  ...extra,
  ...widgetPanelFields,
];

export const BLOG_BLOCKS: Record<string, BlockDefinition> = {
  // --- listing -------------------------------------------------------------
  blogHero: {
    type: 'blogHero',
    label: 'Blog hero',
    description: 'Large banner introducing the blog, with optional breadcrumb and buttons.',
    group: 'Blog',
    icon: 'layout-template',
    surfaces: ['blogListing'],
    schema: blogHeroSchema,
    design: ['buttons'],
    fields: [
      { kind: 'boolean', name: 'showHeading', label: 'Show heading', width: 'half' },
      { kind: 'boolean', name: 'showSubtitle', label: 'Show subtitle', width: 'half' },
      { kind: 'boolean', name: 'showDescription', label: 'Show description', width: 'half' },
      { kind: 'boolean', name: 'showBreadcrumb', label: 'Show breadcrumb', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'text', name: 'subtitle', label: 'Subtitle' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 3 },
      {
        kind: 'select',
        name: 'contentAlign',
        label: 'Content alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
        ],
      },
      {
        kind: 'length',
        name: 'minHeight',
        label: 'Minimum height',
        width: 'half',
        help: 'Leave blank to size to the content.',
      },
      { kind: 'boolean', name: 'showPostCount', label: 'Show article count', width: 'half' },
      { kind: 'text', name: 'postCountLabel', label: 'Article count label', width: 'half' },
      { kind: 'boolean', name: 'showCta', label: 'Show buttons', width: 'half' },
      ...linkFields('cta', 'Primary button'),
      ...linkFields('secondaryCta', 'Secondary button'),
      {
        kind: 'select',
        name: 'imagePlacement',
        label: 'Foreground image',
        width: 'half',
        help: 'The hero background is set in the Design tab.',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Right of the copy', value: 'right' },
          { label: 'Left of the copy', value: 'left' },
          { label: 'Below the copy', value: 'below' },
        ],
      },
      {
        kind: 'media',
        name: 'imageId',
        label: 'Image',
        width: 'half',
        showWhen: { field: 'imagePlacement', equals: ['right', 'left', 'below'] },
      },
      {
        kind: 'text',
        name: 'imageAlt',
        label: 'Image alt text',
        width: 'half',
        showWhen: { field: 'imagePlacement', equals: ['right', 'left', 'below'] },
      },
      {
        kind: 'length',
        name: 'imageRadius',
        label: 'Image corner radius',
        width: 'half',
        showWhen: { field: 'imagePlacement', equals: ['right', 'left', 'below'] },
      },
    ],
  },

  blogBreadcrumb: {
    type: 'blogBreadcrumb',
    label: 'Breadcrumb',
    description: 'Home → Blog → current archive.',
    group: 'Blog',
    icon: 'list-ordered',
    surfaces: ['blogListing'],
    schema: blogBreadcrumbSchema,
    fields: [
      { kind: 'boolean', name: 'showHome', label: 'Show the home link', width: 'half' },
      { kind: 'text', name: 'homeLabel', label: 'Home label', width: 'half' },
      { kind: 'text', name: 'blogLabel', label: 'Blog label', width: 'half' },
    ],
  },

  blogCategoryFilter: {
    type: 'blogCategoryFilter',
    label: 'Category filters',
    description: 'Category chips loaded from Blog → Categories, with an optional search field.',
    group: 'Blog',
    icon: 'grid-3x3',
    surfaces: ['blogListing'],
    schema: blogCategoryFilterSchema,
    fields: [
      ...headingFields,
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Pills', value: 'pill' },
          { label: 'Underline', value: 'underline' },
          { label: 'Buttons', value: 'button' },
        ],
      },
      {
        kind: 'select',
        name: 'source',
        label: 'Categories to show',
        width: 'half',
        options: [
          { label: 'Every active category', value: 'all' },
          { label: 'Only the ones I choose', value: 'selected' },
        ],
      },
      {
        kind: 'blogCategories',
        name: 'categoryIds',
        label: 'Chosen categories',
        showWhen: { field: 'source', equals: ['selected'] },
      },
      { kind: 'boolean', name: 'showAll', label: 'Show an “All” chip', width: 'half' },
      { kind: 'text', name: 'allLabel', label: '“All” label', width: 'half' },
      { kind: 'boolean', name: 'showCounts', label: 'Show article counts', width: 'half' },
      { kind: 'boolean', name: 'includeChildren', label: 'Include subcategories', width: 'half' },
      { kind: 'boolean', name: 'showEmpty', label: 'Show categories with no posts', width: 'half' },
      { kind: 'boolean', name: 'showSearch', label: 'Add a search field', width: 'half' },
      {
        kind: 'text',
        name: 'searchPlaceholder',
        label: 'Search placeholder',
        width: 'half',
        showWhen: { field: 'showSearch', equals: [true] },
      },
    ],
  },

  blogSearch: {
    type: 'blogSearch',
    label: 'Blog search',
    description: 'Search across titles, excerpts, content, categories and tags.',
    group: 'Blog',
    icon: 'circle-help',
    surfaces: ['blogListing'],
    schema: blogSearchSchema,
    fields: [
      ...headingFields,
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Inline', value: 'inline' },
          { label: 'Stacked', value: 'stacked' },
          { label: 'Full width', value: 'wide' },
        ],
      },
      { kind: 'length', name: 'maxWidth', label: 'Maximum width', width: 'half' },
      { kind: 'text', name: 'placeholder', label: 'Placeholder', width: 'half' },
      { kind: 'text', name: 'buttonLabel', label: 'Button label', width: 'half' },
      { kind: 'boolean', name: 'showButton', label: 'Show the button', width: 'half' },
    ],
  },

  blogFeatured: {
    type: 'blogFeatured',
    label: 'Featured article',
    description: 'One large article — automatically the top featured post, or one you pick.',
    group: 'Blog',
    icon: 'star',
    surfaces: ['blogListing'],
    schema: blogFeaturedSchema,
    design: ['buttons'],
    fields: [
      ...headingFields,
      {
        kind: 'select',
        name: 'selection',
        label: 'Which article',
        width: 'half',
        help: 'A hand-picked article always wins over the automatic choice.',
        options: [
          { label: 'Highest-priority featured post', value: 'auto' },
          { label: 'One I choose', value: 'manual' },
        ],
      },
      {
        kind: 'blogPost',
        name: 'postId',
        label: 'Article',
        width: 'half',
        showWhen: { field: 'selection', equals: ['manual'] },
      },
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Image left', value: 'imageLeft' },
          { label: 'Image right', value: 'imageRight' },
          { label: 'Text over image', value: 'overlay' },
          { label: 'Image above text', value: 'stacked' },
        ],
      },
      {
        kind: 'select',
        name: 'imageRatio',
        label: 'Image ratio',
        width: 'half',
        options: [
          { label: '16:9', value: '16/9' },
          { label: '4:3', value: '4/3' },
          { label: '3:2', value: '3/2' },
          { label: 'Square', value: '1/1' },
          { label: 'Original', value: 'auto' },
        ],
      },
      { kind: 'boolean', name: 'showBadge', label: 'Show a badge', width: 'half' },
      { kind: 'text', name: 'badgeLabel', label: 'Badge label', width: 'half' },
      { kind: 'boolean', name: 'showCategory', label: 'Show category', width: 'half' },
      { kind: 'boolean', name: 'showExcerpt', label: 'Show excerpt', width: 'half' },
      { kind: 'boolean', name: 'showAuthor', label: 'Show author', width: 'half' },
      { kind: 'boolean', name: 'showAuthorImage', label: 'Show author photo', width: 'half' },
      { kind: 'boolean', name: 'showDate', label: 'Show date', width: 'half' },
      { kind: 'boolean', name: 'showReadTime', label: 'Show read time', width: 'half' },
      { kind: 'boolean', name: 'showTags', label: 'Show tags', width: 'half' },
      { kind: 'boolean', name: 'showCta', label: 'Show the button', width: 'half' },
      { kind: 'text', name: 'ctaLabel', label: 'Button label', width: 'half' },
      { kind: 'text', name: 'emptyText', label: 'Text when nothing is featured' },
      ...widgetPanelFields.filter((field) => field.name.startsWith('panel.')),
    ],
  },

  blogGrid: {
    type: 'blogGrid',
    label: 'Article grid',
    description: 'A responsive grid of article cards from any source, optionally paginated.',
    group: 'Blog',
    icon: 'grid-3x3',
    surfaces: ['blogListing', 'blogArticle'],
    schema: blogGridSchema,
    design: ['buttons'],
    fields: [
      ...headingFields,
      ...postSourceFields,
      { kind: 'number', name: 'columns', label: 'Desktop columns', min: 1, max: 4, width: 'half' },
      ...responsiveColumnFields,
      {
        kind: 'boolean',
        name: 'paginate',
        label: 'This is the page’s main grid',
        width: 'half',
        help: 'Follows the search, category and page in the URL and can be paginated.',
      },
      {
        kind: 'boolean',
        name: 'showPagination',
        label: 'Show pagination under the grid',
        width: 'half',
        showWhen: { field: 'paginate', equals: [true] },
      },
      ...cardOverrideFields,
      { kind: 'text', name: 'emptyHeading', label: 'Empty state heading' },
      { kind: 'textarea', name: 'emptyText', label: 'Empty state text', rows: 2 },
      ...linkFields('cta', 'Button under the grid'),
    ],
  },

  blogPagination: {
    type: 'blogPagination',
    label: 'Pagination',
    description: 'Previous / next and page numbers for the page’s main article grid.',
    group: 'Blog',
    icon: 'list-ordered',
    surfaces: ['blogListing'],
    singleton: true,
    schema: blogPaginationSchema,
    fields: [
      { kind: 'text', name: 'previousLabel', label: 'Previous label', width: 'half' },
      { kind: 'text', name: 'nextLabel', label: 'Next label', width: 'half' },
      { kind: 'boolean', name: 'showNumbers', label: 'Show page numbers', width: 'half' },
      { kind: 'boolean', name: 'showSummary', label: 'Show “page X of Y”', width: 'half' },
      {
        kind: 'select',
        name: 'align',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
    ],
  },

  blogNewsletter: {
    type: 'blogNewsletter',
    label: 'Newsletter',
    description: 'A compact sign-up band wired to any form from Form management.',
    group: 'Blog',
    icon: 'megaphone',
    surfaces: ['blogListing', 'blogArticle'],
    schema: blogNewsletterSchema,
    design: ['buttons'],
    formFields: formStyleGroups(),
    fields: [
      ...headingFields,
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Inline', value: 'inline' },
          { label: 'Split', value: 'split' },
          { label: 'Centred', value: 'centered' },
        ],
      },
      { kind: 'form', name: 'formSlug', label: 'Form', width: 'half', help: FORM_PICKER_HELP },
      {
        kind: 'text',
        name: 'ctaLocation',
        label: 'Tracking label',
        width: 'half',
        help: 'Names this placement on the leads it captures, e.g. blog_newsletter.',
      },
      {
        kind: 'media',
        name: 'imageId',
        label: 'Image',
        width: 'half',
        showWhen: { field: 'layout', equals: ['split'] },
      },
      { kind: 'text', name: 'footnote', label: 'Small print under the form' },
      ...widgetPanelFields.filter((field) => field.name.startsWith('panel.')),
    ],
  },

  divider: {
    type: 'divider',
    label: 'Divider',
    description: 'A horizontal rule.',
    group: 'Content',
    icon: 'text',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: dividerSchema,
    fields: [
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' },
        ],
      },
      { kind: 'length', name: 'thickness', label: 'Thickness', width: 'half' },
      { kind: 'color', name: 'color', label: 'Colour', width: 'half' },
      {
        kind: 'select',
        name: 'width',
        label: 'Width',
        width: 'half',
        options: [
          { label: 'Full', value: 'full' },
          { label: 'Content width', value: 'content' },
          { label: 'Short', value: 'short' },
        ],
      },
    ],
  },

  spacer: {
    type: 'spacer',
    label: 'Spacer',
    description: 'Empty vertical space, set per breakpoint.',
    group: 'Content',
    icon: 'text',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: spacerSchema,
    fields: [
      { kind: 'length', name: 'height', label: 'Desktop height', width: 'half' },
      { kind: 'length', name: 'tabletHeight', label: 'Tablet height', width: 'half' },
      { kind: 'length', name: 'mobileHeight', label: 'Mobile height', width: 'half' },
    ],
  },

  // --- article -------------------------------------------------------------
  articleBreadcrumb: {
    type: 'articleBreadcrumb',
    label: 'Breadcrumb',
    description: 'Home → Blog → category → article.',
    group: 'Article',
    icon: 'list-ordered',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: blogBreadcrumbSchema,
    fields: [
      { kind: 'boolean', name: 'showHome', label: 'Show the home link', width: 'half' },
      { kind: 'text', name: 'homeLabel', label: 'Home label', width: 'half' },
      { kind: 'text', name: 'blogLabel', label: 'Blog label', width: 'half' },
    ],
  },

  articleHeader: {
    type: 'articleHeader',
    label: 'Article header',
    description: 'Category, title, subtitle and the author / date / read-time row.',
    group: 'Article',
    icon: 'text',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: articleHeaderSchema,
    fields: [
      {
        kind: 'select',
        name: 'align',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
        ],
      },
      { kind: 'text', name: 'updatedLabel', label: 'Updated-date label', width: 'half' },
      { kind: 'boolean', name: 'showCategory', label: 'Show category', width: 'half' },
      { kind: 'boolean', name: 'showSubtitle', label: 'Show subtitle', width: 'half' },
      { kind: 'boolean', name: 'showExcerpt', label: 'Show excerpt', width: 'half' },
      { kind: 'boolean', name: 'showAuthor', label: 'Show author', width: 'half' },
      { kind: 'boolean', name: 'showAuthorImage', label: 'Show author photo', width: 'half' },
      { kind: 'boolean', name: 'showDate', label: 'Show publish date', width: 'half' },
      { kind: 'boolean', name: 'showUpdatedDate', label: 'Show updated date', width: 'half' },
      { kind: 'boolean', name: 'showReadTime', label: 'Show read time', width: 'half' },
      { kind: 'boolean', name: 'showTags', label: 'Show tags', width: 'half' },
    ],
  },

  articleImage: {
    type: 'articleImage',
    label: 'Featured image',
    description: 'The article’s main image.',
    group: 'Article',
    icon: 'image',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: articleImageSchema,
    fields: [
      {
        kind: 'select',
        name: 'ratio',
        label: 'Ratio',
        width: 'half',
        options: [
          { label: '16:9', value: '16/9' },
          { label: '4:3', value: '4/3' },
          { label: '3:2', value: '3/2' },
          { label: '21:9', value: '21/9' },
          { label: 'Original', value: 'auto' },
        ],
      },
      { kind: 'length', name: 'radius', label: 'Corner radius', width: 'half' },
      { kind: 'boolean', name: 'showCaption', label: 'Show the image caption', width: 'half' },
      { kind: 'boolean', name: 'useThumbnail', label: 'Use the thumbnail instead', width: 'half' },
    ],
  },

  articleToc: {
    type: 'articleToc',
    label: 'Table of contents',
    description: 'Built automatically from the article’s H2 and H3 headings.',
    group: 'Article',
    icon: 'list-ordered',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: articleTocSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      { kind: 'boolean', name: 'includeH3', label: 'Include H3 headings', width: 'half' },
      { kind: 'boolean', name: 'collapsible', label: 'Collapsible', width: 'half' },
      { kind: 'boolean', name: 'openByDefault', label: 'Open by default', width: 'half' },
      ...widgetPanelFields.filter((field) => field.name.startsWith('panel.')),
    ],
  },

  articleContent: {
    type: 'articleContent',
    label: 'Article content',
    description: 'The article body written in the post editor.',
    group: 'Article',
    icon: 'text',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: articleContentSchema,
    fields: [
      { kind: 'boolean', name: 'showLead', label: 'Show the excerpt as a lead paragraph', width: 'half' },
      { kind: 'length', name: 'maxWidth', label: 'Maximum text width', width: 'half' },
    ],
  },

  articleShare: {
    type: 'articleShare',
    label: 'Share buttons',
    description: 'Networks and placement come from Blog → Design.',
    group: 'Article',
    icon: 'megaphone',
    surfaces: ['blogArticle'],
    schema: articleShareSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Icons', value: 'icon' },
          { label: 'Icons with labels', value: 'label' },
          { label: 'Buttons', value: 'button' },
        ],
      },
      {
        kind: 'select',
        name: 'align',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
    ],
  },

  articleTags: {
    type: 'articleTags',
    label: 'Tag list',
    description: 'The article’s tags, linking to each tag archive.',
    group: 'Article',
    icon: 'text',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: articleTagsSchema,
    fields: [
      { kind: 'boolean', name: 'showLabel', label: 'Show the label', width: 'half' },
      { kind: 'text', name: 'label', label: 'Label', width: 'half' },
    ],
  },

  articleAuthor: {
    type: 'articleAuthor',
    label: 'Author box',
    description: 'Photo, role, bio and social links from the author’s staff profile.',
    group: 'Article',
    icon: 'building-2',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: articleAuthorSchema,
    fields: [
      { kind: 'boolean', name: 'showHeading', label: 'Show a heading', width: 'half' },
      { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
      { kind: 'boolean', name: 'showImage', label: 'Show the photo', width: 'half' },
      { kind: 'boolean', name: 'showJobTitle', label: 'Show the job title', width: 'half' },
      { kind: 'boolean', name: 'showBio', label: 'Show the bio', width: 'half' },
      { kind: 'boolean', name: 'showSocial', label: 'Show social links', width: 'half' },
      ...widgetPanelFields.filter((field) => field.name.startsWith('panel.')),
    ],
  },

  articleRelated: {
    type: 'articleRelated',
    label: 'Related articles',
    description: 'Hand-picked first, then same category, shared tags and recent posts.',
    group: 'Article',
    icon: 'grid-3x3',
    surfaces: ['blogArticle'],
    schema: articleRelatedSchema,
    fields: [
      ...headingFields,
      ...postSourceFields,
      { kind: 'number', name: 'columns', label: 'Columns', min: 1, max: 4, width: 'half' },
      ...responsiveColumnFields,
      ...cardOverrideFields,
      { kind: 'text', name: 'emptyText', label: 'Text when there is nothing related' },
    ],
  },

  articlePrevNext: {
    type: 'articlePrevNext',
    label: 'Previous / next',
    description: 'Links to the articles either side of this one.',
    group: 'Article',
    icon: 'list-ordered',
    surfaces: ['blogArticle'],
    singleton: true,
    schema: articlePrevNextSchema,
    fields: [
      { kind: 'text', name: 'previousLabel', label: 'Previous label', width: 'half' },
      { kind: 'text', name: 'nextLabel', label: 'Next label', width: 'half' },
      { kind: 'boolean', name: 'showImage', label: 'Show thumbnails', width: 'half' },
      { kind: 'boolean', name: 'sameCategory', label: 'Stay in the same category', width: 'half' },
    ],
  },

  // --- sidebar widgets -----------------------------------------------------
  widgetSearch: {
    type: 'widgetSearch',
    label: 'Search',
    description: 'A search field that sends the visitor to the blog archive.',
    group: 'Sidebar',
    icon: 'circle-help',
    surfaces: ['blogSidebar'],
    schema: widgetSearchSchema,
    fields: [
      ...widgetBaseFields,
      { kind: 'text', name: 'placeholder', label: 'Placeholder', width: 'half' },
      { kind: 'boolean', name: 'showButton', label: 'Show a button', width: 'half' },
      { kind: 'text', name: 'buttonLabel', label: 'Button label', width: 'half' },
      ...widgetPanelFields,
    ],
  },

  widgetToc: {
    type: 'widgetToc',
    label: 'Table of contents',
    description: 'The article’s headings, in the sidebar.',
    group: 'Sidebar',
    icon: 'list-ordered',
    surfaces: ['blogSidebar'],
    schema: widgetTocSchema,
    fields: [
      ...widgetBaseFields,
      { kind: 'boolean', name: 'includeH3', label: 'Include H3 headings', width: 'half' },
      { kind: 'boolean', name: 'collapsible', label: 'Collapsible', width: 'half' },
      { kind: 'boolean', name: 'openByDefault', label: 'Open by default', width: 'half' },
      ...widgetPanelFields,
    ],
  },

  widgetPosts: {
    type: 'widgetPosts',
    label: 'Post list',
    description: 'Recent, popular, featured, related or hand-picked articles.',
    group: 'Sidebar',
    icon: 'grid-3x3',
    surfaces: ['blogSidebar'],
    schema: widgetPostListSchema,
    fields: postListWidgetFields(),
  },

  widgetCategories: {
    type: 'widgetCategories',
    label: 'Categories',
    description: 'Category list with optional subcategories and article counts.',
    group: 'Sidebar',
    icon: 'grid-3x3',
    surfaces: ['blogSidebar'],
    schema: widgetCategoriesSchema,
    fields: [
      ...widgetBaseFields,
      {
        kind: 'select',
        name: 'source',
        label: 'Categories to show',
        width: 'half',
        options: [
          { label: 'Every active category', value: 'all' },
          { label: 'Only the ones I choose', value: 'selected' },
        ],
      },
      {
        kind: 'blogCategories',
        name: 'categoryIds',
        label: 'Chosen categories',
        showWhen: { field: 'source', equals: ['selected'] },
      },
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'List', value: 'list' },
          { label: 'Pills', value: 'pill' },
        ],
      },
      { kind: 'boolean', name: 'showChildren', label: 'Show subcategories', width: 'half' },
      { kind: 'boolean', name: 'showCounts', label: 'Show article counts', width: 'half' },
      { kind: 'boolean', name: 'showEmpty', label: 'Show empty categories', width: 'half' },
      { kind: 'number', name: 'limit', label: 'Maximum shown', min: 1, max: 50, width: 'half' },
      ...widgetPanelFields,
    ],
  },

  widgetTags: {
    type: 'widgetTags',
    label: 'Tags',
    description: 'A cloud of the tags in use.',
    group: 'Sidebar',
    icon: 'text',
    surfaces: ['blogSidebar'],
    schema: widgetTagsSchema,
    fields: [
      ...widgetBaseFields,
      { kind: 'number', name: 'limit', label: 'Maximum shown', min: 1, max: 60, width: 'half' },
      { kind: 'boolean', name: 'showCounts', label: 'Show article counts', width: 'half' },
      ...widgetPanelFields,
    ],
  },

  widgetForm: {
    type: 'widgetForm',
    label: 'Lead form',
    description: 'Any form from Form management. Submissions land in Leads.',
    group: 'Sidebar',
    icon: 'clipboard-list',
    surfaces: ['blogSidebar'],
    schema: widgetFormSchema,
    design: ['buttons'],
    formFields: formStyleGroups({ card: false }),
    fields: [
      ...widgetBaseFields,
      { kind: 'form', name: 'formSlug', label: 'Form', width: 'half', help: FORM_PICKER_HELP },
      {
        kind: 'boolean',
        name: 'preferPostForm',
        label: 'Let a post override this form',
        width: 'half',
        help: 'Uses the sidebar form chosen on the article when it has one.',
      },
      {
        kind: 'text',
        name: 'ctaLocation',
        label: 'Tracking label',
        help: 'Names this placement on the leads it captures, e.g. blog_sidebar.',
      },
      ...widgetPanelFields,
    ],
  },

  widgetNewsletter: {
    type: 'widgetNewsletter',
    label: 'Newsletter',
    description: 'A compact sign-up form for the sidebar.',
    group: 'Sidebar',
    icon: 'megaphone',
    surfaces: ['blogSidebar'],
    schema: widgetFormSchema,
    design: ['buttons'],
    formFields: formStyleGroups({ card: false }),
    fields: [
      ...widgetBaseFields,
      { kind: 'form', name: 'formSlug', label: 'Form', width: 'half', help: FORM_PICKER_HELP },
      { kind: 'text', name: 'ctaLocation', label: 'Tracking label', width: 'half' },
      ...widgetPanelFields,
    ],
  },

  widgetCta: {
    type: 'widgetCta',
    label: 'Call to action',
    description: 'A promo card with an image, copy and a button.',
    group: 'Sidebar',
    icon: 'megaphone',
    surfaces: ['blogSidebar'],
    schema: widgetCtaSchema,
    fields: [
      ...widgetBaseFields,
      { kind: 'media', name: 'imageId', label: 'Image', width: 'half' },
      {
        kind: 'select',
        name: 'align',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
        ],
      },
      { kind: 'textarea', name: 'body', label: 'Body copy', rows: 3 },
      ...linkFields('cta', 'Button'),
      ...widgetPanelFields,
    ],
  },

  widgetAuthor: {
    type: 'widgetAuthor',
    label: 'Author',
    description: 'The article author’s photo, role, bio and links.',
    group: 'Sidebar',
    icon: 'building-2',
    surfaces: ['blogSidebar'],
    schema: widgetAuthorSchema,
    fields: [
      ...widgetBaseFields,
      { kind: 'boolean', name: 'showImage', label: 'Show the photo', width: 'half' },
      { kind: 'boolean', name: 'showJobTitle', label: 'Show the job title', width: 'half' },
      { kind: 'boolean', name: 'showBio', label: 'Show the bio', width: 'half' },
      { kind: 'boolean', name: 'showSocial', label: 'Show social links', width: 'half' },
      {
        kind: 'blogAuthor',
        name: 'fallbackAuthorId',
        label: 'Fallback author',
        help: 'Used on articles that have no author set.',
      },
      ...widgetPanelFields,
    ],
  },

  widgetProducts: {
    type: 'widgetProducts',
    label: 'Product recommendations',
    description: 'Plans and products pulled from the product catalogue.',
    group: 'Sidebar',
    icon: 'package',
    surfaces: ['blogSidebar'],
    schema: widgetProductsSchema,
    fields: [
      ...widgetBaseFields,
      {
        kind: 'select',
        name: 'source',
        label: 'Products to show',
        width: 'half',
        options: [
          { label: 'Featured', value: 'featured' },
          { label: 'Latest', value: 'latest' },
          { label: 'A category', value: 'category' },
          { label: 'Hand-picked', value: 'selected' },
        ],
      },
      { kind: 'number', name: 'limit', label: 'How many', min: 1, max: 8, width: 'half' },
      {
        kind: 'productCategory',
        name: 'categoryId',
        label: 'Category',
        showWhen: { field: 'source', equals: ['category'] },
      },
      {
        kind: 'products',
        name: 'productIds',
        label: 'Chosen products',
        showWhen: { field: 'source', equals: ['selected'] },
      },
      { kind: 'boolean', name: 'showImage', label: 'Show images', width: 'half' },
      { kind: 'boolean', name: 'showPrice', label: 'Show prices', width: 'half' },
      { kind: 'text', name: 'ctaLabel', label: 'Button label', width: 'half' },
      ...widgetPanelFields,
    ],
  },

  widgetImage: {
    type: 'widgetImage',
    label: 'Image',
    description: 'A single image, optionally linked.',
    group: 'Sidebar',
    icon: 'image',
    surfaces: ['blogSidebar'],
    schema: widgetImageSchema,
    fields: [
      ...widgetBaseFields,
      { kind: 'media', name: 'imageId', label: 'Image', width: 'half' },
      { kind: 'text', name: 'alt', label: 'Alt text', width: 'half' },
      { kind: 'url', name: 'linkUrl', label: 'Links to', width: 'half' },
      { kind: 'length', name: 'radius', label: 'Corner radius', width: 'half' },
      { kind: 'text', name: 'caption', label: 'Caption' },
      ...widgetPanelFields,
    ],
  },

  widgetHeading: {
    type: 'widgetHeading',
    label: 'Heading',
    description: 'A standalone heading.',
    group: 'Sidebar',
    icon: 'text',
    surfaces: ['blogSidebar'],
    schema: widgetHeadingSchema,
    fields: [
      ...widgetBaseFields,
      { kind: 'text', name: 'text', label: 'Text' },
      {
        kind: 'select',
        name: 'level',
        label: 'Level',
        width: 'half',
        options: [
          { label: 'Heading 2', value: 'h2' },
          { label: 'Heading 3', value: 'h3' },
          { label: 'Heading 4', value: 'h4' },
          { label: 'Paragraph', value: 'p' },
        ],
      },
      {
        kind: 'select',
        name: 'align',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
      ...widgetPanelFields,
    ],
  },

  widgetText: {
    type: 'widgetText',
    label: 'Custom content',
    description: 'Formatted text. Sanitised before it reaches the website.',
    group: 'Sidebar',
    icon: 'text',
    surfaces: ['blogSidebar'],
    schema: widgetTextSchema,
    fields: [...widgetBaseFields, { kind: 'richtext', name: 'body', label: 'Content' }, ...widgetPanelFields],
  },

  widgetButton: {
    type: 'widgetButton',
    label: 'Button',
    description: 'A single call-to-action button.',
    group: 'Sidebar',
    icon: 'megaphone',
    surfaces: ['blogSidebar'],
    schema: widgetButtonSchema,
    fields: [
      ...widgetBaseFields,
      ...linkFields('cta', 'Button'),
      {
        kind: 'select',
        name: 'variant',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Primary', value: 'primary' },
          { label: 'Outline', value: 'outline' },
          { label: 'Text', value: 'ghost' },
        ],
      },
      { kind: 'boolean', name: 'fullWidth', label: 'Full width', width: 'half' },
      ...widgetPanelFields,
    ],
  },

  widgetSocial: {
    type: 'widgetSocial',
    label: 'Social links',
    description: 'Links to your profiles. Blank fields inherit Website settings.',
    group: 'Sidebar',
    icon: 'megaphone',
    surfaces: ['blogSidebar'],
    schema: widgetSocialSchema,
    fields: [
      ...widgetBaseFields,
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Icons', value: 'icon' },
          { label: 'List', value: 'list' },
        ],
      },
      { kind: 'url', name: 'linkedinUrl', label: 'LinkedIn', width: 'half' },
      { kind: 'url', name: 'twitterUrl', label: 'X', width: 'half' },
      { kind: 'url', name: 'facebookUrl', label: 'Facebook', width: 'half' },
      { kind: 'url', name: 'instagramUrl', label: 'Instagram', width: 'half' },
      { kind: 'url', name: 'youtubeUrl', label: 'YouTube', width: 'half' },
      ...widgetPanelFields,
    ],
  },
};

export type BlogHeroContent = z.infer<typeof blogHeroSchema>;
export type BlogBreadcrumbContent = z.infer<typeof blogBreadcrumbSchema>;
export type BlogCategoryFilterContent = z.infer<typeof blogCategoryFilterSchema>;
export type BlogSearchContent = z.infer<typeof blogSearchSchema>;
export type BlogFeaturedContent = z.infer<typeof blogFeaturedSchema>;
export type BlogGridContent = z.infer<typeof blogGridSchema>;
export type BlogPaginationContent = z.infer<typeof blogPaginationSchema>;
export type BlogNewsletterContent = z.infer<typeof blogNewsletterSchema>;
export type DividerContent = z.infer<typeof dividerSchema>;
export type SpacerContent = z.infer<typeof spacerSchema>;
export type ArticleHeaderContent = z.infer<typeof articleHeaderSchema>;
export type ArticleImageContent = z.infer<typeof articleImageSchema>;
export type ArticleTocContent = z.infer<typeof articleTocSchema>;
export type ArticleContentContent = z.infer<typeof articleContentSchema>;
export type ArticleShareContent = z.infer<typeof articleShareSchema>;
export type ArticleTagsContent = z.infer<typeof articleTagsSchema>;
export type ArticleAuthorContent = z.infer<typeof articleAuthorSchema>;
export type ArticleRelatedContent = z.infer<typeof articleRelatedSchema>;
export type ArticlePrevNextContent = z.infer<typeof articlePrevNextSchema>;
export type WidgetPostListContent = z.infer<typeof widgetPostListSchema>;
export type WidgetSearchContent = z.infer<typeof widgetSearchSchema>;
export type WidgetTocContent = z.infer<typeof widgetTocSchema>;
export type WidgetCategoriesContent = z.infer<typeof widgetCategoriesSchema>;
export type WidgetTagsContent = z.infer<typeof widgetTagsSchema>;
export type WidgetFormContent = z.infer<typeof widgetFormSchema>;
export type WidgetCtaContent = z.infer<typeof widgetCtaSchema>;
export type WidgetAuthorContent = z.infer<typeof widgetAuthorSchema>;
export type WidgetProductsContent = z.infer<typeof widgetProductsSchema>;
export type WidgetImageContent = z.infer<typeof widgetImageSchema>;
export type WidgetTextContent = z.infer<typeof widgetTextSchema>;
export type WidgetHeadingContent = z.infer<typeof widgetHeadingSchema>;
export type WidgetButtonContent = z.infer<typeof widgetButtonSchema>;
export type WidgetSocialContent = z.infer<typeof widgetSocialSchema>;

/** Shared shape of the post-source settings, for the service layer. */
export type PostSource = Pick<
  BlogGridContent,
  | 'source'
  | 'categoryId'
  | 'includeChildCategories'
  | 'tagId'
  | 'postIds'
  | 'limit'
  | 'orderBy'
  | 'orderDir'
  | 'excludeCurrent'
  | 'excludeIds'
>;

/** Per-section card overrides resolved against the blog-wide card settings. */
export type CardOverrides = Pick<
  BlogGridContent,
  | 'cardImage'
  | 'cardCategory'
  | 'cardExcerpt'
  | 'cardAuthor'
  | 'cardDate'
  | 'cardReadTime'
  | 'cardTags'
  | 'cardCta'
>;
