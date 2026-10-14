'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { Spinner } from '@/components/ui/icons';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { recalculateAllSeo } from '@/lib/actions/seo-intelligence';
import type { AnalysisRow } from '@/lib/services/seo-intelligence';
import { ENTITY_LABELS } from '@/lib/seo-intelligence/types';
import { AnalysisDrawer } from './analysis-panel';
import { ScoreValue } from './score-badge';

export function RecalculateAllButton({ label = 'Recalculate all' }: { label?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await recalculateAllSeo();
        setPending(false);
        toast(result.ok ? (result.message ?? 'Done.') : result.error, result.ok ? 'success' : 'error');
        if (result.ok) router.refresh();
      }}
    >
      {pending ? <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
      {pending ? 'Analysing…' : label}
    </Button>
  );
}

export function AnalysisTable({
  rows,
  countryNames,
  showCountry,
  filtered,
}: {
  rows: AnalysisRow[];
  countryNames: Record<string, string>;
  showCountry: boolean;
  filtered: boolean;
}) {
  const [open, setOpen] = React.useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-5 w-5" />}
        title={filtered ? 'Nothing matches these filters' : 'Nothing analysed yet'}
        description={
          filtered
            ? 'Clear a filter to see more.'
            : 'Run the first analysis to score every page, product and city page. Scores are then kept up to date as content is saved.'
        }
        action={filtered ? undefined : <RecalculateAllButton label="Run first analysis" />}
      />
    );
  }

  return (
    <>
      <TableWrap>
        <Table>
          <caption className="sr-only">SEO Intelligence results</caption>
          <thead>
            <tr>
              <Th>Page</Th>
              <Th>Type</Th>
              {showCountry ? <Th>Country</Th> : null}
              <Th align="center">SEO</Th>
              <Th align="center">AEO</Th>
              <Th align="center">GEO</Th>
              <Th align="center">Overall</Th>
              <Th>Issues</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="min-w-[14rem]">
                  <button
                    type="button"
                    onClick={() => setOpen(row.id)}
                    className="text-left font-medium text-content hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  >
                    {row.label}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <code className="break-all rounded bg-muted/10 px-1.5 py-0.5 font-mono text-xs text-muted">{row.path}</code>
                    {row.entityType !== 'SITE' ? <ContentStatusBadge status={row.status} /> : null}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">{ENTITY_LABELS[row.entityType]}</Td>
                {showCountry ? <Td className="whitespace-nowrap text-sm">{countryNames[row.countryId] ?? '—'}</Td> : null}
                <Td align="center"><ScoreValue score={row.seo} /></Td>
                <Td align="center"><ScoreValue score={row.aeo} /></Td>
                <Td align="center"><ScoreValue score={row.geo} /></Td>
                <Td align="center"><ScoreValue score={row.overall} className="text-base" /></Td>
                <Td className="whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    {row.critical ? <Badge tone="danger">{row.critical} critical</Badge> : null}
                    {row.warnings ? <Badge tone="warning">{row.warnings} warning{row.warnings === 1 ? '' : 's'}</Badge> : null}
                    {!row.critical && !row.warnings ? <Badge tone="success">No issues</Badge> : null}
                    <Button size="sm" variant="ghost" onClick={() => setOpen(row.id)} aria-label={`View analysis of ${row.label}`}>
                      View
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <AnalysisDrawer analysisId={open} onClose={() => setOpen(null)} />
    </>
  );
}
