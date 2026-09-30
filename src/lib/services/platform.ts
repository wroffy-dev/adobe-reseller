import 'server-only';
import { prisma } from '@/lib/db/prisma';

/**
 * The plan: what this installation allows, set by the super admin.
 */

export async function getPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

export type CustomEmailQuota = {
  /** Null means the plan sets no limit. */
  limit: number | null;
  used: number;
  remaining: number | null;
  reached: boolean;
};

export async function customEmailQuota(): Promise<CustomEmailQuota> {
  const [settings, used] = await Promise.all([getPlatformSettings(), prisma.customEmail.count()]);
  const limit = settings.maxCustomEmails;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  return { limit, used, remaining, reached: limit !== null && used >= limit };
}

/** The sentence the admin shows wherever a custom email can be created. */
export function quotaMessage(quota: CustomEmailQuota): string {
  if (quota.limit === null) return 'Your plan has no limit on custom emails.';
  const noun = quota.limit === 1 ? 'email' : 'emails';
  if (quota.reached) {
    return `Only ${quota.limit} ${noun} you can create in your plan — all ${quota.limit} are used. Delete one, or ask your provider to raise the limit.`;
  }
  return `Only ${quota.limit} ${noun} you can create in your plan — ${quota.used} used, ${quota.remaining} left.`;
}
