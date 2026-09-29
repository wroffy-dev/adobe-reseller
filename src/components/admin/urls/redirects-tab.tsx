'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Select, Field, Switch, Textarea } from '@/components/ui/field';
import { Table, TableWrap, Th, Td, Tr, StickyThead } from '@/components/ui/table';
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { deleteRedirectAction, fetchRedirects, saveRedirectAction, toggleRedirectAction } from '@/lib/actions/url-manager';
import { redirectStatusLabel } from '@/lib/urls/paths';
import { Drawer } from './drawer';

type RedirectRow = {
  id: string;
  source: string;
  destination: string;
  type: 'PERMANENT' | 'TEMPORARY';
  isActive: boolean;
  hitCount: number;
  lastHitAt: string | null;
  note: string | null;
  origin: string;
  targetLabel: string | null;
  keyed: boolean;
  createdAt: string;
};

const ORIGIN_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  AUTO: 'Automatic',
  HEALTH: 'From URL Health',
  IMPORT: 'Imported',
};

export function RedirectsTab({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const [q, setQ] = React.useState('');
  const [origin, setOrigin] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ rows: RedirectRow[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Partial<RedirectRow> | null>(null);
  const [deleting, setDeleting] = React.useState<RedirectRow | null>(null);
  const [pending, setPending] = React.useState(false);
  const request = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++request.current;
    const result = await fetchRedirects({ q: q || undefined, origin: origin || undefined, page });
    if (id !== request.current) return;
    if (!result.ok) setError(result.error);
    else {
      setError(null);
      setData(result.data as { rows: RedirectRow[]; total: number; pageSize: number });
    }
  }, [q, origin, page]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggle = async (row: RedirectRow) => {
    const result = await toggleRedirectAction(row.id, !row.isActive);
    toast(result.ok ? (result.message ?? 'Saved.') : result.error, result.ok ? 'success' : 'error');
    if (result.ok) void load();
  };

  const remove = async () => {
    if (!deleting) return;
    setPending(true);
    const result = await deleteRedirectAction(deleting.id);
    setPending(false);
    toast(result.ok ? 'Redirect deleted.' : result.error, result.ok ? 'success' : 'error');
    setDeleting(null);
    if (result.ok) void load();
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <Alert tone="info" title="How redirects answer">
        Permanent rules answer <strong>308</strong> and temporary ones <strong>307</strong> — the codes Next.js actually sends (they keep the request method, unlike 301/302). Browsers and search engines cache permanent redirects; after changing or removing one, a visitor who already followed it may keep being sent to the old destination until their cache clears, so prefer a temporary rule while you are still deciding.
      </Alert>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="redirect-q" className="min-w-[14rem] flex-1">
          <Input id="redirect-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Source, destination or note" />
        </Field>
        <Field label="Origin" htmlFor="redirect-origin">
          <Select id="redirect-origin" value={origin} onChange={(e) => { setOrigin(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {Object.entries(ORIGIN_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {canEdit ? (
          <Button onClick={() => setEditing({ type: 'PERMANENT', isActive: true })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add redirect
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="rounded-xl border border-hairline bg-surface">
        {!data ? (
          <TableSkeleton rows={6} cols={5} />
        ) : data.rows.length === 0 ? (
          <EmptyState title="No redirects" description="Redirects appear here when a public URL moves, or when you add one." />
        ) : (
          <TableWrap maxHeight="60vh" className="sm:mx-0">
            <Table stickyHeader className="min-w-[52rem]">
              <StickyThead>
                <tr>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Status</Th>
                  <Th align="right">Hits</Th>
                  <Th>On</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </StickyThead>
              <tbody>
                {data.rows.map((row) => (
                  <Tr key={row.id}>
                    <Td className="max-w-[16rem]">
                      <p className="break-all font-mono text-xs text-content">{row.source}</p>
                      <p className="text-xs text-muted">
                        {ORIGIN_LABEL[row.origin] ?? row.origin}
                        {!row.keyed ? ' · not applied (see URL Health)' : ''}
                      </p>
                    </Td>
                    <Td className="max-w-[18rem]">
                      <p className="break-all font-mono text-xs text-content">{row.destination}</p>
                      {row.targetLabel ? <p className="text-xs text-muted">{row.targetLabel}</p> : null}
                      {row.note ? <p className="text-xs italic text-muted">{row.note}</p> : null}
                    </Td>
                    <Td>
                      <Badge tone={row.type === 'PERMANENT' ? 'info' : 'warning'}>{redirectStatusLabel(row.type)}</Badge>
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {row.hitCount}
                      {row.lastHitAt ? <p className="text-[0.7rem] text-muted">{new Date(row.lastHitAt).toLocaleDateString()}</p> : null}
                    </Td>
                    <Td>
                      <Switch checked={row.isActive} onChange={() => void toggle(row)} disabled={!canEdit} label={<span className="sr-only">Enabled</span>} />
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      {canEdit ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(row)} className="text-red-600">
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>

      {data && data.total > data.pageSize ? (
        <nav className="flex items-center justify-between text-sm text-muted" aria-label="Pagination">
          <span>
            {data.total} redirects · page {page} of {pages}
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

      {editing ? (
        <RedirectEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        pending={pending}
        title="Delete redirect?"
        message={deleting ? `${deleting.source} will answer 404 (unless content lives there). Visitors whose browsers cached a permanent redirect may still be sent on for a while.` : ''}
      />
    </div>
  );
}

function RedirectEditor({ initial, onClose, onSaved }: { initial: Partial<RedirectRow>; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [source, setSource] = React.useState(initial.source ?? '');
  const [destination, setDestination] = React.useState(initial.destination ?? '');
  const [type, setType] = React.useState<'PERMANENT' | 'TEMPORARY'>(initial.type ?? 'PERMANENT');
  const [isActive, setIsActive] = React.useState(initial.isActive ?? true);
  const [note, setNote] = React.useState(initial.note ?? '');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setPending(true);
    setError(null);
    const result = await saveRedirectAction({ id: initial.id ?? null, source, destination, type, isActive, note: note || null });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast(result.message ?? 'Saved.');
    onSaved();
  };

  return (
    <Drawer
      open
      width="md"
      onClose={onClose}
      title={initial.id ? 'Edit redirect' : 'Add redirect'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !source || !destination}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="From" htmlFor="redirect-source" hint="A path on this site, with the market prefix when it is a market’s URL: /old-plan or /ae/old-plan. It may not be a live page’s address.">
          <Input id="redirect-source" value={source} onChange={(e) => setSource(e.target.value)} className="font-mono" autoComplete="off" />
        </Field>
        <Field label="To" htmlFor="redirect-destination" hint="A path on this site or a full https:// URL. If it is itself redirected, the final address is stored so there is no chain.">
          <Input id="redirect-destination" value={destination} onChange={(e) => setDestination(e.target.value)} className="font-mono" autoComplete="off" />
        </Field>
        <Field label="Type" htmlFor="redirect-type">
          <Select id="redirect-type" value={type} onChange={(e) => setType(e.target.value as 'PERMANENT' | 'TEMPORARY')}>
            <option value="PERMANENT">308 Permanent — the move is final</option>
            <option value="TEMPORARY">307 Temporary — may change back</option>
          </Select>
        </Field>
        <Switch checked={isActive} onChange={setIsActive} label="Enabled" />
        <Field label="Note" htmlFor="redirect-note">
          <Textarea id="redirect-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Drawer>
  );
}
