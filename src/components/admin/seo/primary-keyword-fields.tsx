'use client';

import { Field, Input } from '@/components/ui/field';

/**
 * Three primary keyword fields — the phrases a page is written to rank for.
 *
 * Deliberately three and no more: SEO Intelligence checks each of them across
 * the title, description, headings and copy, and a page aimed at ten phrases
 * is aimed at none.
 */
export function PrimaryKeywordFields({
  values,
  onChange,
  idPrefix = 'kw',
  disabled,
  hint = 'Up to three phrases this page should rank for. Used by SEO Intelligence and as meta keywords.',
}: {
  values: string[];
  onChange: (next: string[]) => void;
  idPrefix?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const slots = [0, 1, 2].map((i) => values[i] ?? '');
  const set = (index: number, value: string) => onChange(slots.map((current, i) => (i === index ? value : current)));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-content">Primary keywords</legend>
      <p className="text-xs leading-relaxed text-muted">{hint}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {slots.map((value, index) => (
          <Field key={index} label={`Keyword ${index + 1}`} htmlFor={`${idPrefix}-${index}`}>
            <Input
              id={`${idPrefix}-${index}`}
              value={value}
              maxLength={120}
              disabled={disabled}
              onChange={(e) => set(index, e.target.value)}
              placeholder={index === 0 ? 'Main phrase' : 'Optional'}
            />
          </Field>
        ))}
      </div>
    </fieldset>
  );
}
