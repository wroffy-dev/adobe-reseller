'use client';

import * as React from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Spinner } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { recalculateSeoEntity } from '@/lib/actions/seo-intelligence';
import type { AnalysisDetail } from '@/lib/services/seo-intelligence';
import { AnalysisDrawer } from './analysis-panel';
import { ScoreValue } from './score-badge';

/**
 * SEO · AEO · GEO for the content being edited, in one line.
 *
 * Shows the stored result straight away and refreshes it in the background
 * when the content has changed since it was analysed, so opening an editor
 * never waits on an analysis. A product has one result per market; the card
 * shows one market at a time.
 */
export function SeoScoreCard({
  target,
  initial,
  stale,
  countryNames,
  canRecalculate = true,
}: {
  target: { kind: 'page' | 'product' | 'post'; id: string };
  initial: AnalysisDetail[];
  /** True when the content changed after it was last analysed. */
  stale: boolean;
  countryNames?: Record<string, string>;
  canRecalculate?: boolean;
}) {
  const { toast } = useToast();
  const [rows, setRows] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);
  const [countryId, setCountryId] = React.useState(initial[0]?.countryId ?? '');
  const ran = React.useRef(false);

  const refresh = React.useCallback(
    async (announce: boolean) => {
      setPending(true);
      const result = await recalculateSeoEntity(target);
      setPending(false);
      if (!result.ok) {
        if (announce) toast(result.error, 'error');
        return;
      }
      const next = result.data ?? [];
      setRows(next);
      setCountryId((current) => (next.some((r) => r.countryId === current) ? current : (next[0]?.countryId ?? '')));
      if (announce) toast('Scores updated.');
    },
    [target, toast],
  );

  React.useEffect(() => {
    if (ran.current || !canRecalculate) return;
    ran.current = true;
    if (stale || initial.length === 0) void refresh(false);
  }, [stale, initial.length, refresh, canRecalculate]);

  const active = rows.find((r) => r.countryId === countryId) ?? rows[0] ?? null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> SEO Intelligence
        </span>
        {active ? (
          <dl className="flex items-center gap-4 text-sm">
            {(
              [
                ['SEO', active.seo],
                ['AEO', active.aeo],
                ['GEO', active.geo],
              ] as const
            ).map(([label, score]) => (
              <div key={label} className="flex items-baseline gap-1.5">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-base">
                  <ScoreValue score={score} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="text-sm text-muted">{pending ? 'Analysing…' : 'Not analysed yet.'}</span>
        )}
        {rows.length > 1 && countryNames ? (
          <Select
            aria-label="Country"
            value={active?.countryId ?? ''}
            onChange={(e) => setCountryId(e.target.value)}
            className="h-8 w-auto py-0 text-xs"
          >
            {rows.map((row) => (
              <option key={row.countryId} value={row.countryId}>
                {countryNames[row.countryId] ?? row.countryId}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canRecalculate ? (
          <Button size="sm" variant="ghost" onClick={() => refresh(true)} disabled={pending} aria-label="Recalculate scores">
            {pending ? <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">Recalculate</span>
          </Button>
        ) : null}
        <Button size="sm" variant="outline" disabled={!active} onClick={() => active && setOpen(active.id)}>
          View analysis
        </Button>
      </div>
      <AnalysisDrawer analysisId={open} initial={active} onClose={() => setOpen(null)} />
    </div>
  );
}
