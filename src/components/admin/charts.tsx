import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/format';

/**
 * Deliberately dependency-free charts.
 *
 * The dashboard needs three simple shapes; adding a charting library for them
 * would cost more client JS than the whole admin shell.
 */
export function BarChart({
  data,
  label,
  height = 160,
}: {
  data: Array<{ date: string; count: number }>;
  label: string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <figure>
      <figcaption className="sr-only">
        {label}: {total} in total across {data.length} days.
      </figcaption>
      <div
        className="flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={`${label}. ${total} leads over ${data.length} days.`}
      >
        {data.map((point) => (
          <div
            key={point.date}
            className="group relative flex-1 rounded-t bg-brand/20 transition-colors hover:bg-brand/40"
            style={{ height: `${Math.max(2, (point.count / max) * 100)}%` }}
          >
            <span className="pointer-events-none absolute bottom-full left-1/2 z-tooltip mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[rgb(var(--primary))] px-2 py-1 text-[0.6875rem] text-[rgb(var(--primary-fg))] shadow-md group-hover:block">
              {new Date(point.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              : {point.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>
          {data[0]
            ? new Date(data[0].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : ''}
        </span>
        <span>
          {data[data.length - 1]
            ? new Date(data[data.length - 1]!.date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })
            : ''}
        </span>
      </div>
    </figure>
  );
}

export function HorizontalBars({
  items,
  emptyLabel = 'No data yet',
}: {
  items: Array<{ label: string; count: number; href?: string }>;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-content group-hover:text-brand">{item.label}</span>
              <span className="shrink-0 font-medium text-muted">{formatNumber(item.count)}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/15">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={item.label}>
            {/* A row is only a link when the caller can say what it filters —
                otherwise it stays plain text rather than looking clickable and
                going nowhere. */}
            {item.href ? (
              <Link
                href={item.href}
                className="group block rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {body}
              </Link>
            ) : (
              <div className="px-1 py-0.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FunnelBars({
  stages,
}: {
  stages: Array<{ label: string; count: number; tone?: string }>;
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ul className="space-y-2.5">
      {stages.map((stage) => (
        <li key={stage.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-muted">{stage.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded bg-muted/10">
            <div
              className={cn('flex h-full items-center rounded px-2', stage.tone ?? 'bg-brand/70')}
              style={{ width: `${Math.max(4, (stage.count / max) * 100)}%` }}
            >
              <span className="text-[0.6875rem] font-semibold text-white">{stage.count}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
 * Dashboard charts
 * ------------------------------------------------------------------------- */

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Rounds a maximum up to 1, 2 or 5 × 10ⁿ so gridline labels read cleanly. */
function niceCeiling(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Change against a previous value as a percentage — or null when the previous
 * value is too small for a percentage to mean anything (5 → 154 is "+2980%",
 * which says less than the two numbers do). Callers show the raw numbers then.
 */
export function percentChange(current: number, previous: number, minBase = 10): number | null {
  if (previous < minBase) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Daily series as an area chart with a summary above it.
 *
 * The figures that matter (period total, daily average, busiest day, change
 * against the previous period) are written out, so the chart never has to be
 * read precisely. Hover shows a day's value; for keyboards and screen readers
 * the same values are in a disclosed table rather than 30 extra tab stops.
 */
export function TrendChart({
  data,
  previousTotal,
  noun = 'leads',
  height = 176,
}: {
  data: Array<{ date: string; count: number }>;
  previousTotal: number;
  noun?: string;
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const average = data.length ? total / data.length : 0;
  const busiest = data.reduce<{ date: string; count: number } | null>(
    (best, d) => (!best || d.count > best.count ? d : best),
    null,
  );
  const change = percentChange(total, previousTotal);
  const ceiling = niceCeiling(Math.max(1, ...data.map((d) => d.count)));
  const gridlines = [ceiling, ceiling / 2, 0];

  const n = Math.max(1, data.length - 1);
  const points = data.map((d, i) => [(i / n) * 100, 100 - (d.count / ceiling) * 100] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  const area = points.length ? `${line} L100,100 L0,100 Z` : '';

  return (
    <figure className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Summary label={`Total ${noun}`}>
          <span className="ui-stat-value text-xl">{formatNumber(total)}</span>
          {change !== null ? <ChangeChip value={change} /> : null}
        </Summary>
        <Summary label="Daily average">
          <span className="ui-stat-value text-xl">{average.toFixed(1)}</span>
        </Summary>
        <Summary label="Busiest day">
          <span className="ui-stat-value text-xl">{busiest ? formatNumber(busiest.count) : '–'}</span>
          {busiest && busiest.count > 0 ? (
            <span className="text-xs text-muted">{shortDate(busiest.date)}</span>
          ) : null}
        </Summary>
        <Summary label="Previous period">
          <span className="ui-stat-value text-xl">{formatNumber(previousTotal)}</span>
        </Summary>
      </dl>

      <div className="flex gap-2">
        {/* Y-axis labels, aligned to the gridlines. */}
        <div className="relative w-7 shrink-0 text-right text-[0.6875rem] tabular-nums text-muted" style={{ height }} aria-hidden="true">
          {gridlines.map((value, i) => (
            <span
              key={value}
              className="absolute right-0 -translate-y-1/2 leading-none"
              style={{ top: `${(i / (gridlines.length - 1)) * 100}%` }}
            >
              {formatNumber(value)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          {gridlines.map((value, i) => (
            <div
              key={value}
              className={cn('absolute inset-x-0 border-t', i === gridlines.length - 1 ? 'border-hairline' : 'border-dashed border-hairline/70')}
              style={{ top: `${(i / (gridlines.length - 1)) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible text-brand"
            role="img"
            aria-label={`${formatNumber(total)} ${noun} over ${data.length} days, ${average.toFixed(1)} a day on average${
              change !== null ? `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(change))}% on the previous period` : ''
            }.`}
          >
            <defs>
              <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#trend-fill)" />
            <path d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>

          {/* Hover targets: one column per day, with a guide line, a dot and a tooltip. */}
          <div className="absolute inset-0 flex" aria-hidden="true">
            {data.map((point, i) => {
              const top = 100 - (point.count / ceiling) * 100;
              const edge = i < 3 ? 'left-0' : i > data.length - 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';
              return (
                <div key={point.date} className="group relative h-full flex-1">
                  <div className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-brand/30 group-hover:block" />
                  <div
                    className="absolute left-1/2 hidden h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[rgb(var(--surface))] bg-brand shadow group-hover:block"
                    style={{ top: `${top}%` }}
                  />
                  <div
                    className={cn(
                      'pointer-events-none absolute z-tooltip mb-2 hidden whitespace-nowrap rounded-lg bg-[rgb(var(--primary))] px-2.5 py-1.5 text-xs text-[rgb(var(--primary-fg))] shadow-md group-hover:block',
                      edge,
                    )}
                    style={{ bottom: `${100 - top}%` }}
                  >
                    <span className="font-semibold tabular-nums">{formatNumber(point.count)}</span>{' '}
                    {point.count === 1 ? noun.replace(/s$/, '') : noun} · {shortDate(point.date)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-between pl-9 text-xs text-muted" aria-hidden="true">
        <span>{data[0] ? shortDate(data[0].date) : ''}</span>
        <span>{data.length > 2 ? shortDate(data[Math.floor(data.length / 2)]!.date) : ''}</span>
        <span>{data.length ? shortDate(data[data.length - 1]!.date) : ''}</span>
      </div>

      <details className="group/table text-sm">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
          Show daily figures
        </summary>
        <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-hairline">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[rgb(var(--surface))]">
              <tr className="text-left text-muted">
                <th scope="col" className="px-3 py-2 font-medium">Date</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{noun[0]!.toUpperCase() + noun.slice(1)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {[...data].reverse().map((point) => (
                <tr key={point.date}>
                  <td className="px-3 py-1.5 text-content">{shortDate(point.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-content">{formatNumber(point.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">{children}</dd>
    </div>
  );
}

/** Up/down chip with an arrow and a sign, so it never relies on colour alone. */
export function ChangeChip({ value, invert = false }: { value: number; invert?: boolean }) {
  const rounded = Math.round(value);
  const flat = rounded === 0;
  const up = rounded > 0;
  const good = flat ? null : invert ? !up : up;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums',
        good === null ? 'bg-muted/10 text-muted' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
      )}
    >
      {flat ? null : <Arrow className="h-3 w-3" aria-hidden="true" />}
      {up ? '+' : ''}
      {rounded}%<span className="sr-only"> on the previous period</span>
    </span>
  );
}

/**
 * Where open leads sit right now, stage by stage, and how decided leads ended.
 *
 * These are a snapshot of current statuses, not a cohort moving through a
 * funnel — a stage can hold more leads than the one before it — so each stage
 * shows its share of the open pipeline rather than a "conversion" rate.
 * Counts sit outside the bars so they keep full contrast at any bar width.
 */
export function PipelineStages({
  stages,
  won,
  lost,
  wonHref,
  lostHref,
}: {
  stages: Array<{ label: string; count: number; href: string }>;
  won: number;
  lost: number;
  wonHref: string;
  lostHref: string;
}) {
  const open = stages.reduce((sum, s) => sum + s.count, 0);
  const max = Math.max(1, ...stages.map((s) => s.count));
  const decided = won + lost;

  return (
    <div className="space-y-5">
      <ul className="space-y-1">
        {stages.map((stage) => {
          const share = open ? Math.round((stage.count / open) * 100) : 0;
          return (
            <li key={stage.label}>
              <Link
                href={stage.href}
                className="group grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="truncate text-sm text-content group-hover:text-brand">{stage.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted/10">
                  <span
                    className="block h-full rounded-full bg-brand/80 motion-safe:transition-[width] motion-safe:duration-500"
                    style={{ width: `${stage.count ? Math.max(3, (stage.count / max) * 100) : 0}%` }}
                  />
                </span>
                <span className="w-16 text-right text-sm tabular-nums">
                  <span className="font-semibold text-content">{formatNumber(stage.count)}</span>
                  <span className="ml-1 text-xs text-muted">{share}%</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 gap-2 border-t border-hairline pt-4">
        <Link
          href={wonHref}
          className="glass-chip flex items-center gap-2.5 rounded-xl border border-hairline px-3 py-2.5 transition-colors hover:border-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold tabular-nums text-content">{formatNumber(won)}</span>
            <span className="block text-xs text-muted">Won</span>
          </span>
        </Link>
        <Link
          href={lostHref}
          className="glass-chip flex items-center gap-2.5 rounded-xl border border-hairline px-3 py-2.5 transition-colors hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold tabular-nums text-content">{formatNumber(lost)}</span>
            <span className="block text-xs text-muted">Lost</span>
          </span>
        </Link>
      </div>
      <p className="text-xs text-muted">
        {decided > 0
          ? `Win rate ${Math.round((won / decided) * 100)}% across ${formatNumber(decided)} decided ${decided === 1 ? 'lead' : 'leads'}.`
          : 'No leads have been won or lost yet.'}{' '}
        {formatNumber(open)} open.
      </p>
    </div>
  );
}
