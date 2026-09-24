'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/field';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import { buttonClasses } from '@/components/ui/button';

/**
 * Blog search.
 *
 * The query lives in the URL, so the results are server-rendered, shareable and
 * paginated — the client part is only the field itself: submit on Enter, a
 * clear button once something is typed, and a pending indicator while the
 * server renders the next result.
 */
export function BlogSearch({
  action,
  placeholder,
  buttonLabel,
  showButton = true,
  layout = 'inline',
  maxWidth,
  compact,
  className,
}: {
  /** Where the search lands, e.g. `/blog`. */
  action: string;
  placeholder?: string;
  buttonLabel?: string;
  showButton?: boolean;
  layout?: 'inline' | 'stacked' | 'wide';
  maxWidth?: string;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('q') ?? '';

  const [value, setValue] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const inputId = React.useId();

  // A back/forward navigation must not leave a stale query in the field.
  React.useEffect(() => setValue(initial), [initial]);

  const go = React.useCallback(
    (next: string) => {
      const search = new URLSearchParams();
      // Only `q` survives a new search: page 3 of the previous query is
      // meaningless for a different one.
      const category = params.get('category');
      if (category) search.set('category', category);
      if (next.trim()) search.set('q', next.trim());
      const qs = search.toString();
      startTransition(() => router.push(qs ? `${action}?${qs}` : action));
    },
    [action, params, router],
  );

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        go(value);
      }}
      className={cn(
        'flex gap-2',
        layout === 'stacked' && 'flex-col',
        layout === 'wide' ? 'w-full' : 'w-full',
        className,
      )}
      style={maxWidth ? { maxWidth } : undefined}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder || 'Search articles'}
          aria-label={placeholder || 'Search articles'}
          className={cn('pl-9', value ? 'pr-9' : undefined, compact && 'h-9 text-[0.8125rem]')}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue('');
              go('');
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:bg-muted/10 hover:text-content"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showButton ? (
        <button
          type="submit"
          className={buttonClasses('primary', compact ? 'sm' : 'md', 'btn-tokens shrink-0')}
        >
          {pending ? <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {buttonLabel || 'Search'}
        </button>
      ) : null}

      {pending && !showButton ? (
        <span className="sr-only" role="status">
          Searching…
        </span>
      ) : null}
    </form>
  );
}
