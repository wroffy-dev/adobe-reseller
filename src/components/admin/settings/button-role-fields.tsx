'use client';

import * as React from 'react';
import {
  BUTTON_COLOR_KEYS,
  buttonField,
  previewLook,
  type ButtonRole,
  type ButtonSettings,
} from '@/lib/cms/buttons';
import { Field, Select } from '@/components/ui/field';
import { ColorField } from './color-field';

const COLOR_LABELS: Record<(typeof BUTTON_COLOR_KEYS)[number], string> = {
  Bg: 'Background',
  Text: 'Text',
  Border: 'Border',
  HoverBg: 'Background on hover',
  HoverText: 'Text on hover',
  HoverBorder: 'Border on hover',
};

type Values = Record<string, string | boolean>;

/**
 * A button as the website draws it for one role, normal or hovered.
 *
 * Reads the same `previewLook` the Theme tab does, so the two previews and the
 * public site agree on what a style and a colour produce.
 */
export function ButtonPreview({
  values,
  role,
  hover = false,
  label,
}: {
  values: Values;
  role: ButtonRole;
  hover?: boolean;
  label?: string;
}) {
  const str = (key: string) => String(values[key] ?? '');
  const look = previewLook(values as unknown as ButtonSettings, role);
  const background = hover ? look.hoverBackground : look.background;
  const text = hover ? look.hoverText : look.text;
  const border = (hover ? look.hoverBorder : look.border) || background;
  const radius =
    str(role === 'primary' ? 'buttonPrimaryRadius' : 'buttonSecondaryRadius') ||
    str('buttonRadius') ||
    '0.5rem';

  return (
    <span
      className="inline-flex items-center justify-center text-sm font-semibold"
      style={{
        backgroundColor: background,
        color: text,
        borderStyle: 'solid',
        borderColor: border,
        borderWidth: str('buttonBorderWidth') || '1px',
        borderRadius: radius,
        padding: `${str('buttonPaddingY') || '0.625rem'} ${str('buttonPaddingX') || '1.25rem'}`,
        textTransform: (str('buttonTextTransform') || 'none') as React.CSSProperties['textTransform'],
      }}
    >
      {label ?? (role === 'primary' ? 'Primary button' : 'Secondary button')}
    </span>
  );
}

/** One role's fieldset: its style, six colours and a live preview. */
export function ButtonRoleFields({
  role,
  values,
  errors,
  onChange,
  children,
}: {
  role: ButtonRole;
  values: Values;
  errors: Record<string, string[]>;
  onChange: (key: string, value: string) => void;
  /** Extra controls placed after the style select, such as the shape picker. */
  children?: React.ReactNode;
}) {
  const title = role === 'primary' ? 'Primary button' : 'Secondary button';
  const styleKey = role === 'primary' ? 'buttonPrimaryStyle' : 'buttonSecondaryStyle';

  return (
    <fieldset className="space-y-4 rounded-lg border border-hairline p-4">
      <legend className="px-1 text-sm font-medium text-content">{title}</legend>
      <p className="text-xs text-muted">
        {role === 'primary'
          ? 'The main call to action: the header button, a hero’s first button, product buttons.'
          : 'The second, quieter button beside it, and outline buttons.'}{' '}
        A colour left blank takes its value from the style and the theme.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Style" htmlFor={styleKey}>
          <Select
            id={styleKey}
            value={String(values[styleKey] ?? '') || (role === 'primary' ? 'solid' : 'outline')}
            onChange={(e) => onChange(styleKey, e.target.value)}
          >
            <option value="solid">Solid</option>
            <option value="outline">Outline</option>
            <option value="soft">Soft tint</option>
          </Select>
        </Field>
        {children}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {BUTTON_COLOR_KEYS.map((key) => {
          const name = buttonField(role, key);
          return (
            <ColorField
              key={name}
              label={COLOR_LABELS[key]}
              name={name}
              value={String(values[name] ?? '')}
              error={errors[name]}
              onChange={(v) => onChange(name, v)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-hairline bg-surface p-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Normal</p>
          <ButtonPreview values={values} role={role} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">On hover</p>
          <ButtonPreview values={values} role={role} hover />
        </div>
      </div>
    </fieldset>
  );
}
