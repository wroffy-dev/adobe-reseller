import type { AnalysisInput, Finding } from './types';
import { finding, quote } from './finding';
import { keywordFindings } from './keywords';
import { wordCount } from './text';

/**
 * The SEO score: 100 points in four groups.
 *
 *   Metadata   30  title, description, canonical, social, indexability
 *   Keywords   25  see keywords.ts
 *   Content    30  one H1, heading structure, length, alt text, links, CTA, duplicates
 *   Technical  15  sitemap, URL registry, structured data, robots.txt
 */

export function metadataFindings(input: AnalysisInput): Finding[] {
  const titleLength = input.title.trim().length;
  const descLength = input.description.trim().length;
  const canonicalOk = !input.canonicalUrl || input.canonicalUrl.replace(/\/+$/, '') === input.selfUrl.replace(/\/+$/, '');

  return [
    finding({
      id: 'meta.title',
      category: 'metadata',
      severity: titleLength ? 'warning' : 'critical',
      points: !titleLength ? 0 : input.titleIsExplicit ? 5 : 3,
      maxPoints: 5,
      title: 'SEO title',
      description: !titleLength
        ? 'There is no title.'
        : input.titleIsExplicit
          ? `SEO title: ${quote(input.title)}.`
          : `No SEO title is set, so the name ${quote(input.title)} is used.`,
      recommendation: 'Write an SEO title that says what the page offers, with the main keyword near the start.',
    }),
    finding({
      id: 'meta.titleLength',
      category: 'metadata',
      severity: 'warning',
      points: titleLength >= 30 && titleLength <= 60 ? 5 : (titleLength >= 20 && titleLength < 30) || (titleLength > 60 && titleLength <= 70) ? 3 : titleLength ? 1 : 0,
      maxPoints: 5,
      title: 'Title length',
      description: `The title is ${titleLength} characters; 30–60 displays in full in search results.`,
      recommendation: titleLength > 60 ? 'Shorten the title to about 60 characters so it is not cut off.' : 'Lengthen the title to 30–60 characters with a clear description of the page.',
    }),
    finding({
      id: 'meta.description',
      category: 'metadata',
      severity: descLength ? 'warning' : 'critical',
      points: !descLength ? 0 : input.descriptionIsExplicit ? 6 : 3,
      maxPoints: 6,
      title: 'Meta description',
      description: !descLength
        ? 'There is no meta description.'
        : input.descriptionIsExplicit
          ? 'A meta description is set.'
          : 'No meta description is set for this page, so a default is used — the same text other pages get.',
      recommendation: 'Write a meta description for this page: what it offers and why to click, in 140–160 characters.',
    }),
    finding({
      id: 'meta.descriptionLength',
      category: 'metadata',
      severity: 'warning',
      points: descLength >= 70 && descLength <= 160 ? 4 : (descLength >= 50 && descLength < 70) || (descLength > 160 && descLength <= 200) ? 2 : 0,
      maxPoints: 4,
      title: 'Description length',
      description: `The description is ${descLength} characters; 70–160 shows in full.`,
      recommendation: descLength > 160 ? 'Trim the description to about 160 characters.' : 'Expand the description to 70–160 characters.',
    }),
    finding({
      id: 'meta.canonical',
      category: 'metadata',
      severity: 'warning',
      points: canonicalOk ? 4 : 0,
      maxPoints: 4,
      title: 'Canonical URL',
      description: canonicalOk
        ? `The canonical is this page’s own address (${input.selfUrl}).`
        : `The canonical points to ${input.canonicalUrl}, so search engines are told to index that URL instead of this one.`,
      recommendation: 'Clear the canonical URL unless this page really duplicates another; it then defaults to the page’s own address.',
    }),
    finding({
      id: 'meta.social',
      category: 'metadata',
      severity: 'info',
      points: (input.ogTitle ? 1 : 0) + (input.ogImage ? 2 : 0),
      maxPoints: 3,
      title: 'Social sharing (Open Graph)',
      description: input.ogImage ? 'A share title and image are available.' : 'No share image is set here or in the site defaults.',
      recommendation: 'Choose an Open Graph image (1200×630) so shared links show a preview.',
    }),
    finding({
      id: 'meta.indexable',
      category: 'metadata',
      severity: 'critical',
      points: input.noIndex ? 0 : 3,
      maxPoints: 3,
      title: 'Indexable',
      description: input.noIndex ? `This page tells search engines not to index it (${input.noIndexReason ?? 'noindex'}).` : 'Search engines may index this page.',
      recommendation: 'If this page should appear in search results, switch off “Hide from search engines”. Leave it on if hiding it is intended.',
    }),
  ];
}

export function contentFindings(input: AnalysisInput): Finding[] {
  const { doc, duplicates } = input;
  const words = wordCount(doc.body);
  const h2 = doc.headings.filter((h) => h.level === 2).length;
  const levels = doc.headings.map((h) => h.level);
  const skips = levels.some((level, i) => i > 0 && level > (levels[i - 1] ?? 1) + 1 && level > 2);
  const withAlt = doc.images.filter((i) => i.alt.trim()).length;
  const internal = new Set(doc.links.filter((l) => l.internal).map((l) => l.href)).size;
  const dupes = [
    ...duplicates.titleWith.map((l) => `title with ${quote(l)}`),
    ...duplicates.descriptionWith.map((l) => `description with ${quote(l)}`),
    // One shared H1 can be coincidence; the same H1 on three pages is a pattern.
    ...(duplicates.h1With.length >= 2 ? [`H1 with ${duplicates.h1With.length} other pages`] : []),
  ];

  return [
    finding({
      id: 'content.h1',
      category: 'content',
      severity: doc.h1.length === 0 ? 'critical' : 'warning',
      points: doc.h1.length === 1 ? 6 : doc.h1.length > 1 ? 3 : 0,
      maxPoints: 6,
      title: 'One clear H1',
      description:
        doc.h1.length === 1
          ? `The H1 is ${quote(doc.h1[0]!)}.`
          : doc.h1.length === 0
            ? 'The page has no H1. The first section’s heading becomes the H1.'
            : `The page has ${doc.h1.length} H1 headings: ${doc.h1.map(quote).join(', ')}.`,
      recommendation: doc.h1.length === 0 ? 'Give the first section a heading that states what the page is about.' : 'Keep one H1; use Heading 2 for the others.',
    }),
    finding({
      id: 'content.headings',
      category: 'content',
      severity: 'warning',
      points: (h2 >= 2 ? 4 : h2 === 1 ? 2 : 0) - (skips ? 1 : 0),
      maxPoints: 4,
      title: 'Heading structure',
      description: `${h2} section heading${h2 === 1 ? '' : 's'} (H2)${skips ? ', and a heading level is skipped' : ''}.`,
      recommendation: 'Break the page into sections with descriptive H2 headings, without skipping levels.',
    }),
    finding({
      id: 'content.length',
      category: 'content',
      severity: words < 300 ? 'critical' : 'warning',
      points: words >= 600 ? 8 : words >= 300 ? 5 : words >= 150 ? 2 : 0,
      maxPoints: 8,
      title: 'Enough useful content',
      description: words < 300 ? `Only ${words} words — thin content that rarely ranks.` : `${words} words of copy.`,
      recommendation: 'Add genuinely useful detail: what is offered, for whom, how it works, prices, and answers to common questions. Aim for 600+ words that are specific to this page.',
    }),
    finding({
      id: 'content.alt',
      category: 'content',
      severity: 'warning',
      points: doc.images.length === 0 ? 4 : (withAlt / doc.images.length) * 4,
      maxPoints: 4,
      title: 'Image alt text',
      description: doc.images.length === 0 ? 'No images to describe.' : `${withAlt} of ${doc.images.length} images have alt text.`,
      recommendation: 'Describe every meaningful image in its alt text, in plain words.',
    }),
    finding({
      id: 'content.links',
      category: 'content',
      severity: 'warning',
      points: internal >= 3 ? 4 : internal >= 1 ? 2 : 0,
      maxPoints: 4,
      title: 'Internal links',
      description: `${internal} internal link${internal === 1 ? '' : 's'} to other pages of the site.`,
      recommendation: 'Link to at least three related pages — products, services, contact — so visitors and crawlers can go further.',
    }),
    finding({
      id: 'content.cta',
      category: 'content',
      severity: 'info',
      points: doc.hasCta || doc.hasForm ? 2 : 0,
      maxPoints: 2,
      title: 'Call to action',
      description: doc.hasCta || doc.hasForm ? 'The page offers a clear next step.' : 'There is no button or form telling a visitor what to do next.',
      recommendation: 'Add a CTA or an enquiry form.',
    }),
    finding({
      id: 'content.duplicateMeta',
      category: 'content',
      severity: 'warning',
      points: dupes.length ? 0 : 2,
      maxPoints: 2,
      title: 'Unique title, description and H1',
      description: dupes.length ? `Shares its ${dupes.slice(0, 3).join('; ')}.` : 'No other page in this market uses the same title or description, and the H1 is not reused.',
      recommendation: 'Give every page its own title and description so search engines can tell them apart.',
    }),
  ];
}

export function technicalFindings(input: AnalysisInput): Finding[] {
  const t = input.technical;
  return [
    finding({
      id: 'tech.sitemap',
      category: 'technical',
      severity: t.published ? 'warning' : 'info',
      points: t.inSitemap ? 4 : 0,
      maxPoints: 4,
      title: 'In the sitemap',
      description: t.inSitemap ? 'Listed in the XML sitemap.' : `Not in the sitemap: ${t.sitemapReason ?? 'not eligible'}.`,
      recommendation: t.published ? 'Pages that should be found belong in the sitemap: make sure the page is indexable and its market is published.' : 'Publish the page when it is ready; drafts are never listed.',
    }),
    finding({
      id: 'tech.url',
      category: 'technical',
      severity: t.route === 'conflict' ? 'critical' : 'info',
      points: t.route === 'ok' ? 4 : t.route === 'unregistered' ? 2 : 0,
      maxPoints: 4,
      title: 'URL health',
      description: t.route === 'ok' ? `${input.path} is registered in the URL Manager without problems.` : t.route === 'conflict' ? `URL conflict: ${t.routeNote ?? 'another item holds this address'}.` : 'This address is not in the URL registry yet.',
      recommendation: t.route === 'conflict' ? 'Resolve it under SEO → Slug & URL Manager → Conflicts.' : 'Run the URL registry backfill from the Slug & URL Manager.',
    }),
    finding({
      id: 'tech.structured',
      category: 'technical',
      severity: 'warning',
      points: t.structuredData.length >= 2 ? 4 : t.structuredData.length === 1 ? 2 : 0,
      maxPoints: 4,
      title: 'Structured data',
      description: t.structuredData.length ? `Emits ${t.structuredData.join(', ')}.` : 'No structured data is emitted for this page.',
      recommendation: 'Add an FAQ section (FAQPage schema) or product content so the page carries more than breadcrumbs.',
    }),
    finding({
      id: 'tech.robots',
      category: 'technical',
      severity: 'critical',
      points: t.robotsBlocked ? 0 : 3,
      maxPoints: 3,
      title: 'Allowed by robots.txt',
      description: t.robotsBlocked ? `robots.txt disallows ${input.path}, so crawlers cannot read it.` : 'robots.txt allows crawling this address.',
      recommendation: 'Remove the Disallow rule that covers this page under SEO → robots.txt, or accept that it will not be crawled.',
    }),
  ];
}

export function seoFindings(input: AnalysisInput): Finding[] {
  return [...metadataFindings(input), ...keywordFindings(input), ...contentFindings(input), ...technicalFindings(input)];
}
