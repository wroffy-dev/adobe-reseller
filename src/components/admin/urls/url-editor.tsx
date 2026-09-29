'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { previewRouteEdits, applyRouteEdits } from '@/lib/actions/url-manager';
import type { Preview, RouteEdit, RouteListRow } from '@/lib/urls/manager';
import { Drawer } from './drawer';
import { PreviewPanel, type ApplyOptions } from './preview-panel';

type Mode = 'custom' | 'slug' | 'reset';

/**
 * Editing one address.
 *
 * Nothing is saved until a preview has been run and applied: the preview
 * checks availability across every content type, redirects and reserved
 * routes, and lists the redirect it will keep and the links it could update.
 */
export function UrlEditor({
  route,
  origin,
  canEdit,
  resolverEnabled,
  onClose,
  onSaved,
}: {
  route: RouteListRow;
  origin: string;
  canEdit: boolean;
  resolverEnabled: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const prefix = route.marketPrefix ? `/${route.marketPrefix}` : '';
  const relative = prefix && route.path.startsWith(prefix) ? route.path.slice(prefix.length) || '/' : route.path;
  const canSlug = !route.isHomepage && route.type !== 'CATEGORY_PAGE' && route.type !== 'BRAND_PAGE';

  const [mode, setMode] = React.useState<Mode>('custom');
  const [path, setPath] = React.useState(relative);
  const [slug, setSlug] = React.useState(route.slug);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [options, setOptions] = React.useState<ApplyOptions>({ updateLinks: false, updateCanonicals: false });
  const [pending, setPending] = React.useState<'preview' | 'apply' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // A changed input invalidates the preview: apply always matches what was shown.
  React.useEffect(() => setPreview(null), [mode, path, slug]);

  const edit = (): RouteEdit =>
    mode === 'reset'
      ? { routeId: route.id, action: 'reset' }
      : mode === 'slug'
        ? { routeId: route.id, action: 'slug', slug }
        : { routeId: route.id, action: 'custom', path };

  const finalPath = (() => {
    if (mode === 'reset') return route.inheritedPath;
    if (mode === 'slug') return `${prefix}${route.pattern.replace('{slug}', slug.replace(/^\/+|\/+$/g, ''))}`.replace(/\/+$/, '') || '/';
    return `${prefix}/${path.replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/';
  })();

  const runPreview = async () => {
    setPending('preview');
    setError(null);
    const result = await previewRouteEdits([edit()]);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.data!);
  };

  const apply = async () => {
    if (!preview) return;
    setPending('apply');
    setError(null);
    const result = await applyRouteEdits([edit()], { token: preview.token, ...options });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast(result.message ?? 'Saved.');
    onSaved();
  };

  const blocked = !preview || preview.errors.length > 0 || preview.items.some((i) => i.status === 'conflict' && i.routeId === route.id);

  return (
    <Drawer
      open
      onClose={onClose}
      title={route.label}
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{route.typeLabel}</Badge>
          <Badge tone="neutral">{route.countryName}</Badge>
          <Badge tone={route.isPublic ? 'success' : 'warning'}>{route.isPublic ? 'Public' : route.status.toLowerCase()}</Badge>
          <Badge tone={route.mode === 'CUSTOM' ? 'purple' : 'neutral'}>{route.mode === 'CUSTOM' ? 'Custom URL' : 'Follows pattern'}</Badge>
        </span>
      }
      footer={
        canEdit ? (
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={runPreview} disabled={pending !== null || !resolverEnabled}>
              {pending === 'preview' ? 'Checking…' : 'Preview & check'}
            </Button>
            <Button onClick={apply} disabled={blocked || pending !== null}>
              {pending === 'apply' ? 'Applying…' : 'Apply'}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <dl className="grid gap-3 rounded-lg border border-hairline bg-muted/[0.03] p-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-muted">Current URL</dt>
            <dd className="flex items-center gap-1.5 break-all font-mono text-xs text-content">
              {origin}
              {route.path}
              {route.isPublic ? (
                <a href={route.path} target="_blank" rel="noopener noreferrer" aria-label="Open live page" className="text-brand">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">Inherited pattern ({route.patternSource})</dt>
            <dd className="break-all font-mono text-xs text-content">
              {route.pattern} → {route.inheritedPath}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">Custom override</dt>
            <dd className="break-all font-mono text-xs text-content">{route.customPath ?? 'none'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">Content slug</dt>
            <dd className="break-all font-mono text-xs text-content">{route.slug || '(home)'}</dd>
          </div>
        </dl>

        {route.conflictPath ? (
          <Alert tone="warning" title="Unresolved conflict">
            Wanted <code>{route.conflictPath}</code>: {route.conflictReason}
          </Alert>
        ) : null}

        {!resolverEnabled ? (
          <Alert tone="info" title="Registry not active yet">
            Register current URLs and switch the registry on from the URL Health tab before changing addresses.
          </Alert>
        ) : null}

        {route.isHomepage ? (
          <Alert tone="info">A home page always lives at its market’s root and cannot be moved.</Alert>
        ) : canEdit ? (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-content">Change the address</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to change the address">
              {(
                [
                  ['custom', 'Custom path for this market'],
                  ...(canSlug ? [['slug', 'Rename the slug'] as const] : []),
                  ...(route.mode === 'CUSTOM' ? [['reset', 'Reset to the pattern'] as const] : []),
                ] as Array<readonly [Mode, string]>
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${mode === value ? 'border-brand bg-brand/5 text-brand' : 'border-hairline text-content'}`}
                >
                  <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </div>

            {mode === 'custom' ? (
              <Field
                label="Path"
                htmlFor="url-path"
                hint={`Only this ${route.countryName} address changes. Lower-case letters, numbers, hyphens; nest with “/”. The pattern path is stored as “follows pattern”.`}
              >
                <div className="flex min-w-0 items-stretch">
                  {prefix ? (
                    <span className="flex items-center rounded-l-lg border border-r-0 border-hairline bg-muted/5 px-2.5 font-mono text-xs text-muted">{prefix}</span>
                  ) : null}
                  <Input id="url-path" value={path} onChange={(e) => setPath(e.target.value)} className={`min-w-0 flex-1 font-mono ${prefix ? 'rounded-l-none' : ''}`} autoComplete="off" spellCheck={false} />
                </div>
              </Field>
            ) : null}

            {mode === 'slug' ? (
              <Field
                label="Slug"
                htmlFor="url-slug"
                hint={
                  route.type === 'PRODUCT'
                    ? 'A product’s slug is shared: every market that follows its pattern moves too. Use a custom path to change one market only.'
                    : 'Renames the content itself; the pattern builds the address from it.'
                }
              >
                <Input id="url-slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" autoComplete="off" spellCheck={false} />
              </Field>
            ) : null}

            {mode === 'reset' ? (
              <p className="text-sm text-muted">
                Removes the custom path. The address goes back to <code className="font-mono">{route.inheritedPath}</code>, with a redirect from the current one.
              </p>
            ) : null}

            <div className="rounded-lg border border-dashed border-hairline px-3 py-2">
              <p className="text-xs text-muted">Final URL</p>
              <p className="break-all font-mono text-sm text-content">
                {origin}
                {finalPath}
              </p>
            </div>
          </fieldset>
        ) : (
          <Alert tone="info">You can view this address but not change it.</Alert>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {preview ? <PreviewPanel preview={preview} origin={origin} options={options} onOptions={setOptions} /> : null}

        <p className="text-xs text-muted">
          A moved public address answers with a permanent <strong>308</strong> redirect straight to the new one, with the visitor’s query string (UTM tags included) carried over.{' '}
          {route.editHref ? (
            <Link href={route.editHref} className="text-brand hover:underline">
              Edit the content
            </Link>
          ) : null}
        </p>
      </div>
    </Drawer>
  );
}
