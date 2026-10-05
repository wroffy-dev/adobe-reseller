import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';
import { NavIcon } from './nav-icon';

export type StatTone = 'default' | 'brand' | 'success' | 'danger' | 'warning';

const VALUE_TONE: Record<StatTone, string> = {
  default: 'text-content',
  brand: 'text-brand',
  success: 'text-emerald-600',
  danger: 'text-red-600',
  warning: 'text-amber-600',
};

const ICON_TONE: Record<StatTone, string> = {
  default: 'bg-muted/10 text-muted',
  brand: 'bg-brand/10 text-brand',
  success: 'bg-emerald-50 text-emerald-600',
  danger: 'bg-red-50 text-red-600',
  warning: 'bg-amber-50 text-amber-600',
};

/**
 * KPI tile: a small uppercase label, an icon tile, the value, and optionally a
 * hint, a trend chip and a sparkline.
 *
 * Colour is reserved for values that carry meaning. A trend chip always shows
 * an arrow and a sign, so it never relies on colour alone; `invertTrend` is for
 * metrics where up is bad (lost leads, errors).
 */
export function StatCard({
  label,
  value,
  hint,
  href,
  icon,
  tone = 'default',
  trend,
  invertTrend = false,
  sparkline,
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  /** NavIcon key. */
  icon?: string;
  tone?: StatTone;
  /** Change against the previous period, in percent. */
  trend?: number | null;
  invertTrend?: boolean;
  /** A short series drawn as a 72px sparkline. */
  sparkline?: number[];
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">{label}</p>
        {icon ? (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', ICON_TONE[tone])}>
            <NavIcon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={cn('ui-stat-value text-[1.625rem] leading-tight sm:text-[1.75rem]', VALUE_TONE[tone])}>
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
        {sparkline && sparkline.length > 1 ? <Sparkline values={sparkline} /> : null}
      </div>

      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {typeof trend === 'number' && Number.isFinite(trend) ? <TrendChip value={trend} invert={invertTrend} /> : null}
        {hint ? <p className="min-w-0 truncate text-xs text-muted" title={hint}>{hint}</p> : null}
      </div>
    </>
  );

  const shell = cn('ui-stat glass-card group flex h-full flex-col rounded-xl p-4 sm:p-5', className);

  if (href) {
    return (
      <Link href={href} className={cn(shell, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand')}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}

function TrendChip({ value, invert }: { value: number; invert: boolean }) {
  const up = value > 0;
  const flat = value === 0;
  const good = flat ? null : invert ? !up : up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums',
        good === null ? 'bg-muted/10 text-muted' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
      )}
    >
      {flat ? null : <Arrow className="h-3 w-3" aria-hidden="true" />}
      {up ? '+' : ''}
      {Math.round(value * 10) / 10}%
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 72;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 text-brand" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
