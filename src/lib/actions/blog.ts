'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { canSetParent } from '@/lib/utils/tree';
import { blogPostSchema, blogCategorySchema } from '@/lib/validation/blog';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { sectionCopy } from '@/lib/cms/section-copy';
import { sanitizeHtml, sanitizeText } from '@/lib/utils/sanitize';
import { readingTimeMinutes, plainExcerpt } from '@/lib/utils/format';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { resolveActionCountry } from '@/lib/country/admin';
import { assertCountryAccess } from '@/lib/country/access';
import { getCountryById, listActiveCountries } from '@/lib/country/registry';
import { revalidateCountryBlog, revalidateAllCountryBlogs } from '@/lib/country/revalidate';
import { syncContentRoutes, checkSlugAvailability, isAddressTaken, actorOf } from '@/lib/urls/registry';

/** Revalidates a market's blog surfaces. */
async function revalidatePost(countryId: string, slug?: string | null) {
  const country = await getCountryById(countryId);
  if (!country) return;
  revalidateCountryBlog(country, slug ?? null);
}

function readPostForm(formData: FormData) {
  const parseJson = <T>(key: string, fallback: T): T => {
    const raw = formData.get(key);
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  return blogPostSchema.parse({
    title: formData.get('title'),
    slug: formData.get('slug') || String(formData.get('title') ?? ''),
    subtitle: formData.get('subtitle'),
    status: formData.get('status') || 'DRAFT',
    publishedAt: formData.get('publishedAt') || null,
    excerpt: formData.get('excerpt'),
    content: formData.get('content') ?? '',
    isFeatured: formData.get('isFeatured') === 'true',
    featuredPriority: formData.get('featuredPriority') || 0,
    featuredImageId: formData.get('featuredImageId'),
    thumbnailId: formData.get('thumbnailId'),
    categoryId: formData.get('categoryId'),
    authorId: formData.get('authorId'),
    tags: parseJson<string[]>('tags', []),
    relatedIds: parseJson<string[]>('relatedIds', []),
    options: parseJson<Record<string, unknown>>('options', {}),
    sidebarMode: formData.get('sidebarMode') || 'GLOBAL',
    seoTitle: formData.get('seoTitle'),
    seoDescription: formData.get('seoDescription'),
    focusKeyword: formData.get('focusKeyword'),
    canonicalUrl: formData.get('canonicalUrl'),
    noIndex: formData.get('noIndex') === 'true',
    noFollow: formData.get('noFollow') === 'true',
    ogTitle: formData.get('ogTitle'),
    ogDescription: formData.get('ogDescription'),
    ogImageId: formData.get('ogImageId'),
    twitterImageId: formData.get('twitterImageId'),
  });
}

/** Resolves tag names to ids, creating any that do not exist yet. */
async function resolveTagIds(names: string[]): Promise<string[]> {
  const cleaned = Array.from(
    new Set(names.map((name) => sanitizeText(name).trim()).filter(Boolean)),
  ).slice(0, 20);
  const ids: string[] = [];

  for (const name of cleaned) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.blogTag.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
    ids.push(tag.id);
  }
  return ids;
}

export async function createBlogPost(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('blog.create');
    const input = readPostForm(formData);
    if (input.status === 'PUBLISHED') await authorize('blog.publish');

    // The market comes from the admin's current selection unless the form names
    // one, and is validated against the user's market access either way.
    const country = await resolveActionCountry(user, formData.get('countryId')?.toString() || null);

    // Article slugs are unique per market, so the same guide can exist in both.
    const slug = await uniqueSlug(input.slug || slugify(input.title), async (candidate) => {
      const existing = await prisma.blogPost.findUnique({
        where: { countryId_slug: { countryId: country.id, slug: candidate } },
        select: { id: true },
      });
      return Boolean(existing) || (await isAddressTaken({ kind: 'post', slug: candidate }));
    });

    const content = sanitizeHtml(input.content);
    const tagIds = await resolveTagIds(input.tags);

    const post = await prisma.blogPost.create({
      data: {
        countryId: country.id,
        title: sanitizeText(input.title),
        slug,
        status: input.status,
        publishedAt:
          input.status === 'PUBLISHED' ? (input.publishedAt ?? new Date()) : input.publishedAt,
        subtitle: input.subtitle ? sanitizeText(input.subtitle) : null,
        excerpt: input.excerpt ? sanitizeText(input.excerpt) : plainExcerpt(content, 200) || null,
        content,
        readingTime: readingTimeMinutes(content),
        isFeatured: input.isFeatured,
        featuredPriority: input.featuredPriority,
        featuredImageId: input.featuredImageId,
        thumbnailId: input.thumbnailId,
        categoryId: input.categoryId,
        authorId: input.authorId ?? user.id,
        options: input.options as unknown as object,
        sidebarMode: input.sidebarMode,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        focusKeyword: input.focusKeyword,
        canonicalUrl: input.canonicalUrl,
        noIndex: input.noIndex,
        noFollow: input.noFollow,
        ogTitle: input.ogTitle,
        ogDescription: input.ogDescription,
        ogImageId: input.ogImageId,
        twitterImageId: input.twitterImageId,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        relatedTo: {
          create: input.relatedIds.map((targetId, index) => ({ targetId, sortOrder: index * 10 })),
        },
      },
    });

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'BlogPost',
      entityId: post.id,
      summary: `Created post “${post.title}”`,
    });

    revalidatePath('/admin/blog');
    await revalidatePost(post.countryId, slug);
    await syncContentRoutes({ kind: 'post' }, actorOf(user), 'created');
    return success({ id: post.id }, 'Post created.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateBlogPost(postId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('blog.edit');
    const before = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!before || before.deletedAt) return failure('That post no longer exists.');

    const input = readPostForm(formData);
    if (input.status === 'PUBLISHED' && before.status !== 'PUBLISHED')
      await authorize('blog.publish');

    const slug = input.slug || before.slug;
    if (slug !== before.slug) {
      const clash = await prisma.blogPost.findFirst({
        where: { slug, countryId: before.countryId, id: { not: postId } },
        select: { id: true },
      });
      if (clash)
        return failure('Another post already uses that URL.', { slug: ['This URL is taken'] });
      const available = await checkSlugAvailability({ kind: 'post', contentId: postId, slug });
      if (!available.ok) return failure(available.message, { slug: [available.message] });
    }

    const content = sanitizeHtml(input.content);
    const tagIds = await resolveTagIds(input.tags);
    // Related posts must not include the post itself.
    const relatedIds = input.relatedIds.filter((id) => id !== postId);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.blogPostTag.deleteMany({ where: { postId } });
      await tx.blogPostRelation.deleteMany({ where: { sourceId: postId } });

      return tx.blogPost.update({
        where: { id: postId },
        data: {
          title: sanitizeText(input.title),
          slug,
          status: input.status,
          publishedAt:
            input.status === 'PUBLISHED'
              ? (input.publishedAt ?? before.publishedAt ?? new Date())
              : input.publishedAt,
          subtitle: input.subtitle ? sanitizeText(input.subtitle) : null,
          excerpt: input.excerpt ? sanitizeText(input.excerpt) : plainExcerpt(content, 200) || null,
          content,
          readingTime: readingTimeMinutes(content),
          isFeatured: input.isFeatured,
          featuredPriority: input.featuredPriority,
          featuredImageId: input.featuredImageId,
          thumbnailId: input.thumbnailId,
          categoryId: input.categoryId,
          authorId: input.authorId,
          options: input.options as unknown as object,
          sidebarMode: input.sidebarMode,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          focusKeyword: input.focusKeyword,
          canonicalUrl: input.canonicalUrl,
          noIndex: input.noIndex,
          noFollow: input.noFollow,
          ogTitle: input.ogTitle,
          ogDescription: input.ogDescription,
          ogImageId: input.ogImageId,
          twitterImageId: input.twitterImageId,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          relatedTo: {
            create: relatedIds.map((targetId, index) => ({ targetId, sortOrder: index * 10 })),
          },
        },
      });
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'BlogPost',
      entityId: postId,
      summary: `Updated post “${updated.title}”`,
      before: { status: before.status, slug: before.slug },
      after: { status: updated.status, slug: updated.slug },
    });

    revalidatePath('/admin/blog');
    revalidatePath(`/admin/blog/${postId}`);
    await revalidatePost(before.countryId, before.slug);
    if (slug !== before.slug) await revalidatePost(before.countryId, slug);
    await syncContentRoutes({ kind: 'post', ids: [postId] }, actorOf(user), 'renamed');
    return success(undefined, 'Post saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setBlogPostStatus(
  postId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
): Promise<ActionResult> {
  try {
    const user =
      status === 'PUBLISHED' ? await authorize('blog.publish') : await authorize('blog.edit');
    const post = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!post) return failure('That post no longer exists.');

    await prisma.blogPost.update({
      where: { id: postId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? (post.publishedAt ?? new Date()) : post.publishedAt,
      },
    });

    await recordAudit({
      actor: user,
      action: status.toLowerCase(),
      entity: 'BlogPost',
      entityId: postId,
      summary: `Set “${post.title}” to ${status.toLowerCase()}`,
    });

    revalidatePath('/admin/blog');
    await revalidatePost(post.countryId, post.slug);
    await syncContentRoutes({ kind: 'post' }, actorOf(user), 'renamed');
    return success(undefined, `Post ${status.toLowerCase()}.`);
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Copies an article into another market.
 *
 * The copy keeps the source's slug, so `/blog/x` and `/ae/blog/x` are the same
 * article told for two audiences and hreflang can pair them. It is always a
 * DRAFT and never featured: a duplicated article must be reviewed and localised
 * before it can appear in search results next to the original.
 *
 * An article already at that URL in the target market is never overwritten
 * silently — the action refuses and says so, and replaces it only when the
 * caller comes back having confirmed it.
 */
export async function duplicateBlogPostToCountry(
  postId: string,
  targetCountryId: string,
  options: { replaceExisting?: boolean } = {},
): Promise<ActionResult<{ id: string; replaced: boolean }>> {
  try {
    const user = await authorize('blog.create');

    const source = await prisma.blogPost.findUnique({
      where: { id: postId },
      include: { tags: true, sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source || source.deletedAt) return failure('That post no longer exists.');
    await assertCountryAccess(user, source.countryId);

    const target = await resolveActionCountry(user, targetCountryId);
    if (target.id === source.countryId) {
      return failure('That article already belongs to this country.');
    }

    const existing = await prisma.blogPost.findUnique({
      where: { countryId_slug: { countryId: target.id, slug: source.slug } },
      select: { id: true, title: true, deletedAt: true },
    });

    if (existing && !existing.deletedAt && !options.replaceExisting) {
      return failure(
        `${target.name} already has an article at /blog/${source.slug} (“${existing.title}”). Confirm to replace it.`,
        { _confirm: ['exists'] },
      );
    }

    const shared = {
      title: source.title,
      subtitle: source.subtitle,
      status: 'DRAFT' as const,
      publishedAt: null,
      excerpt: source.excerpt,
      content: source.content,
      readingTime: source.readingTime,
      isFeatured: false,
      featuredPriority: source.featuredPriority,
      featuredImageId: source.featuredImageId,
      thumbnailId: source.thumbnailId,
      categoryId: source.categoryId,
      authorId: user.id,
      options: source.options as object,
      sidebarMode: source.sidebarMode,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      focusKeyword: source.focusKeyword,
      // Not copied on purpose: a market canonicals to its own URL.
      canonicalUrl: null,
      noIndex: source.noIndex,
      noFollow: source.noFollow,
      ogTitle: source.ogTitle,
      ogDescription: source.ogDescription,
      ogImageId: source.ogImageId,
      twitterImageId: source.twitterImageId,
    };

    const sectionData = source.sections.map((section) => ({
      ...sectionCopy(section),
      surface: section.surface,
    }));

    const copy = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.blogPostTag.deleteMany({ where: { postId: existing.id } });
        await tx.blogSection.deleteMany({ where: { postId: existing.id } });
        return tx.blogPost.update({
          where: { id: existing.id },
          data: {
            ...shared,
            slug: source.slug,
            deletedAt: null,
            tags: { create: source.tags.map((tag) => ({ tagId: tag.tagId })) },
            sections: { create: sectionData },
          },
        });
      }
      return tx.blogPost.create({
        data: {
          ...shared,
          countryId: target.id,
          slug: source.slug,
          tags: { create: source.tags.map((tag) => ({ tagId: tag.tagId })) },
          sections: { create: sectionData },
        },
      });
    });

    await recordAudit({
      actor: user,
      action: existing ? 'duplicated.replaced' : 'duplicated.country',
      entity: 'BlogPost',
      entityId: copy.id,
      summary: `Copied “${source.title}” to ${target.name} as a draft`,
      after: { slug: copy.slug, country: target.code, status: copy.status },
    });

    revalidatePath('/admin/blog');
    await revalidatePost(target.id, copy.slug);
    await syncContentRoutes({ kind: 'post' }, actorOf(user), 'created');
    return success(
      { id: copy.id, replaced: Boolean(existing) },
      `Copied to ${target.name} as a draft.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateBlogPost(postId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('blog.create');
    const source = await prisma.blogPost.findUnique({
      where: { id: postId },
      include: { tags: true, sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) return failure('That post no longer exists.');
    await assertCountryAccess(user, source.countryId);

    const slug = await uniqueSlug(`${source.slug}-copy`, async (candidate) => {
      const existing = await prisma.blogPost.findUnique({
        where: { countryId_slug: { countryId: source.countryId, slug: candidate } },
        select: { id: true },
      });
      return Boolean(existing) || (await isAddressTaken({ kind: 'post', slug: candidate }));
    });

    const copy = await prisma.blogPost.create({
      data: {
        countryId: source.countryId,
        title: `${source.title} (copy)`,
        slug,
        status: 'DRAFT',
        subtitle: source.subtitle,
        excerpt: source.excerpt,
        content: source.content,
        readingTime: source.readingTime,
        // A copy is never featured: two articles sharing the featured slot is
        // never what duplicating was for.
        isFeatured: false,
        featuredPriority: source.featuredPriority,
        featuredImageId: source.featuredImageId,
        thumbnailId: source.thumbnailId,
        categoryId: source.categoryId,
        authorId: user.id,
        options: source.options as object,
        sidebarMode: source.sidebarMode,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        focusKeyword: source.focusKeyword,
        noIndex: source.noIndex,
        noFollow: source.noFollow,
        ogTitle: source.ogTitle,
        ogDescription: source.ogDescription,
        ogImageId: source.ogImageId,
        twitterImageId: source.twitterImageId,
        tags: { create: source.tags.map((t) => ({ tagId: t.tagId })) },
        // A post that overrides its own sidebar keeps that override; a post
        // that uses the blog-wide set has no rows and goes on using it.
        sections: {
          create: source.sections.map((section) => ({
            ...sectionCopy(section),
            surface: section.surface,
          })),
        },
      },
    });

    await recordAudit({
      actor: user,
      action: 'duplicated',
      entity: 'BlogPost',
      entityId: copy.id,
      summary: `Duplicated post “${source.title}”`,
    });

    revalidatePath('/admin/blog');
    await syncContentRoutes({ kind: 'post' }, actorOf(user), 'created');
    return success({ id: copy.id }, 'Post duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBlogPost(postId: string): Promise<ActionResult> {
  try {
    const user = await authorize('blog.delete');
    const post = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!post) return failure('That post no longer exists.');

    await prisma.blogPost.update({
      where: { id: postId },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        slug: `${post.slug}-deleted-${Date.now()}`,
        isFeatured: false,
      },
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'BlogPost',
      entityId: postId,
      summary: `Deleted post “${post.title}”`,
    });

    revalidatePath('/admin/blog');
    await revalidatePost(post.countryId, post.slug);
    await syncContentRoutes({ kind: 'post', ids: [postId] }, actorOf(user), 'deleted');
    return success(undefined, 'Post deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveBlogCategory(
  categoryId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('blog.edit');
    const input = blogCategorySchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      parentId: formData.get('parentId'),
      sortOrder: formData.get('sortOrder') || 0,
      isActive: formData.get('isActive') !== 'false',
      imageId: formData.get('imageId'),
      bannerImageId: formData.get('bannerImageId'),
      archiveTitle: formData.get('archiveTitle'),
      archiveDescription: formData.get('archiveDescription'),
      seoTitle: formData.get('seoTitle'),
      seoDescription: formData.get('seoDescription'),
      canonicalUrl: formData.get('canonicalUrl'),
      ogTitle: formData.get('ogTitle'),
      ogDescription: formData.get('ogDescription'),
      ogImageId: formData.get('ogImageId'),
      noIndex: formData.get('noIndex') === 'true',
      noFollow: formData.get('noFollow') === 'true',
    });

    // A category may not sit inside itself or inside one of its own children;
    // a cycle would make the tree and breadcrumb reads loop forever.
    const parentCheck = canSetParent(
      await prisma.blogCategory.findMany({ select: { id: true, parentId: true } }),
      categoryId,
      input.parentId,
      {
        self: 'A category cannot be its own parent.',
        cycle: 'That would place a category inside one of its own subcategories.',
        missing: 'That parent category no longer exists.',
      },
    );
    if (!parentCheck.ok) return failure(parentCheck.error);

    const slug =
      categoryId === null
        ? await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
            const existing = await prisma.blogCategory.findUnique({
              where: { slug: candidate },
              select: { id: true },
            });
            return Boolean(existing) || (await isAddressTaken({ kind: 'blogCategory', slug: candidate }));
          })
        : input.slug;

    if (categoryId !== null) {
      const available = await checkSlugAvailability({ kind: 'blogCategory', contentId: categoryId, slug });
      if (!available.ok) return failure(available.message, { slug: [available.message] });
    }

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      parentId: input.parentId,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      imageId: input.imageId,
      bannerImageId: input.bannerImageId,
      archiveTitle: input.archiveTitle,
      archiveDescription: input.archiveDescription,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      canonicalUrl: input.canonicalUrl,
      ogTitle: input.ogTitle,
      ogDescription: input.ogDescription,
      ogImageId: input.ogImageId,
      noIndex: input.noIndex,
      noFollow: input.noFollow,
    };

    const category = categoryId
      ? await prisma.blogCategory.update({ where: { id: categoryId }, data })
      : await prisma.blogCategory.create({ data });

    await recordAudit({
      actor: user,
      action: categoryId ? 'updated' : 'created',
      entity: 'BlogCategory',
      entityId: category.id,
      summary: `${categoryId ? 'Updated' : 'Created'} category “${category.name}”`,
    });

    revalidatePath('/admin/blog/categories');
    // Categories are shared by every market, so every blog is affected.
    await revalidateAllCountryBlogs();
    await syncContentRoutes({ kind: 'blogCategory' }, actorOf(user), 'renamed');
    return success({ id: category.id }, 'Category saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBlogCategory(categoryId: string): Promise<ActionResult> {
  try {
    const user = await authorize('blog.delete');
    const category = await prisma.blogCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { posts: true, children: true } } },
    });
    if (!category) return failure('That category no longer exists.');

    await prisma.$transaction(async (tx) => {
      // Subcategories rise to the deleted category's own parent rather than
      // being orphaned at the root — the hierarchy stays meaningful.
      await tx.blogCategory.updateMany({
        where: { parentId: categoryId },
        data: { parentId: category.parentId },
      });
      await tx.blogCategory.delete({ where: { id: categoryId } });
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'BlogCategory',
      entityId: categoryId,
      summary:
        `Deleted category “${category.name}” — ${category._count.posts} post(s) uncategorised, ` +
        `${category._count.children} subcategory(ies) promoted`,
    });

    revalidatePath('/admin/blog/categories');
    // Categories are shared by every market, so every blog is affected.
    await revalidateAllCountryBlogs();
    await syncContentRoutes({ kind: 'blogCategory' }, actorOf(user), 'deleted');
    return success(
      undefined,
      category._count.posts > 0
        ? `Category deleted. ${category._count.posts} post(s) are now uncategorised.`
        : 'Category deleted.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['publish', 'draft', 'archive', 'delete']),
});

export async function bulkBlogAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action } = bulkSchema.parse(input);
    const user =
      action === 'delete'
        ? await authorize('blog.delete')
        : action === 'publish'
          ? await authorize('blog.publish')
          : await authorize('blog.edit');

    const posts = await prisma.blogPost.findMany({ where: { id: { in: ids }, deletedAt: null } });

    if (action === 'delete') {
      await prisma.$transaction(
        posts.map((post) =>
          prisma.blogPost.update({
            where: { id: post.id },
            data: {
              deletedAt: new Date(),
              status: 'ARCHIVED',
              slug: `${post.slug}-deleted-${Date.now()}`,
              isFeatured: false,
            },
          }),
        ),
      );
    } else {
      const status = action === 'publish' ? 'PUBLISHED' : action === 'draft' ? 'DRAFT' : 'ARCHIVED';
      await prisma.blogPost.updateMany({
        where: { id: { in: posts.map((p) => p.id) } },
        data: { status, ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}) },
      });
    }

    await recordAudit({
      actor: user,
      action: `bulk.${action}`,
      entity: 'BlogPost',
      summary: `${action} applied to ${posts.length} post(s)`,
    });

    revalidatePath('/admin/blog');
    for (const countryId of new Set(posts.map((post) => post.countryId))) {
      await revalidatePost(countryId);
    }
    await syncContentRoutes({ kind: 'post' }, actorOf(user), 'bulk');
    return success(undefined, `${posts.length} post(s) updated.`);
  } catch (error) {
    return toActionError(error);
  }
}
