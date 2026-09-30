'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { authorize, userCan, type SessionUser } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { resolveActionCountry } from '@/lib/country/admin';
import { assertCountryAccess } from '@/lib/country/access';
import { getCountryById } from '@/lib/country/registry';
import { revalidateCountryPage } from '@/lib/country/revalidate';
import { countryPath } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';
import { getBlock } from '@/lib/cms/blocks';
import { DEFAULT_SECTION_DESIGN } from '@/lib/cms/design';
import { sectionCopies } from '@/lib/cms/section-copy';
import { pagesUnderCity, pagePathTemplates, SLUG_PLACEHOLDER } from '@/lib/services/cities';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { sanitizeText } from '@/lib/utils/sanitize';
import { checkSlugAvailability, syncContentRoutes, actorOf } from '@/lib/urls/registry';
import {
  cityInputSchema,
  cityPageInputSchema,
  cityProductPagesSchema,
  type CityPageInput,
} from '@/lib/validation/city';
import {
  cityProductSlug,
  cityProductStarterSections,
  cityStarterSections,
  DEFAULT_CITY_PHRASE,
  replaceTokens,
  suggestCityProductSeo,
  suggestCitySeo,
  type CityTokens,
  type StarterSection,
} from '@/lib/cities/defaults';
import { queueSeoAnalysis } from '@/lib/seo-intelligence/queue';

/**
 * Cities and their landing pages.
 *
 * A city's pages are ordinary CMS pages: they are created here with useful
 * starting content and from then on edited in the page builder like any other
 * page. Every address goes through the URL registry — availability is checked
 * with the same rules as a page's slug before anything is written, and routes
 * and redirects are synced by the registry afterwards.
 */

type Tx = Prisma.TransactionClient;

async function revalidateCity(country: CountryContext, slugs: string[]) {
  revalidatePath('/admin/cities');
  revalidatePath('/admin/pages');
  for (const slug of slugs) revalidateCountryPage(country, slug);
}

/** Why a page slug cannot be used in this market, or null when it can. */
async function pageSlugProblem(countryId: string, slug: string, pageId: string | null): Promise<string | null> {
  const clash = await prisma.page.findFirst({
    where: { countryId, slug, ...(pageId ? { id: { not: pageId } } : {}) },
    select: { title: true, deletedAt: true },
  });
  if (clash) {
    return clash.deletedAt
      ? `A deleted page still holds /${slug}. Empty it from the Recycle Bin or choose another slug.`
      : `The page “${clash.title}” already uses /${slug}.`;
  }
  const available = await checkSlugAvailability({ kind: 'page', contentId: pageId, slug, countryIds: [countryId] });
  return available.ok ? null : available.message;
}

/** A form to put in a generated enquiry section: this market's, else a shared one. */
async function defaultFormSlug(countryId: string): Promise<string> {
  const forms = await prisma.form.findMany({
    where: { deletedAt: null, isActive: true, OR: [{ countryId }, { countryId: null }] },
    orderBy: [{ createdAt: 'asc' }],
    select: { slug: true, countryId: true },
    take: 20,
  });
  const ranked = [...forms].sort(
    (a, b) =>
      Number(b.countryId === countryId) - Number(a.countryId === countryId) ||
      Number(/contact|enquir|quote/.test(b.slug)) - Number(/contact|enquir|quote/.test(a.slug)),
  );
  return ranked[0]?.slug ?? '';
}

function sectionRows(sections: StarterSection[]) {
  return sections.map((section, index) => {
    const definition = getBlock(section.blockType);
    return {
      blockType: section.blockType,
      name: section.name,
      sortOrder: (index + 1) * 10,
      isVisible: true,
      // Parsed through the block's own schema so every default is filled in.
      content: (definition ? definition.schema.parse(section.content) : section.content) as object,
      settings: { ...DEFAULT_SECTION_DESIGN, anchorId: section.anchorId ?? '' } as unknown as object,
    };
  });
}

async function createPageRecord(
  tx: Tx,
  input: {
    countryId: string;
    title: string;
    slug: string;
    status: 'DRAFT' | 'PUBLISHED';
    seoTitle: string | null;
    seoDescription: string | null;
    keywords: string[];
    userId: string;
    sections: ReturnType<typeof sectionRows> | ReturnType<typeof sectionCopies>;
  },
) {
  return tx.page.create({
    data: {
      countryId: input.countryId,
      title: sanitizeText(input.title),
      slug: input.slug,
      status: input.status,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      seoTitle: input.seoTitle ? sanitizeText(input.seoTitle) : null,
      seoDescription: input.seoDescription ? sanitizeText(input.seoDescription) : null,
      primaryKeywords: input.keywords.map((k) => sanitizeText(k)),
      createdById: input.userId,
      updatedById: input.userId,
      sections: { create: input.sections },
    },
    select: { id: true, slug: true },
  });
}

/**
 * The sections of a new city page: a template page's, copied once with its
 * {{city}} tokens filled in, or the starter layout.
 */
async function citySectionsFor(
  country: CountryContext,
  tokens: CityTokens,
  page: CityPageInput,
  h1: string,
  seoDescription: string,
) {
  if (page.templatePageId) {
    const template = await prisma.page.findFirst({
      where: { id: page.templatePageId, deletedAt: null },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) return { error: 'The template page no longer exists.' } as const;
    if (template.countryId !== country.id) return { error: 'Choose a template page from the same country.' } as const;
    return { rows: sectionCopies(replaceTokens(template.sections, tokens)) } as const;
  }
  const phrase = page.phrase.trim() || DEFAULT_CITY_PHRASE;
  const seo = { ...suggestCitySeo(tokens, phrase), h1, seoDescription };
  const formSlug = await defaultFormSlug(country.id);
  return { rows: sectionRows(cityStarterSections(tokens, seo, phrase, formSlug)) } as const;
}

async function assertCityAccess(user: SessionUser, cityId: string) {
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  if (!city) return null;
  await assertCountryAccess(user, city.countryId);
  return city;
}

// ---------------------------------------------------------------------------
// Checking an address before saving
// ---------------------------------------------------------------------------

/**
 * Where a city would live and whether that address is free — the live check
 * behind the slug field. Uses the registry's own collision and reserved-path
 * rules, so the answer is the one saving would give.
 */
export async function checkCityAddress(input: {
  countryId: string;
  slug: string;
  cityId?: string | null;
}): Promise<ActionResult<{ path: string; available: boolean; message: string | null }>> {
  try {
    const user = await authorize('cities.view');
    const country = await resolveActionCountry(user, input.countryId);
    const slug = cityInputSchema.shape.slug.safeParse(input.slug);
    if (!slug.success) return success({ path: countryPath(country, ''), available: false, message: 'Enter a URL slug.' });

    const existing = input.cityId ? await prisma.city.findUnique({ where: { id: input.cityId } }) : null;
    const taken = await prisma.city.findFirst({
      where: { countryId: country.id, slug: slug.data, ...(existing ? { id: { not: existing.id } } : {}) },
      select: { name: true },
    });
    const templates = await pagePathTemplates([country]);
    const path = (templates[country.id] ?? countryPath(country, SLUG_PLACEHOLDER)).replace(SLUG_PLACEHOLDER, slug.data);
    if (taken) return success({ path, available: false, message: `${taken.name} already uses /${slug.data} in ${country.name}.` });

    const pageId = existing?.countryId === country.id ? existing.pageId : null;
    const problem = existing && existing.slug === slug.data && existing.countryId === country.id
      ? null
      : await pageSlugProblem(country.id, slug.data, pageId);
    return success({ path, available: !problem, message: problem });
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Create, edit, archive, delete
// ---------------------------------------------------------------------------

export async function createCity(input: unknown): Promise<ActionResult<{ id: string; pageId: string | null }>> {
  try {
    const user = await authorize('cities.manage');
    const raw = (input ?? {}) as Record<string, unknown>;
    const city = cityInputSchema.parse(raw);
    const page = cityPageInputSchema.parse(raw.page ?? {});
    if (page.createPage && page.status === 'PUBLISHED' && !userCan(user, 'pages.publish')) {
      return failure('You do not have permission to publish pages. Create the page as a draft.');
    }

    const country = await resolveActionCountry(user, city.countryId);

    const duplicate = await prisma.city.findUnique({
      where: { countryId_slug: { countryId: country.id, slug: city.slug } },
      select: { name: true },
    });
    if (duplicate) {
      return failure(`${duplicate.name} already uses this slug in ${country.name}.`, {
        slug: [`Already used by ${duplicate.name}`],
      });
    }

    const tokens: CityTokens = { city: sanitizeText(city.name), region: city.region, country: country.name };
    const suggestion = suggestCitySeo(tokens, page.phrase || DEFAULT_CITY_PHRASE);
    const h1 = page.h1 ?? suggestion.h1;
    const seoDescription = page.seoDescription ?? suggestion.seoDescription;

    let sections: Awaited<ReturnType<typeof citySectionsFor>> | null = null;
    if (page.createPage) {
      const problem = await pageSlugProblem(country.id, city.slug, null);
      if (problem) return failure(problem, { slug: [problem] });
      sections = await citySectionsFor(country, tokens, page, h1, seoDescription);
      if ('error' in sections) return failure(sections.error!, { templatePageId: [sections.error!] });
    }

    const created = await prisma.$transaction(async (tx) => {
      const pageRow =
        page.createPage && sections && 'rows' in sections
          ? await createPageRecord(tx, {
              countryId: country.id,
              title: tokens.city,
              slug: city.slug,
              status: page.status,
              seoTitle: page.seoTitle ?? suggestion.seoTitle,
              seoDescription,
              keywords: page.keywords.length ? page.keywords : suggestion.keywords,
              userId: user.id,
              sections: sections.rows,
            })
          : null;
      return tx.city.create({
        data: {
          countryId: country.id,
          name: tokens.city,
          slug: city.slug,
          region: city.region ? sanitizeText(city.region) : null,
          isActive: city.isActive,
          sortOrder: city.sortOrder,
          pageId: pageRow?.id ?? null,
          createdById: user.id,
          updatedById: user.id,
        },
      });
    });

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'City',
      entityId: created.id,
      summary: `Created city “${created.name}” (${country.code})${created.pageId ? ' with its landing page' : ''}`,
      after: { name: created.name, slug: created.slug, region: created.region, country: country.code },
    });

    if (created.pageId) {
      await syncContentRoutes({ kind: 'page', ids: [created.pageId] }, actorOf(user), 'created');
      queueSeoAnalysis([{ kind: 'page', id: created.pageId }]);
    }
    await revalidateCity(country, [created.slug]);
    return success({ id: created.id, pageId: created.pageId }, created.pageId ? 'City and landing page created.' : 'City created.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Saves a city. A new slug moves the landing page and every page under it —
 * "/delhi" and "/delhi/…" become "/new-delhi" and "/new-delhi/…" — checked in
 * full before anything is written, and the registry leaves a permanent
 * redirect behind each published address.
 */
export async function updateCity(cityId: string, input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('cities.manage');
    const before = await assertCityAccess(user, cityId);
    if (!before) return failure('That city no longer exists.');

    const parsed = cityInputSchema.parse({ ...(input as object), countryId: before.countryId });
    const country = await getCountryById(before.countryId);
    if (!country) return failure('That city’s country no longer exists.');

    const slugChanged = parsed.slug !== before.slug;
    let moves: Awaited<ReturnType<typeof pagesUnderCity>> = [];
    if (slugChanged) {
      const duplicate = await prisma.city.findFirst({
        where: { countryId: before.countryId, slug: parsed.slug, id: { not: cityId } },
        select: { name: true },
      });
      if (duplicate) return failure(`${duplicate.name} already uses this slug.`, { slug: [`Already used by ${duplicate.name}`] });

      const rootSlug = before.pageId
        ? (await prisma.page.findUnique({ where: { id: before.pageId }, select: { slug: true, deletedAt: true } }))
        : null;
      const from = rootSlug && !rootSlug.deletedAt ? rootSlug.slug : before.slug;
      moves = await pagesUnderCity(before.countryId, from, parsed.slug);
      const moving = new Set(moves.map((m) => m.id));
      for (const move of moves) {
        const clash = await prisma.page.findFirst({
          where: { countryId: before.countryId, slug: move.newSlug, id: { notIn: [...moving] } },
          select: { title: true },
        });
        if (clash) return failure(`/${move.newSlug} is already used by “${clash.title}”.`, { slug: [`/${move.newSlug} is taken`] });
        const available = await checkSlugAvailability({ kind: 'page', contentId: move.id, slug: move.newSlug });
        if (!available.ok) return failure(available.message, { slug: [available.message] });
      }
      if (!before.pageId) {
        const problem = await pageSlugProblem(before.countryId, parsed.slug, null);
        if (problem) return failure(problem, { slug: [problem] });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Two passes, so pages swapping places never collide on the unique slug.
      for (const move of moves) {
        await tx.page.update({ where: { id: move.id }, data: { slug: `${move.newSlug}--moving-${move.id}` } });
      }
      for (const move of moves) {
        await tx.page.update({ where: { id: move.id }, data: { slug: move.newSlug, updatedById: user.id } });
      }
      await tx.city.update({
        where: { id: cityId },
        data: {
          name: sanitizeText(parsed.name),
          slug: parsed.slug,
          region: parsed.region ? sanitizeText(parsed.region) : null,
          sortOrder: parsed.sortOrder,
          updatedById: user.id,
        },
      });
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'City',
      entityId: cityId,
      summary: slugChanged
        ? `Moved city “${parsed.name}” from /${before.slug} to /${parsed.slug} (${moves.length} page(s))`
        : `Updated city “${parsed.name}”`,
      before: { name: before.name, slug: before.slug, region: before.region },
      after: { name: parsed.name, slug: parsed.slug, region: parsed.region },
    });

    if (moves.length) {
      await syncContentRoutes({ kind: 'page', ids: moves.map((m) => m.id) }, actorOf(user), 'renamed');
      queueSeoAnalysis(moves.map((m) => ({ kind: 'page' as const, id: m.id })));
    }
    await revalidateCity(country, [before.slug, parsed.slug, ...moves.flatMap((m) => [m.slug, m.newSlug])]);
    return success(undefined, moves.length ? `City saved. ${moves.length} page address(es) moved, with redirects from the old ones.` : 'City saved.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Archives or restores a city. Archiving takes its pages off the website
 * (they become Archived, exactly as archiving them one by one would); restoring
 * brings them back as drafts to be reviewed and published again.
 */
export async function setCityActive(cityId: string, active: boolean): Promise<ActionResult> {
  try {
    const user = await authorize('cities.manage');
    const city = await assertCityAccess(user, cityId);
    if (!city) return failure('That city no longer exists.');
    const country = await getCountryById(city.countryId);
    if (!country) return failure('That city’s country no longer exists.');

    const mappings = await prisma.cityProductPage.findMany({ where: { cityId }, select: { pageId: true } });
    const pageIds = [...(city.pageId ? [city.pageId] : []), ...mappings.map((m) => m.pageId)];
    const pages = await prisma.page.findMany({ where: { id: { in: pageIds }, deletedAt: null }, select: { id: true, slug: true, status: true } });

    await prisma.$transaction([
      prisma.city.update({ where: { id: cityId }, data: { isActive: active, updatedById: user.id } }),
      prisma.page.updateMany({
        where: { id: { in: pages.map((p) => p.id) }, ...(active ? { status: 'ARCHIVED' } : {}) },
        data: { status: active ? 'DRAFT' : 'ARCHIVED', updatedById: user.id },
      }),
    ]);

    await recordAudit({
      actor: user,
      action: active ? 'restored' : 'archived',
      entity: 'City',
      entityId: cityId,
      summary: `${active ? 'Restored' : 'Archived'} city “${city.name}” and ${pages.length} page(s)`,
    });

    if (pages.length) {
      await syncContentRoutes({ kind: 'page', ids: pages.map((p) => p.id) }, actorOf(user), 'renamed');
      queueSeoAnalysis(pages.map((p) => ({ kind: 'page' as const, id: p.id })));
    }
    await revalidateCity(country, pages.map((p) => p.slug));
    return success(
      undefined,
      active ? 'City restored. Its pages are drafts until you publish them again.' : 'City archived and its pages taken off the website.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Removes a city. Its pages are kept as ordinary pages — they may be indexed,
 * linked and edited, and deleting content is a decision for the Pages screen,
 * where it goes to the Recycle Bin.
 */
export async function deleteCity(cityId: string): Promise<ActionResult> {
  try {
    const user = await authorize('cities.manage');
    const city = await assertCityAccess(user, cityId);
    if (!city) return failure('That city no longer exists.');
    await prisma.city.delete({ where: { id: cityId } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'City',
      entityId: cityId,
      summary: `Deleted city “${city.name}”; its pages were kept`,
      before: { name: city.name, slug: city.slug, pageId: city.pageId },
    });
    await prisma.seoAnalysis.updateMany({ where: { cityId }, data: { cityId: null } });
    revalidatePath('/admin/cities');
    return success(undefined, 'City deleted. Its pages are still in Pages.');
  } catch (error) {
    return toActionError(error);
  }
}

/** Creates a landing page for a city that has none (never made, or deleted). */
export async function createCityLandingPage(cityId: string, input: unknown): Promise<ActionResult<{ pageId: string }>> {
  try {
    const user = await authorize('cities.manage');
    const city = await assertCityAccess(user, cityId);
    if (!city) return failure('That city no longer exists.');
    const existing = city.pageId ? await prisma.page.findUnique({ where: { id: city.pageId }, select: { deletedAt: true } }) : null;
    if (existing && !existing.deletedAt) return failure('This city already has a landing page.');

    const page = cityPageInputSchema.parse({ ...(input as object), createPage: true });
    if (page.status === 'PUBLISHED' && !userCan(user, 'pages.publish')) {
      return failure('You do not have permission to publish pages. Create the page as a draft.');
    }
    const country = await getCountryById(city.countryId);
    if (!country) return failure('That city’s country no longer exists.');

    const problem = await pageSlugProblem(country.id, city.slug, null);
    if (problem) return failure(problem, { slug: [problem] });

    const tokens: CityTokens = { city: city.name, region: city.region, country: country.name };
    const suggestion = suggestCitySeo(tokens, page.phrase || DEFAULT_CITY_PHRASE);
    const h1 = page.h1 ?? suggestion.h1;
    const seoDescription = page.seoDescription ?? suggestion.seoDescription;
    const sections = await citySectionsFor(country, tokens, page, h1, seoDescription);
    if ('error' in sections) return failure(sections.error!);

    const created = await prisma.$transaction(async (tx) => {
      const row = await createPageRecord(tx, {
        countryId: country.id,
        title: city.name,
        slug: city.slug,
        status: page.status,
        seoTitle: page.seoTitle ?? suggestion.seoTitle,
        seoDescription,
        keywords: page.keywords.length ? page.keywords : suggestion.keywords,
        userId: user.id,
        sections: sections.rows,
      });
      await tx.city.update({ where: { id: cityId }, data: { pageId: row.id, updatedById: user.id } });
      return row;
    });

    await recordAudit({ actor: user, action: 'page.created', entity: 'City', entityId: cityId, summary: `Created the landing page for “${city.name}”` });
    await syncContentRoutes({ kind: 'page', ids: [created.id] }, actorOf(user), 'created');
    queueSeoAnalysis([{ kind: 'page', id: created.id }]);
    await revalidateCity(country, [created.slug]);
    return success({ pageId: created.id }, 'Landing page created.');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// City product pages
// ---------------------------------------------------------------------------

/**
 * Creates "/<city>/<product>" pages for products this market sells.
 *
 * Each is an ordinary page with a starter layout built from the city and the
 * product as they are now; nothing links the copy back to either afterwards,
 * except a product block that shows the live price from ProductCountry.
 * A product that already has a page for this city is skipped, never
 * duplicated or overwritten.
 */
export async function generateCityProductPages(
  input: unknown,
): Promise<ActionResult<{ created: number; skipped: string[] }>> {
  try {
    const user = await authorize('cities.manage');
    const { cityId, productIds, status } = cityProductPagesSchema.parse(input);
    if (status === 'PUBLISHED' && !userCan(user, 'pages.publish')) {
      return failure('You do not have permission to publish pages. Create them as drafts.');
    }
    const city = await assertCityAccess(user, cityId);
    if (!city) return failure('That city no longer exists.');
    const country = await getCountryById(city.countryId);
    if (!country) return failure('That city’s country no longer exists.');

    const [root, offers, existing, formSlug] = await Promise.all([
      city.pageId ? prisma.page.findUnique({ where: { id: city.pageId }, select: { slug: true, deletedAt: true } }) : null,
      prisma.productCountry.findMany({
        where: { countryId: city.countryId, productId: { in: productIds }, deletedAt: null, product: { deletedAt: null } },
        include: { product: { select: { id: true, name: true, slug: true, shortDescription: true, description: true } } },
      }),
      prisma.cityProductPage.findMany({ where: { cityId, productId: { in: productIds } }, select: { productId: true } }),
      defaultFormSlug(city.countryId),
    ]);
    const base = root && !root.deletedAt ? root.slug : city.slug;
    const already = new Set(existing.map((e) => e.productId));
    const offered = new Map(offers.map((o) => [o.productId, o]));

    const skipped: string[] = [];
    const createdIds: string[] = [];
    for (const productId of productIds) {
      const offer = offered.get(productId);
      if (!offer) {
        skipped.push(`A selected product is not sold in ${country.name}.`);
        continue;
      }
      const product = offer.product;
      if (already.has(productId)) {
        skipped.push(`${product.name}: this city already has a page for it.`);
        continue;
      }
      const slug = cityProductSlug(base, product.slug);
      const problem = await pageSlugProblem(country.id, slug, null);
      if (problem) {
        skipped.push(`${product.name}: ${problem}`);
        continue;
      }

      const tokens = { city: city.name, region: city.region, country: country.name, product: product.name };
      const seo = suggestCityProductSeo(tokens);
      const sections = sectionRows(
        cityProductStarterSections({
          tokens,
          seo,
          productId: product.id,
          productSummary: offer.shortDescription || product.shortDescription || '',
          productDescriptionHtml: offer.description || product.description || '',
          cityPath: `/${base}`,
          formSlug,
        }),
      );

      try {
        const page = await prisma.$transaction(async (tx) => {
          const row = await createPageRecord(tx, {
            countryId: country.id,
            title: seo.title,
            slug,
            status,
            seoTitle: seo.seoTitle,
            seoDescription: seo.seoDescription,
            keywords: seo.keywords,
            userId: user.id,
            sections,
          });
          await tx.cityProductPage.create({ data: { cityId, productId, pageId: row.id } });
          return row;
        });
        createdIds.push(page.id);
      } catch (error) {
        // The unique (city, product) pair is the backstop against a double click.
        if (error instanceof Error && error.message.includes('Unique constraint')) {
          skipped.push(`${product.name}: this city already has a page for it.`);
          continue;
        }
        throw error;
      }
    }

    if (createdIds.length) {
      await recordAudit({
        actor: user,
        action: 'product-pages.created',
        entity: 'City',
        entityId: cityId,
        summary: `Created ${createdIds.length} product page(s) for “${city.name}”`,
      });
      await syncContentRoutes({ kind: 'page', ids: createdIds }, actorOf(user), 'created');
      queueSeoAnalysis(createdIds.map((id) => ({ kind: 'page' as const, id })));
    }
    await revalidateCity(country, []);
    revalidatePath(`/admin/cities/${cityId}`);

    if (createdIds.length === 0) return failure(skipped[0] ?? 'Nothing was created.');
    return success(
      { created: createdIds.length, skipped },
      `${createdIds.length} product page(s) created${skipped.length ? `, ${skipped.length} skipped` : ''}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

/** Unlinks a product page from its city. The page itself is kept. */
export async function unlinkCityProductPage(mappingId: string): Promise<ActionResult> {
  try {
    const user = await authorize('cities.manage');
    const mapping = await prisma.cityProductPage.findUnique({
      where: { id: mappingId },
      include: { city: true, product: { select: { name: true } } },
    });
    if (!mapping) return failure('That product page is no longer linked.');
    await assertCountryAccess(user, mapping.city.countryId);
    await prisma.cityProductPage.delete({ where: { id: mappingId } });
    await recordAudit({
      actor: user,
      action: 'product-page.unlinked',
      entity: 'City',
      entityId: mapping.cityId,
      summary: `Unlinked the ${mapping.product.name} page from “${mapping.city.name}”; the page was kept`,
    });
    queueSeoAnalysis([{ kind: 'page', id: mapping.pageId }]);
    revalidatePath(`/admin/cities/${mapping.cityId}`);
    return success(undefined, 'Unlinked. The page is still in Pages.');
  } catch (error) {
    return toActionError(error);
  }
}
