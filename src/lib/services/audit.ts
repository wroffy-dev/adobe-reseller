import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { hashIp } from '@/lib/utils/crypto';
import { requestContext } from '@/lib/utils/request';
import type { SessionUser } from '@/lib/auth/guards';
import { notifyActivity } from './activity-notifications';

export type AuditInput = {
  actor?: SessionUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

/** Never throws — an audit failure must not break the user's action. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    await prisma.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        before: input.before === undefined ? undefined : JSON.parse(JSON.stringify(input.before)),
        after: input.after === undefined ? undefined : JSON.parse(JSON.stringify(input.after)),
        ipHash: hashIp(ip),
        userAgent,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record', error);
  }

  // Every recorded action can be emailed to the super admin. Not awaited: a
  // slow or failing SMTP server must never hold up or break the action.
  void notifyActivity(input);
}
