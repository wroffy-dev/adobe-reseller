'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { authorizeSuperAdmin } from '@/lib/auth/super-admin';
import { recordAudit } from '@/lib/services/audit';
import { sendMail } from '@/lib/email/mailer';
import { sanitizeHtml, sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { quotaMessage, customEmailQuota } from '@/lib/services/platform';
import { invalidateActivitySettings, parseRecipients } from '@/lib/services/activity-notifications';

/**
 * Custom emails, and the plan that limits them.
 *
 * Staff with `emails.manage` write and send their own emails. How many may
 * exist is the plan's decision, set by the super admin and enforced here, on
 * the server, inside the same transaction that creates the email — so two
 * people saving at once can never both take the last slot.
 */

/** Serialises custom email creation so the count and the insert agree. */
const QUOTA_LOCK = 7_340_022;

const emailSchema = z.object({
  name: z.string().trim().min(1, 'Give the email a name').max(120),
  subject: z.string().trim().min(1, 'Enter a subject').max(200),
  body: z.string().max(100_000),
  isActive: z.boolean().default(true),
});

export async function saveCustomEmail(
  emailId: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('emails.manage');
    const parsed = emailSchema.parse(input);
    const body = sanitizeHtml(parsed.body);
    if (!body.replace(/<[^>]*>/g, '').trim()) return failure('Write the email first.', { body: ['Write the email first'] });
    const data = {
      name: sanitizeText(parsed.name),
      subject: sanitizeText(parsed.subject),
      body,
      isActive: parsed.isActive,
      updatedById: user.id,
    };

    if (emailId) {
      const exists = await prisma.customEmail.findUnique({ where: { id: emailId }, select: { id: true } });
      if (!exists) return failure('That email no longer exists.');
      await prisma.customEmail.update({ where: { id: emailId }, data });
      await recordAudit({ actor: user, action: 'updated', entity: 'CustomEmail', entityId: emailId, summary: `Updated custom email “${data.name}”` });
      revalidatePath('/admin/emails');
      return success({ id: emailId }, 'Email saved.');
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTA_LOCK})`;
      const [settings, used] = await Promise.all([
        tx.platformSettings.findUnique({ where: { id: 'singleton' }, select: { maxCustomEmails: true } }),
        tx.customEmail.count(),
      ]);
      const limit = settings?.maxCustomEmails ?? null;
      if (limit !== null && used >= limit) return { limit };
      return { email: await tx.customEmail.create({ data: { ...data, createdById: user.id } }) };
    });

    if (!('email' in created) || !created.email) {
      const quota = await customEmailQuota();
      return failure(quotaMessage(quota));
    }

    await recordAudit({ actor: user, action: 'created', entity: 'CustomEmail', entityId: created.email.id, summary: `Created custom email “${data.name}”` });
    revalidatePath('/admin/emails');
    return success({ id: created.email.id }, 'Email created.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCustomEmail(emailId: string): Promise<ActionResult> {
  try {
    const user = await authorize('emails.manage');
    const email = await prisma.customEmail.findUnique({ where: { id: emailId } });
    if (!email) return failure('That email no longer exists.');
    await prisma.customEmail.delete({ where: { id: emailId } });
    await recordAudit({ actor: user, action: 'deleted', entity: 'CustomEmail', entityId: emailId, summary: `Deleted custom email “${email.name}”` });
    revalidatePath('/admin/emails');
    return success(undefined, 'Email deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

const sendSchema = z.object({
  emailId: z.string().min(1),
  recipients: z.string().max(5_000),
});

const MAX_RECIPIENTS = 20;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function wrap(inner: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1b34">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e3e8f0;border-radius:12px;padding:28px;line-height:1.6">${inner}</div>
</body></html>`;
}

/**
 * Sends a custom email, one message per recipient so nobody sees anybody
 * else's address. `{{email}}` is filled per recipient, and `{{name}}` with the
 * matching lead's or customer's name when the address is known.
 */
export async function sendCustomEmail(input: unknown): Promise<ActionResult<{ sent: number; failed: string[] }>> {
  try {
    const user = await authorize('emails.manage');
    const { emailId, recipients: raw } = sendSchema.parse(input);
    const email = await prisma.customEmail.findUnique({ where: { id: emailId } });
    if (!email) return failure('That email no longer exists.');
    if (!email.isActive) return failure('This email is switched off. Switch it on to send it.');

    const recipients = parseRecipients(raw);
    if (recipients.length === 0) return failure('Enter at least one valid email address.', { recipients: ['Enter a valid address'] });
    if (recipients.length > MAX_RECIPIENTS) return failure(`Send to at most ${MAX_RECIPIENTS} addresses at a time.`);

    const [leads, customers] = await Promise.all([
      prisma.lead.findMany({ where: { email: { in: recipients, mode: 'insensitive' } }, select: { email: true, name: true } }),
      prisma.customer.findMany({ where: { email: { in: recipients, mode: 'insensitive' } }, select: { email: true, name: true } }),
    ]);
    const names = new Map<string, string>();
    for (const row of [...customers, ...leads]) if (row.email && row.name) names.set(row.email.toLowerCase(), row.name);

    let sent = 0;
    const failed: string[] = [];
    for (const to of recipients) {
      const tokens: Record<string, string> = { email: escapeHtml(to), name: escapeHtml(names.get(to) ?? '') };
      const fill = (text: string) => text.replace(/\{\{\s*(name|email)\s*\}\}/g, (_m, key: string) => tokens[key] ?? '');
      const result = await sendMail({ to, subject: fill(email.subject).replace(/&amp;/g, '&'), html: wrap(fill(email.body)) });
      if (result.sent) sent += 1;
      else failed.push(`${to}: ${result.reason ?? 'not sent'}`);
    }

    if (sent > 0) {
      await prisma.customEmail.update({ where: { id: emailId }, data: { sentCount: { increment: sent }, lastSentAt: new Date() } });
    }
    await recordAudit({
      actor: user,
      action: 'sent',
      entity: 'CustomEmail',
      entityId: emailId,
      summary: `Sent “${email.name}” to ${sent} of ${recipients.length} recipient(s)`,
    });
    revalidatePath('/admin/emails');

    if (sent === 0) return failure(failed[0] ?? 'Nothing was sent. Check the SMTP settings.');
    return success({ sent, failed }, failed.length ? `Sent to ${sent}; ${failed.length} failed.` : `Sent to ${sent} recipient(s).`);
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Plan & limits — super admin only
// ---------------------------------------------------------------------------

const planSchema = z.object({
  maxCustomEmails: z
    .union([z.literal(''), z.coerce.number().int().min(0, 'Use 0 or more').max(10_000)])
    .transform((value) => (value === '' ? null : value)),
  activityEmailsEnabled: z.boolean(),
  activityEmailRecipients: z.string().max(2_000),
});

export async function savePlatformSettings(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorizeSuperAdmin();
    const parsed = planSchema.parse(input);
    const recipients = parseRecipients(parsed.activityEmailRecipients);
    if (parsed.activityEmailsEnabled && recipients.length === 0) {
      return failure('Add at least one address to receive activity emails.', { activityEmailRecipients: ['Add an address'] });
    }
    const before = await prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    const data = {
      maxCustomEmails: parsed.maxCustomEmails,
      activityEmailsEnabled: parsed.activityEmailsEnabled,
      activityEmailRecipients: recipients.join(', ') || null,
      updatedById: user.id,
    };
    await prisma.platformSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data });
    invalidateActivitySettings();
    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'PlatformSettings',
      entityId: 'singleton',
      summary: `Plan: custom emails ${data.maxCustomEmails ?? 'unlimited'}; activity emails ${data.activityEmailsEnabled ? 'on' : 'off'}`,
      before: before ? { maxCustomEmails: before.maxCustomEmails, activityEmailsEnabled: before.activityEmailsEnabled } : null,
      after: { maxCustomEmails: data.maxCustomEmails, activityEmailsEnabled: data.activityEmailsEnabled },
    });
    revalidatePath('/admin/settings/plan');
    revalidatePath('/admin/emails');
    return success(undefined, 'Plan saved.');
  } catch (error) {
    return toActionError(error);
  }
}
