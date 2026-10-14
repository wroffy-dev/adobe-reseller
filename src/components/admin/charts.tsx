import Link from 'next/link';
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
