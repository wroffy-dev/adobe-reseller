/**
 * SEO Intelligence — the shapes shared by the extractor, the rules and the
 * dashboard.
 *
 * SEO, AEO (answer engines) and GEO (generative engines) are this site's own
 * scores: deterministic checklists of signals known to help, each worth a
 * stated number of points. They are not scores published by Google, OpenAI
 * or any other platform, and the dashboard says so.
 */

export const ENTITY_TYPES = ['SITE', 'PAGE', 'CITY_PAGE', 'CITY_PRODUCT_PAGE', 'PRODUCT', 'BLOG_POST'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_LABELS: Record<EntityType, string> = {
  SITE: 'Website',
  PAGE: 'Page',
  CITY_PAGE: 'City page',
  CITY_PRODUCT_PAGE: 'City product page',
  PRODUCT: 'Product',
  BLOG_POST: 'Blog post',
};

export type Severity = 'critical' | 'warning' | 'info';

export type Category = 'metadata' | 'keywords' | 'content' | 'technical' | 'aeo' | 'geo' | 'local' | 'site';

export const CATEGORY_LABELS: Record<Category, string> = {
  metadata: 'Metadata',
  keywords: 'Keywords',
  content: 'Content',
  technical: 'Technical',
  aeo: 'Answer engines (AEO)',
  geo: 'Generative engines (GEO)',
  local: 'Local SEO',
  site: 'Website',
};

/** One check: what was looked at, what it earned, and what to do about it. */
export type Finding = {
  id: string;
  category: Category;
  /** How much a failure matters. A passed check keeps its severity for context. */
  severity: Severity;
  passed: boolean;
  points: number;
  maxPoints: number;
  title: string;
  /** What was found — the reason points were or were not given. */
  description: string;
  /** What to change. Empty when the check passed. */
  recommendation: string;
};

/** What a page says, reduced to what the rules read. */
export type ContentDoc = {
  /** Headings rendered as <h1>. */
  h1: string[];
  headings: Array<{ level: number; text: string }>;
  /** Visible copy of the first section. */
  firstText: string;
  /** All visible copy, in order. */
  body: string;
  listItems: number;
  images: Array<{ alt: string }>;
  links: Array<{ href: string; internal: boolean }>;
  faq: Array<{ question: string; answer: string }>;
  hasCta: boolean;
  hasForm: boolean;
  hasTestimonials: boolean;
  hasStats: boolean;
  /** Product names shown by product blocks, which read live catalogue data. */
  productNames: string[];
  sectionCount: number;
};

export type DuplicateInfo = {
  /** Other content in the market with the same title. */
  titleWith: string[];
  descriptionWith: string[];
  /** Other content in the market with the same H1. */
  h1With: string[];
  /** Other content whose copy is mostly the same. */
  similar: Array<{ label: string; score: number }>;
};

export type AnalysisInput = {
  entityType: EntityType;
  entityId: string;
  countryId: string;
  label: string;
  /** The public path, prefix included. */
  path: string;
  status: string;
  slug: string;
  /** The title as a search engine sees it, before the site's template. */
  title: string;
  /** Whether the title is an explicit SEO title rather than a fallback. */
  titleIsExplicit: boolean;
  description: string;
  descriptionIsExplicit: boolean;
  /** An explicit canonical URL, or null for "this page's own URL". */
  canonicalUrl: string | null;
  /** This page's own absolute URL. */
  selfUrl: string;
  noIndex: boolean;
  /** Why the page is noindex: page, market or site. */
  noIndexReason: string | null;
  ogTitle: boolean;
  ogImage: boolean;
  keywords: string[];
  doc: ContentDoc;
  technical: {
    published: boolean;
    inSitemap: boolean;
    sitemapReason: string | null;
    /** The registry's view of the address. */
    route: 'ok' | 'conflict' | 'unregistered';
    routeNote: string | null;
    robotsBlocked: boolean;
    /** Schema.org types the page emits. */
    structuredData: string[];
  };
  org: { name: string; hasPhone: boolean; hasEmail: boolean; hasAddress: boolean };
  market: { name: string; code: string };
  city: null | {
    kind: 'city' | 'cityProduct';
    name: string;
    region: string | null;
    productName: string | null;
    /** For a product page: whether its city's landing page is live. */
    parentLive: boolean;
  };
  duplicates: DuplicateInfo;
};

export type Scores = {
  seo: number;
  aeo: number;
  geo: number;
  /** Local SEO, for city pages only. */
  local: number | null;
  overall: number;
};

export type AnalysisResult = {
  scores: Scores;
  findings: Finding[];
  counts: { critical: number; warning: number; passed: number };
};

/** 90–100 Excellent, 75–89 Good, 50–74 Needs improvement, 0–49 Poor. */
export type Health = 'excellent' | 'good' | 'needs-improvement' | 'poor';

export function healthOf(score: number): Health {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'needs-improvement';
  return 'poor';
}

export const HEALTH_LABELS: Record<Health, string> = {
  excellent: 'Excellent',
  good: 'Good',
  'needs-improvement': 'Needs improvement',
  poor: 'Poor',
};

export const HEALTH_RANGES: Record<Health, [number, number]> = {
  excellent: [90, 100],
  good: [75, 89],
  'needs-improvement': [50, 74],
  poor: [0, 49],
};
