import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { HEALTH_LABELS, healthOf, type Health } from '@/lib/seo-intelligence/types';

/** Health bands are UI labels only: 90+ Excellent, 75+ Good, 50+ Needs improvement. */
export const HEALTH_TONE: Record<Health, BadgeTone> = {
  excellent: 'success',
  good: 'info',
  'needs-improvement': 'warning',
  poor: 'danger',
};

const TEXT: Record<Health, string> = {
  excellent: 'text-emerald-600',
  good: 'text-sky-600',
  'needs-improvement': 'text-amber-600',
  poor: 'text-red-600',
};

/** A score as a coloured number, with its health band for screen readers. */
export function ScoreValue({ score, className }: { score: number; className?: string }) {
  const health = healthOf(score);
  return (
    <span className={cn('font-semibold tabular-nums', TEXT[health], className)} title={HEALTH_LABELS[health]}>
      {score}
      <span className="sr-only"> ({HEALTH_LABELS[health]})</span>
    </span>
  );
}

export function HealthBadge({ score }: { score: number }) {
  const health = healthOf(score);
  return <Badge tone={HEALTH_TONE[health]}>{HEALTH_LABELS[health]}</Badge>;
}

/** A labelled score tile: "SEO 82". */
export function ScoreTile({ label, score, hint }: { label: string; score: number | null; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-surface px-3 py-2">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-xl">{score === null ? <span className="text-muted">—</span> : <ScoreValue score={score} />}</p>
      {hint ? <p className="truncate text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
