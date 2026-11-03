'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

const optional = (max: number, pattern?: RegExp, message?: string) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !pattern || pattern.test(v), message ?? 'That ID is not in the expected format');

/**
 * Vendor IDs are validated to their documented shapes. The renderer applies the
 * same patterns again, so a malformed value can never reach a script tag.
 */
/** Google IDs are upper-case; store them that way whatever was typed. */
const upper = (v: string | null) => (v ? v.toUpperCase() : v);

const trackingSchema = z.object({
  ga4Id: optional(40, /^G-[A-Z0-9]{4,20}$/i, 'Google Analytics IDs look like G-XXXXXXX').transform(upper),
  ga4Enabled: z.coerce.boolean().default(false),
  gtmId: optional(40, /^GTM-[A-Z0-9]{4,20}$/i, 'Tag Manager IDs look like GTM-XXXXXX').transform(upper),
  gtmEnabled: z.coerce.boolean().default(false),
  googleAdsId: optional(40, /^AW-[0-9]{6,20}$/i, 'Google Ads IDs look like AW-123456789').transform(upper),
  googleAdsEnabled: z.coerce.boolean().default(false),
  googleAdsConversionLabel: optional(80),
  metaPixelId: optional(40, /^[0-9]{6,25}$/, 'Meta pixel IDs are numeric'),
  metaPixelEnabled: z.coerce.boolean().default(false),
  microsoftUetId: optional(40, /^[0-9]{6,25}$/, 'UET tag IDs are numeric'),
  microsoftUetEnabled: z.coerce.boolean().default(false),
  hotjarId: optional(40, /^[0-9]{6,25}$/, 'Hotjar site IDs are numeric'),
  hotjarEnabled: z.coerce.boolean().default(false),
  linkedinPartnerId: optional(40, /^[0-9]{6,25}$/, 'LinkedIn partner IDs are numeric'),
  linkedinEnabled: z.coerce.boolean().default(false),
  tiktokPixelId: optional(40, /^[A-Za-z0-9_-]{4,40}$/, 'TikTok pixel IDs are letters and numbers'),
  tiktokEnabled: z.coerce.boolean().default(false),
  consentRequired: z.coerce.boolean().default(false),
  consentMessage: optional(500),
});

export async function saveTrackingSettings(formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('marketing.manage');
    const raw = Object.fromEntries(formData.entries()) as Record<string, string>;

    const booleans = [
      'ga4Enabled', 'gtmEnabled', 'googleAdsEnabled', 'metaPixelEnabled',
      'microsoftUetEnabled', 'hotjarEnabled', 'linkedinEnabled', 'tiktokEnabled',
      'consentRequired',
    ];
    const input = trackingSchema.parse({
      ...raw,
      ...Object.fromEntries(booleans.map((key) => [key, raw[key] === 'true'])),
    });

    // Enabling a tag without its ID silently does nothing, so catch it here.
    const missing: string[] = [];
    if (input.ga4Enabled && !input.ga4Id) missing.push('Google Analytics');
    if (input.gtmEnabled && !input.gtmId) missing.push('Tag Manager');
    if (input.googleAdsEnabled && !input.googleAdsId) missing.push('Google Ads');
    if (input.metaPixelEnabled && !input.metaPixelId) missing.push('Meta Pixel');
    if (input.microsoftUetEnabled && !input.microsoftUetId) missing.push('Microsoft UET');
    if (input.hotjarEnabled && !input.hotjarId) missing.push('Hotjar');
    if (input.linkedinEnabled && !input.linkedinPartnerId) missing.push('LinkedIn');
    if (input.tiktokEnabled && !input.tiktokPixelId) missing.push('TikTok');
    if (missing.length > 0) {
      return failure(`Add an ID before enabling: ${missing.join(', ')}.`);
    }

    await prisma.trackingSettings.upsert({
      where: { id: 'singleton' },
      update: { ...input, consentMessage: input.consentMessage ? sanitizeText(input.consentMessage) : null },
      create: {
        id: 'singleton',
        ...input,
        consentMessage: input.consentMessage ? sanitizeText(input.consentMessage) : null,
      },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'TrackingSettings',
      summary: 'Updated marketing and tracking settings',
    });

    revalidatePath('/', 'layout');
    return success(undefined, 'Tracking settings saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const scriptSchema = z.object({
  name: z.string().trim().min(1, 'Give the script a name').max(120),
  placement: z.enum(['HEAD', 'BODY_START', 'BODY_END']).default('HEAD'),
  environment: z.enum(['ALL', 'PRODUCTION', 'DEVELOPMENT']).default('ALL'),
  isActive: z.coerce.boolean().default(false),
  requiresConsent: z.coerce.boolean().default(true),
  code: z.string().trim().min(1, 'Paste the script body').max(20_000),
});

/**
 * Custom scripts are the one place arbitrary JavaScript can enter the site.
 * They require marketing.manage, are audited with the full body, and are never
 * reachable from ordinary CMS content fields.
 */
export async function saveTrackingScript(
  scriptId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('marketing.manage');
    const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
    const input = scriptSchema.parse({
      ...raw,
      isActive: raw.isActive === 'true',
      requiresConsent: raw.requiresConsent === 'true',
    });

    // The renderer wraps the body in a script tag, so a pasted tag would nest.
    const code = input.code.replace(/<\/?script[^>]*>/gi, '').trim();
    if (!code) return failure('That script had no body once the <script> tags were removed.');

    const data = { ...input, code };
    const script = scriptId
      ? await prisma.trackingScript.update({ where: { id: scriptId }, data })
      : await prisma.trackingScript.create({ data });

    await recordAudit({
      actor: user,
      action: scriptId ? 'updated' : 'created',
      entity: 'TrackingScript',
      entityId: script.id,
      summary: `${scriptId ? 'Updated' : 'Added'} custom script “${script.name}” (${script.placement})`,
      after: { name: script.name, placement: script.placement, isActive: script.isActive, code },
    });

    revalidatePath('/admin/marketing');
    revalidatePath('/', 'layout');
    return success({ id: script.id }, 'Script saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteTrackingScript(scriptId: string): Promise<ActionResult> {
  try {
    const user = await authorize('marketing.manage');
    const script = await prisma.trackingScript.findUnique({ where: { id: scriptId } });
    if (!script) return failure('That script no longer exists.');

    await prisma.trackingScript.delete({ where: { id: scriptId } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'TrackingScript',
      entityId: scriptId,
      summary: `Removed custom script “${script.name}”`,
      before: { name: script.name, code: script.code },
    });

    revalidatePath('/admin/marketing');
    revalidatePath('/', 'layout');
    return success(undefined, 'Script deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleTrackingScript(scriptId: string): Promise<ActionResult> {
  try {
    const user = await authorize('marketing.manage');
    const script = await prisma.trackingScript.findUnique({ where: { id: scriptId } });
    if (!script) return failure('That script no longer exists.');

    await prisma.trackingScript.update({
      where: { id: scriptId },
      data: { isActive: !script.isActive },
    });

    await recordAudit({
      actor: user,
      action: script.isActive ? 'disabled' : 'enabled',
      entity: 'TrackingScript',
      entityId: scriptId,
      summary: `${script.isActive ? 'Disabled' : 'Enabled'} custom script “${script.name}”`,
    });

    revalidatePath('/admin/marketing');
    revalidatePath('/', 'layout');
    return success(undefined, script.isActive ? 'Script disabled.' : 'Script enabled.');
  } catch (error) {
    return toActionError(error);
  }
}
