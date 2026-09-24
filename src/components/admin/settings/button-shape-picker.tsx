'use client';

import * as React from 'react';
import { BUTTON_SHAPES, buttonShapeOf } from '@/lib/cms/buttons';
import { Input } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';

/** The swatch each chip draws, small enough that 999px and 4px read apart. */
const SWATCH_RADIUS: Record<string, string> = {
  square: '0',
  slight: '2px',
  rounded: '4px',
  pill: '999px',
};

/**
 * Button shapes, picked by sight.
 *
 * A row of chips, each drawing its shape, plus "Custom" for any other radius.
 * "Custom" is a mode kept here rather than read off the value, so typing a
 * value that happens to equal a preset keeps the input open instead of
 * snapping shut mid-edit. `inheritLabel` adds a first chip that stores blank.
 */
export function ButtonShapePicker({
  id,
  label,
  value,
  onChange,
  inheritLabel,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  inheritLabel?: string;
  error?: string[];
  hint?: string;
}) {
  const preset = buttonShapeOf(value);
  const [custom, setCustom] = React.useState(() => value.trim() !== '' && !preset);

  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
      active
        ? 'border-brand bg-brand/10 text-content'
        : 'border-hairline bg-surface text-muted hover:text-content',
    );

  const swatch = (radius: string) => (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-7 border-2 border-current"
      style={{ borderRadius: radius }}
    />
  );

  return (
    <div className="space-y-2 sm:col-span-2">
      <p id={`${id}-label`} className="text-sm font-medium text-content">
        {label}
      </p>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {inheritLabel ? (
          <button
            type="button"
            aria-pressed={!custom && value.trim() === ''}
            className={chip(!custom && value.trim() === '')}
            onClick={() => {
              setCustom(false);
              onChange('');
            }}
          >
            {inheritLabel}
          </button>
        ) : null}
        {BUTTON_SHAPES.map((shape) => {
          const active = !custom && preset?.id === shape.id;
          return (
            <button
              key={shape.id}
              type="button"
              aria-pressed={active}
              className={chip(active)}
              onClick={() => {
                setCustom(false);
                onChange(shape.radius);
              }}
            >
              {swatch(SWATCH_RADIUS[shape.id]!)}
              {shape.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={custom}
          className={chip(custom)}
          onClick={() => setCustom(true)}
        >
          Custom
        </button>
      </div>
      {custom ? (
        <Input
          id={id}
          value={value}
          placeholder="0.75rem"
          aria-label={`${label}: custom radius`}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {error?.length ? <p className="text-xs text-red-600">{error[0]}</p> : null}
    </div>
  );
}
