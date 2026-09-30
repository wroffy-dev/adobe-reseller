import type { AnalysisInput, Finding } from './types';
import { finding, quote } from './finding';
import { containsPhrase, wordCount } from './text';

/**
 * Local SEO checks for city pages and city product pages — 100 points.
 *
 *   City in the H1                  15
 *   City in the SEO title           10
 *   A keyword targets the city      10
 *   City-specific introduction      10
 *   Not a city-swapped copy         20
 *   Local contact / service context 10
 *   FAQs with local intent          10
 *   Links to products / its city    10
 *   Hierarchy (breadcrumbs, parent)  5
 *
 * For city pages the SEO score is 80% the general SEO checks and 20% these.
 * The checks reward pages that are genuinely about the city; they never
 * reward repeating its name, and they flag pages that differ from another
 * city's only by the name — the doorway-page pattern search engines demote.
 */

export function localFindings(input: AnalysisInput): Finding[] {
  const city = input.city;
  if (!city) return [];
  const { doc } = input;
  const inH1 = doc.h1.some((h) => containsPhrase(h, city.name));
  const inTitle = containsPhrase(input.title, city.name);
  const keyword = input.keywords.find((k) => containsPhrase(k, city.name));
  const intro = containsPhrase(doc.firstText, city.name) && wordCount(doc.firstText) >= 25;
  const swapped = input.duplicates.similar.filter((d) => d.score >= 0.75);
  const worst = swapped.reduce((max, d) => Math.max(max, d.score), 0);
  const words = wordCount(doc.body);
  const localFaq = doc.faq.filter((f) => containsPhrase(`${f.question} ${f.answer}`, city.name)).length;
  const contact = (doc.hasCta || doc.hasForm) && (input.org.hasPhone || input.org.hasEmail || input.org.hasAddress || /\b(call|visit|office|on-site|onsite|local)\b/i.test(doc.body));
  const internal = doc.links.filter((l) => l.internal).length;
  const hasBreadcrumbs = input.technical.structuredData.includes('BreadcrumbList');

  return [
    finding({
      id: 'local.h1',
      category: 'local',
      severity: 'warning',
      points: inH1 ? 15 : 0,
      maxPoints: 15,
      title: 'City in the H1',
      description: inH1 ? `The H1 names ${city.name}.` : `The H1 does not mention ${city.name}.`,
      recommendation: `Name ${city.name} naturally in the main heading.`,
    }),
    finding({
      id: 'local.title',
      category: 'local',
      severity: 'warning',
      points: inTitle ? 10 : 0,
      maxPoints: 10,
      title: 'City in the SEO title',
      description: inTitle ? `The title names ${city.name}.` : `The title does not mention ${city.name}.`,
      recommendation: `Include ${city.name} in the SEO title.`,
    }),
    finding({
      id: 'local.keyword',
      category: 'local',
      severity: 'warning',
      points: keyword ? 10 : 0,
      maxPoints: 10,
      title: 'Local target keyword',
      description: keyword ? `${quote(keyword)} targets ${city.name}.` : `No primary keyword mentions ${city.name}.`,
      recommendation: `Add a primary keyword such as ${quote(`${city.productName ?? input.keywords[0]?.split(' in ')[0] ?? 'your service'} in ${city.name}`)}.`,
    }),
    finding({
      id: 'local.intro',
      category: 'local',
      severity: 'warning',
      points: intro ? 10 : containsPhrase(doc.body, city.name) ? 4 : 0,
      maxPoints: 10,
      title: 'City-specific introduction',
      description: intro ? `The opening section is about ${city.name}.` : `The opening section does not introduce what you offer in ${city.name}.`,
      recommendation: `Open with a few sentences about serving customers in ${city.name}: who you work with there and how.`,
    }),
    finding({
      id: 'local.unique',
      category: 'local',
      severity: worst >= 0.9 || words < 300 ? 'critical' : swapped.length ? 'warning' : 'info',
      points: worst >= 0.9 ? 0 : swapped.length ? 8 : words < 300 ? 8 : 20,
      maxPoints: 20,
      title: 'Genuinely local content',
      description:
        worst >= 0.9
          ? `The copy matches ${swapped.slice(0, 3).map((d) => quote(d.label)).join(', ')} except for the city name (${Math.round(worst * 100)}% the same). Search engines treat pages like this as doorway pages.`
          : swapped.length
            ? `Much of the copy is shared with ${swapped.slice(0, 3).map((d) => `${quote(d.label)} (${Math.round(d.score * 100)}%)`).join(', ')}.`
            : words < 300
              ? `Only ${words} words — a thin city page.`
              : 'The copy is not a copy of another city’s page.',
      recommendation: `Write what is true of ${city.name} specifically — local customers, delivery and support arrangements, examples — rather than changing only the name. Nothing is hidden or removed automatically; this is for you to decide.`,
    }),
    finding({
      id: 'local.contact',
      category: 'local',
      severity: 'info',
      points: contact ? 10 : doc.hasCta || doc.hasForm ? 5 : 0,
      maxPoints: 10,
      title: 'Local contact and service context',
      description: contact ? 'A visitor can see how to reach you and how you serve the area.' : 'The page does not say how customers here reach you.',
      recommendation: `Add an enquiry form and explain how you serve ${city.name} (phone, visits, remote support).`,
    }),
    finding({
      id: 'local.faq',
      category: 'local',
      severity: 'info',
      points: localFaq >= 2 ? 10 : localFaq === 1 ? 5 : 0,
      maxPoints: 10,
      title: 'FAQs with local intent',
      description: `${localFaq} FAQ entr${localFaq === 1 ? 'y mentions' : 'ies mention'} ${city.name}.`,
      recommendation: `Answer questions people in ${city.name} actually ask — delivery, local support, invoicing.`,
    }),
    finding({
      id: 'local.links',
      category: 'local',
      severity: 'info',
      points: internal >= 3 ? 10 : internal >= 1 ? 5 : 0,
      maxPoints: 10,
      title: city.kind === 'city' ? 'Links to products' : 'Links to the city and related products',
      description: `${internal} internal link${internal === 1 ? '' : 's'}${doc.productNames.length ? `, including ${doc.productNames.length} product${doc.productNames.length === 1 ? '' : 's'}` : ''}.`,
      recommendation: city.kind === 'city' ? `Link to the products you supply in ${city.name}.` : `Link back to the ${city.name} page and to related products.`,
    }),
    finding({
      id: 'local.hierarchy',
      category: 'local',
      severity: 'info',
      points: (hasBreadcrumbs ? 3 : 0) + (city.kind === 'city' || city.parentLive ? 2 : 0),
      maxPoints: 5,
      title: 'City hierarchy',
      description:
        city.kind === 'cityProduct' && !city.parentLive
          ? `The ${city.name} landing page is not published, so this page’s parent in the breadcrumb trail is missing.`
          : hasBreadcrumbs
            ? 'Breadcrumbs reflect the city hierarchy.'
            : 'No breadcrumb data.',
      recommendation: `Publish the ${city.name} landing page so the hierarchy is complete.`,
    }),
  ];
}
