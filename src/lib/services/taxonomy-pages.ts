import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { countryPath } from '@/lib/country/routing';
import { loadLinks } from '@/lib/urls/links';
import { publishedPageWhere } from './pages';
import type { CountryContext } from '@/lib/country/types';
import { blockDefaults } from '@/lib/cms/blocks';
import {
  taxonomyPageSections,
  taxonomyPageSlug,
  taxonomyPageDescription,
  type TaxonomyKind,
  type TaxonomySeed,
} from '@/lib/cms/taxonomy-pages';

/**
 * Giving a category or a brand its page.
 *
 * Creating one is deliberately idempotent and never destructive: if a page
 * already sits at that URL in that market it is left exactly as it is, whoever
 * built it and whatever is on it now. Generating is a one-time head start, not
 * a template that reaches back in and overwrites somebody's work every time
 * the category is renamed.
 */

export type TaxonomyPageResult = {
  created: boolean;
  pageId: string;
  slug: string;
};

/**
 * The page for one category or brand in one market, created if it is missing.
 *
 * Published, because a category page with no products on it is a draft nobody
 * asked for and a category page with its products is the thing that was just
 * asked for. It is an ordinary page from that moment on — unpublish it, edit
 * it, delete it.
 */
export async function ensureTaxonomyPage(
  seed: TaxonomySeed,
  countryId: string,
  userId: string | null,
): Promise<TaxonomyPageResult> {
  const slug = taxonomyPageSlug(seed.kind, seed.slug);

  // The page is found by the taxonomy's identity first, so a page whose URL
  // was changed — or a category that was renamed — is still recognised.
  const linked = await prisma.page.findUnique({
    where: {
      countryId_taxonomyKind_taxonomyId: { countryId, taxonomyKind: seed.kind, taxonomyId: seed.id },
    },
    select: { id: true, slug: true },
  });
  if (linked) return { created: false, pageId: linked.id, slug: linked.slug };

  const existing = await prisma.page.findUnique({
    where: { countryId_slug: { countryId, slug } },
    select: { id: true, deletedAt: true, taxonomyId: true },
  });
  if (existing) {
    // A page generated before pages were tied to their taxonomy: tie it now.
    if (!existing.taxonomyId) {
      await prisma.page.update({
        where: { id: existing.id },
        data: { taxonomyKind: seed.kind, taxonomyId: seed.id },
      });
    }
    return { created: false, pageId: existing.id, slug };
  }

  const page = await prisma.page.create({
    data: {
      countryId,
      title: seed.name,
      slug,
      taxonomyKind: seed.kind,
      taxonomyId: seed.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      seoTitle: seed.name,
      seoDescription: taxonomyPageDescription(seed),
      createdById: userId,
      updatedById: userId,
      sections: {
        create: taxonomyPageSections(seed).map((section, index) => ({
          blockType: section.blockType,
          name: section.name ?? null,
          sortOrder: (index + 1) * 10,
          isVisible: section.isVisible ?? true,
          content: {
            ...(blockDefaults(section.blockType) as object),
            ...(section.content ?? {}),
          } as object,
          settings: (section.settings ?? {}) as object,
        })),
      },
    },
    select: { id: true },
  });

  return { created: true, pageId: page.id, slug };
}

/**
 * Which of these taxonomy entries already has a page in this market, by the
 * taxonomy's id — returns taxonomy id → page id.
 */
export async function taxonomyPageMap(
  kind: TaxonomyKind,
  entries: Array<{ id: string; slug: string }>,
  countryId: string,
): Promise<Map<string, string>> {
  if (entries.length === 0) return new Map();

  const pages = await prisma.page.findMany({
    where: {
      countryId,
      deletedAt: null,
      OR: [
        { taxonomyKind: kind, taxonomyId: { in: entries.map((entry) => entry.id) } },
        // Pages generated before the id link existed, until they are tied.
        { taxonomyId: null, slug: { in: entries.map((entry) => taxonomyPageSlug(kind, entry.slug)) } },
      ],
    },
    select: { id: true, slug: true, taxonomyId: true },
  });

  const out = new Map<string, string>();
  for (const entry of entries) {
    const page =
      pages.find((candidate) => candidate.taxonomyId === entry.id) ??
      pages.find((candidate) => !candidate.taxonomyId && candidate.slug === taxonomyPageSlug(kind, entry.slug));
    if (page) out.set(entry.id, page.id);
  }
  return out;
}

/**
 * Where a product's category and brand actually link to, in this market.
 *
 * Found by the taxonomy's identity, not by assuming the page still sits at
 * /categories/<slug>, and linked at whatever address the URL registry gives
 * it. Only a page that is published here produces a link; otherwise the name
 * renders as plain text rather than as a link to a 404.
 */
export async function taxonomyHrefs(
  country: Pick<CountryContext, 'id' | 'slug'>,
  taxonomy: {
    categoryId?: string | null;
    categorySlug?: string | null;
    brandId?: string | null;
    brandSlug?: string | null;
  },
): Promise<{ categoryHref: string | null; brandHref: string | null }> {
  const wanted: Array<{ kind: 'category' | 'brand'; id: string | null; slug: string }> = [];
  if (taxonomy.categorySlug) wanted.push({ kind: 'category', id: taxonomy.categoryId ?? null, slug: taxonomy.categorySlug });
  if (taxonomy.brandSlug) wanted.push({ kind: 'brand', id: taxonomy.brandId ?? null, slug: taxonomy.brandSlug });
  if (wanted.length === 0) return { categoryHref: null, brandHref: null };

  const [live, links] = await Promise.all([
    prisma.page.findMany({
      where: {
        ...publishedPageWhere(),
        countryId: country.id,
        OR: wanted.flatMap((entry) => [
          ...(entry.id ? [{ taxonomyKind: entry.kind, taxonomyId: entry.id }] : []),
          { taxonomyId: null, slug: taxonomyPageSlug(entry.kind, entry.slug) },
        ]),
      },
      select: { id: true, slug: true, taxonomyKind: true, taxonomyId: true },
    }),
    loadLinks(),
  ]);

  const href = (kind: 'category' | 'brand') => {
    const entry = wanted.find((candidate) => candidate.kind === kind);
    if (!entry) return null;
    const match =
      live.find((page) => entry.id && page.taxonomyKind === kind && page.taxonomyId === entry.id) ??
      live.find((page) => !page.taxonomyId && page.slug === taxonomyPageSlug(kind, entry.slug));
    if (!match) return null;
    return links.pageById(match.id, country.id) ?? countryPath(country, match.slug);
  };

  return { categoryHref: href('category'), brandHref: href('brand') };
}
