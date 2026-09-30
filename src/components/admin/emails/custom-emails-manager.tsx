'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Switch, Textarea } from '@/components/ui/field';
import { Alert, EmptyState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { RichTextEditor } from '@/components/cms/rich-text-editor';
import { Drawer } from '@/components/admin/urls/drawer';
import { deleteCustomEmail, saveCustomEmail, sendCustomEmail } from '@/lib/actions/custom-emails';

export type CustomEmailRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  isActive: boolean;
  sentCount: number;
  lastSentAt: string | null;
  updatedAt: string;
};

type Quota = { limit: number | null; used: number; remaining: number | null; reached: boolean; message: string };

export function CustomEmailsManager({
  emails,
  quota,
  canEdit,
  smtpReady,
}: {
  emails: CustomEmailRow[];
  quota: Quota;
  canEdit: boolean;
  smtpReady: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<Partial<CustomEmailRow> | null>(null);
  const [sending, setSending] = React.useState<CustomEmailRow | null>(null);
  const [deleting, setDeleting] = React.useState<CustomEmailRow | null>(null);
  const [pending, setPending] = React.useState(false);

  const remove = async () => {
    if (!deleting) return;
    setPending(true);
    const result = await deleteCustomEmail(deleting.id);
    setPending(false);
    setDeleting(null);
    toast(result.ok ? (result.message ?? 'Deleted.') : result.error, result.ok ? 'success' : 'error');
    if (result.ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-content" role="status">
            {quota.message}
          </p>
          {quota.limit !== null ? (
            <div
              className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted/15"
              role="progressbar"
              aria-label="Custom emails used"
              aria-valuemin={0}
              aria-valuemax={quota.limit}
              aria-valuenow={quota.used}
            >
              <div
                className={quota.reached ? 'h-full bg-red-500' : 'h-full bg-brand'}
                style={{ width: `${quota.limit === 0 ? 100 : Math.min(100, (quota.used / quota.limit) * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
        {canEdit ? (
          <Button onClick={() => setEditing({ isActive: true, body: '' })} disabled={quota.reached} className="shrink-0">
            <Plus className="h-4 w-4" aria-hidden="true" /> New email
          </Button>
        ) : null}
      </div>

      {!smtpReady ? (
        <Alert tone="warning" title="Sending is not set up yet">
          Emails can be written now, but nothing is delivered until your provider sets up SMTP.
        </Alert>
      ) : null}

      <div className="rounded-xl border border-hairline bg-surface">
        {emails.length === 0 ? (
          <EmptyState
            icon={<Mail className="h-5 w-5" />}
            title="No custom emails yet"
            description="Write an offer, a follow-up or an announcement once, and send it whenever you need it."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {emails.map((email) => (
              <li key={email.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-content">
                    {email.name}
                    {!email.isActive ? <Badge tone="warning">Off</Badge> : null}
                  </p>
                  <p className="truncate text-sm text-muted">{email.subject}</p>
                  <p className="text-xs text-muted">
                    Sent {email.sentCount} time{email.sentCount === 1 ? '' : 's'}
                    {email.lastSentAt ? ` · last ${new Date(email.lastSentAt).toLocaleString()}` : ''}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => setSending(email)} disabled={!email.isActive}>
                      <Send className="h-4 w-4" aria-hidden="true" /> Send
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(email)} aria-label={`Edit ${email.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleting(email)} aria-label={`Delete ${email.name}`}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <EmailEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      {sending ? (
        <SendDrawer
          email={sending}
          smtpReady={smtpReady}
          onClose={() => setSending(null)}
          onSent={() => {
            setSending(null);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        pending={pending}
        title="Delete this email?"
        message={deleting ? `“${deleting.name}” will be deleted. It frees one place in your plan.` : ''}
      />
    </div>
  );
}

function EmailEditor({ initial, onClose, onSaved }: { initial: Partial<CustomEmailRow>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = React.useState(initial.name ?? '');
  const [subject, setSubject] = React.useState(initial.subject ?? '');
  const [body, setBody] = React.useState(initial.body ?? '');
  const [isActive, setIsActive] = React.useState(initial.isActive ?? true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const save = async () => {
    setPending(true);
    setError(null);
    setErrors({});
    const result = await saveCustomEmail(initial.id ?? null, { name, subject, body, isActive });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setErrors(result.fieldErrors ?? {});
      return;
    }
    toast(result.message ?? 'Saved.');
    onSaved();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={initial.id ? 'Edit email' : 'New email'}
      description="Use {{name}} and {{email}} to personalise each message."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save email'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="ce-name" hint="For you — recipients never see it." error={errors.name}>
          <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Renewal reminder" />
        </Field>
        <Field label="Subject" htmlFor="ce-subject" error={errors.subject}>
          <Input id="ce-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your Adobe licence renews soon, {{name}}" />
        </Field>
        <Field label="Message" htmlFor="ce-body" error={errors.body}>
          <RichTextEditor id="ce-body" value={body} onChange={setBody} rows={12} />
        </Field>
        <Switch checked={isActive} onChange={setIsActive} label="Ready to send" hint="Switch off to keep it as a draft." />
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Drawer>
  );
}

function SendDrawer({ email, smtpReady, onClose, onSent }: { email: CustomEmailRow; smtpReady: boolean; onClose: () => void; onSent: () => void }) {
  const { toast } = useToast();
  const [recipients, setRecipients] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const send = async () => {
    setPending(true);
    setError(null);
    const result = await sendCustomEmail({ emailId: email.id, recipients });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast(result.message ?? 'Sent.');
    if (result.data?.failed.length) setError(result.data.failed.join('\n'));
    else onSent();
  };

  return (
    <Drawer
      open
      width="md"
      onClose={onClose}
      title={`Send “${email.name}”`}
      description={email.subject}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={send} disabled={pending || !smtpReady || !recipients.trim()}>
            {pending ? 'Sending…' : 'Send'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="To"
          htmlFor="ce-to"
          hint="Up to 20 addresses, separated by commas. Each person gets their own message; a lead's or customer's name fills {{name}}."
        >
          <Textarea id="ce-to" rows={3} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="client@example.com, buyer@example.com" />
        </Field>
        {!smtpReady ? <Alert tone="warning">SMTP is not set up, so nothing can be sent yet.</Alert> : null}
        {error ? <Alert tone="danger"><span className="whitespace-pre-line">{error}</span></Alert> : null}
      </div>
    </Drawer>
  );
}
