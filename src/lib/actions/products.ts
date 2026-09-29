'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { productInputSchema, productCategorySchema, brandSchema } from '@/lib/validation/product';
import { uniqueSlug, slugify, originalSlug } from '@/lib/utils/slug';
import { toDecimal } from '@/lib/utils/money';
import { sanitizeHtml, sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { listActiveCountries } from '@/lib/country/registry';
import { scopeForUser } from '@/lib/country/admin';
import { offerIn, removeFrom } from '@/lib/country/availability';
import { sectionCopy } from '@/lib/cms/section-copy';
import { ensureTaxonomyPage } from '@/lib/services/taxonomy-pages';
import type { TaxonomyKind } from '@/lib/cms/taxonomy-pages';
import { countryPath } from '@/lib/country/routing';
import type { SessionUser } from '@/lib/auth/guards';
import { syncContentRoutes, checkSlugAvailability, isAddressTaken, actorOf } from '@/lib/urls/registry';

/**
 * Revalidates a product's page in every market that could be serving it.
 *
 * The catalogue is global but the pages are not, so a price change in one
 * market still has to clear that market's URL — and only touching `/products/x`
 * would leave `/ae/products/x` stale.
 */
async function revalidateProduct(slug: string) {
  const countries = await listActiveCountries();
  for (const country of countries) {
    revalidatePath(countryPath(country, `products/${slug}`));
  }
  revalidatePath('/sitemap.xml');
  // Product blocks appear on CMS pages, so the whole public tree is affected.
  revalidatePath('/', 'layout');
}

/** Parses the multi-value fields that arrive as JSON strings from the form. */
function parseJsonField<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readProductForm(formData: FormData) {
  return productInputSchema.parse({
    name: formData.get('name'),
    slug: formData.get('slug') || String(formData.get('name') ?? ''),
    sku: formData.get('sku'),
    status: formData.get('status') || 'DRAFT',
    publishedAt: formData.get('publishedAt') || null,
    isFeatured: formData.get('isFeatured') === 'true',
    sortOrder: formData.get('sortOrder') || 0,
    featuredOrder: formData.get('featuredOrder') || 0,
    shortDescription: formData.get('shortDescription'),
    description: formData.get('description'),
    storage: formData.get('storage'),
    minUsers: formData.get('minUsers'),
    maxUsers: formData.get('maxUsers'),
    billingPeriod: formData.get('billingPeriod') || 'BOTH',
    currency: formData.get('currency') || 'INR',
    monthlyPrice: formData.get('monthlyPrice'),
    annualPrice: formData.get('annualPrice'),
    compareAtPrice: formData.get('compareAtPrice'),
    discountPercent: formData.get('discountPercent'),
    priceSuffix: formData.get('priceSuffix'),
    priceNote: formData.get('priceNote'),
    features: parseJsonField<string[]>(formData.get('features'), []),
    benefits: parseJsonField<string[]>(formData.get('benefits'), []),
    specs: parseJsonField<Array<{ label: string; value: string }>>(formData.get('specs'), []),
    ctaLabel: formData.get('ctaLabel'),
    ctaUrl: formData.get('ctaUrl'),
    ctaFormId: formData.get('ctaFormId'),
    imageId: formData.get('imageId'),
    galleryIds: parseJsonField<string[]>(formData.get('galleryIds'), []),
    categoryId: formData.get('categoryId'),
    brandId: formData.get('brandId'),
    seoTitle: formData.get('seoTitle'),
    seoDescription: formData.get('seoDescription'),
    canonicalUrl: formData.get('canonicalUrl'),
    noIndex: formData.get('noIndex') === 'true',
    ogImageId: formData.get('ogImageId'),
  });
}

function toPrismaData(input: ReturnType<typeof readProductForm>) {
  return {
    name: sanitizeText(input.name),
    sku: input.sku,
    status: input.status,
    isFeatured: input.isFeatured,
    sortOrder: input.sortOrder,
    featuredOrder: input.featuredOrder,
    shortDescription: input.shortDescription ? sanitizeText(input.shortDescription) : null,
    description: input.description ? sanitizeHtml(input.description) : null,
    storage: input.storage,
    minUsers: input.minUsers,
    maxUsers: input.maxUsers,
    billingPeriod: input.billingPeriod,
    currency: input.currency.toUpperCase(),
    monthlyPrice: toDecimal(input.monthlyPrice),
    annualPrice: toDecimal(input.annualPrice),
    compareAtPrice: toDecimal(input.compareAtPrice),
    discountPercent: input.discountPercent,
    priceSuffix: input.priceSuffix,
    priceNote: input.priceNote,
    features: input.features.map((f) => sanitizeText(f)).filter(Boolean) as Prisma.InputJsonValue,
    benefits: input.benefits.map((b) => sanitizeText(b)).filter(Boolean) as Prisma.InputJsonValue,
    specs: input.specs
      .map((s) => ({ label: sanitizeText(s.label), value: sanitizeText(s.value) }))
      .filter((s) => s.label) as Prisma.InputJsonValue,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    ctaFormId: input.ctaFormId,
    imageId: input.imageId,
    galleryIds: input.galleryIds as Prisma.InputJsonValue,
    categoryId: input.categoryId,
    brandId: input.brandId,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    canonicalUrl: input.canonicalUrl,
    noIndex: input.noIndex,
    ogImageId: input.ogImageId,
  };
}

export async function createProduct(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.create');
    const input = readProductForm(formData);

    // A new product's address must be free across every content type, not
    // just among products — a page or a redirect may already hold it.
    const slug = await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
      const existing = await prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return Boolean(existing) || (await isAddressTaken({ kind: 'product', slug: candidate }));
    });

    const product = await prisma.product.create({
      data: {
        ...toPrismaData(input),
        slug,
        publishedAt: input.status === 'PUBLISHED' ? (input.publishedAt ?? new Date()) : input.publishedAt,
        createdById: user.id,
        updatedById: user.id,
      },
    });

    // A new product goes on sale in the market the admin is working in, at the
    // price they just entered. Other markets stay untouched until somebody
    // prices it there.
    await syncCountryPricing(user, product.id, pricingFrom(input, product.currency));

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'Product',
      entityId: product.id,
      summary: `Created product “${product.name}”`,
      after: { name: product.name, slug: product.slug, status: product.status },
    });

    revalidatePath('/admin/products');
    await revalidateProduct(slug);
    await syncContentRoutes({ kind: 'product', ids: [product.id] }, actorOf(user), 'created');
    return success({ id: product.id }, 'Product created.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Mirrors a product's commercial fields into the market the admin is working in.
 *
 * The product form, the catalogue list and the ordering screen each show one
 * price, one status and one arrangement — and the admin is working in one
 * market, so those controls edit *that* market. Other markets are reached
 * through the Country pricing panel on the product's own screen. On a
 * single-market installation this is exactly the behaviour these screens always
 * had.
 *
 * Without this the global row and the market row drift apart: an admin would
 * change a price, save, and see nothing change on the site, because the public
 * pages read `ProductCountry`.
 */
async function syncCountryPricing(
  user: SessionUser,
  productId: string,
  patch: Prisma.ProductCountryUncheckedUpdateInput & { currency?: string },
  defaults: Partial<Prisma.ProductCountryUncheckedCreateInput> = {},
): Promise<void> {
  const scope = await scopeForUser(user);
  const countryId = scope.country.id;

  await prisma.productCountry.upsert({
    where: { productId_countryId: { productId, countryId } },
    // Saving a product while working in a market that had withdrawn it is a
    // decision to offer it there again.
    update: { ...patch, deletedAt: null },
    // A market that does not sell the product yet starts from what was just
    // entered, so saving a product never leaves it for sale nowhere.
    create: {
      currency: scope.country.currency,
      ...defaults,
      ...(patch as Prisma.ProductCountryUncheckedCreateInput),
      productId,
      countryId,
    },
  });
}

/** The commercial fields of the product form, as one market's configuration. */
function pricingFrom(
  input: ReturnType<typeof readProductForm>,
  currency: string,
): Prisma.ProductCountryUncheckedUpdateInput & { currency: string } {
  return {
    status: input.status,
    publishedAt:
      input.status === 'PUBLISHED' ? (input.publishedAt ?? new Date()) : input.publishedAt,
    isFeatured: input.isFeatured,
    sortOrder: input.sortOrder,
    featuredOrder: input.featuredOrder,
    currency: input.currency || currency,
    monthlyPrice: toDecimal(input.monthlyPrice),
    annualPrice: toDecimal(input.annualPrice),
    compareAtPrice: toDecimal(input.compareAtPrice),
    discountPercent: input.discountPercent ?? null,
    priceSuffix: input.priceSuffix,
    priceNote: input.priceNote,
  };
}

export async function updateProduct(productId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');
    const before = await prisma.product.findUnique({ where: { id: productId } });
    if (!before || before.deletedAt) return failure('That product no longer exists.');

    const input = readProductForm(formData);
    const slug = input.slug || before.slug;

    if (slug !== before.slug) {
      const clash = await prisma.product.findFirst({
        where: { slug, id: { not: productId } },
        select: { id: true },
      });
      if (clash) return failure('Another product already uses that URL.', { slug: ['This URL is taken'] });
      // The same check the Slug & URL Manager runs, so it cannot be bypassed
      // here: every market's resulting address must be free.
      const available = await checkSlugAvailability({ kind: 'product', contentId: productId, slug });
      if (!available.ok) return failure(available.message, { slug: [available.message] });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...toPrismaData(input),
        slug,
        publishedAt:
          input.status === 'PUBLISHED'
            ? (input.publishedAt ?? before.publishedAt ?? new Date())
            : input.publishedAt,
        updatedById: user.id,
      },
    });

    // The form edits the market the admin is in, so its price, status and
    // ordering land where the public site reads them.
    await syncCountryPricing(user, productId, {
      ...pricingFrom(input, updated.currency),
      publishedAt:
        input.status === 'PUBLISHED'
          ? (input.publishedAt ?? before.publishedAt ?? new Date())
          : input.publishedAt,
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'Product',
      entityId: productId,
      summary: `Updated product “${updated.name}”`,
      before: {
        name: before.name,
        status: before.status,
        monthlyPrice: before.monthlyPrice?.toString() ?? null,
        annualPrice: before.annualPrice?.toString() ?? null,
      },
      after: {
        name: updated.name,
        status: updated.status,
        monthlyPrice: updated.monthlyPrice?.toString() ?? null,
        annualPrice: updated.annualPrice?.toString() ?? null,
      },
    });

    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    await revalidateProduct(before.slug);
    if (slug !== before.slug) await revalidateProduct(slug);
    await syncContentRoutes({ kind: 'product', ids: [productId] }, actorOf(user), 'renamed');
    return success(undefined, 'Product saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setProductStatus(
  productId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return failure('That product no longer exists.');

    const publishedAt =
      status === 'PUBLISHED' ? (product.publishedAt ?? new Date()) : product.publishedAt;

    await prisma.product.update({
      where: { id: productId },
      data: { status, publishedAt, updatedById: user.id },
    });

    // Publishing from the catalogue publishes it in the market being worked in.
    await syncCountryPricing(user, productId, { status, publishedAt });

    await recordAudit({
      actor: user,
      action: status.toLowerCase(),
      entity: 'Product',
      entityId: productId,
      summary: `Set “${product.name}” to ${status.toLowerCase()}`,
    });

    revalidatePath('/admin/products');
    await revalidateProduct(product.slug);
    await syncContentRoutes({ kind: 'product', ids: [productId] }, actorOf(user), 'renamed');
    return success(undefined, `Product ${status.toLowerCase()}.`);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Featured is a plain flag, so any number of products can carry it.
 *
 * Newly featured products join the end of the featured order rather than
 * jumping to the front, which keeps an existing arrangement stable.
 */
export async function toggleProductFeatured(productId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return failure('That product no longer exists.');

    const nextFeatured = !product.isFeatured;
    let featuredOrder = product.featuredOrder;

    if (nextFeatured) {
      // The end of the featured rail in the market being worked in — featured
      // ordering is per market, so another market's rail is not consulted.
      const scope = await scopeForUser(user);
      const last = await prisma.productCountry.findFirst({
        where: { isFeatured: true, countryId: scope.country.id, product: { deletedAt: null } },
        orderBy: { featuredOrder: 'desc' },
        select: { featuredOrder: true },
      });
      featuredOrder = (last?.featuredOrder ?? 0) + 10;
    }

    await prisma.product.update({
      where: { id: productId },
      data: { isFeatured: nextFeatured, featuredOrder, updatedById: user.id },
    });

    await syncCountryPricing(user, productId, { isFeatured: nextFeatured, featuredOrder });

    await recordAudit({
      actor: user,
      action: nextFeatured ? 'featured' : 'unfeatured',
      entity: 'Product',
      entityId: productId,
      summary: `${nextFeatured ? 'Marked' : 'Removed'} “${product.name}” ${nextFeatured ? 'as featured' : 'from featured'}`,
    });

    revalidatePath('/admin/products');
    await revalidateProduct(product.slug);
    return success(undefined, product.isFeatured ? 'Removed from featured.' : 'Marked as featured.');
  } catch (error) {
    return toActionError(error);
  }
}

const reorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1).max(500),
  scope: z.enum(['catalogue', 'featured']).default('catalogue'),
});

/**
 * Persists a manual product order.
 *
 * `catalogue` writes `sortOrder`, `featured` writes `featuredOrder`. Both are
 * stored in the database so the arrangement survives restarts and is never
 * derived from creation date.
 */
export async function reorderProducts(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');
    const { order, scope } = reorderSchema.parse(input);

    const owned = await prisma.product.findMany({
      where: { id: { in: order }, deletedAt: null },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((p) => p.id));
    if (order.some((id) => !ownedIds.has(id))) return failure('Invalid product order.');

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.product.update({
          where: { id },
          data:
            scope === 'featured'
              ? { featuredOrder: (index + 1) * 10, updatedById: user.id }
              : { sortOrder: (index + 1) * 10, updatedById: user.id },
        }),
      ),
    );

    // The public catalogue orders by the market's own row, so the arrangement
    // has to land there too — in the market the admin arranged it in.
    for (const [index, id] of order.entries()) {
      await syncCountryPricing(
        user,
        id,
        scope === 'featured'
          ? { featuredOrder: (index + 1) * 10 }
          : { sortOrder: (index + 1) * 10 },
      );
    }

    await recordAudit({
      actor: user,
      action: 'reordered',
      entity: 'Product',
      summary: `Reordered ${order.length} ${scope === 'featured' ? 'featured product' : 'product'}(s)`,
    });

    revalidatePath('/admin/products');
    revalidatePath('/', 'layout');
    return success(undefined, 'Order saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateProduct(productId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.create');
    const source = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: { orderBy: { sortOrder: 'asc' } },
        sections: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!source) return failure('That product no longer exists.');

    const slug = await uniqueSlug(`${source.slug}-copy`, async (candidate) => {
      const existing = await prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return Boolean(existing) || (await isAddressTaken({ kind: 'product', slug: candidate }));
    });

    const { id, createdAt, updatedAt, sku, ...rest } = source;
    void id;
    void createdAt;
    void updatedAt;

    const copy = await prisma.product.create({
      data: {
        ...rest,
        variants: undefined,
        sections: undefined,
        name: `${source.name} (copy)`,
        slug,
        sku: sku ? `${sku}-COPY` : null,
        status: 'DRAFT',
        isFeatured: false,
        publishedAt: null,
        createdById: user.id,
        updatedById: user.id,
        features: source.features as Prisma.InputJsonValue,
        benefits: source.benefits as Prisma.InputJsonValue,
        specs: source.specs as Prisma.InputJsonValue,
        galleryIds: source.galleryIds as Prisma.InputJsonValue,
      },
    });

    /*
     * The copy carries the source's pricing into the market being worked in,
     * as a draft. Duplicating a product to reprice it is the common case, and
     * an empty Country pricing tab would make the copy look broken.
     */
    await syncCountryPricing(user, copy.id, {
      status: 'DRAFT',
      publishedAt: null,
      isFeatured: false,
      sortOrder: source.sortOrder,
      featuredOrder: source.featuredOrder,
      currency: source.currency,
      monthlyPrice: source.monthlyPrice,
      annualPrice: source.annualPrice,
      compareAtPrice: source.compareAtPrice,
      discountPercent: source.discountPercent,
      priceSuffix: source.priceSuffix,
      priceNote: source.priceNote,
    });

    /*
     * The page somebody built for the product comes across with it — every
     * section of both surfaces, in order. Duplicating a product to sell a
     * variation of it is the common case, and a copy that fell back to the
     * built-in arrangement would silently throw that work away.
     */
    if (source.sections.length > 0) {
      await prisma.productSection.createMany({
        data: source.sections.map((section) => ({
          ...sectionCopy(section),
          productId: copy.id,
          surface: section.surface,
        })),
      });
    }

    if (source.variants.length > 0) {
      await prisma.productVariant.createMany({
        data: source.variants.map((variant) => ({
          productId: copy.id,
          name: variant.name,
          sku: null,
          storage: variant.storage,
          users: variant.users,
          monthlyPrice: variant.monthlyPrice,
          annualPrice: variant.annualPrice,
          sortOrder: variant.sortOrder,
          isDefault: variant.isDefault,
        })),
      });
    }

    await recordAudit({
      actor: user,
      action: 'duplicated',
      entity: 'Product',
      entityId: copy.id,
      summary: `Duplicated “${source.name}”`,
    });

    revalidatePath('/admin/products');
    await syncContentRoutes({ kind: 'product', ids: [copy.id] }, actorOf(user), 'created');
    return success({ id: copy.id }, 'Product duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Withdraws a product from **one market**.
 *
 * The product screen is country-scoped — the admin is looking at one market's
 * catalogue — so delete means "stop selling this here", not "destroy this
 * product". Deleting `Product.deletedAt` instead would take the product out of
 * every market at once, including the ones whose administrators were never
 * asked; that is what this used to do, and it is why a UAE deletion removed the
 * product from India.
 *
 * The market's own configuration — its prices, ordering and SEO — is archived
 * rather than destroyed, so a mistaken removal costs nothing to undo.
 *
 * The global product row is only retired once **no** market offers it any more,
 * and even then it is soft-deleted, because leads reference it and must keep
 * their attribution.
 */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.delete');
    const scope = await scopeForUser(user);
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true },
    });
    if (!product) return failure('That product no longer exists.');

    const removed = await withdrawFromMarket(productId, scope.country.id);
    if (!removed) {
      return failure(`${scope.country.name} does not offer that product.`);
    }

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'ProductCountry',
      entityId: productId,
      summary: `Removed product “${product.name}” from ${scope.country.name}`,
    });

    revalidatePath('/admin/products');
    await revalidateProduct(product.slug);
    await syncContentRoutes({ kind: 'product', ids: [productId] }, actorOf(user), 'deleted');
    return success(undefined, `Removed from ${scope.country.name}.`);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Archives one market's configuration, and retires the shared product only if
 * that was the last market offering it.
 *
 * Returns false when the market did not offer the product to begin with, so the
 * caller can say so rather than reporting a delete that deleted nothing.
 */
async function withdrawFromMarket(productId: string, countryId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const config = await tx.productCountry.findUnique({
      where: { productId_countryId: { productId, countryId } },
      select: { id: true, deletedAt: true },
    });
    if (!config || config.deletedAt) return false;

    await tx.productCountry.update({
      where: { id: config.id },
      data: { deletedAt: new Date(), status: 'ARCHIVED', isFeatured: false },
    });

    /*
     * Only when nothing is left. A product still on sale somewhere must keep a
     * live global row: every market's configuration hangs off it, and the
     * catalogue queries that join through it would drop those markets' products
     * the moment this was set.
     */
    const stillSold = await tx.productCountry.count({
      where: { productId, deletedAt: null },
    });
    if (stillSold === 0) {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { slug: true, deletedAt: true },
      });
      if (product && !product.deletedAt) {
        await tx.product.update({
          where: { id: productId },
          data: {
            deletedAt: new Date(),
            status: 'ARCHIVED',
            // Frees the slug for a future product of the same name.
            slug: `${product.slug}-deleted-${Date.now()}`,
            isFeatured: false,
          },
        });
      }
    }

    return true;
  });
}

/**
 * Puts a removed product back.
 *
 * The market's configuration was archived rather than destroyed, so this is
 * the undo it was archived for: the market offers the product again, and if
 * the shared row had been retired — which only happens once no market wants
 * it — that comes back too, under the URL it had.
 *
 * It comes back as a draft in this market, never straight to the website. A
 * restore is someone recovering from a mistake, not a decision to publish, and
 * those are not the same click.
 */
export async function restoreProduct(productId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.delete');
    const scope = await scopeForUser(user);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true, deletedAt: true },
    });
    if (!product) return failure('That product no longer exists.');

    const slug = product.deletedAt
      ? await uniqueSlug(originalSlug(product.slug), async (candidate) => {
          const clash = await prisma.product.findFirst({
            where: { slug: candidate, id: { not: productId } },
            select: { id: true },
          });
          return Boolean(clash);
        })
      : product.slug;

    await prisma.$transaction(async (tx) => {
      if (product.deletedAt) {
        await tx.product.update({
          where: { id: productId },
          data: { deletedAt: null, status: 'DRAFT', slug, updatedById: user.id },
        });
      }

      /*
       * The market's own row. A product retired everywhere may have no row for
       * the market doing the restoring — it was removed from that one first —
       * so one is created rather than leaving a restored product that appears
       * in no catalogue at all.
       */
      await tx.productCountry.upsert({
        where: { productId_countryId: { productId, countryId: scope.country.id } },
        update: { deletedAt: null, status: 'ARCHIVED' },
        create: {
          productId,
          countryId: scope.country.id,
          currency: scope.country.currency,
          status: 'ARCHIVED',
        },
      });
    });

    await recordAudit({
      actor: user,
      action: 'restored',
      entity: 'Product',
      entityId: productId,
      summary: `Restored product “${product.name}” to ${scope.country.name}`,
      after: { slug },
    });

    revalidatePath('/admin/products');
    revalidatePath('/admin/products/trash');
    await revalidateProduct(slug);
    await syncContentRoutes({ kind: 'product', ids: [productId] }, actorOf(user), 'restored');
    return success(undefined, `Restored to ${scope.country.name} as a draft.`);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Destroys a removed product for good.
 *
 * Refused while a lead points at it. Leads carry the product they were about,
 * and that attribution is the reason a deleted product is kept at all — a
 * purge that quietly emptied the product column of last quarter's enquiries
 * would be data loss dressed up as tidying. Everything else a product owns —
 * its market rows, variants, sections and gallery links — goes with it.
 */
export async function purgeProduct(productId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.delete');

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true, deletedAt: true },
    });
    if (!product) return failure('That product no longer exists.');
    if (!product.deletedAt) {
      return failure('Remove the product from every market before deleting it for good.');
    }

    const leads = await prisma.lead.count({ where: { productId } });
    if (leads > 0) {
      return failure(
        `${leads} lead(s) are attributed to this product, so it cannot be deleted for good. ` +
          'It stays here, out of the catalogue, and keeps that attribution.',
      );
    }

    await prisma.product.delete({ where: { id: productId } });

    await recordAudit({
      actor: user,
      action: 'purged',
      entity: 'Product',
      entityId: productId,
      summary: `Permanently deleted product “${product.name}”`,
      before: { name: product.name, slug: originalSlug(product.slug) },
    });

    revalidatePath('/admin/products');
    revalidatePath('/admin/products/trash');
    await syncContentRoutes({ kind: 'product', ids: [productId] }, actorOf(user), 'deleted');
    return success(undefined, 'Deleted for good.');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveProductCategory(
  categoryId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.edit');
    const input = productCategorySchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      sortOrder: formData.get('sortOrder') || 0,
      imageId: formData.get('imageId'),
    });

    const slug =
      categoryId === null
        ? await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
            const existing = await prisma.productCategory.findUnique({
              where: { slug: candidate },
              select: { id: true },
            });
            return Boolean(existing);
          })
        : input.slug;

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      sortOrder: input.sortOrder,
      imageId: input.imageId,
    };

    const category = categoryId
      ? await prisma.productCategory.update({ where: { id: categoryId }, data })
      : await prisma.productCategory.create({ data });

    /*
     * A category created while working in a market is offered there. Without
     * this it would exist but belong to nobody, and the screen that just
     * created it would not list it.
     *
     * Only on create: an edit must not silently re-offer a category this market
     * had removed.
     */
    let generatedPage: string | null = null;
    if (!categoryId) {
      const scope = await scopeForUser(user);
      await offerIn('PRODUCT_CATEGORY', [category.id], scope.country.id);

      /*
       * And a page to send people to. A category with no page is a filter
       * nobody can reach; the description that was just typed becomes its
       * opening, and its products are listed by a block that asks for them at
       * render time rather than a copy made here.
       */
      const page = await ensureTaxonomyPage(
        {
          kind: 'category',
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          imageId: category.imageId,
        },
        scope.country.id,
        user.id,
      );
      generatedPage = page.created ? page.slug : null;
    }

    await recordAudit({
      actor: user,
      action: categoryId ? 'updated' : 'created',
      entity: 'ProductCategory',
      entityId: category.id,
      summary: `${categoryId ? 'Updated' : 'Created'} category “${category.name}”`,
    });

    revalidatePath('/admin/products/categories');
    revalidatePath('/admin/pages');
    revalidatePath('/', 'layout');
    await syncContentRoutes({ kind: 'page' }, actorOf(user), 'renamed');
    return success(
      { id: category.id },
      generatedPage ? `Category saved, with a page at /${generatedPage}.` : 'Category saved.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Gives a category or brand that has no page one now.
 *
 * Everything created from here on gets its page on the way in, but the
 * categories and brands that already existed do not have one — and a category
 * whose page was deleted on purpose should not have it silently grow back on
 * the next rename. So this is a button rather than something that happens by
 * itself, and it does nothing at all where a page is already there.
 */
export async function generateTaxonomyPage(
  kind: TaxonomyKind,
  id: string,
): Promise<ActionResult<{ pageId: string; slug: string }>> {
  try {
    const user = await authorize('pages.create');
    const scope = await scopeForUser(user);

    const seed =
      kind === 'category'
        ? await prisma.productCategory
            .findUnique({
              where: { id },
              select: { id: true, name: true, slug: true, description: true, imageId: true },
            })
            .then((row) => (row ? { kind, ...row } : null))
        : await prisma.brand
            .findUnique({
              where: { id },
              select: { id: true, name: true, slug: true, description: true, logoId: true },
            })
            .then((row) => (row ? { kind, ...row, imageId: row.logoId } : null));

    if (!seed) return failure('That no longer exists.');

    const page = await ensureTaxonomyPage(seed, scope.country.id, user.id);

    if (!page.created) {
      return failure(`A page already exists at /${page.slug}.`);
    }

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'Page',
      entityId: page.pageId,
      summary: `Generated the page for “${seed.name}”`,
      after: { slug: page.slug, from: kind },
    });

    revalidatePath('/admin/products/categories');
    revalidatePath('/admin/products/brands');
    revalidatePath('/admin/pages');
    revalidatePath('/', 'layout');
    await syncContentRoutes({ kind: 'page' }, actorOf(user), 'created');
    return success({ pageId: page.pageId, slug: page.slug }, `Page created at /${page.slug}.`);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Stops **one market** offering a category.
 *
 * The category row is shared by every market, so deleting it here would delete
 * it everywhere — a UAE administrator tidying their own list would empty
 * India's. What is removed instead is this market's availability row.
 *
 * The shared category is only removed once no market offers it at all, which is
 * the one case where keeping it would leave an orphan nobody can reach.
 */
export async function deleteProductCategory(categoryId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.delete');
    const scope = await scopeForUser(user);
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) return failure('That category no longer exists.');

    const outcome = await removeFrom('PRODUCT_CATEGORY', categoryId, scope.country.id, {
      // Retired rather than destroyed. See `deleteBrand` — same reasoning,
      // same recycle bin, and the products keep their category either way.
      retireWhenUnused: async (tx) => {
        await tx.productCategory.update({
          where: { id: categoryId },
          data: { deletedAt: new Date(), slug: `${category.slug}-deleted-${Date.now()}` },
        });
      },
    });

    if (!outcome.removed && !outcome.retired) {
      return failure(`${scope.country.name} does not use that category.`);
    }

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'ProductCategory',
      entityId: categoryId,
      summary: outcome.retired
        ? `Removed category “${category.name}” from ${scope.country.name}; no market used it, so it went to the recycle bin`
        : `Removed category “${category.name}” from ${scope.country.name} (${outcome.remaining} other market(s) keep it)`,
    });

    revalidatePath('/admin/products/categories');
    revalidatePath('/admin/products');
    await syncContentRoutes({ kind: 'page' }, actorOf(user), 'renamed');
    return success(
      undefined,
      outcome.retired
        ? 'Category removed. No other market used it, so it is in the recycle bin.'
        : `Removed from ${scope.country.name}. ${outcome.remaining} other market(s) still use it.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['publish', 'draft', 'archive', 'feature', 'unfeature', 'delete']),
});

export async function bulkProductAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action } = bulkSchema.parse(input);
    const user =
      action === 'delete' ? await authorize('products.delete') : await authorize('products.edit');

    const products = await prisma.product.findMany({ where: { id: { in: ids }, deletedAt: null } });

    if (action === 'delete') {
      /*
       * Country-scoped, exactly like deleting one product from its row menu.
       * Selecting twenty rows in the UAE catalogue and pressing Delete is
       * twenty withdrawals from the UAE, not twenty products destroyed for
       * every market — which is what a global `product.updateMany` did here.
       *
       * Sequential rather than one transaction over all of them: each
       * withdrawal has to count the remaining markets for its own product, and
       * a single transaction over hundreds of rows is the kind that times out
       * holding locks on the catalogue.
       */
      const scope = await scopeForUser(user);
      let removed = 0;
      for (const product of products) {
        if (await withdrawFromMarket(product.id, scope.country.id)) removed += 1;
      }

      await recordAudit({
        actor: user,
        action: 'bulk.delete',
        entity: 'ProductCountry',
        summary: `Removed ${removed} product(s) from ${scope.country.name}`,
      });

      revalidatePath('/admin/products');
      revalidatePath('/', 'layout');
      await syncContentRoutes({ kind: 'product', ids }, actorOf(user), 'bulk');
      return success(
        undefined,
        `${removed} product(s) removed from ${scope.country.name}. Other markets are unchanged.`,
      );
    } else if (action === 'feature' || action === 'unfeature') {
      if (action === 'feature') {
        // Append to the featured order so an existing arrangement is preserved.
        const scope = await scopeForUser(user);
        const last = await prisma.productCountry.findFirst({
          where: { isFeatured: true, countryId: scope.country.id, product: { deletedAt: null } },
          orderBy: { featuredOrder: 'desc' },
          select: { featuredOrder: true },
        });
        let cursor = last?.featuredOrder ?? 0;
        const promoted = products.filter((p) => !p.isFeatured);

        await prisma.$transaction(
          promoted.map((product) => {
            cursor += 10;
            return prisma.product.update({
              where: { id: product.id },
              data: { isFeatured: true, featuredOrder: cursor, updatedById: user.id },
            });
          }),
        );

        let mirror = last?.featuredOrder ?? 0;
        for (const product of promoted) {
          mirror += 10;
          await syncCountryPricing(user, product.id, {
            isFeatured: true,
            featuredOrder: mirror,
          });
        }
      } else {
        await prisma.product.updateMany({
          where: { id: { in: products.map((p) => p.id) } },
          data: { isFeatured: false, updatedById: user.id },
        });
        for (const product of products) {
          await syncCountryPricing(user, product.id, { isFeatured: false });
        }
      }
    } else {
      const status = action === 'publish' ? 'PUBLISHED' : action === 'draft' ? 'DRAFT' : 'ARCHIVED';
      const publishedAt = status === 'PUBLISHED' ? new Date() : undefined;

      await prisma.product.updateMany({
        where: { id: { in: products.map((p) => p.id) } },
        data: { status, ...(publishedAt ? { publishedAt } : {}), updatedById: user.id },
      });

      // Bulk publishing publishes into the market being worked in, the same way
      // publishing one product from its row menu does.
      for (const product of products) {
        await syncCountryPricing(user, product.id, {
          status,
          ...(publishedAt ? { publishedAt } : {}),
        });
      }
    }

    await recordAudit({
      actor: user,
      action: `bulk.${action}`,
      entity: 'Product',
      summary: `${action} applied to ${products.length} product(s)`,
    });

    revalidatePath('/admin/products');
    revalidatePath('/', 'layout');
    await syncContentRoutes({ kind: 'product', ids }, actorOf(user), 'bulk');
    return success(undefined, `${products.length} product(s) updated.`);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export async function saveBrand(
  brandId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.edit');
    const input = brandSchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      websiteUrl: formData.get('websiteUrl'),
      sortOrder: formData.get('sortOrder') || 0,
      logoId: formData.get('logoId'),
    });

    const slug =
      brandId === null
        ? await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
            const existing = await prisma.brand.findUnique({
              where: { slug: candidate },
              select: { id: true },
            });
            return Boolean(existing);
          })
        : input.slug;

    if (brandId) {
      const clash = await prisma.brand.findFirst({
        where: { slug, id: { not: brandId } },
        select: { id: true },
      });
      if (clash) return failure('Another brand already uses that URL.', { slug: ['This URL is taken'] });
    }

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      websiteUrl: input.websiteUrl,
      sortOrder: input.sortOrder,
      logoId: input.logoId,
    };

    const brand = brandId
      ? await prisma.brand.update({ where: { id: brandId }, data })
      : await prisma.brand.create({ data });

    // Carried in the market it was created in, and given a page to send
    // people to. See `saveProductCategory`.
    let generatedPage: string | null = null;
    if (!brandId) {
      const scope = await scopeForUser(user);
      await offerIn('BRAND', [brand.id], scope.country.id);

      const page = await ensureTaxonomyPage(
        {
          kind: 'brand',
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          description: brand.description,
          imageId: brand.logoId,
        },
        scope.country.id,
        user.id,
      );
      generatedPage = page.created ? page.slug : null;
    }

    await recordAudit({
      actor: user,
      action: brandId ? 'updated' : 'created',
      entity: 'Brand',
      entityId: brand.id,
      summary: `${brandId ? 'Updated' : 'Created'} brand “${brand.name}”`,
    });

    revalidatePath('/admin/products/brands');
    revalidatePath('/admin/products');
    revalidatePath('/admin/pages');
    revalidatePath('/', 'layout');
    await syncContentRoutes({ kind: 'page' }, actorOf(user), 'renamed');
    return success(
      { id: brand.id },
      generatedPage ? `Brand saved, with a page at /${generatedPage}.` : 'Brand saved.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Stops **one market** carrying a brand. See `deleteProductCategory` — same
 * reasoning, same shape: a brand is one identity shared by every market, so
 * what a country screen removes is that market's availability row.
 */
export async function deleteBrand(brandId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.delete');
    const scope = await scopeForUser(user);
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) return failure('That brand no longer exists.');

    const outcome = await removeFrom('BRAND', brandId, scope.country.id, {
      /*
       * No market carries it any more, so the shared row is retired — marked
       * deleted and parked under a freed slug, not destroyed. It waits in the
       * recycle bin, the products pointing at it keep pointing at it, and the
       * URL it had is available again immediately.
       */
      retireWhenUnused: async (tx) => {
        await tx.brand.update({
          where: { id: brandId },
          data: { deletedAt: new Date(), slug: `${brand.slug}-deleted-${Date.now()}` },
        });
      },
    });

    if (!outcome.removed && !outcome.retired) {
      return failure(`${scope.country.name} does not carry that brand.`);
    }

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Brand',
      entityId: brandId,
      summary: outcome.retired
        ? `Removed brand “${brand.name}” from ${scope.country.name}; no market carried it, so it went to the recycle bin`
        : `Removed brand “${brand.name}” from ${scope.country.name} (${outcome.remaining} other market(s) keep it)`,
    });

    revalidatePath('/admin/products/brands');
    revalidatePath('/admin/products');
    revalidatePath('/', 'layout');
    await syncContentRoutes({ kind: 'page' }, actorOf(user), 'renamed');
    return success(
      undefined,
      outcome.retired
        ? `Brand removed. No other market carried it, so it is in the recycle bin${
            brand._count.products > 0 ? `, with its ${brand._count.products} product(s)` : ''
          }.`
        : `Removed from ${scope.country.name}. ${outcome.remaining} other market(s) still carry it.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
