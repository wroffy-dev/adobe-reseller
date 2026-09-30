import { slugify } from '@/lib/utils/slug';

/**
 * Starting values for a city's landing pages, as pure functions.
 *
 * Everything here is used exactly once — when a page is generated — and then
 * belongs to the page. Nothing reads these again, so editing a city page never
 * fights a template, and changing a template never rewrites a page somebody
 * has already edited.
 */

/** What a new city's pages are about, until the editor says otherwise. */
export const DEFAULT_CITY_PHRASE = 'Adobe reseller';

export const MAX_PRIMARY_KEYWORDS = 3;

export type CityTokens = {
  city: string;
  region?: string | null;
  country: string;
  product?: string;
};

/** A city's slug from its name: "New Delhi" → "new-delhi". */
export function citySlug(name: string): string {
  return slugify(name);
}

/** The page slug of a city's product page: "delhi/adobe-acrobat-pro". */
export function cityProductSlug(citySlugValue: string, productSlug: string): string {
  return `${citySlugValue}/${productSlug}`;
}

/**
 * The slug a page gets when its city moves from `from` to `to`.
 *
 * Only the city's own page and pages under it move — "delhi" and
 * "delhi/acrobat" follow the city, "delhi-ncr" does not.
 */
export function rebaseCitySlug(slug: string, from: string, to: string): string | null {
  if (slug === from) return to;
  if (slug.startsWith(`${from}/`)) return `${to}${slug.slice(from.length)}`;
  return null;
}

/** Up to three distinct, non-empty phrases, trimmed and in the order given. */
export function normaliseKeywords(input: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const value = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length === MAX_PRIMARY_KEYWORDS) break;
  }
  return out;
}

function titleCase(value: string): string {
  return value.replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** "Adobe reseller" → "Adobe": the brand a phrase is about. */
export function brandOf(phrase: string): string {
  const first = phrase.trim().split(/\s+/)[0] ?? '';
  return first ? titleCase(first) : '';
}

function place(tokens: CityTokens): string {
  return tokens.region ? `${tokens.city}, ${tokens.region}` : tokens.city;
}

export type SeoSuggestion = {
  title: string;
  seoTitle: string;
  h1: string;
  seoDescription: string;
  keywords: string[];
};

/** Suggested SEO for a city's landing page: "Adobe Reseller in Delhi". */
export function suggestCitySeo(tokens: CityTokens, phrase = DEFAULT_CITY_PHRASE): SeoSuggestion {
  const clean = phrase.replace(/\s+/g, ' ').trim() || DEFAULT_CITY_PHRASE;
  const brand = brandOf(clean);
  const h1 = `${titleCase(clean)} in ${tokens.city}`;
  return {
    title: tokens.city,
    seoTitle: brand ? `${h1} | ${brand} Licensing Partner` : h1,
    h1,
    seoDescription: `Genuine ${brand} licenses for businesses in ${place(tokens)}, ${tokens.country}. Get pricing, deployment help and local support from an authorised ${brand} partner.`,
    keywords: normaliseKeywords([
      `${clean} in ${tokens.city}`,
      brand ? `${brand} partner in ${tokens.city}` : null,
      brand ? `${brand} licenses in ${tokens.city}` : null,
    ]),
  };
}

/**
 * Suggested SEO for a city's product page: "Adobe Acrobat Pro in Delhi".
 * The site's title template adds the brand, so the title does not.
 */
export function suggestCityProductSeo(tokens: CityTokens & { product: string }): SeoSuggestion {
  const h1 = `${tokens.product} in ${tokens.city}`;
  return {
    title: h1,
    seoTitle: `${h1} | Licenses & Pricing`,
    h1,
    seoDescription: `Buy ${tokens.product} licenses in ${place(tokens)} with current ${tokens.country} pricing, invoicing, setup help and local support.`,
    keywords: normaliseKeywords([
      h1,
      `buy ${tokens.product} in ${tokens.city}`,
      `${tokens.product} price in ${tokens.city}`,
    ]),
  };
}

/**
 * Replaces {{city}}, {{region}}, {{country}} and {{product}} in every string of
 * a copied section payload — how a template page becomes a starting point.
 */
export function replaceTokens<T>(value: T, tokens: CityTokens): T {
  const map: Record<string, string> = {
    city: tokens.city,
    region: tokens.region ?? '',
    country: tokens.country,
    product: tokens.product ?? '',
  };
  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') {
      return input.replace(/\{\{\s*(city|region|country|product)\s*\}\}/gi, (_, key: string) => map[key.toLowerCase()] ?? '');
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    }
    return input;
  };
  return walk(value) as T;
}

export type StarterSection = {
  blockType: string;
  name: string;
  content: Record<string, unknown>;
  anchorId?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The starter layout of a city landing page.
 *
 * Deliberately a starting point: the copy is short and general, so SEO
 * Intelligence flags it as too similar to other cities until somebody writes
 * what is actually true of this city. Prices come from a product block, which
 * reads Product and ProductCountry when the page renders.
 */
export function cityStarterSections(
  tokens: CityTokens,
  seo: SeoSuggestion,
  phrase = DEFAULT_CITY_PHRASE,
  formSlug = '',
): StarterSection[] {
  const brand = brandOf(phrase) || 'our';
  const city = escapeHtml(tokens.city);
  return [
    {
      blockType: 'hero',
      name: 'Hero',
      content: {
        eyebrow: tokens.region ? `${tokens.region}, ${tokens.country}` : tokens.country,
        heading: seo.h1,
        description: seo.seoDescription,
        primaryCtaLabel: 'Get a quote',
        primaryCtaUrl: '#enquiry',
      },
    },
    {
      blockType: 'richText',
      name: 'Introduction',
      content: {
        heading: `${brand} licensing for businesses in ${tokens.city}`,
        content: `<p>We help teams in ${city} choose, buy and manage the right ${escapeHtml(brand)} plans — from a single licence to an organisation-wide agreement.</p><p>Describe here what is specific to ${city}: the industries you work with, how quickly you can deliver, and how customers here reach you.</p>`,
      },
    },
    {
      blockType: 'productCards',
      name: 'Products',
      content: {
        heading: `${brand} products for teams in ${tokens.city}`,
        source: 'featured',
        limit: 6,
      },
    },
    {
      blockType: 'faq',
      name: 'FAQ',
      content: {
        heading: `${brand} licensing in ${tokens.city}: common questions`,
        items: [
          {
            question: `Where can I buy ${brand} licenses in ${tokens.city}?`,
            answer: `You can buy ${brand} licenses for ${tokens.city} directly from us. Send an enquiry and we reply with a quote for the plans and seat counts you need.`,
          },
          {
            question: `Do you provide installation and support in ${tokens.city}?`,
            answer: `Yes. We help with deployment, user setup and renewals for customers in ${tokens.city}, and support continues after purchase.`,
          },
          {
            question: `How is ${brand} pricing calculated in ${tokens.country}?`,
            answer: `Prices depend on the plan, the number of users and the billing term. Current ${tokens.country} prices are shown on each product.`,
          },
        ],
      },
    },
    {
      blockType: 'cta',
      name: 'Enquiry',
      anchorId: 'enquiry',
      content: {
        heading: `Talk to a ${brand} licensing specialist for ${tokens.city}`,
        description: 'Tell us what your team needs and we will reply with a quote.',
        primaryCtaLabel: formSlug ? '' : 'Contact us',
        primaryCtaUrl: formSlug ? '' : '/contact',
        formSlug,
      },
    },
  ];
}

/** The starter layout of a city's product page. */
export function cityProductStarterSections(input: {
  tokens: CityTokens & { product: string };
  seo: SeoSuggestion;
  productId: string;
  productSummary: string;
  productDescriptionHtml: string;
  cityPath: string;
  formSlug?: string;
}): StarterSection[] {
  const { tokens, seo } = input;
  const city = escapeHtml(tokens.city);
  const product = escapeHtml(tokens.product);
  return [
    {
      blockType: 'hero',
      name: 'Hero',
      content: {
        eyebrow: tokens.region ? `${tokens.city}, ${tokens.region}` : tokens.city,
        heading: seo.h1,
        description: input.productSummary || seo.seoDescription,
        primaryCtaLabel: 'Get a quote',
        primaryCtaUrl: '#enquiry',
      },
    },
    {
      // The price shown here is read live from the product in this market.
      blockType: 'productCards',
      name: 'Pricing',
      content: {
        heading: `${tokens.product} pricing in ${tokens.country}`,
        source: 'selected',
        productIds: [input.productId],
        limit: 1,
        columns: 2,
      },
    },
    {
      blockType: 'richText',
      name: 'About the product',
      content: {
        heading: `Buying ${tokens.product} in ${tokens.city}`,
        content: `${input.productDescriptionHtml || `<p>${product} for teams in ${city}.</p>`}<p>Looking for something else? See every product we supply in <a href="${escapeHtml(input.cityPath)}">${city}</a>.</p>`,
      },
    },
    {
      blockType: 'faq',
      name: 'FAQ',
      content: {
        heading: `${tokens.product} in ${tokens.city}: common questions`,
        items: [
          {
            question: `How much does ${tokens.product} cost in ${tokens.city}?`,
            answer: `The current ${tokens.country} price is shown above. Volume, multi-year and education pricing are quoted on request.`,
          },
          {
            question: `Can you set up ${tokens.product} for a team in ${tokens.city}?`,
            answer: `Yes. We handle licence assignment, installation guidance and renewals for ${tokens.product} customers in ${tokens.city}.`,
          },
        ],
      },
    },
    {
      blockType: 'cta',
      name: 'Enquiry',
      anchorId: 'enquiry',
      content: {
        heading: `Get a ${tokens.product} quote for ${tokens.city}`,
        description: 'Tell us how many users you need and we will reply with pricing.',
        primaryCtaLabel: input.formSlug ? '' : 'Contact us',
        primaryCtaUrl: input.formSlug ? '' : '/contact',
        formSlug: input.formSlug ?? '',
      },
    },
  ];
}
