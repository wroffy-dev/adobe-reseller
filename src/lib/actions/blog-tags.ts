'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { blogTagSchema } from '@/lib/validation/blog';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { revalidateAllCountryBlogs } from '@/lib/country/revalidate';
import { syncContentRoutes, checkSlugAvailability, isAddressTaken, actorOf } from '@/lib/urls/registry';

/**
 * Manual tag management.
 *
 * Tags are still created automatically when a post names a new one — that
 * behaviour is untouched. These actions only give an admin control over the
 * tags that already exist: renaming, fixing a slug, and clearing out ones no
 * post uses. The BlogPostTag join rows are never rewritten by a rename, so
 * every existing post keeps its tags.
 */

export async function saveBlogTag(
  tagId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('blog.edit');

    const input = blogTagSchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      isActive: formData.get('isActive') !== 'false',
      seoTitle: formData.get('seoTitle'),
      seoDescription: formData.get('seoDescription'),
      canonicalUrl: formData.get('canonicalUrl'),
      noIndex: formData.get('noIndex') === 'true',
    });

    let slug = input.slug || slugify(input.name);
    if (!slug) return failure('That name cannot be turned into a URL slug.');

    if (tagId === null) {
      slug = await uniqueSlug(slug, async (candidate) => {
        const existing = await prisma.blogTag.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return Boolean(existing) || (await isAddressTaken({ kind: 'blogTag', slug: candidate }));
      });
    } else {
      // On edit the admin chose the slug, so a clash is reported rather than
      // silently suffixed — a changed tag URL should be deliberate.
      const clash = await prisma.blogTag.findFirst({
        where: { slug, NOT: { id: tagId } },
        select: { id: true },
      });
      if (clash) return failure('Another tag already uses that URL slug.');
      const available = await checkSlugAvailability({ kind: 'blogTag', contentId: tagId, slug });
      if (!available.ok) return failure(available.message);
    }

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      isActive: input.isActive,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      canonicalUrl: input.canonicalUrl,
      noIndex: input.noIndex,
    };

    const tag = tagId
      ? await prisma.blogTag.update({ where: { id: tagId }, data })
      : await prisma.blogTag.create({ data });

    await recordAudit({
      actor: user,
      action: tagId ? 'updated' : 'created',
      entity: 'BlogTag',
      entityId: tag.id,
      summary: `${tagId ? 'Updated' : 'Created'} tag “${tag.name}”`,
    });

    revalidatePath('/admin/blog/tags');
    await revalidateAllCountryBlogs();
    await syncContentRoutes({ kind: 'blogTag' }, actorOf(user), 'renamed');
    return success({ id: tag.id }, 'Tag saved.');
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Deletes a tag. The join rows go with it, so posts simply stop carrying that
 * tag — no post is deleted or otherwise altered.
 */
export async function deleteBlogTag(tagId: string): Promise<ActionResult> {
  try {
    const user = await authorize('blog.delete');

    const tag = await prisma.blogTag.findUnique({
      where: { id: tagId },
      include: { _count: { select: { posts: true } } },
    });
    if (!tag) return failure('That tag no longer exists.');

    await prisma.$transaction(async (tx) => {
      await tx.blogPostTag.deleteMany({ where: { tagId } });
      await tx.blogTag.delete({ where: { id: tagId } });
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'BlogTag',
      entityId: tagId,
      summary: `Deleted tag “${tag.name}” (was on ${tag._count.posts} post(s))`,
    });

    revalidatePath('/admin/blog/tags');
    await revalidateAllCountryBlogs();
    await syncContentRoutes({ kind: 'blogTag' }, actorOf(user), 'deleted');
    return success(
      undefined,
      tag._count.posts > 0
        ? `Tag deleted and removed from ${tag._count.posts} post(s).`
        : 'Tag deleted.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

const bulkTagSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(['delete', 'deleteUnused']),
});

/**
 * Bulk tag cleanup.
 *
 * `deleteUnused` is the safe default the admin screen offers: it removes only
 * the tags in the selection that no post uses, so a mis-click cannot strip
 * tags off published posts.
 */
export async function bulkBlogTagAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action } = bulkTagSchema.parse(input);
    const user = await authorize('blog.delete');

    const tags = await prisma.blogTag.findMany({
      where: { id: { in: ids } },
      include: { _count: { select: { posts: true } } },
    });
    if (tags.length === 0) return failure('Those tags no longer exist.');

    const targets = action === 'deleteUnused' ? tags.filter((tag) => tag._count.posts === 0) : tags;

    if (targets.length === 0) {
      return failure('Every selected tag is still in use, so nothing was deleted.');
    }

    const targetIds = targets.map((tag) => tag.id);
    await prisma.$transaction(async (tx) => {
      await tx.blogPostTag.deleteMany({ where: { tagId: { in: targetIds } } });
      await tx.blogTag.deleteMany({ where: { id: { in: targetIds } } });
    });

    await recordAudit({
      actor: user,
      action: `bulk.${action}`,
      entity: 'BlogTag',
      summary: `${action} applied to ${targetIds.length} tag(s)`,
    });

    revalidatePath('/admin/blog/tags');
    await revalidateAllCountryBlogs();
    await syncContentRoutes({ kind: 'blogTag' }, actorOf(user), 'bulk');
    return success(undefined, `${targetIds.length} tag(s) deleted.`);
  } catch (error) {
    return toActionError(error);
  }
}
