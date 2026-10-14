'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export type AdminTab = { id: string; label: string; badge?: number | string };

/**
 * Horizontal tab strip used by every large edit screen, so a long form becomes
 * a few short ones instead of one overwhelming page.
 */
export function AdminTabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: AdminTab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === active);
    const next =
      event.key === 'ArrowRight'
        ? tabs[(index + 1) % tabs.length]
        : tabs[(index - 1 + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn('ui-tabs scroll-x flex items-center gap-1 border-b border-hairline', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'ui-tab relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
              selected ? 'font-medium text-brand' : 'text-muted hover:text-content',
            )}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.badge !== undefined && tab.badge !== 0 ? (
                <span className="rounded-full bg-muted/15 px-1.5 text-[0.6875rem] font-semibold text-muted">
                  {tab.badge}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-x-1 -bottom-px h-0.5 rounded-full transition-colors',
                selected ? 'bg-brand' : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  active,
  children,
  className,
}: {
  id: string;
  active: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className={className}>
      {children}
    </div>
  );
}
