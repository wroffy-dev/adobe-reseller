'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash, Pencil, Code } from 'lucide-react';
import {
  saveTrackingSettings,
  saveTrackingScript,
  deleteTrackingScript,
  toggleTrackingScript,
} from '@/lib/actions/marketing';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Alert, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';

export type TrackingValues = {
  ga4Id: string;
  ga4Enabled: boolean;
  gtmId: string;
  gtmEnabled: boolean;
  googleAdsId: string;
  googleAdsEnabled: boolean;
  googleAdsConversionLabel: string;
  metaPixelId: string;
  metaPixelEnabled: boolean;
  microsoftUetId: string;
  microsoftUetEnabled: boolean;
  hotjarId: string;
  hotjarEnabled: boolean;
  linkedinPartnerId: string;
  linkedinEnabled: boolean;
  tiktokPixelId: string;
  tiktokEnabled: boolean;
  consentRequired: boolean;
  consentMessage: string;
};

export type ScriptRow = {
  id: string;
  name: string;
  placement: string;
  environment: string;
  isActive: boolean;
  requiresConsent: boolean;
  code: string;
};

const VENDORS: Array<{
  idKey: keyof TrackingValues;
  enabledKey: keyof TrackingValues;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  {
    idKey: 'ga4Id',
    enabledKey: 'ga4Enabled',
    label: 'Google Analytics 4',
    placeholder: 'G-XXXXXXXXXX',
    hint: 'Measurement ID from Admin → Data streams.',
  },
  {
    idKey: 'gtmId',
    enabledKey: 'gtmEnabled',
    label: 'Google Tag Manager',
    placeholder: 'GTM-XXXXXXX',
    hint: 'Container ID. Includes the noscript fallback automatically.',
  },
  {
    idKey: 'googleAdsId',
    enabledKey: 'googleAdsEnabled',
    label: 'Google Ads',
    placeholder: 'AW-123456789',
    hint: 'Conversion ID for remarketing and conversion tracking.',
  },
  {
    idKey: 'metaPixelId',
    enabledKey: 'metaPixelEnabled',
    label: 'Meta Pixel',
    placeholder: '123456789012345',
    hint: 'Pixel ID from Meta Events Manager.',
  },
  {
    idKey: 'microsoftUetId',
    enabledKey: 'microsoftUetEnabled',
    label: 'Microsoft UET',
    placeholder: '12345678',
    hint: 'UET tag ID from Microsoft Advertising.',
  },
  {
    idKey: 'hotjarId',
    enabledKey: 'hotjarEnabled',
    label: 'Hotjar',
    placeholder: '1234567',
    hint: 'Site ID for heatmaps and session recordings.',
  },
  {
    idKey: 'linkedinPartnerId',
    enabledKey: 'linkedinEnabled',
    label: 'LinkedIn Insight Tag',
    placeholder: '1234567',
    hint: 'Partner ID from LinkedIn Campaign Manager.',
  },
  {
    idKey: 'tiktokPixelId',
    enabledKey: 'tiktokEnabled',
    label: 'TikTok Pixel',
    placeholder: 'C1A2B3C4D5E6',
    hint: 'Pixel ID from TikTok Events Manager.',
  },
];

/** How each provider card reads at a glance. */
const VENDOR_STATE: Record<'live' | 'off' | 'unset', { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'success' },
  off: { label: 'Switched off', tone: 'warning' },
  unset: { label: 'Not set up', tone: 'neutral' },
};

const BLANK_SCRIPT = {
  id: '',
  name: '',
  placement: 'HEAD',
  environment: 'ALL',
  isActive: false,
  requiresConsent: true,
  code: '',
};

export function TrackingForm({
  initial,
  scripts,
  canEdit,
}: {
  initial: TrackingValues;
  scripts: ScriptRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [editingScript, setEditingScript] = React.useState<typeof BLANK_SCRIPT | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ScriptRow | null>(null);
  const [scriptErrors, setScriptErrors] = React.useState<Record<string, string[]>>({});

  const set = <K extends keyof TrackingValues>(key: K, value: TrackingValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  // "Live" means both halves are done: an ID is filled in and the tag is on.
  const liveCount = React.useMemo(
    () =>
      VENDORS.filter(
        (vendor) => String(values[vendor.idKey] ?? '').trim() && Boolean(values[vendor.enabledKey]),
      ).length,
    [values],
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));

    const result = await saveTrackingSettings(data);
    setPending(false);

    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setPending(true);
    const result = await fn();
    setPending(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    toast(result.message ?? 'Done.');
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader
            title="Analytics and advertising tags"
            description="Enter the ID and switch the tag on. Nothing loads on the website until a tag is both filled in and switched on."
            actions={
              <span className="text-sm text-muted">
                {liveCount} of {VENDORS.length} live
              </span>
            }
          />
          <CardBody>
            <fieldset disabled={!canEdit || pending} className="grid gap-3 sm:grid-cols-2">
              {VENDORS.map((vendor) => {
                const id = String(values[vendor.idKey] ?? '').trim();
                const enabled = Boolean(values[vendor.enabledKey]);
                const state = !id ? 'unset' : enabled ? 'live' : 'off';
                return (
                  <div
                    key={vendor.idKey}
                    className={cn(
                      'rounded-lg border p-4 transition-colors',
                      state === 'live' ? 'border-brand/40 bg-brand/[0.03]' : 'border-hairline',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-content">{vendor.label}</p>
                        <p className="mt-0.5 text-xs text-muted">{vendor.hint}</p>
                      </div>
                      <Badge tone={VENDOR_STATE[state].tone}>{VENDOR_STATE[state].label}</Badge>
                    </div>

                    <div className="mt-3">
                      <label htmlFor={vendor.idKey} className="sr-only">
                        {vendor.label} ID
                      </label>
                      <Input
                        id={vendor.idKey}
                        value={String(values[vendor.idKey] ?? '')}
                        placeholder={vendor.placeholder}
                        onChange={(e) => set(vendor.idKey, e.target.value as never)}
                        className="font-mono text-sm"
                      />
                    </div>

                    {vendor.idKey === 'googleAdsId' && enabled ? (
                      <div className="mt-3">
                        <Field label="Conversion label" htmlFor="googleAdsConversionLabel">
                          <Input
                            id="googleAdsConversionLabel"
                            value={values.googleAdsConversionLabel}
                            onChange={(e) => set('googleAdsConversionLabel', e.target.value)}
                            className="font-mono text-sm"
                          />
                        </Field>
                      </div>
                    ) : null}

                    <div className="mt-3 border-t border-hairline pt-3">
                      <Switch
                        checked={enabled}
                        onChange={(next) => set(vendor.enabledKey, next as never)}
                        label="Load on the website"
                        hint={!id ? 'Add the ID above first.' : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Consent"
            description="When required, Google Tag Manager still loads but in Google Consent Mode (advertising and analytics storage denied) until the visitor accepts. Every other tag waits for Accept."
          />
          <CardBody className="space-y-4">
            <fieldset disabled={!canEdit || pending} className="space-y-4">
              <div className="rounded-lg border border-hairline p-4">
                <Switch
                  checked={values.consentRequired}
                  onChange={(next) => set('consentRequired', next)}
                  label="Ask for consent before loading tracking"
                  hint="Shows a banner with Accept and Decline. Required in the EU and UK."
                />
              </div>
              <Field label="Consent message" htmlFor="consentMessage">
                <Textarea
                  id="consentMessage"
                  rows={2}
                  value={values.consentMessage}
                  placeholder="We use cookies to understand how the site is used and to improve it."
                  onChange={(e) => set('consentMessage', e.target.value)}
                />
              </Field>
            </fieldset>
          </CardBody>

          {canEdit ? (
            <div className="flex justify-end border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  'Save tracking settings'
                )}
              </Button>
            </div>
          ) : null}
        </Card>
      </form>

      <Card>
        <CardHeader
          title="Custom scripts"
          description="For tags this platform does not support directly."
          actions={
            canEdit ? (
              <Button size="sm" onClick={() => setEditingScript({ ...BLANK_SCRIPT })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add script
              </Button>
            ) : null
          }
        />
        <CardBody>
          <Alert tone="warning" className="mb-4" title="These run on every page">
            A custom script has full access to your visitors&apos; browsers. Only paste code from a
            source you trust, and check it first. Every change here is recorded in the audit log
            with the full body.
          </Alert>

          {scripts.length === 0 ? (
            <EmptyState
              icon={<Code className="h-5 w-5" />}
              title="No custom scripts"
              description="The tags above cover most needs. Add a custom script only when they do not."
            />
          ) : (
            <ul className="space-y-2">
              {scripts.map((script) => (
                <li
                  key={script.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-content">
                      {script.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {script.placement.replace('_', ' ').toLowerCase()} ·{' '}
                      {script.environment.toLowerCase()}
                      {script.requiresConsent ? ' · consent required' : ''}
                    </span>
                  </span>
                  <Badge tone={script.isActive ? 'success' : 'neutral'}>
                    {script.isActive ? 'Active' : 'Disabled'}
                  </Badge>
                  {canEdit ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => run(() => toggleTrackingScript(script.id))}
                        disabled={pending}
                        className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-muted/10 hover:text-content"
                      >
                        {script.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingScript({ ...script })}
                        aria-label={`Edit ${script.name}`}
                        className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(script)}
                        aria-label={`Delete ${script.name}`}
                        className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(editingScript)}
        onClose={() => setEditingScript(null)}
        title={editingScript?.id ? 'Edit custom script' : 'Add custom script'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingScript(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || !editingScript?.name.trim() || !editingScript?.code.trim()}
              onClick={async () => {
                if (!editingScript) return;
                setPending(true);
                setScriptErrors({});
                const data = new FormData();
                for (const [key, value] of Object.entries(editingScript)) {
                  if (key !== 'id') data.set(key, String(value));
                }
                const result = await saveTrackingScript(editingScript.id || null, data);
                setPending(false);
                if (!result.ok) {
                  setScriptErrors(result.fieldErrors ?? {});
                  toast(result.error, 'error');
                  return;
                }
                toast(result.message ?? 'Saved.');
                setEditingScript(null);
                router.refresh();
              }}
            >
              {pending ? 'Saving…' : 'Save script'}
            </Button>
          </>
        }
      >
        {editingScript ? (
          <div className="space-y-4">
            <Field label="Name" htmlFor="script-name" required error={scriptErrors.name}>
              <Input
                id="script-name"
                value={editingScript.name}
                placeholder="Intercom widget"
                onChange={(e) => setEditingScript({ ...editingScript, name: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Placement" htmlFor="script-placement">
                <Select
                  id="script-placement"
                  value={editingScript.placement}
                  onChange={(e) =>
                    setEditingScript({
                      ...editingScript,
                      placement: e.target.value,
                    })
                  }
                >
                  <option value="HEAD">Head</option>
                  <option value="BODY_START">Start of body</option>
                  <option value="BODY_END">End of body</option>
                </Select>
              </Field>
              <Field
                label="Environment"
                htmlFor="script-environment"
                hint="Keep test tags out of production."
              >
                <Select
                  id="script-environment"
                  value={editingScript.environment}
                  onChange={(e) =>
                    setEditingScript({
                      ...editingScript,
                      environment: e.target.value,
                    })
                  }
                >
                  <option value="ALL">All environments</option>
                  <option value="PRODUCTION">Production only</option>
                  <option value="DEVELOPMENT">Development only</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Script body"
              htmlFor="script-code"
              required
              error={scriptErrors.code}
              hint="JavaScript only — surrounding <script> tags are stripped."
            >
              <Textarea
                id="script-code"
                rows={10}
                value={editingScript.code}
                onChange={(e) => setEditingScript({ ...editingScript, code: e.target.value })}
                className="font-mono text-xs"
              />
            </Field>

            <div className="space-y-3 rounded-lg border border-hairline p-4">
              <Switch
                checked={editingScript.requiresConsent}
                onChange={(next) => setEditingScript({ ...editingScript, requiresConsent: next })}
                label="Only load after consent"
                hint="Leave on unless the script is strictly necessary."
              />
              <Switch
                checked={editingScript.isActive}
                onChange={(next) => setEditingScript({ ...editingScript, isActive: next })}
                label="Active"
              />
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await run(() => deleteTrackingScript(confirmDelete.id));
          setConfirmDelete(null);
        }}
        title="Delete this script?"
        message="It stops running on the site immediately. The body is kept in the audit log."
        pending={pending}
      />
    </div>
  );
}
