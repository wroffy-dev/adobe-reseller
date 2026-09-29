'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import {
  dismissNotFoundAction,
  fetchHealth,
  fetchRoute,
  mapNotFoundAction,
  runBackfillAction,
  setResolverAction,
} from '@/lib/actions/url-manager';
import type { RouteListRow } from '@/lib/urls/manager';
import { UrlEditor } from './url-editor';

export type HealthData = {
  notFound: Array<{ id: string; path: string; hits: number; referrerHost: string | null; firstSeenAt: string; lastSeenAt: string }>;
  broken: Array<{ where: string; label: string; href: string; adminHref: string }>;
  conflicts: Array<{ routeId: string; label: string; type: string; path: string; wanted: string; reason: string | null }>;
  backfillCollisions: Array<{ kind: string; path: string; label: string; reason: string }>;
  redirectProblems: Array<{ id: string; source: string; destination: string; problem: string }>;
  settings: { resolverEnabled: boolean; backfilledAt: string | null; activatedAt: string | null };
};

function useHealth() {
  const [data, setData] = React.useState<HealthData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    const result = await fetchHealth();
    if (result.ok) {
      setData(result.data as HealthData);
      setError(null);
    } else setError(result.error);
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  return { data, error, reload: load };
}

/** Registration, activation and everything that needs a decision. */
export function HealthTab({ origin, canEdit, canActivate, onChanged }: { origin: string; canEdit: boolean; canActivate: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const { data, error, reload } = useHealth();
  const [pending, setPending] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<'on' | 'off' | null>(null);
  const [targets, setTargets] = React.useState<Record<string, string>>({});

  const backfill = async () => {
    setPending('backfill');
    const result = await runBackfillAction();
    setPending(null);
    toast(result.ok ? (result.message ?? 'Done.') : result.error, result.ok ? 'success' : 'error');
    void reload();
    onChanged();
  };

  const switchResolver = async (enabled: boolean) => {
    setPending('resolver');
    const result = await setResolverAction(enabled);
    setPending(null);
    setConfirm(null);
    toast(result.ok ? (result.message ?? 'Saved.') : result.error, result.ok ? 'success' : 'error');
    void reload();
    onChanged();
  };

  const map = async (id: string) => {
    const destination = targets[id]?.trim();
    if (!destination) return;
    setPending(id);
    const result = await mapNotFoundAction(id, destination);
    setPending(null);
    toast(result.ok ? (result.message ?? 'Mapped.') : result.error, result.ok ? 'success' : 'error');
    if (result.ok) void reload();
  };

  const dismiss = async (id: string) => {
    setPending(id);
    const result = await dismissNotFoundAction(id);
    setPending(null);
    if (result.ok) void reload();
  };

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <TableSkeleton rows={6} cols={3} />;

  const contentCollisions = data.backfillCollisions.filter((c) => c.kind === 'content');

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-hairline bg-surface p-4" aria-labelledby="registry-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="registry-heading" className="text-sm font-semibold text-content">
            URL registry
          </h3>
          <Badge tone={data.settings.resolverEnabled ? 'success' : 'warning'}>{data.settings.resolverEnabled ? 'Active' : 'Not active'}</Badge>
        </div>
        <p className="text-sm text-muted">
          Registering records every current address exactly as it is — nothing public changes. Once collisions are reviewed, switching the registry on makes it resolve the public site: moved URLs redirect with 308 before the page renders, and custom URLs work everywhere.
        </p>
        <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2">
          <div>Last registered: {data.settings.backfilledAt ? new Date(data.settings.backfilledAt).toLocaleString() : 'never'}</div>
          <div>Activated: {data.settings.activatedAt ? new Date(data.settings.activatedAt).toLocaleString() : '—'}</div>
        </dl>
        {canActivate ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={backfill} disabled={pending !== null}>
              {pending === 'backfill' ? 'Registering…' : 'Register current URLs'}
            </Button>
            {data.settings.resolverEnabled ? (
              <Button size="sm" variant="outline" onClick={() => setConfirm('off')} disabled={pending !== null}>
                Switch registry off
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirm('on')} disabled={pending !== null || !data.settings.backfilledAt}>
                Switch registry on
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">Only staff with access to every market can register URLs or switch the registry.</p>
        )}
        {data.backfillCollisions.length ? (
          <Alert tone={contentCollisions.length ? 'warning' : 'info'} title={`${data.backfillCollisions.length} collision(s) found when registering`}>
            <ul className="mt-1 space-y-1">
              {data.backfillCollisions.slice(0, 50).map((c, i) => (
                <li key={i} className="break-words">
                  <code>{c.path}</code> — {c.label}: {c.reason}
                </li>
              ))}
            </ul>
          </Alert>
        ) : data.settings.backfilledAt ? (
          <p className="text-xs text-emerald-700">No collisions at the last registration.</p>
        ) : null}
      </section>

      <section className="space-y-2" aria-labelledby="notfound-heading">
        <h3 id="notfound-heading" className="text-sm font-semibold text-content">
          Addresses answering 404 ({data.notFound.length})
        </h3>
        <p className="text-xs text-muted">Recorded from real visits — the path only, never the query string. Map one to a published page, product or article to redirect it.</p>
        <div className="rounded-xl border border-hairline bg-surface">
          {data.notFound.length === 0 ? (
            <EmptyState title="No recorded 404s" description="Missing addresses show up here as visitors hit them." />
          ) : (
            <ul className="divide-y divide-hairline">
              {data.notFound.map((row) => (
                <li key={row.id} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm text-content">{row.path}</p>
                    <p className="text-xs text-muted">
                      {row.hits} hit{row.hits === 1 ? '' : 's'} · last {new Date(row.lastSeenAt).toLocaleString()}
                      {row.referrerHost ? ` · from ${row.referrerHost}` : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-2 lg:w-[26rem] lg:flex-nowrap">
                      <label className="sr-only" htmlFor={`map-${row.id}`}>
                        Redirect {row.path} to
                      </label>
                      <Input
                        id={`map-${row.id}`}
                        placeholder="/destination"
                        value={targets[row.id] ?? ''}
                        onChange={(e) => setTargets((t) => ({ ...t, [row.id]: e.target.value }))}
                        className="h-8 min-w-0 flex-1 font-mono text-xs"
                      />
                      <Button size="sm" onClick={() => void map(row.id)} disabled={pending !== null || !targets[row.id]}>
                        Map
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void dismiss(row.id)} disabled={pending !== null}>
                        Dismiss
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="broken-heading">
        <h3 id="broken-heading" className="text-sm font-semibold text-content">
          Broken internal links ({data.broken.length})
        </h3>
        <p className="text-xs text-muted">Links stored in menus, product buttons and page content that lead to no page and no redirect. Checked against the registry — nothing is fetched.</p>
        {data.broken.length === 0 ? (
          <p className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-muted">None found.</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-xl border border-hairline bg-surface">
            {data.broken.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="min-w-0">
                  {b.where} · <span className="font-medium">{b.label}</span> → <code className="break-all">{b.href}</code>
                </span>
                <Link href={b.adminHref} className="text-brand hover:underline">
                  Fix
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="redirect-problems-heading">
        <h3 id="redirect-problems-heading" className="text-sm font-semibold text-content">
          Redirect problems ({data.redirectProblems.length})
        </h3>
        {data.redirectProblems.length === 0 ? (
          <p className="rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-muted">No chains, loops or dead destinations.</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-xl border border-hairline bg-surface">
            {data.redirectProblems.map((p) => (
              <li key={p.id} className="px-4 py-2 text-sm">
                <code className="break-all">{p.source}</code> → <code className="break-all">{p.destination}</code>
                <p className="text-xs text-muted">{p.problem}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Fix a problem on the Redirects tab. Deleted content keeps its history; its old address needs an intentional replacement — nothing is sent to the home page automatically.</p>
      </section>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void switchResolver(confirm === 'on')}
        pending={pending === 'resolver'}
        tone="primary"
        confirmLabel={confirm === 'on' ? 'Switch on' : 'Switch off'}
        title={confirm === 'on' ? 'Switch the URL registry on?' : 'Switch the URL registry off?'}
        message={
          confirm === 'on'
            ? contentCollisions.length
              ? `${contentCollisions.length} content collision(s) are unresolved: that content keeps being served at its old address, outside the registry, until you resolve it. Everything else resolves through the registry from now on.`
              : 'Every public address resolves through the registry from now on. Nothing changes until you edit a URL.'
            : 'The site goes back to its built-in addresses (/products/…, /blog/…). Custom URLs stop working until you switch it on again; redirects still apply.'
        }
      />
      <span className="sr-only">{origin}</span>
    </div>
  );
}

/** Routes that could not take the address they should have. */
export function ConflictsTab({ origin, canEdit, resolverEnabled, onChanged }: { origin: string; canEdit: boolean; resolverEnabled: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const { data, error, reload } = useHealth();
  const [editing, setEditing] = React.useState<RouteListRow | null>(null);

  const open = async (routeId: string) => {
    const result = await fetchRoute(routeId);
    if (result.ok) setEditing(result.data!);
    else toast(result.error, 'error');
  };

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <TableSkeleton rows={4} cols={3} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        A conflict is never resolved by overwriting the owner or silently adding “-2”: the content keeps its current address until you choose another one or free the wanted one.
      </p>
      {data.conflicts.length === 0 && data.backfillCollisions.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface">
          <EmptyState title="No conflicts" description="Every registered URL has the address its pattern or override asks for." />
        </div>
      ) : null}
      {data.conflicts.length ? (
        <ul className="divide-y divide-hairline rounded-xl border border-hairline bg-surface">
          {data.conflicts.map((c) => (
            <li key={c.routeId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-content">
                  {c.label} <Badge tone="neutral">{c.type}</Badge>
                </p>
                <p className="break-all font-mono text-xs text-muted">
                  At {c.path}, wants {c.wanted}
                </p>
                <p className="text-xs text-red-700">{c.reason}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void open(c.routeId)}>
                Resolve
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {data.backfillCollisions.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-content">Found when registering</h3>
          <ul className="divide-y divide-hairline rounded-xl border border-hairline bg-surface text-sm">
            {data.backfillCollisions.map((c, i) => (
              <li key={i} className="px-4 py-2">
                <code className="break-all">{c.path}</code> — {c.label}
                <p className="text-xs text-muted">{c.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {editing ? (
        <UrlEditor
          route={editing}
          origin={origin}
          canEdit={canEdit}
          resolverEnabled={resolverEnabled}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
