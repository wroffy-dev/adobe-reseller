'use server';

import { prisma } from '@/lib/db/prisma';
import { getCurrentUser, userCan } from '@/lib/auth/guards';
import { scopeForUser } from '@/lib/country/admin';

export type PickerOption = { value: string; label: string; hint?: string | null };

/**
 * Product options for CMS block pickers. Requires products.view.
 *
 * Scoped to the market the admin is working in: a block on a UAE page can only
 * hand-pick products the UAE actually sells, because one it does not sell would
 * render as nothing on the published page.
 */
export async function listProductOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!user || !userCan(user, 'products.view')) return [];
  const scope = await scopeForUser(user);

  const rows = await prisma.productCountry.findMany({
    where: { countryId: scope.country.id, deletedAt: null, product: { deletedAt: null } },
    orderBy: [{ sortOrder: 'asc' }, { product: { name: 'asc' } }],
    take: 200,
    select: {
      status: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  });
  return rows.map((row) => ({
    value: row.product.id,
    label: row.product.name,
    hint: [row.product.sku, row.status.toLowerCase()].filter(Boolean).join(' · '),
  }));
}

export type ProductImportRow = { productId: string; name: string };

/**
 * Every product the admin's market carries, in its catalogue order — what the
 * Product Showcase's "Add all products" button fills the grid with. Requires
 * products.view, like every product picker.
 *
 * Only the id and name are copied into the section: the image and the link are
 * read from the product when the page renders, so they stay current.
 */
export async function listProductsForImport(): Promise<ProductImportRow[]> {
  const user = await getCurrentUser();
  if (!user || !userCan(user, 'products.view')) return [];
  const scope = await scopeForUser(user);

  const rows = await prisma.productCountry.findMany({
    where: { countryId: scope.country.id, deletedAt: null, product: { deletedAt: null } },
    orderBy: [{ sortOrder: 'asc' }, { product: { name: 'asc' } }],
    take: 200,
    select: { product: { select: { id: true, name: true } } },
  });
  return rows.map((row) => ({ productId: row.product.id, name: row.product.name }));
}

export async function listFormOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!userCan(user, 'forms.view') && !userCan(user, 'pages.edit')) return [];

  const rows = await prisma.form.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    take: 100,
    select: { slug: true, name: true, isActive: true },
  });
  return rows.map((row) => ({
    value: row.slug,
    label: row.name,
    hint: row.isActive ? null : 'inactive',
  }));
}

export async function listProductCategoryOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  // A page editor needs these to configure a product section, even without
  // full product permissions.
  if (!userCan(user, 'products.view') && !userCan(user, 'pages.edit')) return [];
  const rows = await prisma.productCategory.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
  return rows.map((row) => ({ value: row.id, label: row.name }));
}

/** Brand options for the product grid and the product editor. */
export async function listBrandOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!userCan(user, 'products.view') && !userCan(user, 'pages.edit')) return [];
  const rows = await prisma.brand.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, _count: { select: { products: true } } },
  });
  return rows.map((row) => ({
    value: row.id,
    label: row.name,
    hint: `${row._count.products} product${row._count.products === 1 ? '' : 's'}`,
  }));
}

/**
 * Blog pickers.
 *
 * Same contract as the product ones: a viewer without blog access gets an
 * empty list rather than a leak, and a page editor gets the options they need
 * to configure a blog section without being handed blog-editing rights.
 */
function canPickBlog(user: Awaited<ReturnType<typeof getCurrentUser>>): boolean {
  return userCan(user, 'blog.view') || userCan(user, 'pages.edit');
}

export async function listBlogCategoryOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!canPickBlog(user)) return [];

  const rows = await prisma.blogCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 200,
    select: { id: true, name: true, isActive: true, parent: { select: { name: true } } },
  });
  return rows.map((row) => ({
    value: row.id,
    label: row.parent ? `${row.parent.name} → ${row.name}` : row.name,
    hint: row.isActive ? null : 'hidden',
  }));
}

export async function listBlogTagOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!canPickBlog(user)) return [];

  const rows = await prisma.blogTag.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 300,
    select: { id: true, name: true, isActive: true, _count: { select: { posts: true } } },
  });
  return rows.map((row) => ({
    value: row.id,
    label: row.name,
    hint: row.isActive ? `${row._count.posts} post${row._count.posts === 1 ? '' : 's'}` : 'hidden',
  }));
}

export async function listBlogPostOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!user || !canPickBlog(user)) return [];
  // The current market's articles only: a hand-picked article from another
  // market would never appear on the published page.
  const scope = await scopeForUser(user);

  const rows = await prisma.blogPost.findMany({
    where: { deletedAt: null, countryId: scope.country.id },
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
    select: { id: true, title: true, status: true, category: { select: { name: true } } },
  });
  return rows.map((row) => ({
    value: row.id,
    label: row.title,
    hint: [row.category?.name, row.status === 'PUBLISHED' ? null : row.status.toLowerCase()]
      .filter(Boolean)
      .join(' · ') || null,
  }));
}

/** Staff who can be credited as an author. */
export async function listAuthorOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!canPickBlog(user)) return [];

  const rows = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    take: 200,
    select: { id: true, name: true, jobTitle: true },
  });
  return rows.map((row) => ({ value: row.id, label: row.name, hint: row.jobTitle }));
}
