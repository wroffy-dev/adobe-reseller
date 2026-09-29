'use client';

import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Field } from '@/components/ui/field';
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { fetchHistory, restoreHistoryApply, restoreHistoryPreview } from '@/lib/actions/url-manager';
import type { Preview } from '@/lib/urls/manager';
import { Drawer } from './drawer';
import { PreviewPanel, type ApplyOptions } from './preview-panel';

type HistoryRow = {
  id: string;
  batchId: string | null;
  routeId: string | null;
  label: string;
  oldPath: string | null;
  newPath: string | null;
  action: string;
  note: string | null;
  actor: string;
  createdAt: string;
  restorable: boolean;
};

const ACTION_TONE: Record<string, 'neutral' | 'brand' | 'info' | 'warning' | 'danger' | 'success' | 'purple'> = {
  created: 'success',
  renamed: 'brand',
  bulk: 'purple',
  pattern: 'purple',
  reset: 'info',
  restored: 'info',
  deleted: 'danger',
  redirect: 'neutral',
  registered: 'neutral',
};

export function HistoryTab({ origin, canEdit, onChanged }: { origin: string; canEdit: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ rows: HistoryRow[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState<{ row: HistoryRow; preview: Preview } | null>(null);
  const [options, setOptions] = React.useState<ApplyOptions>({ updateLinks: false, updateCanonicals: false });
  const [pending, setPending] = React.useState<string | null>(null);
  const request = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++request.current;
    const result = await fetchHistory({ q: q || undefined, page });
    if (id !== request.current) return;
    if (!result.ok) setError(result.error);
    else {
      setError(null);
      setData(result.data as { rows: HistoryRow[]; total: number; pageSize: number });
    }
  }, [q, page]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const startRestore = async (row: HistoryRow) => {
    setPending(row.id);
    const result = await restoreHistoryPreview(row.id);
    setPending(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    setOptions({ updateLinks: false, updateCanonicals: false });
    setRestoring({ row, preview: result.data! });
  };

  const applyRestore = async () => {
    if (!restoring) return;
    setPending('apply');
    const result = await restoreHistoryApply(restoring.row.id, { token: restoring.preview.token, ...options });
    setPending(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Restored.');
    setRestoring(null);
    void load();
    onChanged();
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Field label="Search history" htmlFor="history-q" className="max-w-md">
        <Input id="history-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name or path" />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="rounded-xl border border-hairline bg-surface">
        {!data ? (
          <TableSkeleton rows={6} cols={4} />
        ) : data.rows.length === 0 ? (
          <EmptyState title="No URL changes yet" description="Every address change — by hand, in bulk, from a pattern or from a content edit — is recorded here with who made it." />
        ) : (
          <ul className="divide-y divide-hairline">
            {data.rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-content">{row.label}</span>
                    <Badge tone={ACTION_TONE[row.action] ?? 'neutral'}>{row.action}</Badge>
                  </div>
                  <p className="flex flex-wrap items-center gap-1.5 break-all font-mono text-xs text-muted">
                    <span>{row.oldPath ?? '—'}</span>
                    <ArrowRight className="h-3 w-3 shrink-0" aria-label="to" />
                    <span className="text-content">{row.newPath ?? '—'}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {row.actor} · <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time>
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                </div>
                {canEdit && row.restorable ? (
                  <Button size="sm" variant="outline" onClick={() => void startRestore(row)} disabled={pending !== null} className="shrink-0">
                    {pending === row.id ? 'Checking…' : `Restore ${row.oldPath}`}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && data.total > data.pageSize ? (
        <nav className="flex items-center justify-between text-sm text-muted" aria-label="Pagination">
          <span>
            {data.total} changes · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </nav>
      ) : null}

      {restoring ? (
        <Drawer
          open
          onClose={() => setRestoring(null)}
          title={`Restore ${restoring.row.oldPath}`}
          description="Ownership is checked again when you apply. The current address keeps a redirect to the restored one, and the redirect from the old address is removed."
          footer={
            <>
              <Button variant="outline" onClick={() => setRestoring(null)}>
                Cancel
              </Button>
              <Button onClick={applyRestore} disabled={pending !== null || restoring.preview.summary.conflicts > 0 || restoring.preview.errors.length > 0}>
                {pending === 'apply' ? 'Restoring…' : 'Restore'}
              </Button>
            </>
          }
        >
          <PreviewPanel preview={restoring.preview} origin={origin} options={options} onOptions={setOptions} />
        </Drawer>
      ) : null}
    </div>
  );
}
