import { z } from 'zod';
import type { FieldDescriptor } from './fields';
import type { BlockDefinition } from './block-types';
import { sliderSettingsShape, SLIDER_FIELDS } from './slider';
import { productSourceShape, productSourceFields } from './product-source';
import {
  postSourceSchema,
  postSourceFields,
  cardOverrideSchema,
  cardOverrideFields,
} from './blog-blocks';

/**
 * The slider sections.
 *
 * Seven blocks over one slider: each defines what a slide *is* and nothing
 * about how the track behaves, because that comes from `sliderSettingsShape`
 * and `SLIDER_FIELDS` — spread into every one of them, so a control added
 * there appears on all seven and cannot drift between them.
 *
 * Section width, background, padding, margin, radius and the per-breakpoint
 * overrides of each are not repeated here: every section already has them on
 * the Design and Responsive tabs.
 */

const heading = z.string().max(240).default('');
const description = z.string().max(1200).default('');
const mediaId = z.string().nullable().default(null);
const link = z.string().max(500).default('');
const enabled = z.coerce.boolean().catch(true).default(true);

/** Heading and intro, offered by every slider above the track. */
const introShape = {
  eyebrow: z.string().max(120).default(''),
  heading,
  description,
};

const INTRO_FIELDS: FieldDescriptor[] = [
  { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
  { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
  { kind: 'textarea', name: 'description', label: 'Intro', rows: 2 },
];

// --- 1. logo slider ---------------------------------------------------------
const logoSliderSchema = z.object({
  ...introShape,
  ...sliderSettingsShape,
  items: z
    .array(
      z.object({
        imageId: mediaId,
        alt: z.string().max(200).default(''),
        title: z.string().max(120).default(''),
        url: link,
        newTab: z.coerce.boolean().catch(false).default(false),
        enabled,
      }),
    )
    .default([]),
  logoHeight: z.coerce.number().int().min(16).max(200).catch(48).default(48),
  logoFit: z.enum(['contain', 'cover']).catch('contain').default('contain'),
  grayscale: z.coerce.boolean().catch(false).default(false),
  hoverLift: z.coerce.boolean().catch(true).default(true),
});

// --- 2. image slider --------------------------------------------------------
const imageSliderSchema = z.object({
  ...introShape,
  ...sliderSettingsShape,
  items: z
    .array(
      z.object({
        imageId: mediaId,
        alt: z.string().max(200).default(''),
        heading,
        description,
        buttonLabel: z.string().max(80).default(''),
        buttonUrl: link,
        newTab: z.coerce.boolean().catch(false).default(false),
        enabled,
      }),
    )
    .default([]),
  ratio: z.enum(['auto', '1/1', '4/3', '3/2', '16/9', '3/4']).catch('16/9').default('16/9'),
  fit: z.enum(['cover', 'contain']).catch('cover').default('cover'),
  radius: z.coerce.number().int().min(0).max(48).catch(12).default(12),
  overlay: z.coerce.boolean().catch(true).default(true),
  overlayOpacity: z.coerce.number().int().min(0).max(90).catch(45).default(45),
  contentPosition: z
    .enum(['bottomLeft', 'bottomCentre', 'centre', 'topLeft', 'below'])
    .catch('bottomLeft')
    .default('bottomLeft'),
});

// --- 3. testimonial slider --------------------------------------------------
const testimonialSliderSchema = z.object({
  ...introShape,
  ...sliderSettingsShape,
  items: z
    .array(
      z.object({
        name: z.string().max(120).default(''),
        designation: z.string().max(120).default(''),
        company: z.string().max(120).default(''),
        quote: z.string().max(2000).default(''),
        imageId: mediaId,
        companyLogoId: mediaId,
        rating: z.coerce.number().int().min(0).max(5).catch(5).default(5),
        enabled,
      }),
    )
    .default([]),
  cardStyle: z.enum(['bordered', 'filled', 'plain']).catch('bordered').default('bordered'),
  textAlign: z.enum(['left', 'center']).catch('left').default('left'),
  showAvatar: z.coerce.boolean().catch(true).default(true),
  showRating: z.coerce.boolean().catch(true).default(true),
  shadow: z.coerce.boolean().catch(false).default(false),
  radius: z.coerce.number().int().min(0).max(48).catch(12).default(12),
  cardPadding: z.coerce.number().int().min(0).max(64).catch(20).default(20),
});

// --- 4. image + heading + text slider ---------------------------------------
const contentSliderSchema = z.object({
  ...introShape,
  ...sliderSettingsShape,
  items: z
    .array(
      z.object({
        imageId: mediaId,
        alt: z.string().max(200).default(''),
        heading,
        description,
        bullets: z.array(z.string().max(200)).default([]),
        ctaLabel: z.string().max(80).default(''),
        ctaUrl: link,
        newTab: z.coerce.boolean().catch(false).default(false),
        enabled,
      }),
    )
    .default([]),
  layout: z
    .enum(['imageTop', 'imageLeft', 'imageRight', 'backgroundImage'])
    .catch('imageTop')
    .default('imageTop'),
  ratio: z.enum(['auto', '1/1', '4/3', '3/2', '16/9']).catch('4/3').default('4/3'),
  radius: z.coerce.number().int().min(0).max(48).catch(12).default(12),
});



// --- 7. text box / city slider ----------------------------------------------
const textBoxSliderSchema = z.object({
  ...introShape,
  ...sliderSettingsShape,
  items: z
    .array(
      z.object({
        heading,
        text: z.string().max(600).default(''),
        icon: z.string().max(40).default(''),
        imageId: mediaId,
        url: link,
        ctaLabel: z.string().max(80).default(''),
        newTab: z.coerce.boolean().catch(false).default(false),
        enabled,
      }),
    )
    .default([]),
  cardStyle: z.enum(['bordered', 'filled', 'plain']).catch('bordered').default('bordered'),
  textAlign: z.enum(['left', 'center']).catch('left').default('left'),
  shadow: z.coerce.boolean().catch(false).default(false),
  radius: z.coerce.number().int().min(0).max(48).catch(12).default(12),
  cardPadding: z.coerce.number().int().min(0).max(64).catch(20).default(20),
});

// --- 5. product slider ------------------------------------------------------
const productSliderSchema = z.object({
  ...introShape,
  ...sliderSettingsShape,
  ...productSourceShape,
  billing: z.enum(['monthly', 'annual']).catch('monthly').default('monthly'),
  ctaLabel: z.string().max(80).default(''),
  showImage: z.coerce.boolean().catch(true).default(true),
  showDescription: z.coerce.boolean().catch(true).default(true),
  showPrice: z.coerce.boolean().catch(true).default(true),
  showFeatures: z.coerce.boolean().catch(true).default(true),
  /** Benefits and specifications, alongside the features, both on by default. */
  showBenefits: z.coerce.boolean().catch(true).default(true),
  showSpecs: z.coerce.boolean().catch(true).default(true),
  /** 0 — the default — lists every feature, benefit and specification. */
  featureLimit: z.coerce.number().int().min(0).max(40).catch(0).default(0),
  showName: z.coerce.boolean().catch(true).default(true),
  linkName: z.coerce.boolean().catch(true).default(true),
  showActions: z.coerce.boolean().catch(true).default(true),
  showCta: z.coerce.boolean().catch(true).default(true),
  showDetailsLink: z.coerce.boolean().catch(true).default(true),
});

// --- 6. blog slider ---------------------------------------------------------
const blogSliderSchema = z.object({
  ...introShape,
  ...sliderSettingsShape,
  ...postSourceSchema,
  ...cardOverrideSchema,
});

export type LogoSliderContent = z.infer<typeof logoSliderSchema>;
export type ProductSliderContent = z.infer<typeof productSliderSchema>;
export type BlogSliderContent = z.infer<typeof blogSliderSchema>;
export type ImageSliderContent = z.infer<typeof imageSliderSchema>;
export type TestimonialSliderContent = z.infer<typeof testimonialSliderSchema>;
export type ContentSliderContent = z.infer<typeof contentSliderSchema>;
export type TextBoxSliderContent = z.infer<typeof textBoxSliderSchema>;

const itemToggle: FieldDescriptor = {
  kind: 'boolean',
  name: 'enabled',
  label: 'Show this item',
  width: 'half',
};

const newTab: FieldDescriptor = {
  kind: 'boolean',
  name: 'newTab',
  label: 'Open in a new tab',
  width: 'half',
};

export const SLIDER_BLOCKS: Record<string, BlockDefinition> = {
  logoSlider: {
    type: 'logoSlider',
    label: 'Logo slider',
    description: 'Partner or customer logos on a track that scrolls.',
    group: 'Social proof',
    icon: 'building-2',
    surfaces: ['page', 'blogListing'],
    schema: logoSliderSchema,
    fields: [
      ...INTRO_FIELDS,
      {
        kind: 'repeater',
        name: 'items',
        label: 'Logos',
        itemLabel: 'Logo',
        titleField: 'title',
        max: 60,
        fields: [
          { kind: 'media', name: 'imageId', label: 'Logo', width: 'half' },
          { kind: 'text', name: 'alt', label: 'Alt text', width: 'half' },
          { kind: 'text', name: 'title', label: 'Name', width: 'half' },
          { kind: 'url', name: 'url', label: 'Link', width: 'half' },
          newTab,
          itemToggle,
        ],
      },
      {
        kind: 'number',
        name: 'logoHeight',
        label: 'Logo height',
        help: 'Pixels.',
        width: 'third',
        min: 16,
        max: 200,
      },
      {
        kind: 'select',
        name: 'logoFit',
        label: 'Fit',
        width: 'third',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'cover', label: 'Cover' },
        ],
      },
      { kind: 'boolean', name: 'grayscale', label: 'Grey until hovered', width: 'third' },
      { kind: 'boolean', name: 'hoverLift', label: 'Lift on hover', width: 'half' },
      ...SLIDER_FIELDS,
    ],
  },

  imageSlider: {
    type: 'imageSlider',
    label: 'Image slider',
    description: 'Images with optional heading, text and a button.',
    group: 'Cards & media',
    icon: 'image',
    surfaces: ['page', 'blogListing'],
    schema: imageSliderSchema,
    design: ['buttons'],
    fields: [
      ...INTRO_FIELDS,
      {
        kind: 'repeater',
        name: 'items',
        label: 'Slides',
        itemLabel: 'Slide',
        titleField: 'heading',
        max: 30,
        fields: [
          { kind: 'media', name: 'imageId', label: 'Image', width: 'half' },
          { kind: 'text', name: 'alt', label: 'Alt text', width: 'half' },
          { kind: 'text', name: 'heading', label: 'Heading' },
          { kind: 'textarea', name: 'description', label: 'Text', rows: 2 },
          { kind: 'text', name: 'buttonLabel', label: 'Button label', width: 'half' },
          { kind: 'url', name: 'buttonUrl', label: 'Button link', width: 'half' },
          newTab,
          itemToggle,
        ],
      },
      {
        kind: 'select',
        name: 'ratio',
        label: 'Aspect ratio',
        width: 'third',
        options: [
          { value: '16/9', label: '16:9' },
          { value: '3/2', label: '3:2' },
          { value: '4/3', label: '4:3' },
          { value: '1/1', label: 'Square' },
          { value: '3/4', label: 'Portrait' },
          { value: 'auto', label: 'Natural' },
        ],
      },
      {
        kind: 'select',
        name: 'fit',
        label: 'Fit',
        width: 'third',
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
        ],
      },
      { kind: 'number', name: 'radius', label: 'Corner radius', width: 'third', min: 0, max: 48 },
      {
        kind: 'select',
        name: 'contentPosition',
        label: 'Text position',
        width: 'half',
        options: [
          { value: 'bottomLeft', label: 'Over the image, bottom left' },
          { value: 'bottomCentre', label: 'Over the image, bottom centre' },
          { value: 'centre', label: 'Over the image, centred' },
          { value: 'topLeft', label: 'Over the image, top left' },
          { value: 'below', label: 'Below the image' },
        ],
      },
      { kind: 'boolean', name: 'overlay', label: 'Darken behind the text', width: 'half' },
      {
        kind: 'number',
        name: 'overlayOpacity',
        label: 'Overlay strength',
        help: 'Per cent.',
        width: 'half',
        min: 0,
        max: 90,
        showWhen: { field: 'overlay', equals: [true] },
      },
      ...SLIDER_FIELDS,
    ],
  },

  testimonialSlider: {
    type: 'testimonialSlider',
    label: 'Testimonial slider',
    description: 'Customer quotes with a photo, rating and company.',
    group: 'Social proof',
    icon: 'quote',
    surfaces: ['page', 'blogListing'],
    schema: testimonialSliderSchema,
    fields: [
      ...INTRO_FIELDS,
      {
        kind: 'repeater',
        name: 'items',
        label: 'Testimonials',
        itemLabel: 'Testimonial',
        titleField: 'name',
        max: 40,
        fields: [
          { kind: 'textarea', name: 'quote', label: 'Testimonial', rows: 3 },
          { kind: 'text', name: 'name', label: 'Name', width: 'half' },
          { kind: 'text', name: 'designation', label: 'Job title', width: 'half' },
          { kind: 'text', name: 'company', label: 'Company', width: 'half' },
          { kind: 'number', name: 'rating', label: 'Rating out of 5', width: 'half', min: 0, max: 5 },
          { kind: 'media', name: 'imageId', label: 'Photo', width: 'half' },
          { kind: 'media', name: 'companyLogoId', label: 'Company logo', width: 'half' },
          itemToggle,
        ],
      },
      {
        kind: 'select',
        name: 'cardStyle',
        label: 'Card style',
        width: 'third',
        options: [
          { value: 'bordered', label: 'Bordered' },
          { value: 'filled', label: 'Filled' },
          { value: 'plain', label: 'Plain' },
        ],
      },
      {
        kind: 'select',
        name: 'textAlign',
        label: 'Text alignment',
        width: 'third',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
        ],
      },
      { kind: 'number', name: 'radius', label: 'Corner radius', width: 'third', min: 0, max: 48 },
      { kind: 'number', name: 'cardPadding', label: 'Card padding', width: 'third', min: 0, max: 64 },
      { kind: 'boolean', name: 'showAvatar', label: 'Show the photo', width: 'third' },
      { kind: 'boolean', name: 'showRating', label: 'Show the rating', width: 'third' },
      { kind: 'boolean', name: 'shadow', label: 'Card shadow', width: 'half' },
      ...SLIDER_FIELDS,
    ],
  },

  contentSlider: {
    type: 'contentSlider',
    label: 'Image + text slider',
    description: 'Image, heading, text, an optional list and a button per slide.',
    group: 'Content',
    icon: 'layout-panel-left',
    surfaces: ['page', 'blogListing'],
    schema: contentSliderSchema,
    design: ['buttons'],
    fields: [
      ...INTRO_FIELDS,
      {
        kind: 'repeater',
        name: 'items',
        label: 'Slides',
        itemLabel: 'Slide',
        titleField: 'heading',
        max: 30,
        fields: [
          { kind: 'media', name: 'imageId', label: 'Image', width: 'half' },
          { kind: 'text', name: 'alt', label: 'Alt text', width: 'half' },
          { kind: 'text', name: 'heading', label: 'Heading' },
          { kind: 'textarea', name: 'description', label: 'Text', rows: 3 },
          {
            kind: 'repeater',
            name: 'bullets',
            label: 'List',
            itemLabel: 'Point',
            titleField: 'value',
            max: 12,
            fields: [{ kind: 'text', name: 'value', label: 'Point' }],
          },
          { kind: 'text', name: 'ctaLabel', label: 'Button label', width: 'half' },
          { kind: 'url', name: 'ctaUrl', label: 'Button link', width: 'half' },
          newTab,
          itemToggle,
        ],
      },
      {
        kind: 'select',
        name: 'layout',
        label: 'Slide layout',
        width: 'half',
        options: [
          { value: 'imageTop', label: 'Image on top' },
          { value: 'imageLeft', label: 'Image on the left' },
          { value: 'imageRight', label: 'Image on the right' },
          { value: 'backgroundImage', label: 'Image behind the text' },
        ],
        help: 'Side-by-side layouts stack on a phone automatically.',
      },
      {
        kind: 'select',
        name: 'ratio',
        label: 'Image ratio',
        width: 'half',
        options: [
          { value: '4/3', label: '4:3' },
          { value: '16/9', label: '16:9' },
          { value: '3/2', label: '3:2' },
          { value: '1/1', label: 'Square' },
          { value: 'auto', label: 'Natural' },
        ],
      },
      { kind: 'number', name: 'radius', label: 'Corner radius', width: 'half', min: 0, max: 48 },
      ...SLIDER_FIELDS,
    ],
  },



  textBoxSlider: {
    type: 'textBoxSlider',
    label: 'Text box slider',
    description: 'Small cards of text — service areas, cities, anything listed.',
    group: 'Content',
    icon: 'map-pin',
    surfaces: ['page', 'blogListing'],
    schema: textBoxSliderSchema,
    fields: [
      ...INTRO_FIELDS,
      {
        kind: 'repeater',
        name: 'items',
        label: 'Cards',
        itemLabel: 'Card',
        titleField: 'heading',
        max: 60,
        fields: [
          { kind: 'text', name: 'heading', label: 'Heading', width: 'half' },
          { kind: 'icon', name: 'icon', label: 'Icon', width: 'half' },
          { kind: 'textarea', name: 'text', label: 'Text', rows: 2 },
          { kind: 'media', name: 'imageId', label: 'Image', width: 'half' },
          { kind: 'url', name: 'url', label: 'Link', width: 'half' },
          { kind: 'text', name: 'ctaLabel', label: 'Link label', width: 'half' },
          newTab,
          itemToggle,
        ],
      },
      {
        kind: 'select',
        name: 'cardStyle',
        label: 'Card style',
        width: 'third',
        options: [
          { value: 'bordered', label: 'Bordered' },
          { value: 'filled', label: 'Filled' },
          { value: 'plain', label: 'Plain' },
        ],
      },
      {
        kind: 'select',
        name: 'textAlign',
        label: 'Text alignment',
        width: 'third',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
        ],
      },
      { kind: 'number', name: 'radius', label: 'Corner radius', width: 'third', min: 0, max: 48 },
      { kind: 'number', name: 'cardPadding', label: 'Card padding', width: 'half', min: 0, max: 64 },
      { kind: 'boolean', name: 'shadow', label: 'Card shadow', width: 'half' },
      ...SLIDER_FIELDS,
    ],
  },
  productSlider: {
    type: 'productSlider',
    label: 'Product slider',
    description: 'Product plans on a track that scrolls, from any product source.',
    group: 'Products',
    icon: 'package',
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: productSliderSchema,
    fields: [
      ...INTRO_FIELDS,
      // The same source controls the product grid and comparison table use, so
      // "Featured", "By category" and "Hand-picked" mean the same thing here.
      ...productSourceFields,
      {
        kind: 'select',
        name: 'billing',
        label: 'Show price for',
        width: 'half',
        options: [
          { value: 'monthly', label: 'Monthly' },
          { value: 'annual', label: 'Annual' },
        ],
      },
      { kind: 'text', name: 'ctaLabel', label: 'Button label', width: 'half' },
      { kind: 'boolean', name: 'showImage', label: 'Show product image', width: 'half' },
      { kind: 'boolean', name: 'showDescription', label: 'Show description', width: 'half' },
      { kind: 'boolean', name: 'showPrice', label: 'Show pricing', width: 'half' },
      { kind: 'boolean', name: 'showFeatures', label: 'Show feature list', width: 'half' },
      { kind: 'boolean', name: 'showBenefits', label: 'Show benefits', width: 'half' },
      { kind: 'boolean', name: 'showSpecs', label: 'Show specifications', width: 'half' },
      {
        kind: 'number',
        name: 'featureLimit',
        label: 'Maximum list items',
        width: 'half',
        min: 0,
        max: 40,
        help: 'Applies to features, benefits and specifications. 0 shows every one.',
      },
      { kind: 'boolean', name: 'showName', label: 'Show product name', width: 'half' },
      {
        kind: 'boolean',
        name: 'linkName',
        label: 'Product name links to the product',
        width: 'half',
        help: 'Off renders the name as plain text.',
      },
      {
        kind: 'boolean',
        name: 'showActions',
        label: 'Show all actions',
        width: 'half',
        help: 'Off hides the button and the details link together.',
      },
      { kind: 'boolean', name: 'showCta', label: 'Show primary button', width: 'half' },
      { kind: 'boolean', name: 'showDetailsLink', label: 'Show \u201cView full details\u201d', width: 'half' },
      ...SLIDER_FIELDS,
    ],
  },

  blogSlider: {
    type: 'blogSlider',
    label: 'Article slider',
    description: 'Blog articles on a track that scrolls, from any post source.',
    group: 'Blog',
    icon: 'newspaper',
    // Offered on ordinary pages too: a home page showing the latest three
    // articles is the common case, and it needs no blog surface to work.
    surfaces: ['page', 'blogListing', 'blogArticle'],
    schema: blogSliderSchema,
    fields: [
      ...INTRO_FIELDS,
      // The article grid's own source controls, so "Latest", "A category",
      // "A tag" and "Related to this article" behave identically in both.
      ...postSourceFields,
      // And the same per-section card overrides, resolved against Blog \u2192 Design.
      ...cardOverrideFields,
      ...SLIDER_FIELDS,
    ],
  },
};
