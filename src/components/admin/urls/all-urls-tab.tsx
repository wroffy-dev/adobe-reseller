'use client';

import * as React from 'react';
import { Download, Pencil, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select, Field } from '@/components/ui/field';
import { Table, TableWrap, Th, Td, Tr, StickyThead } from '@/components/ui/table';
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  exportRoutesCsv,
  fetchRouteIds,
  fetchRoutes,
  previewBulk,
  previewRouteEdits,
  validateCsvImport,
} from '@/lib/actions/url-manager';
import type { CsvRowReport, Preview, RouteEdit, RouteListRow } from '@/lib/urls/manager';
import { URL_CONTENT_LABELS, URL_CONTENT_TYPES } from '@/lib/urls/paths';
import { UrlEditor } from './url-editor';
import { BulkRunner } from './bulk-runner';
import { Drawer } from './drawer';
import type { Market } from './types';

type Filters = { q: string; type: string; countryId: string; status: string; mode: string; page: number; pageSize: number };

const DEFAULT_FILTERS: Filters = { q: '', type: '', countryId: '', status: '', mode: '', page: 1, pageSize: 25 };

function readFilters(): Filters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get('q') ?? '',
    type: params.get('type') ?? '',
    countryId: params.get('country') ?? '',
    status: params.get('status') ?? '',
    mode: params.get('mode') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: [25, 50, 100].includes(Number(params.get('size'))) ? Number(params.get('size')) : 25,
  };
}

/** Filters live in the address bar, so a reload or a shared link keeps them — without a navigation. */
function writeFilters(filters: Filters) {
  const params = new URLSearchParams(window.location.search);
  const set = (key: string, value: string | number, fallback: string | number) =>
    value === fallback || value === '' ? params.delete(key) : params.set(key, String(value));
  set('q', filters.q, '');
  set('type', filters.type, '');
  set('country', filters.countryId, '');
  set('status', filters.status, '');
  set('mode', filters.mode, '');
  set('page', filters.page, 1);
  set('size', filters.pageSize, 25);
  const qs = params.toString();
  window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

export function AllUrlsTab({
  initial,
  markets,
  origin,
  canEdit,
  resolverEnabled,
}: {
  initial: { rows: RouteListRow[]; total: number; page: number; pageSize: number };
  markets: Market[];
  origin: string;
  canEdit: boolean;
  resolverEnabled: boolean;
}) {
  const { toast } = useToast();
  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS);
  const [data, setData] = React.useState(initial);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<RouteListRow | null>(null);
  const [bulk, setBulk] = React.useState<{ title: string; edits: RouteEdit[]; preview: Preview } | null>(null);
  const [prefixOpen, setPrefixOpen] = React.useState(false);
  const [csvReport, setCsvReport] = React.useState<{ rows: CsvRowReport[]; edits: RouteEdit[] } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const requestId = React.useRef(0);
  const firstLoad = React.useRef(true);

  const load = React.useCallback(async (next: Filters) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const result = await fetchRoutes({
      q: next.q || undefined,
      type: next.type || undefined,
      countryId: next.countryId || undefined,
      status: next.status || undefined,
      mode: next.mode || undefined,
      page: next.page,
      pageSize: next.pageSize,
    });
    if (id !== requestId.current) return; // a newer request superseded this one
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setData(result.data!);
  }, []);

  // Restore filters from the address bar once, on mount.
  React.useEffect(() => {
    const stored = readFilters();
    setFilters(stored);
    if (JSON.stringify(stored) !== JSON.stringify(DEFAULT_FILTERS)) void load(stored);
  }, [load]);

  // Debounced reload when filters change (search typed, a select changed).
  React.useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    writeFilters(filters);
    const timer = window.setTimeout(() => void load(filters), 250);
    return () => window.clearTimeout(timer);
  }, [filters, load]);

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, page: 1, ...patch }));
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const allOnPage = data.rows.length > 0 && data.rows.every((row) => selected.has(row.id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllMatching = async () => {
    setBusy('select');
    const result = await fetchRouteIds({
      q: filters.q || undefined,
      type: filters.type || undefined,
      countryId: filters.countryId || undefined,
      status: filters.status || undefined,
      mode: filters.mode || undefined,
    });
    setBusy(null);
    if (result.ok) setSelected(new Set(result.data));
    else toast(result.error, 'error');
  };

  const runBulk = async (operation: { op: 'prefix'; from: string; to: string } | { op: 'reset' }, title: string) => {
    setBusy('bulk');
    const result = await previewBulk({ routeIds: [...selected], operation });
    setBusy(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    setPrefixOpen(false);
    setBulk({ title, edits: result.data!.edits, preview: result.data! });
  };

  const exportCsv = async () => {
    setBusy('export');
    const result = await exportRoutesCsv({
      q: filters.q || undefined,
      type: filters.type || undefined,
      countryId: filters.countryId || undefined,
      status: filters.status || undefined,
      mode: filters.mode || undefined,
    });
    setBusy(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    const blob = new Blob([result.data!], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    if (file.size > 2_000_000) {
      toast('That file is larger than 2 MB.', 'error');
      return;
    }
    setBusy('import');
    const result = await validateCsvImport(await file.text());
    setBusy(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    setCsvReport(result.data!);
  };

  const previewCsv = async () => {
    if (!csvReport || csvReport.edits.length === 0) return;
    setBusy('csv-preview');
    const result = await previewRouteEdits(csvReport.edits.slice(0, 200));
    setBusy(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    setBulk({ title: 'Import URLs from CSV', edits: csvReport.edits, preview: result.data! });
    setCsvReport(null);
  };

  const refresh = () => {
    setEditing(null);
    setBulk(null);
    setSelected(new Set());
    void load(filters);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(4,minmax(8rem,1fr))]">
        <Field label="Search" htmlFor="url-q">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input id="url-q" value={filters.q} onChange={(e) => update({ q: e.target.value })} placeholder="Name, path or slug" className="pl-9" />
          </div>
        </Field>
        <Field label="Type" htmlFor="url-type">
          <Select id="url-type" value={filters.type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">All types</option>
            {URL_CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {URL_CONTENT_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Market" htmlFor="url-country">
          <Select id="url-country" value={filters.countryId} onChange={(e) => update({ countryId: e.target.value })}>
            <option value="">All markets</option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="url-status">
          <Select id="url-status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Any status</option>
            <option value="PUBLIC">Public</option>
            <option value="NOT_PUBLIC">Not public</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ARCHIVED">Archived</option>
            <option value="HIDDEN">Hidden</option>
          </Select>
        </Field>
        <Field label="URL mode" htmlFor="url-mode">
          <Select id="url-mode" value={filters.mode} onChange={(e) => update({ mode: e.target.value })}>
            <option value="">Default & custom</option>
            <option value="PATTERN">Follows pattern</option>
            <option value="CUSTOM">Custom</option>
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {selected.size > 0 ? (
            <>
              <span className="font-medium text-content">{selected.size} selected</span>
              {canEdit ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setPrefixOpen(true)} disabled={!resolverEnabled || busy !== null}>
                    Replace prefix…
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runBulk({ op: 'reset' }, 'Reset to pattern')} disabled={!resolverEnabled || busy !== null}>
                    Reset to pattern
                  </Button>
                </>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={selectAllMatching} disabled={busy !== null || data.total === 0}>
              {busy === 'select' ? 'Selecting…' : `Select all ${Math.min(data.total, 500)} matching`}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={busy !== null}>
            <Download className="h-4 w-4" aria-hidden="true" /> {busy === 'export' ? 'Exporting…' : 'Export CSV'}
          </Button>
          {canEdit ? (
            <label className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-[0.8125rem] text-content hover:bg-muted/5 ${!resolverEnabled ? 'pointer-events-none opacity-50' : ''}`}>
              <Upload className="h-4 w-4" aria-hidden="true" /> {busy === 'import' ? 'Checking…' : 'Import CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={!resolverEnabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void importCsv(file);
                }}
              />
            </label>
          ) : null}
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="relative rounded-xl border border-hairline bg-surface">
        {loading && data.rows.length === 0 ? (
          <TableSkeleton rows={8} cols={6} />
        ) : data.rows.length === 0 ? (
          <EmptyState title="No URLs match" description="Try another search or filter. If nothing is registered yet, run “Register current URLs” on the URL Health tab." />
        ) : (
          <TableWrap maxHeight="65vh" className="sm:mx-0" aria-busy={loading}>
            <Table stickyHeader className="min-w-[56rem]">
              <StickyThead>
                <tr>
                  <Th className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select every URL on this page"
                      checked={allOnPage}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          for (const row of data.rows) {
                            if (allOnPage) next.delete(row.id);
                            else next.add(row.id);
                          }
                          return next;
                        })
                      }
                    />
                  </Th>
                  <Th>Content</Th>
                  <Th>Market</Th>
                  <Th>Public path</Th>
                  <Th>Status</Th>
                  <Th>Mode</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </StickyThead>
              <tbody className={loading ? 'opacity-60' : undefined}>
                {data.rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <input type="checkbox" aria-label={`Select ${row.label}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                    </Td>
                    <Td className="max-w-[16rem]">
                      <p className="truncate font-medium text-content" title={row.label}>
                        {row.label || '(untitled)'}
                      </p>
                      <p className="text-xs text-muted">{row.typeLabel}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-sm">{row.countryName}</Td>
                    <Td className="max-w-[20rem]">
                      <p className="break-all font-mono text-xs text-content">{row.path}</p>
                      {row.conflictPath ? <p className="mt-0.5 text-xs text-red-600">Conflict: wants {row.conflictPath}</p> : null}
                    </Td>
                    <Td>
                      <Badge tone={row.isPublic ? 'success' : 'warning'}>{row.isPublic ? 'Public' : row.status.toLowerCase()}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={row.mode === 'CUSTOM' ? 'purple' : 'neutral'}>{row.mode === 'CUSTOM' ? 'Custom' : 'Default'}</Badge>
                    </Td>
                    <Td align="right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(row)} aria-label={`Edit URL of ${row.label}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" /> {canEdit ? 'Edit' : 'View'}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>

      <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted" aria-label="Pagination">
        <span>
          {data.total} URL{data.total === 1 ? '' : 's'} · page {data.page} of {pages}
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span>Per page</span>
            <Select value={String(filters.pageSize)} onChange={(e) => update({ pageSize: Number(e.target.value) })} className="h-8 w-20" aria-label="Rows per page">
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <Button size="sm" variant="outline" disabled={filters.page <= 1 || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={filters.page >= pages || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
            Next
          </Button>
        </div>
      </nav>

      {editing ? (
        <UrlEditor route={editing} origin={origin} canEdit={canEdit} resolverEnabled={resolverEnabled} onClose={() => setEditing(null)} onSaved={refresh} />
      ) : null}

      {bulk ? <BulkRunner title={bulk.title} edits={bulk.edits} preview={bulk.preview} origin={origin} onClose={() => setBulk(null)} onDone={refresh} /> : null}

      {prefixOpen ? <PrefixDialog count={selected.size} busy={busy === 'bulk'} onClose={() => setPrefixOpen(false)} onPreview={(from, to) => runBulk({ op: 'prefix', from, to }, `Replace ${from || '/'} with ${to || '/'}`)} /> : null}

      {csvReport ? (
        <Drawer
          open
          onClose={() => setCsvReport(null)}
          title="Check the import"
          description="Every row is validated before anything is applied."
          footer={
            <>
              <Button variant="outline" onClick={() => setCsvReport(null)}>
                Cancel
              </Button>
              <Button onClick={previewCsv} disabled={csvReport.edits.length === 0 || busy !== null}>
                {busy === 'csv-preview' ? 'Checking…' : `Preview ${csvReport.edits.length} change(s)`}
              </Button>
            </>
          }
        >
          <CsvReport rows={csvReport.rows} />
        </Drawer>
      ) : null}
    </div>
  );
}

function PrefixDialog({ count, busy, onClose, onPreview }: { count: number; busy: boolean; onClose: () => void; onPreview: (from: string, to: string) => void }) {
  const [from, setFrom] = React.useState('/products');
  const [to, setTo] = React.useState('/');
  return (
    <Drawer
      open
      width="md"
      onClose={onClose}
      title="Replace a path prefix"
      description={`Applies to the ${count} selected URL(s). Market prefixes (/ae…) are kept automatically.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onPreview(from, to)} disabled={busy}>
            {busy ? 'Checking…' : 'Preview'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Replace" htmlFor="prefix-from" hint="e.g. /products — only URLs that start with it change; the rest are listed as excluded.">
          <Input id="prefix-from" value={from} onChange={(e) => setFrom(e.target.value)} className="font-mono" />
        </Field>
        <Field label="With" htmlFor="prefix-to" hint="“/” removes the prefix: /products/dropbox → /dropbox. Or e.g. /software.">
          <Input id="prefix-to" value={to} onChange={(e) => setTo(e.target.value)} className="font-mono" />
        </Field>
        <p className="text-xs text-muted">Each changed URL becomes a custom path for its market. Reset to pattern undoes it.</p>
      </div>
    </Drawer>
  );
}

const CSV_TONE: Record<CsvRowReport['status'], 'success' | 'neutral' | 'danger' | 'warning'> = {
  change: 'success',
  unchanged: 'neutral',
  skipped: 'neutral',
  invalid: 'danger',
  duplicate: 'danger',
  'not-found': 'warning',
};

function CsvReport({ rows }: { rows: CsvRowReport[] }) {
  const counts = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} tone={CSV_TONE[status as CsvRowReport['status']]}>
            {count} {status}
          </Badge>
        ))}
      </div>
      <ul className="divide-y divide-hairline rounded-lg border border-hairline text-sm">
        {rows.slice(0, 500).map((row) => (
          <li key={row.line} className="space-y-0.5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Line {row.line}</span>
              <span className="font-medium text-content">{row.label}</span>
              <Badge tone={CSV_TONE[row.status]}>{row.status}</Badge>
            </div>
            <p className="break-all font-mono text-xs text-muted">
              {row.current ?? '—'} → {row.target || '—'}
            </p>
            {row.message ? <p className="text-xs text-muted">{row.message}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
