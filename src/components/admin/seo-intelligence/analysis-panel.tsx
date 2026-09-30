'use client';

import * as React from 'react';
import { CircleCheck, Lightbulb, OctagonAlert, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/admin/urls/drawer';
import { Alert } from '@/components/ui/states';
import { Spinner } from '@/components/ui/icons';
import { getSeoAnalysis } from '@/lib/actions/seo-intelligence';
import type { AnalysisDetail } from '@/lib/services/seo-intelligence';
import { CATEGORY_LABELS, ENTITY_LABELS, type Finding } from '@/lib/seo-intelligence/types';
import { cn } from '@/lib/utils/cn';
import { HealthBadge, ScoreTile } from './score-badge';

/**
 * The full analysis of one page: scores, keywords, and every check grouped by
 * what to do about it. Each failed check says what was found — the reason
 * points were lost — and what to change.
 */
export function AnalysisPanel({ analysis }: { analysis: AnalysisDetail }) {
  const failed = analysis.findings.filter((f) => !f.passed);
  const groups: Array<{ id: string; title: string; icon: React.ReactNode; items: Finding[] }> = [
    {
      id: 'critical',
      title: 'Critical',
      icon: <OctagonAlert className="h-4 w-4 text-red-600" aria-hidden="true" />,
      items: failed.filter((f) => f.severity === 'critical'),
    },
    {
      id: 'warning',
      title: 'Warnings',
      icon: <TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />,
      items: failed.filter((f) => f.severity === 'warning'),
    },
    {
      id: 'info',
      title: 'Suggestions',
      icon: <Lightbulb className="h-4 w-4 text-sky-600" aria-hidden="true" />,
      items: failed.filter((f) => f.severity === 'info'),
    },
  ];
  const passed = analysis.findings.filter((f) => f.passed);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="neutral">{ENTITY_LABELS[analysis.entityType]}</Badge>
        <code className="break-all rounded bg-muted/10 px-1.5 py-0.5 font-mono">{analysis.path}</code>
        <span>Analysed {new Date(analysis.analyzedAt).toLocaleString()}</span>
      </div>

      <div className={cn('grid gap-2', analysis.local === null ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-5')}>
        <ScoreTile label="Overall" score={analysis.overall} />
        <ScoreTile label="SEO" score={analysis.seo} />
        <ScoreTile label="AEO" score={analysis.aeo} />
        <ScoreTile label="GEO" score={analysis.geo} />
        {analysis.local !== null ? <ScoreTile label="Local" score={analysis.local} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <HealthBadge score={analysis.overall} />
        <p className="text-xs leading-relaxed text-muted">
          Overall = 50% SEO + 25% AEO + 25% GEO. AEO and GEO are this site’s own heuristics, not scores from Google or
          any AI platform.
        </p>
      </div>

      <section aria-labelledby="kw-heading">
        <h3 id="kw-heading" className="text-sm font-semibold text-content">
          Primary keywords
        </h3>
        {analysis.keywords.length ? (
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {analysis.keywords.map((keyword, index) => (
              <li key={keyword}>
                <Badge tone={index === 0 ? 'brand' : 'neutral'}>
                  {index + 1}. {keyword}
                </Badge>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-muted">None set. Add up to three in the SEO settings of this content.</p>
        )}
      </section>

      {groups.map((group) =>
        group.items.length ? (
          <section key={group.id} aria-label={group.title}>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-content">
              {group.icon}
              {group.title} <span className="font-normal text-muted">({group.items.length})</span>
            </h3>
            <ul className="mt-2 space-y-2">
              {group.items.map((item) => (
                <FindingItem key={item.id} finding={item} />
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {failed.length === 0 ? <Alert tone="success">Every check passed.</Alert> : null}

      <details className="rounded-lg border border-hairline">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-content">
          <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Passed <span className="font-normal text-muted">({passed.length})</span>
        </summary>
        <ul className="space-y-1 border-t border-hairline px-3 py-2">
          {passed.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="text-content">{item.title}</span>
              <span className="text-xs text-muted">{item.description}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function FindingItem({ finding }: { finding: Finding }) {
  return (
    <li className="rounded-lg border border-hairline bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-content">{finding.title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone="neutral">{CATEGORY_LABELS[finding.category]}</Badge>
          <span className="text-xs tabular-nums text-muted">
            {finding.points}/{finding.maxPoints} pts
          </span>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        <span className="font-medium text-content">Why: </span>
        {finding.description}
      </p>
      {finding.recommendation ? (
        <p className="mt-1 text-sm text-content">
          <span className="font-medium">Do: </span>
          {finding.recommendation}
        </p>
      ) : null}
    </li>
  );
}

/** A drawer that loads one stored analysis by id. */
export function AnalysisDrawer({
  analysisId,
  initial,
  onClose,
}: {
  analysisId: string | null;
  initial?: AnalysisDetail | null;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<AnalysisDetail | null>(initial ?? null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!analysisId) return;
    if (initial && initial.id === analysisId) {
      setData(initial);
      return;
    }
    let live = true;
    setData(null);
    setError(null);
    getSeoAnalysis(analysisId).then((result) => {
      if (!live) return;
      if (result.ok && result.data) setData(result.data);
      else if (!result.ok) setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [analysisId, initial]);

  return (
    <Drawer open={Boolean(analysisId)} onClose={onClose} title={data?.label ?? 'SEO analysis'} description="What was checked, what it scored and why.">
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : data ? (
        <AnalysisPanel analysis={data} />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
        </p>
      )}
    </Drawer>
  );
}
