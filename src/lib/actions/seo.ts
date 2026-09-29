'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize, type SessionUser } from '@/lib/auth/guards';
import { getUserCountryIds } from '@/lib/country/access';
import { actorOf } from '@/lib/urls/registry';
import {
  UrlManagerError,
  deleteRedirect as removeRedirect,
  saveRedirect as saveRedirectWithRules,
  setRedirectActive,
} from '@/lib/urls/manager';
import { recordAudit } from '@/lib/services/audit';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const seoSettingsSchema = z.object({
  defaultTitle: z.string().trim().min(1, 'A default title is required').max(240),
  titleTemplate: z.string().trim().min(1).max(120),
  defaultDescription: z.string().trim().max(400),
  defaultOgImageUrl: optional(500),
  twitterHandle: optional(60),
  organizationName: z.string().trim().min(1).max(160),
  organizationLogoUrl: optional(500),
  organizationType: z.string().trim().max(60).default('Organization'),
  googleSiteVerification: optional(200),
  bingSiteVerification: optional(200),
  robotsTxtExtra: optional(2000),
  sitemapEnabled: z.coerce.boolean().default(true),
  noIndexSite: z.coerce.boolean().default(false),
});

export async function saveSeoSettings(formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('seo.manage');
    const input = seoSettingsSchema.parse({
      defaultTitle: formData.get('defaultTitle'),
      titleTemplate: formData.get('titleTemplate'),
      defaultDescription: formData.get('defaultDescription') ?? '',
      defaultOgImageUrl: formData.get('defaultOgImageUrl'),
      twitterHandle: formData.get('twitterHandle'),
      organizationName: formData.get('organizationName'),
      organizationLogoUrl: formData.get('organizationLogoUrl'),
      organizationType: formData.get('organizationType') || 'Organization',
      googleSiteVerification: formData.get('googleSiteVerification'),
      bingSiteVerification: formData.get('bingSiteVerification'),
      robotsTxtExtra: formData.get('robotsTxtExtra'),
      sitemapEnabled: formData.get('sitemapEnabled') === 'true',
      noIndexSite: formData.get('noIndexSite') === 'true',
    });

    if (!input.titleTemplate.includes('%s')) {
      return failure('The title template must contain %s — the page title goes there.', {
        titleTemplate: ['Include %s, for example "%s | Acme"'],
      });
    }

    await prisma.seoSettings.upsert({
      where: { id: 'singleton' },
      update: {
        ...input,
        defaultTitle: sanitizeText(input.defaultTitle),
        defaultDescription: sanitizeText(input.defaultDescription),
        organizationName: sanitizeText(input.organizationName),
      },
      create: {
        id: 'singleton',
        ...input,
        defaultTitle: sanitizeText(input.defaultTitle),
        defaultDescription: sanitizeText(input.defaultDescription),
        organizationName: sanitizeText(input.organizationName),
      },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'SeoSettings',
      summary: 'Updated global SEO settings',
    });

    // Metadata, robots and the sitemap all read these values.
    revalidatePath('/', 'layout');
    revalidatePath('/robots.txt');
    revalidatePath('/sitemap.xml');
    return success(undefined, 'SEO settings saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const redirectSchema = z.object({
  source: z
    .string()
    .trim()
    .min(1, 'Enter the old path')
    .max(500)
    .transform((v) => (v.startsWith('/') || /^https?:\/\//i.test(v) ? v : `/${v}`)),
  destination: z
    .string()
    .trim()
    .min(1, 'Enter the new path')
    .max(500)
    .transform((v) => (v.startsWith('/') || /^https?:\/\//i.test(v) ? v : `/${v}`)),
  type: z.enum(['PERMANENT', 'TEMPORARY']).default('PERMANENT'),
  isActive: z.coerce.boolean().default(true),
  note: optional(200),
});

/*
 * The classic Redirects screen writes through the same service as the Slug &
 * URL Manager, so both apply one set of rules: no redirect over a live page,
 * no duplicate source, no loop, no chain, market access enforced.
 */
async function allowedCountries(user: SessionUser): Promise<string[] | null> {
  if (user.role === 'super-admin') return null;
  const assigned = await getUserCountryIds(user.id);
  return assigned.length ? assigned : null;
}

function managerFailure(error: unknown): ActionResult<never> {
  if (error instanceof UrlManagerError) return failure(error.message, { source: [error.message] });
  return toActionError(error);
}

export async function saveRedirect(
  redirectId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('seo.manage');
    const input = redirectSchema.parse({
      source: formData.get('source'),
      destination: formData.get('destination'),
      type: formData.get('type') || 'PERMANENT',
      isActive: formData.get('isActive') !== 'false',
      note: formData.get('note'),
    });
    const saved = await saveRedirectWithRules(
      { id: redirectId, ...input, note: input.note ?? null },
      actorOf(user),
      await allowedCountries(user),
    );

    await recordAudit({
      actor: user,
      action: redirectId ? 'updated' : 'created',
      entity: 'Redirect',
      entityId: saved.id,
      summary: `${input.source} → ${saved.destination}`,
    });

    revalidatePath('/admin/redirects');
    revalidatePath('/admin/slug-manager');
    return success({ id: saved.id }, 'Redirect saved.');
  } catch (error) {
    return managerFailure(error);
  }
}

export async function toggleRedirect(redirectId: string): Promise<ActionResult> {
  try {
    const user = await authorize('seo.manage');
    const redirect = await prisma.redirect.findUnique({ where: { id: redirectId } });
    if (!redirect) return failure('That redirect no longer exists.');

    await setRedirectActive(redirectId, !redirect.isActive, await allowedCountries(user));
    revalidatePath('/admin/redirects');
    return success(undefined, redirect.isActive ? 'Redirect disabled.' : 'Redirect enabled.');
  } catch (error) {
    return managerFailure(error);
  }
}

export async function deleteRedirect(redirectId: string): Promise<ActionResult> {
  try {
    const user = await authorize('seo.manage');
    const redirect = await removeRedirect(redirectId, await allowedCountries(user));

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Redirect',
      entityId: redirectId,
      summary: `Removed ${redirect.source} → ${redirect.destination}`,
    });

    revalidatePath('/admin/redirects');
    return success(undefined, 'Redirect deleted.');
  } catch (error) {
    return managerFailure(error);
  }
}
