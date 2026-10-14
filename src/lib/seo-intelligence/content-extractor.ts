import type { ContentDoc } from './types';
import { stripHtml, decodeEntities } from './text';

/**
 * Turns stored page-builder sections into what a visitor (and a crawler)
 * reads: headings, copy, lists, images, links, FAQs and calls to action.
 *
 * Reads the stored JSON generically rather than knowing every block, so a
 * block added later is analysed without changes here. It mirrors the
 * renderer's one structural rule that matters for SEO: the first visible
 * section's heading is the page's <h1>, every other section heading an <h2>.
 */

export type ExtractableSection = {
  blockType: string;
  content: unknown;
  isVisible: boolean;
  sortOrder?: number;
};

export type ExtractOptions = {
  /** Whether the first section may own the <h1> (false where the page has its own). */
  firstIsH1?: boolean;
  /** Alt text stored on media, by id, for images whose block sets none. */
  mediaAlt?: ReadonlyMap<string, string>;
  /** Names shown by a product block, which reads the catalogue at render time. */
  productNamesFor?: (blockType: string, content: Record<string, unknown>) => string[];
  /** The site's own hostname, so absolute links to it count as internal. */
  host?: string;
};

const TEXT_KEYS = new Set([
  'heading', 'title', 'subheading', 'eyebrow', 'description', 'content', 'text', 'body', 'answer', 'question',
  'quote', 'caption', 'summary', 'intro', 'label', 'value', 'name', 'role', 'company',
]);
const LIST_KEYS = new Set(['bullets', 'items', 'features', 'benefits', 'points', 'list']);
const LINK_KEY = /(url|href|link)$/i;
const SKIP_KEYS = new Set(['formStyle', 'settings', 'design', 'icon', 'layout', 'variant', 'style', 'alignment', 'align']);
const PRODUCT_BLOCKS = new Set(['productCards', 'productTable', 'productGrid']);
const CTA_BLOCKS = new Set(['cta', 'leadMagnet', 'form', 'formBlock']);

function isInternal(href: string, host?: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  if (!host) return false;
  try {
    return new URL(href).hostname === host;
  } catch {
    return false;
  }
}

function htmlParts(html: string, doc: ContentDoc, host?: string) {
  for (const match of html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = stripHtml(match[2] ?? '');
    if (!text) continue;
    const level = Number(match[1]);
    doc.headings.push({ level, text });
    if (level === 1) doc.h1.push(text);
  }
  doc.listItems += (html.match(/<li[\s>]/gi) ?? []).length;
  for (const match of html.matchAll(/<a\s[^>]*href=("|')([^"']+)\1/gi)) {
    const href = decodeEntities(match[2] ?? '');
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    doc.links.push({ href, internal: isInternal(href, host) });
  }
  for (const match of html.matchAll(/<img\s[^>]*>/gi)) {
    const alt = /alt=("|')([^"']*)\1/i.exec(match[0]);
    doc.images.push({ alt: decodeEntities(alt?.[2] ?? '').trim() });
  }
}

export function emptyDoc(): ContentDoc {
  return {
    h1: [],
    headings: [],
    firstText: '',
    body: '',
    listItems: 0,
    images: [],
    links: [],
    faq: [],
    hasCta: false,
    hasForm: false,
    hasTestimonials: false,
    hasStats: false,
    productNames: [],
    sectionCount: 0,
  };
}

export function extractSections(sections: readonly ExtractableSection[], options: ExtractOptions = {}): ContentDoc {
  const doc = emptyDoc();
  const visible = sections
    .filter((s) => s.isVisible)
    .map((s, index) => ({ s, index }))
    .sort((a, b) => (a.s.sortOrder ?? a.index) - (b.s.sortOrder ?? b.index))
    .map(({ s }) => s);
  const text: string[] = [];
  const firstIsH1 = options.firstIsH1 ?? true;

  visible.forEach((section, index) => {
    const content = (section.content && typeof section.content === 'object' ? section.content : {}) as Record<string, unknown>;
    const own: string[] = [];
    doc.sectionCount += 1;

    // The section's own heading: the page's <h1> when it leads, else an <h2>.
    const heading = typeof content.heading === 'string' ? content.heading.trim() : '';
    if (heading) {
      const level = index === 0 && firstIsH1 ? 1 : 2;
      doc.headings.push({ level, text: heading });
      if (level === 1) doc.h1.push(heading);
    }

    if (section.blockType === 'faq' && Array.isArray(content.items)) {
      for (const item of content.items as Array<Record<string, unknown>>) {
        const question = String(item?.question ?? '').trim();
        const answer = stripHtml(String(item?.answer ?? ''));
        if (question && answer) doc.faq.push({ question, answer });
      }
    }
    if (section.blockType === 'testimonials') doc.hasTestimonials = true;
    if (section.blockType === 'stats' || section.blockType === 'statistics') doc.hasStats = true;
    if (CTA_BLOCKS.has(section.blockType)) doc.hasCta = true;
    if (PRODUCT_BLOCKS.has(section.blockType) && options.productNamesFor) {
      const names = options.productNamesFor(section.blockType, content);
      doc.productNames.push(...names);
      own.push(...names);
      // Product cards link each product to its page.
      if (content.linkName !== false || content.showDetailsLink !== false) {
        for (const name of names) doc.links.push({ href: `product:${name}`, internal: true });
      }
    }

    const walk = (value: unknown, key: string, depth: number) => {
      if (SKIP_KEYS.has(key)) return;
      if (typeof value === 'string') {
        const v = value.trim();
        if (!v) return;
        if (LINK_KEY.test(key)) {
          if (!v.startsWith('#') && !v.startsWith('mailto:') && !v.startsWith('tel:')) {
            doc.links.push({ href: v, internal: isInternal(v, options.host) });
          }
          return;
        }
        if (key === 'formSlug') {
          doc.hasForm = true;
          doc.hasCta = true;
          return;
        }
        if (/^(primary|secondary)?ctaLabel$/i.test(key)) {
          doc.hasCta = true;
          return;
        }
        if (key === 'heading' && depth === 0) {
          own.push(v);
          return;
        }
        if (v.includes('<')) {
          htmlParts(v, doc, options.host);
          own.push(stripHtml(v));
          return;
        }
        if (TEXT_KEYS.has(key) || LIST_KEYS.has(key)) {
          own.push(v);
          if (depth > 0 && (key === 'title' || key === 'heading')) doc.headings.push({ level: 3, text: v });
        }
        return;
      }
      if (typeof value === 'boolean') {
        if (key === 'showForm' && value) doc.hasForm = true;
        return;
      }
      if (Array.isArray(value)) {
        if (LIST_KEYS.has(key)) doc.listItems += value.length;
        for (const item of value) walk(item, LIST_KEYS.has(key) && typeof item === 'string' ? key : key, depth + 1);
        return;
      }
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.imageId === 'string' && record.imageId) {
          const alt = String(record.imageAlt ?? record.alt ?? '').trim() || options.mediaAlt?.get(record.imageId) || '';
          doc.images.push({ alt });
        }
        for (const [k, v] of Object.entries(record)) {
          if (k === 'imageId' || k === 'imageAlt' || k === 'alt') continue;
          walk(v, k, depth + 1);
        }
      }
    };

    if (typeof content.imageId === 'string' && content.imageId) {
      const alt = String(content.imageAlt ?? '').trim() || options.mediaAlt?.get(content.imageId) || '';
      doc.images.push({ alt });
    }
    for (const [k, v] of Object.entries(content)) {
      if (k === 'imageId' || k === 'imageAlt') continue;
      walk(v, k, 0);
    }
    if (content.showForm === true || (typeof content.formSlug === 'string' && content.formSlug)) doc.hasForm = true;

    const joined = own.join(' ').replace(/\s+/g, ' ').trim();
    if (index === 0) doc.firstText = joined;
    else if (!doc.firstText && joined) doc.firstText = joined;
    text.push(joined);
  });

  doc.body = text.filter(Boolean).join(' ');
  return doc;
}

/** Adds a product's own record — name, copy, features — to what its sections say. */
export function withProductRecord(
  doc: ContentDoc,
  product: { name: string; summary: string; descriptionHtml: string; features: string[]; benefits: string[]; specs: Array<{ label: string; value: string }> },
): ContentDoc {
  const next = { ...doc, headings: [...doc.headings], h1: [...doc.h1], links: [...doc.links], images: [...doc.images] };
  // The product header renders the product's name as the page's <h1> when no
  // leading section claims it.
  if (next.h1.length === 0) {
    next.h1.push(product.name);
    next.headings.unshift({ level: 1, text: product.name });
  }
  if (product.descriptionHtml) htmlParts(product.descriptionHtml, next);
  const extra = [
    product.summary,
    stripHtml(product.descriptionHtml),
    ...product.features,
    ...product.benefits,
    ...product.specs.map((s) => `${s.label} ${s.value}`),
  ]
    .filter(Boolean)
    .join(' ');
  next.listItems += product.features.length + product.benefits.length + product.specs.length;
  next.firstText = next.firstText || product.summary;
  next.body = [product.name, extra, doc.body].filter(Boolean).join(' ');
  next.productNames = [...doc.productNames, product.name];
  return next;
}
