import { describe, it, expect } from 'vitest';
import { analyze, combine } from '@/lib/seo-intelligence/analyzer';
import { extractSections } from '@/lib/seo-intelligence/content-extractor';
import { findDuplicates } from '@/lib/seo-intelligence/duplicates';
import { robotsDisallows } from '@/lib/seo-intelligence/robots-check';
import { siteFindings } from '@/lib/seo-intelligence/site-score';
import { scoreOf } from '@/lib/seo-intelligence/finding';
import { minhashSignature, signatureSimilarity, matchLevel } from '@/lib/seo-intelligence/text';
import { healthOf, type AnalysisInput, type ContentDoc } from '@/lib/seo-intelligence/types';
import { cityStarterSections, suggestCitySeo } from '@/lib/cities/defaults';

const LONG =
  'Delhi businesses buy Adobe Creative Cloud, Adobe Acrobat Pro and Adobe Express licenses from us. We are an authorised partner with local support, GST invoices and deployment help for teams of 5 to 500 users. ';

function doc(overrides: Partial<ContentDoc> = {}): ContentDoc {
  return {
    h1: ['Adobe Reseller in Delhi'],
    headings: [
      { level: 1, text: 'Adobe Reseller in Delhi' },
      { level: 2, text: 'Adobe licensing for businesses in Delhi' },
      { level: 2, text: 'Where can I buy Adobe licenses in Delhi?' },
    ],
    firstText: `Adobe Reseller in Delhi. ${LONG}`,
    body: `Adobe reseller in Delhi. ${LONG.repeat(14)}`,
    listItems: 6,
    images: [{ alt: 'Team in Delhi' }],
    links: [
      { href: '/products/a', internal: true },
      { href: '/products/b', internal: true },
      { href: '/contact', internal: true },
    ],
    faq: [
      { question: 'Where can I buy Adobe licenses in Delhi?', answer: 'You can buy Adobe licenses in Delhi from us, with a quote the same day.' },
      { question: 'Do you install Adobe in Delhi?', answer: 'Yes, we deploy and support Adobe for teams in Delhi after purchase.' },
      { question: 'How is pricing calculated?', answer: 'Pricing depends on plan, users and the billing term you choose.' },
    ],
    hasCta: true,
    hasForm: true,
    hasTestimonials: true,
    hasStats: false,
    productNames: ['Adobe Acrobat Pro', 'Adobe Creative Cloud'],
    sectionCount: 5,
    ...overrides,
  };
}

function input(overrides: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    entityType: 'CITY_PAGE',
    entityId: 'p1',
    countryId: 'in',
    label: 'Delhi',
    path: '/delhi',
    status: 'PUBLISHED',
    slug: 'delhi',
    title: 'Adobe Reseller in Delhi | Adobe Licensing Partner',
    titleIsExplicit: true,
    description: 'Genuine Adobe licenses for businesses in Delhi, India. Get pricing, deployment help and local support from an authorised Adobe partner.',
    descriptionIsExplicit: true,
    canonicalUrl: null,
    selfUrl: 'https://example.test/delhi',
    noIndex: false,
    noIndexReason: null,
    ogTitle: true,
    ogImage: true,
    keywords: ['Adobe reseller in Delhi', 'Adobe partner in Delhi', 'Adobe licenses in Delhi'],
    doc: doc(),
    technical: {
      published: true,
      inSitemap: true,
      sitemapReason: null,
      route: 'ok',
      routeNote: null,
      robotsBlocked: false,
      structuredData: ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage', 'Service'],
    },
    org: { name: 'Acme Licensing', hasPhone: true, hasEmail: true, hasAddress: true },
    market: { name: 'India', code: 'IN' },
    city: { kind: 'city', name: 'Delhi', region: null, productName: null, parentLive: true },
    duplicates: { titleWith: [], descriptionWith: [], h1With: [], similar: [] },
    ...overrides,
  };
}

const find = (result: ReturnType<typeof analyze>, id: string) => result.findings.find((f) => f.id === id)!;

describe('SEO Intelligence scoring', () => {
  it('scores a strong local page highly, and explains every point', () => {
    const result = analyze(input());
    expect(result.scores.seo).toBeGreaterThanOrEqual(85);
    expect(result.scores.aeo).toBeGreaterThanOrEqual(80);
    expect(result.scores.local).toBeGreaterThanOrEqual(85);
    for (const f of result.findings) {
      expect(f.title).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.points).toBeLessThanOrEqual(f.maxPoints);
      if (!f.passed) expect(f.recommendation).toBeTruthy();
    }
  });

  it('weights overall as 50% SEO, 25% AEO, 25% GEO', () => {
    expect(combine(80, 60, 40)).toBe(65);
    const result = analyze(input());
    expect(result.scores.overall).toBe(combine(result.scores.seo, result.scores.aeo, result.scores.geo));
  });

  it('is deterministic', () => {
    expect(analyze(input())).toEqual(analyze(input()));
  });

  it('flags missing metadata as critical', () => {
    const result = analyze(input({ title: '', description: '', titleIsExplicit: false, descriptionIsExplicit: false }));
    expect(find(result, 'meta.title')).toMatchObject({ passed: false, severity: 'critical' });
    expect(find(result, 'meta.description')).toMatchObject({ passed: false, severity: 'critical' });
    expect(result.counts.critical).toBeGreaterThanOrEqual(2);
  });

  it('uses up to three primary keywords, and scores 0 keyword points without any', () => {
    const none = analyze(input({ keywords: [] }));
    expect(find(none, 'kw.defined')).toMatchObject({ passed: false, points: 0, maxPoints: 25 });

    // The third keyword alone still earns the title placement (at 80%).
    const third = analyze(input({ title: 'Adobe licenses in Delhi — pricing', keywords: ['zzz one', 'yyy two', 'Adobe licenses in Delhi'] }));
    expect(find(third, 'kw.title').points).toBe(4);
    expect(matchLevel('Adobe licences in Delhi', 'Adobe licenses in Delhi')).toBe('partial');
  });

  it('never rewards keyword stuffing', () => {
    const stuffed = analyze(input({ doc: doc({ body: 'Adobe reseller in Delhi '.repeat(60) }) }));
    expect(find(stuffed, 'kw.natural')).toMatchObject({ passed: false, points: 0 });
    expect(find(stuffed, 'kw.natural').description).toMatch(/stuffing/);
  });

  it('treats noindex as a lost, explained point — not a hidden one', () => {
    const result = analyze(input({ noIndex: true, noIndexReason: 'this page is set to noindex' }));
    expect(find(result, 'meta.indexable')).toMatchObject({ passed: false, severity: 'critical' });
    expect(find(result, 'meta.indexable').description).toContain('this page is set to noindex');
  });

  it('reports sitemap exclusion with the reason', () => {
    const result = analyze(input({ technical: { ...input().technical, inSitemap: false, sitemapReason: 'it is not published', published: false } }));
    expect(find(result, 'tech.sitemap')).toMatchObject({ passed: false, severity: 'info' });
    expect(find(result, 'tech.sitemap').description).toContain('not published');
  });

  it('rewards answer-engine structure: FAQ, questions, concise answers', () => {
    const without = analyze(input({ doc: doc({ faq: [], headings: [{ level: 1, text: 'Adobe Reseller in Delhi' }] }) }));
    expect(find(without, 'aeo.faq')).toMatchObject({ passed: false });
    expect(find(without, 'aeo.faq').description).toBe('Missing FAQ section.');
    expect(find(without, 'aeo.faq').recommendation).toContain('Where can I buy licenses in Delhi?');
    expect(analyze(input()).scores.aeo).toBeGreaterThan(without.scores.aeo);
  });

  it('lowers GEO for copy shared with another page', () => {
    const shared = analyze(input({ duplicates: { titleWith: [], descriptionWith: [], h1With: [], similar: [{ label: 'Gurugram', score: 0.95 }] } }));
    expect(find(shared, 'geo.unique')).toMatchObject({ passed: false, points: 0 });
    expect(shared.scores.geo).toBeLessThan(analyze(input()).scores.geo);
  });
});

describe('local SEO checks', () => {
  it('flags a city page that differs from another only by the city name', () => {
    const result = analyze(input({ duplicates: { titleWith: [], descriptionWith: [], h1With: [], similar: [{ label: 'Gurugram', score: 0.97 }] } }));
    const unique = find(result, 'local.unique');
    expect(unique).toMatchObject({ passed: false, severity: 'critical', points: 0 });
    expect(unique.description).toMatch(/except for the city name/);
    expect(unique.recommendation).toMatch(/Nothing is hidden or removed automatically/);
  });

  it('checks the city in the H1, the title and a keyword', () => {
    const result = analyze(
      input({ title: 'Adobe licensing', doc: doc({ h1: ['Adobe licensing'] }), keywords: ['adobe licensing'] }),
    );
    expect(find(result, 'local.h1').passed).toBe(false);
    expect(find(result, 'local.title').passed).toBe(false);
    expect(find(result, 'local.keyword').passed).toBe(false);
  });

  it('is only applied to city pages', () => {
    const page = analyze(input({ entityType: 'PAGE', city: null }));
    expect(page.scores.local).toBeNull();
    expect(page.findings.some((f) => f.category === 'local')).toBe(false);
  });

  it('notes a product page whose city page is not live', () => {
    const result = analyze(input({ entityType: 'CITY_PRODUCT_PAGE', city: { kind: 'cityProduct', name: 'Delhi', region: null, productName: 'Adobe Acrobat Pro', parentLive: false } }));
    expect(find(result, 'local.hierarchy').passed).toBe(false);
  });
});

describe('country-specific product scoring', () => {
  it('scores each market against its own keywords', () => {
    const base = input({ entityType: 'PRODUCT', city: null, label: 'Adobe Acrobat Pro', title: 'Adobe Acrobat Pro price in India', slug: 'adobe-acrobat-pro' });
    const india = analyze({ ...base, countryId: 'in', keywords: ['Adobe Acrobat Pro price in India'] });
    const uae = analyze({ ...base, countryId: 'ae', keywords: ['Acrobat Pro UAE'] });
    expect(find(india, 'kw.title').points).toBeGreaterThan(find(uae, 'kw.title').points);
  });
});

describe('content extraction', () => {
  it('reads the first section heading as the H1 and later ones as H2', () => {
    const seo = suggestCitySeo({ city: 'Delhi', country: 'India' });
    const sections = cityStarterSections({ city: 'Delhi', country: 'India' }, seo).map((s, i) => ({ ...s, isVisible: true, sortOrder: i }));
    const d = extractSections(sections, { productNamesFor: () => ['Adobe Acrobat Pro'] });
    expect(d.h1).toEqual(['Adobe Reseller in Delhi']);
    expect(d.headings.filter((h) => h.level === 2).length).toBeGreaterThanOrEqual(3);
    expect(d.faq).toHaveLength(3);
    expect(d.hasCta).toBe(true);
    expect(d.productNames).toContain('Adobe Acrobat Pro');
  });

  it('ignores hidden sections and reads rich-text headings, links and images', () => {
    const d = extractSections([
      { blockType: 'hero', content: { heading: 'Hidden' }, isVisible: false },
      { blockType: 'richText', content: { heading: 'Title', content: '<h2>Why us?</h2><p>Text <a href="/contact">contact</a></p><img src="/x.png" alt="">' }, isVisible: true },
    ]);
    expect(d.h1).toEqual(['Title']);
    expect(d.headings.some((h) => h.text === 'Why us?' && h.level === 2)).toBe(true);
    expect(d.links).toEqual([{ href: '/contact', internal: true }]);
    expect(d.images).toEqual([{ alt: '' }]);
  });
});

describe('duplicate detection', () => {
  const delhi = `We supply Adobe licenses to companies in Delhi with same day quotes, local invoices and installation support for every team size and industry. ${LONG}`;
  const gurugram = delhi.replace(/Delhi/g, 'Gurugram');

  it('sees through city-name swapping once city names are neutralised', () => {
    const a = minhashSignature(delhi, ['Delhi', 'Gurugram']);
    const b = minhashSignature(gurugram, ['Delhi', 'Gurugram']);
    expect(signatureSimilarity(a, b)).toBe(1);
    const unrelated = minhashSignature('A completely different page about backup storage, migration and pricing for large enterprises across many regions.');
    expect(signatureSimilarity(a, unrelated)).toBeLessThan(0.3);
  });

  it('finds shared titles and similar copy within a market only', () => {
    const sig = minhashSignature(delhi, ['Delhi', 'Gurugram']);
    const rows = [
      { key: 'a', label: 'Delhi', countryId: 'in', titleKey: 't', descriptionKey: 'd1', h1Key: null, signature: sig },
      { key: 'b', label: 'Gurugram', countryId: 'in', titleKey: 't', descriptionKey: 'd2', h1Key: null, signature: minhashSignature(gurugram, ['Delhi', 'Gurugram']) },
      { key: 'c', label: 'Dubai', countryId: 'ae', titleKey: 't', descriptionKey: 'd3', h1Key: null, signature: sig },
    ];
    const out = findDuplicates([rows[0]!], rows).get('a')!;
    expect(out.titleWith).toEqual(['Gurugram']);
    expect(out.similar.map((s) => s.label)).toEqual(['Gurugram']);
  });
});

describe('robots and website checks', () => {
  it('applies the longest matching robots.txt rule', () => {
    const body = 'User-agent: *\nDisallow: /admin\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: other\nDisallow: /';
    expect(robotsDisallows(body, '/admin/x')).toBe(true);
    expect(robotsDisallows(body, '/private/page')).toBe(true);
    expect(robotsDisallows(body, '/private/ok')).toBe(false);
    expect(robotsDisallows(body, '/delhi')).toBe(false);
  });

  it('scores a market’s site-wide settings out of 100', () => {
    const findings = siteFindings({
      market: { name: 'India', isPublished: true },
      noIndexSite: false,
      noIndexCountry: false,
      sitemapEnabled: true,
      excludeFromSitemap: false,
      sitemapUrlCount: 10,
      robotsErrors: [],
      robotsWarnings: [],
      homepagePublished: true,
      defaultTitle: 'Acme',
      defaultDescription: 'Acme licensing',
      org: { name: 'Acme', hasPhone: true, hasEmail: true, hasAddress: true, hasLogo: true },
      verification: true,
      defaultOgImage: true,
    });
    expect(findings.reduce((s, f) => s + f.maxPoints, 0)).toBe(100);
    expect(scoreOf(findings)).toBe(100);
  });

  it('labels health bands for the UI', () => {
    expect([healthOf(95), healthOf(80), healthOf(60), healthOf(10)]).toEqual(['excellent', 'good', 'needs-improvement', 'poor']);
  });
});
