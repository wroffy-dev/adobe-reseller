import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mockAuth, uniqueSuffix } from '../helpers';

// An Admin (not super admin) with the custom email permissions.
mockAuth(['emails.view', 'emails.manage', 'settings.manage'], 'admin');

const sent: Array<{ to: unknown; subject: string }> = [];
vi.doMock('@/lib/email/mailer', () => ({
  sendMail: async (input: { to: unknown; subject: string }) => {
    sent.push(input);
    return { sent: true };
  },
  sendTemplate: async () => ({ sent: false }),
  verifySmtp: async () => ({ sent: false }),
  resolveSmtpConfig: async () => null,
  buildTransport: () => {
    throw new Error('no transport in tests');
  },
}));

const { prisma } = await import('@/lib/db/prisma');
const { saveCustomEmail, sendCustomEmail, deleteCustomEmail, savePlatformSettings } = await import(
  '@/lib/actions/custom-emails'
);
const { saveEmailSettings } = await import('@/lib/actions/settings');
const { notifyActivity, invalidateActivitySettings } = await import('@/lib/services/activity-notifications');
const { quotaMessage, customEmailQuota } = await import('@/lib/services/platform');

/**
 * Custom emails within the plan's limit, a plan only the super admin can set,
 * and activity emails to the super admin.
 */

const suffix = uniqueSuffix();
let before: { maxCustomEmails: number | null; activityEmailsEnabled: boolean; activityEmailRecipients: string | null } | null = null;
const created: string[] = [];

beforeAll(async () => {
  before = await prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
  await prisma.customEmail.deleteMany({});
});

afterAll(async () => {
  await prisma.customEmail.deleteMany({ where: { id: { in: created } } });
  await prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {
      maxCustomEmails: before?.maxCustomEmails ?? null,
      activityEmailsEnabled: before?.activityEmailsEnabled ?? false,
      activityEmailRecipients: before?.activityEmailRecipients ?? null,
    },
  });
  invalidateActivitySettings();
});

const draft = (n: number) => ({ name: `Offer ${n} ${suffix}`, subject: 'Hello {{name}}', body: '<p>Hi {{name}}, this is for {{email}}.</p>', isActive: true });

describe('the plan limit', () => {
  it('stops a non-super-admin from changing the plan', async () => {
    const result = await savePlatformSettings({ maxCustomEmails: '100', activityEmailsEnabled: false, activityEmailRecipients: '' });
    expect(result.ok).toBe(false);
  });

  it('stops a non-super-admin from changing SMTP', async () => {
    const form = new FormData();
    form.set('host', 'smtp.evil.test');
    const result = await saveEmailSettings(form);
    expect(result.ok).toBe(false);
  });

  it('allows exactly as many custom emails as the plan says, and says so', async () => {
    await prisma.platformSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', maxCustomEmails: 2 }, update: { maxCustomEmails: 2 } });

    for (const n of [1, 2]) {
      const result = await saveCustomEmail(null, draft(n));
      expect(result.ok).toBe(true);
      if (result.ok && result.data) created.push(result.data.id);
    }
    const third = await saveCustomEmail(null, draft(3));
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toMatch(/Only 2 emails you can create in your plan/);

    const quota = await customEmailQuota();
    expect(quota).toMatchObject({ limit: 2, used: 2, remaining: 0, reached: true });
  });

  it('never lets two concurrent saves take the last place', async () => {
    await prisma.platformSettings.update({ where: { id: 'singleton' }, data: { maxCustomEmails: 3 } });
    const results = await Promise.all([saveCustomEmail(null, draft(4)), saveCustomEmail(null, draft(5))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results) if (r.ok && r.data) created.push(r.data.id);
    expect(await prisma.customEmail.count()).toBe(3);
  });

  it('frees a place when an email is deleted, and still edits existing ones at the limit', async () => {
    const edit = await saveCustomEmail(created[0]!, { ...draft(1), subject: 'Edited' });
    expect(edit.ok).toBe(true);
    await deleteCustomEmail(created[0]!);
    const again = await saveCustomEmail(null, draft(6));
    expect(again.ok).toBe(true);
    if (again.ok && again.data) created.push(again.data.id);
  });

  it('describes an unlimited plan', () => {
    expect(quotaMessage({ limit: null, used: 4, remaining: null, reached: false })).toMatch(/no limit/);
    expect(quotaMessage({ limit: 5, used: 2, remaining: 3, reached: false })).toBe('Only 5 emails you can create in your plan — 2 used, 3 left.');
  });
});

describe('sending', () => {
  it('sends one message per recipient with their details filled in', async () => {
    sent.length = 0;
    const id = created[created.length - 1]!;
    const result = await sendCustomEmail({ emailId: id, recipients: 'a@example.test, b@example.test, not-an-address' });
    expect(result.ok).toBe(true);
    const own = sent.filter((m) => m.subject.startsWith('Hello'));
    expect(own).toHaveLength(2);
    expect(own.map((m) => m.to)).toEqual(['a@example.test', 'b@example.test']);
    expect((await prisma.customEmail.findUniqueOrThrow({ where: { id } })).sentCount).toBe(2);
  });
});

describe('activity emails', () => {
  it('emails the super admin about another admin’s action, not about their own', async () => {
    await prisma.platformSettings.update({
      where: { id: 'singleton' },
      data: { activityEmailsEnabled: true, activityEmailRecipients: 'owner@example.test' },
    });
    invalidateActivitySettings();
    sent.length = 0;
    await notifyActivity({ actor: { name: 'Asha', email: 'asha@example.test', role: 'admin' }, action: 'updated', entity: 'Page', summary: 'Changed pricing' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toEqual(['owner@example.test']);
    expect(sent[0]!.subject).toContain('Asha updated Page');

    await notifyActivity({ actor: { name: 'Owner', email: 'owner@example.test', role: 'super-admin' }, action: 'updated', entity: 'Page' });
    expect(sent).toHaveLength(1);
  });

  it('stays quiet when switched off', async () => {
    await prisma.platformSettings.update({ where: { id: 'singleton' }, data: { activityEmailsEnabled: false } });
    invalidateActivitySettings();
    sent.length = 0;
    await notifyActivity({ actor: { name: 'Asha', email: 'asha@example.test', role: 'admin' }, action: 'deleted', entity: 'Product' });
    expect(sent).toHaveLength(0);
  });
});
