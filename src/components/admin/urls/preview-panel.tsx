'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, CornerDownRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import type { Preview } from '@/lib/urls/manager';

export type ApplyOptions = { updateLinks: boolean; updateCanonicals: boolean };

/**
 * What a change will do, before it is done: every address that moves, every
 * old address kept alive by a redirect, every conflict and exclusion, and the
 * stored links and canonical overrides that name the old address.
 */
export function PreviewPanel({
  preview,
  origin,
  options,
  onOptions,
  maxRows = 200,
}: {
  preview: Preview;
  origin: string;
  options: ApplyOptions;
  onOptions: (next: ApplyOptions) => void;
  maxRows?: number;
}) {
  const changes = preview.items.filter((i) => i.status === 'move' || i.status === 'create');
  const conflicts = preview.items.filter((i) => i.status === 'conflict');
  const removed = preview.items.filter((i) => i.status === 'remove');
  const linkCount = preview.references.reduce((sum, hit) => sum + hit.count, 0);

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="brand">{changes.length} change{changes.length === 1 ? '' : 's'}</Badge>
        <Badge tone="info">{preview.summary.redirects} redirect{preview.summary.redirects === 1 ? '' : 's'} (308)</Badge>
        <Badge tone={conflicts.length ? 'danger' : 'neutral'}>{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}</Badge>
        {preview.exclusions.length ? <Badge tone="warning">{preview.exclusions.length} excluded</Badge> : null}
        {preview.errors.length ? <Badge tone="danger">{preview.errors.length} invalid</Badge> : null}
      </div>

      {preview.errors.length ? (
        <Alert tone="danger" title="Cannot apply">
          <ul className="list-disc space-y-0.5 pl-4">
            {preview.errors.slice(0, 20).map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.label}:</span> {e.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {conflicts.length ? (
        <Alert tone="danger" title="Conflicts — nothing that conflicts is applied">
          <ul className="space-y-1">
            {conflicts.slice(0, 30).map((c, i) => (
              <li key={i} className="break-words">
                <span className="font-medium">{c.label}</span> wants <code className="rounded bg-white/60 px-1">{c.newPath}</code> — {c.reason}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {changes.length ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-content">Old → new</h3>
          <ul className="divide-y divide-hairline rounded-lg border border-hairline">
            {changes.slice(0, maxRows).map((c, i) => (
              <li key={i} className="space-y-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-content">{c.label}</span>
                  <Badge tone="neutral">{c.typeLabel}</Badge>
                  {c.redirect ? <Badge tone="info">308 redirect kept</Badge> : c.status === 'move' ? <Badge tone="neutral">not public — no redirect</Badge> : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 break-all font-mono text-xs text-muted">
                  <span className="line-through decoration-muted/60">{c.oldPath ?? '—'}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" aria-label="becomes" />
                  <span className="text-content">{origin}{c.newPath}</span>
                </div>
              </li>
            ))}
          </ul>
          {changes.length > maxRows ? <p className="mt-1 text-xs text-muted">…and {changes.length - maxRows} more.</p> : null}
        </section>
      ) : (
        <p className="text-sm text-muted">No address changes.</p>
      )}

      {removed.length ? (
        <p className="text-xs text-muted">
          {removed.length} route(s) no longer backed by public content will be released as part of this sync.
        </p>
      ) : null}

      {preview.exclusions.length ? (
        <details className="rounded-lg border border-hairline px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-content">Excluded ({preview.exclusions.length})</summary>
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {preview.exclusions.slice(0, 200).map((e, i) => (
              <li key={i}>
                {e.label}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {preview.references.length ? (
        <section className="space-y-2 rounded-lg border border-hairline p-3">
          <Checkbox
            checked={options.updateLinks}
            onChange={(event) => onOptions({ ...options, updateLinks: event.target.checked })}
            label={`Also update ${linkCount} stored link${linkCount === 1 ? '' : 's'} that point at the old address`}
            hint="Exact links only (a whole link value or an href). Prose and similar-looking addresses are never touched. Without this, the redirect still keeps them working."
          />
          <ul className="max-h-48 space-y-1 overflow-y-auto pl-6 text-xs text-muted">
            {preview.references.map((hit) => (
              <li key={`${hit.table}-${hit.id}`} className="flex items-center gap-1.5">
                <CornerDownRight className="h-3 w-3 shrink-0" />
                <span>
                  {hit.table} “{hit.label}” · {hit.field} · {hit.count}×
                </span>
                {hit.adminHref ? (
                  <Link href={hit.adminHref} className="text-brand hover:underline" target="_blank">
                    open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {preview.canonicals.length ? (
        <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <Checkbox
            checked={options.updateCanonicals}
            onChange={(event) => onOptions({ ...options, updateCanonicals: event.target.checked })}
            label={`Point ${preview.canonicals.length} explicit canonical override${preview.canonicals.length === 1 ? '' : 's'} at the new address`}
            hint="These were typed by hand. Review them — a canonical deliberately aimed elsewhere should stay as it is."
          />
          <ul className="space-y-0.5 pl-6 text-xs text-muted">
            {preview.canonicals.map((hit) => (
              <li key={`${hit.table}-${hit.id}`}>
                {hit.table} “{hit.label}”: <code>{hit.canonicalUrl}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
