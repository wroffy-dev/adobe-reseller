import * as React from 'react';
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted/15', className)} {...props} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-9 flex-1', c === 0 && 'max-w-[16rem]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon ? (
        <div className="ui-empty-icon mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/10 text-muted">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-content">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
  } as const;
  const Icon = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: OctagonAlert }[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('ui-alert rounded-lg border px-4 py-3 text-sm', tones[tone], className)}
    >
      {/* The tone icon is shown in the admin only (admin-ui.css), so screens
          outside it render exactly as before. */}
      <Icon className="ui-alert-icon hidden h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="ui-alert-body min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-1')}>{children}</div> : null}
      </div>
    </div>
  );
}
