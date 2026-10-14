import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { customEmailQuota, quotaMessage } from '@/lib/services/platform';
import { getEmailSettingsSafe } from '@/lib/services/settings';
import { AdminPageHeader } from '@/components/admin/page-header';
import { CustomEmailsManager, type CustomEmailRow } from '@/components/admin/emails/custom-emails-manager';

export const metadata: Metadata = { title: 'Custom emails' };
export const dynamic = 'force-dynamic';

/** Marketing → Custom Emails: emails staff write and send themselves, within the plan's limit. */
export default async function CustomEmailsPage() {
  const user = await requirePermission('emails.view');
  const [rows, quota, smtp] = await Promise.all([
    prisma.customEmail.findMany({ orderBy: { createdAt: 'desc' } }),
    customEmailQuota(),
    getEmailSettingsSafe(),
  ]);

  const emails: CustomEmailRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    isActive: row.isActive,
    sentCount: row.sentCount,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <div className="max-w-5xl">
      <AdminPageHeader
        title="Custom emails"
        description="Write your own emails and send them to leads, customers or anyone else — delivered through the site's SMTP."
        crumbs={[{ label: 'Marketing', href: '/admin/marketing' }, { label: 'Custom emails' }]}
      />
      <CustomEmailsManager
        emails={emails}
        quota={{ ...quota, message: quotaMessage(quota) }}
        canEdit={userCan(user, 'emails.manage')}
        smtpReady={smtp.isEnabled && Boolean(smtp.host) && Boolean(smtp.fromEmail)}
      />
    </div>
  );
}
