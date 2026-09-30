'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { savePlatformSettings } from '@/lib/actions/custom-emails';

type Values = { maxCustomEmails: string; activityEmailsEnabled: boolean; activityEmailRecipients: string };

export function PlanForm({ initial, used, smtpReady }: { initial: Values; used: number; smtpReady: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [error, setError] = React.useState<string | null>(null);

  const limit = values.maxCustomEmails.trim() === '' ? null : Number(values.maxCustomEmails);
  const preview =
    limit === null || Number.isNaN(limit)
      ? 'Admins see: “Your plan has no limit on custom emails.”'
      : `Admins see: “Only ${limit} ${limit === 1 ? 'email' : 'emails'} you can create in your plan — ${used} used, ${Math.max(0, limit - used)} left.”`;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setErrors({});
    const result = await savePlatformSettings(values);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setErrors(result.fieldErrors ?? {});
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-content">Custom emails</h2>
        <Field
          label="How many custom emails the plan allows"
          htmlFor="plan-max"
          hint="Leave blank for no limit. Emails already written are kept if you lower it; new ones cannot be created until the count is under the limit."
          error={errors.maxCustomEmails}
        >
          <Input
            id="plan-max"
            type="number"
            min={0}
            inputMode="numeric"
            value={values.maxCustomEmails}
            onChange={(e) => setValues({ ...values, maxCustomEmails: e.target.value })}
            className="max-w-[10rem]"
          />
        </Field>
        <p className="text-sm text-muted">
          {used} custom email{used === 1 ? '' : 's'} exist now. {preview}
        </p>
      </section>

      <section className="space-y-3 border-t border-hairline pt-5">
        <h2 className="text-sm font-semibold text-content">Activity emails</h2>
        <Switch
          checked={values.activityEmailsEnabled}
          onChange={(next) => setValues({ ...values, activityEmailsEnabled: next })}
          label="Email me whenever another admin does something"
          hint="Every change recorded in the audit log — pages, products, leads, settings, custom emails — by anyone who is not a super admin."
        />
        <Field
          label="Send activity emails to"
          htmlFor="plan-recipients"
          hint="One or more addresses, separated by commas."
          error={errors.activityEmailRecipients}
        >
          <Textarea
            id="plan-recipients"
            rows={2}
            value={values.activityEmailRecipients}
            onChange={(e) => setValues({ ...values, activityEmailRecipients: e.target.value })}
            placeholder="owner@example.com"
          />
        </Field>
        {!smtpReady ? (
          <p className="text-xs text-amber-700">
            Nothing is delivered until{' '}
            <Link href="/admin/settings/email" className="underline">
              SMTP is set up
            </Link>
            .
          </p>
        ) : null}
      </section>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save plan'}
        </Button>
      </div>
    </form>
  );
}
