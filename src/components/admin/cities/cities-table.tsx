'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ExternalLink, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/states';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { ScoreValue } from '@/components/admin/seo-intelligence/score-badge';
import { deleteCity, setCityActive } from '@/lib/actions/cities';
import type { CityRow } from '@/lib/services/cities';

type Row = Omit<CityRow, 'scores'> & { scores: (Omit<NonNullable<CityRow['scores']>, 'analyzedAt'> & { analyzedAt: string }) | null };

export function CitiesTable({
  rows,
  canManage,
  showCountry,
  filtered,
}: {
  rows: Row[];
  canManage: boolean;
  showCountry: boolean;
  filtered: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = React.useState<{ row: Row; action: 'archive' | 'restore' | 'delete' } | null>(null);
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    if (!confirm) return;
    setPending(true);
    const result =
      confirm.action === 'delete' ? await deleteCity(confirm.row.id) : await setCityActive(confirm.row.id, confirm.action === 'restore');
    setPending(false);
    setConfirm(null);
    toast(result.ok ? (result.message ?? 'Done.') : result.error, result.ok ? 'success' : 'error');
    if (result.ok) router.refresh();
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<MapPin className="h-5 w-5" />}
        title={filtered ? 'No cities match these filters' : 'No cities yet'}
        description={
          filtered
            ? 'Clear a filter to see more.'
            : 'Add the cities you serve. Each gets a landing page — /delhi, /ae/dubai — that you build and edit like any other page.'
        }
      />
    );
  }

  return (
    <>
      <TableWrap>
        <Table>
          <caption className="sr-only">Cities</caption>
          <thead>
            <tr>
              <Th>City</Th>
              {showCountry ? <Th>Country</Th> : null}
              <Th>Public URL</Th>
              <Th>Status</Th>
              <Th>City page</Th>
              <Th align="center">SEO</Th>
              <Th align="center">AEO</Th>
              <Th align="center">GEO</Th>
              <Th align="center">Product pages</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="min-w-[10rem]">
                  <Link href={`/admin/cities/${row.id}`} className="font-medium text-content hover:text-brand">
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted">{row.region ?? '—'}</p>
                </Td>
                {showCountry ? <Td className="whitespace-nowrap text-sm">{row.country.name}</Td> : null}
                <Td>
                  {row.page ? (
                    <code className="break-all rounded bg-muted/10 px-1.5 py-0.5 font-mono text-xs text-muted">{row.page.path}</code>
                  ) : (
                    <span className="text-xs text-muted">No page</span>
                  )}
                </Td>
                <Td>{row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Archived</Badge>}</Td>
                <Td>{row.page ? <ContentStatusBadge status={row.page.status} /> : <Badge tone="warning">Missing</Badge>}</Td>
                <Td align="center">{row.scores ? <ScoreValue score={row.scores.seo} /> : <span className="text-muted">—</span>}</Td>
                <Td align="center">{row.scores ? <ScoreValue score={row.scores.aeo} /> : <span className="text-muted">—</span>}</Td>
                <Td align="center">{row.scores ? <ScoreValue score={row.scores.geo} /> : <span className="text-muted">—</span>}</Td>
                <Td align="center" className="text-sm tabular-nums">{row.productPageCount}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/admin/cities/${row.id}`} className={buttonClasses('ghost', 'sm')} aria-label={`Edit ${row.name}`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden lg:inline">Edit</span>
                    </Link>
                    {row.page && row.page.status === 'PUBLISHED' ? (
                      <a
                        href={row.page.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses('ghost', 'sm')}
                        aria-label={`View ${row.name} (opens in a new tab)`}
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden lg:inline">View</span>
                      </a>
                    ) : null}
                    {canManage ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirm({ row, action: row.isActive ? 'archive' : 'restore' })}
                          aria-label={row.isActive ? `Archive ${row.name}` : `Restore ${row.name}`}
                        >
                          {row.isActive ? <Archive className="h-4 w-4" aria-hidden="true" /> : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => setConfirm({ row, action: 'delete' })}
                          aria-label={`Delete ${row.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        pending={pending}
        confirmLabel={confirm?.action === 'delete' ? 'Delete city' : confirm?.action === 'archive' ? 'Archive' : 'Restore'}
        tone={confirm?.action === 'restore' ? 'primary' : 'danger'}
        title={
          confirm?.action === 'delete'
            ? `Delete ${confirm.row.name}?`
            : confirm?.action === 'archive'
              ? `Archive ${confirm?.row.name}?`
              : `Restore ${confirm?.row.name ?? ''}?`
        }
        message={
          confirm?.action === 'delete'
            ? 'The city record is removed. Its landing page and product pages are kept as ordinary pages, still live and still in Pages — delete them there if you want them gone.'
            : confirm?.action === 'archive'
              ? 'Its landing page and product pages are archived and leave the website. Their content is kept.'
              : 'The city becomes active again. Its pages come back as drafts for you to review and publish.'
        }
      />
    </>
  );
}
