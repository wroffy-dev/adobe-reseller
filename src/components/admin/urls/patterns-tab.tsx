'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select, Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { applyPatternChangeAction, previewPatternChange } from '@/lib/actions/url-manager';
import type { Preview } from '@/lib/urls/manager';
import { DEFAULT_PATTERNS, ROOT_ONLY_TYPES, URL_CONTENT_LABELS, URL_CONTENT_TYPES, type UrlContentType } from '@/lib/urls/paths';
import { Drawer } from './drawer';
import { PreviewPanel, type ApplyOptions } from './preview-panel';
import type { Market, PatternRowView } from './types';

/**
 * URL structures per content type: a global pattern, optionally overridden
 * per market. A route's own custom path always wins over both, so changing a
 * pattern never moves a URL someone set by hand — those are listed as
 * exclusions in the preview.
 */
export function PatternsTab({
  patterns,
  counts,
  markets,
  origin,
  canEdit,
  resolverEnabled,
  canEditGlobal,
  onChanged,
}: {
  patterns: PatternRowView[];
  counts: Array<{ contentType: string; countryId: string; mode: string; count: number }>;
  markets: Market[];
  origin: string;
  canEdit: boolean;
  resolverEnabled: boolean;
  canEditGlobal: boolean;
  onChanged: () => void;
}) {
  const [type, setType] = React.useState<UrlContentType>('PRODUCT');
  const [editing, setEditing] = React.useState<{ countryId: string | null; value: string } | null>(null);

  const stored = (countryId: string | null) => patterns.find((p) => p.contentType === type && p.countryId === countryId)?.pattern ?? null;
  const global = stored(null);
  const scopes: Array<{ countryId: string | null; label: string }> = [
    { countryId: null, label: 'Global (every market)' },
    ...(ROOT_ONLY_TYPES.has(type) ? [] : markets.map((m) => ({ countryId: m.id, label: `${m.name}${m.slug ? ` (/${m.slug})` : ' (root)'}` }))),
  ];
  const countFor = (countryId: string | null, mode: string) =>
    counts.filter((c) => c.contentType === type && (countryId === null || c.countryId === countryId) && c.mode === mode).reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-4">
      <Field label="Content type" htmlFor="pattern-type" className="max-w-xs">
        <Select id="pattern-type" value={type} onChange={(e) => setType(e.target.value as UrlContentType)}>
          {URL_CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {URL_CONTENT_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>

      {ROOT_ONLY_TYPES.has(type) ? (
        <Alert tone="info">The blog lives at the site root only, so its URLs have one global pattern and no per-market version.</Alert>
      ) : null}
      {type === 'PAGE' ? <Alert tone="info">Home pages always stay at their market’s root, whatever the page pattern is.</Alert> : null}

      <div className="divide-y divide-hairline rounded-xl border border-hairline bg-surface">
        {scopes.map((scope) => {
          const own = stored(scope.countryId);
          const effective = own ?? (scope.countryId ? (global ?? DEFAULT_PATTERNS[type]) : DEFAULT_PATTERNS[type]);
          const source = own ? (scope.countryId ? 'Market pattern' : 'Global pattern') : scope.countryId ? (global ? 'Inherits global' : 'Built-in default') : 'Built-in default';
          const market = markets.find((m) => m.id === scope.countryId);
          const example = `${market?.slug ? `/${market.slug}` : ''}${effective.replace('{slug}', 'example')}`;
          const editable = canEdit && resolverEnabled && (scope.countryId ? true : canEditGlobal);
          return (
            <div key={scope.countryId ?? 'global'} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-content">{scope.label}</p>
                <p className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted/10 px-1.5 py-0.5 font-mono text-sm text-content">{effective}</code>
                  <Badge tone={own ? 'brand' : 'neutral'}>{source}</Badge>
                </p>
                <p className="break-all text-xs text-muted">
                  e.g. {origin}
                  {example} · {countFor(scope.countryId, 'PATTERN')} following, {countFor(scope.countryId, 'CUSTOM')} custom
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {editable ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing({ countryId: scope.countryId, value: effective })}>
                    Change
                  </Button>
                ) : null}
                {editable && own ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ countryId: scope.countryId, value: '' })}>
                    {scope.countryId ? 'Inherit global' : 'Use built-in'}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        Precedence: a URL’s own custom path → its market’s pattern → the global pattern → the built-in default. Patterns use <code>{'{slug}'}</code> exactly once, as the last part — e.g. <code>/{'{slug}'}</code> or <code>/software/{'{slug}'}</code>.
      </p>

      {editing ? (
        <PatternEditor
          type={type}
          countryId={editing.countryId}
          initial={editing.value}
          origin={origin}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function PatternEditor({
  type,
  countryId,
  initial,
  origin,
  onClose,
  onDone,
}: {
  type: UrlContentType;
  countryId: string | null;
  initial: string;
  origin: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const removing = initial === '';
  const [value, setValue] = React.useState(initial);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [options, setOptions] = React.useState<ApplyOptions>({ updateLinks: false, updateCanonicals: false });
  const [pending, setPending] = React.useState<'preview' | 'apply' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => setPreview(null), [value]);

  const change = { type, countryId, pattern: removing ? null : value };

  const run = async () => {
    setPending('preview');
    setError(null);
    const result = await previewPatternChange(change);
    setPending(null);
    if (result.ok) setPreview(result.data!);
    else setError(result.error);
  };
  const apply = async () => {
    if (!preview) return;
    setPending('apply');
    const result = await applyPatternChangeAction(change, { token: preview.token, ...options });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast(result.message ?? 'Pattern saved.');
    onDone();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${URL_CONTENT_LABELS[type]} URL pattern`}
      description={countryId ? 'For one market' : 'For every market without its own pattern'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" onClick={run} disabled={pending !== null}>
            {pending === 'preview' ? 'Checking…' : 'Preview affected URLs'}
          </Button>
          <Button onClick={apply} disabled={!preview || pending !== null || preview.summary.conflicts > 0}>
            {pending === 'apply' ? 'Applying…' : 'Apply'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {removing ? (
          <p className="text-sm text-muted">Removes this pattern; these URLs fall back to {countryId ? 'the global pattern' : 'the built-in default'}.</p>
        ) : (
          <Field label="Pattern" htmlFor="pattern-value" hint="Starts with /, uses {slug} once as the last part.">
            <Input id="pattern-value" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" autoComplete="off" spellCheck={false} />
          </Field>
        )}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {preview && preview.summary.conflicts > 0 ? (
          <Alert tone="warning">A pattern is applied all at once: resolve the conflicts below (or give those URLs a custom path) before applying.</Alert>
        ) : null}
        {preview ? <PreviewPanel preview={preview} origin={origin} options={options} onOptions={setOptions} /> : null}
      </div>
    </Drawer>
  );
}
