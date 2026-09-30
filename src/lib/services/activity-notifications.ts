import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { sendMail } from '@/lib/email/mailer';
import { siteUrl } from '@/lib/env';
import type { SessionUser } from '@/lib/auth/guards';

/**
 * Emails the super admin about what everyone else does in the admin.
 *
 * Driven from `recordAudit`, which every write already calls, so no action can
 * be added without being covered. A super admin's own actions are not
 * reported to themselves. Never throws and never delays the action: the
 * settings are read from a short cache and the mail goes out after it.
 */

const TTL_MS = 30_000;
let cached: { enabled: boolean; recipients: string[]; at: number } | null = null;

export function invalidateActivitySettings() {
  cached = null;
}

async function settings() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  const row = await prisma.platformSettings.findUnique({
    where: { id: 'singleton' },
    select: { activityEmailsEnabled: true, activityEmailRecipients: true },
  });
  cached = {
    enabled: Boolean(row?.activityEmailsEnabled),
    recipients: parseRecipients(row?.activityEmailRecipients ?? ''),
    at: Date.now(),
  };
  return cached;
}

export function parseRecipients(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;\s]+/)
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)),
    ),
  ).slice(0, 20);
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type ActivityEvent = {
  actor?: Pick<SessionUser, 'name' | 'email' | 'role'> | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
};

/** Sends one activity email when the super admin asked for them. */
export async function notifyActivity(event: ActivityEvent): Promise<void> {
  try {
    if (!event.actor || event.actor.role === 'super-admin') return;
    const config = await settings();
    if (!config.enabled || config.recipients.length === 0) return;

    const site = await prisma.websiteSettings.findUnique({ where: { id: 'singleton' }, select: { siteName: true } });
    const siteName = site?.siteName ?? 'Your website';
    const what = `${event.action} ${event.entity}`.trim();
    const when = new Date().toUTCString();

    await sendMail({
      to: config.recipients,
      subject: `${siteName}: ${event.actor.name || event.actor.email} ${what}`,
      html: `<p><strong>${escape(event.actor.name || event.actor.email)}</strong> (${escape(event.actor.email)}) did this in the admin of ${escape(siteName)}:</p>
<p style="font-size:16px"><strong>${escape(what)}</strong>${event.summary ? `<br>${escape(event.summary)}` : ''}</p>
<p style="color:#667085;font-size:13px">${escape(when)}${event.entityId ? ` · id ${escape(event.entityId)}` : ''}</p>
<p><a href="${escape(siteUrl())}/admin/audit">Open the audit log</a></p>`,
    });
  } catch (error) {
    console.error('[activity] notification failed', error);
  }
}
