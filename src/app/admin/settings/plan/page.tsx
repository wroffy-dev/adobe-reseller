import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/auth/super-admin';
import { getPlatformSettings, customEmailQuota } from '@/lib/services/platform';
import { getEmailSettingsSafe } from '@/lib/services/settings';
import { AdminPageHeader } from '@/components/admin/page-header';
import { PlanForm } from '@/components/admin/emails/plan-form';
import { Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/states';

export const metadata: Metadata = { title: 'Plan & limits' };
export const dynamic = 'force-dynamic';

/**
 * Settings → Plan & Limits. Super admin only: the limits are what the plan
 * sells, so they are not a permission anyone else can be given.
 */
export default async function PlanPage() {
  await requireSuperAdmin();
  const [settings, quota, email] = await Promise.all([getPlatformSettings(), customEmailQuota(), getEmailSettingsSafe()]);
  const smtpReady = email.isEnabled && Boolean(email.host) && Boolean(email.fromEmail);

  return (
    <div className="max-w-3xl space-y-4">
      <AdminPageHeader
        title="Plan & limits"
        description="What this site's plan allows, and how you are told what the other admins do. Only a super admin sees this page."
        crumbs={[{ label: 'Settings', href: '/admin/settings' }, { label: 'Plan & limits' }]}
      />
      {!smtpReady ? (
        <Alert tone="warning" title="SMTP is not set up">
          Activity emails and custom emails are delivered through SMTP.{' '}
          <Link href="/admin/settings/email" className="font-medium underline">
            Set up SMTP
          </Link>{' '}
          first.
        </Alert>
      ) : null}
      <Card className="p-4 sm:p-5">
        <PlanForm
          initial={{
            maxCustomEmails: settings.maxCustomEmails === null ? '' : String(settings.maxCustomEmails),
            activityEmailsEnabled: settings.activityEmailsEnabled,
            activityEmailRecipients: settings.activityEmailRecipients ?? '',
          }}
          used={quota.used}
          smtpReady={smtpReady}
        />
      </Card>
    </div>
  );
}
