import type { AnalysisInput, Finding } from './types';
import { finding, quote } from './finding';
import { containsPhrase, normalise } from './text';

/**
 * The GEO score (generative engine optimisation): 100 points for how well a
 * generative assistant can identify who is speaking, what is offered, where,
 * and quote it with confidence. An internal heuristic — not a metric any
 * search engine or AI platform publishes.
 *
 *   Entity identification      15
 *   Organisation information   10
 *   Structured data            15
 *   Explicit product names     10
 *   Factual, specific content  15
 *   Location / service area    10
 *   Unique content             15
 *   Trust and support signals  10
 */

const TRUST = ['support', 'authorised', 'authorized', 'partner', 'certified', 'warranty', 'guarantee', 'invoice', 'invoices', 'genuine', 'official', 'secure', 'refund', 'sla'];

export function geoFindings(input: AnalysisInput): Finding[] {
  const { doc, org, technical, duplicates } = input;
  const body = doc.body;
  const nameMentioned = org.name ? containsPhrase(body, org.name) || containsPhrase(input.title, org.name) : false;
  const orgFields = [Boolean(org.name), org.hasPhone, org.hasEmail, org.hasAddress].filter(Boolean).length;
  const products = [...new Set(doc.productNames)];
  const facts = (body.match(/\b\d[\d,.]*\s?(%|tb|gb|users?|seats?|years?|months?|days?|hours?|₹|\$|aed|inr|usd)?/gi) ?? []).length;
  const normalisedBody = ` ${normalise(body)} `;
  const trust = TRUST.filter((w) => normalisedBody.includes(` ${w} `));
  const places = [input.city?.name, input.city?.region, input.market.name].filter((p): p is string => Boolean(p));
  const located = places.filter((p) => containsPhrase(body, p));
  const similar = duplicates.similar.filter((d) => d.score >= 0.7);

  return [
    finding({
      id: 'geo.entity',
      category: 'geo',
      severity: 'info',
      points: (nameMentioned ? 10 : 0) + (technical.structuredData.some((t) => /Organization|LocalBusiness|Product/.test(t)) ? 5 : 0),
      maxPoints: 15,
      title: 'Clear entity identification',
      description: nameMentioned ? `The page names ${quote(org.name)}.` : `The page never names the business (${quote(org.name || 'no organisation name set')}).`,
      recommendation: 'Say who you are in the copy — the company name and what it does — so an assistant can attribute the answer.',
    }),
    finding({
      id: 'geo.org',
      category: 'geo',
      severity: 'info',
      points: orgFields * 2.5,
      maxPoints: 10,
      title: 'Organisation information',
      description: `${orgFields} of 4 organisation details are set for ${input.market.name}: name${org.hasPhone ? ', phone' : ''}${org.hasEmail ? ', email' : ''}${org.hasAddress ? ', address' : ''}.`,
      recommendation: 'Complete the company name, phone, email and address in this country’s settings — they feed the Organization schema.',
    }),
    finding({
      id: 'geo.structured',
      category: 'geo',
      severity: 'info',
      points: Math.min(15, technical.structuredData.length * 5),
      maxPoints: 15,
      title: 'Machine-readable facts',
      description: technical.structuredData.length ? `Schema.org types: ${technical.structuredData.join(', ')}.` : 'No schema.org data.',
      recommendation: 'Valid structured data (FAQ, product, breadcrumbs, organisation) helps assistants read facts correctly.',
    }),
    finding({
      id: 'geo.products',
      category: 'geo',
      severity: 'info',
      points: products.length >= 2 ? 10 : products.length === 1 ? 7 : 0,
      maxPoints: 10,
      title: 'Explicit product names',
      description: products.length ? `Names ${products.slice(0, 5).map(quote).join(', ')}${products.length > 5 ? '…' : ''}.` : 'No specific product is named.',
      recommendation: 'Name the exact products and plans you supply rather than referring to them generally.',
    }),
    finding({
      id: 'geo.facts',
      category: 'geo',
      severity: 'info',
      points: facts >= 8 ? 15 : facts >= 4 ? 10 : facts >= 1 ? 5 : 0,
      maxPoints: 15,
      title: 'Specific, factual content',
      description: `${facts} concrete figure${facts === 1 ? '' : 's'} (prices, quantities, durations).`,
      recommendation: 'Add specifics an assistant can quote: plan limits, delivery times, seat counts, support hours.',
    }),
    finding({
      id: 'geo.location',
      category: 'geo',
      severity: 'info',
      points: located.length >= 2 ? 10 : located.length === 1 ? 6 : 0,
      maxPoints: 10,
      title: 'Location and service area',
      description: located.length ? `Mentions ${located.map(quote).join(', ')}.` : `The copy never says where you operate (${places.map(quote).join(', ')}).`,
      recommendation: 'State the area you serve in the copy.',
    }),
    finding({
      id: 'geo.unique',
      category: 'geo',
      severity: similar.length ? 'warning' : 'info',
      points: similar.length === 0 ? 15 : similar.some((d) => d.score >= 0.9) ? 0 : 7,
      maxPoints: 15,
      title: 'Unique content',
      description: similar.length
        ? `Most of the copy is shared with ${similar.slice(0, 3).map((d) => `${quote(d.label)} (${Math.round(d.score * 100)}%)`).join(', ')}.`
        : 'No other page in this market has substantially the same copy.',
      recommendation: 'Rewrite the shared passages with information that is only true of this page.',
    }),
    finding({
      id: 'geo.trust',
      category: 'geo',
      severity: 'info',
      points: Math.min(10, trust.length * 3 + (doc.hasTestimonials ? 4 : 0)),
      maxPoints: 10,
      title: 'Trust and support signals',
      description: trust.length || doc.hasTestimonials
        ? `Mentions ${trust.join(', ') || 'no trust terms'}${doc.hasTestimonials ? ', with testimonials' : ''}.`
        : 'No support, authorisation, invoicing or testimonial information.',
      recommendation: 'Explain your support, partner status and invoicing, and add customer testimonials.',
    }),
  ];
}
