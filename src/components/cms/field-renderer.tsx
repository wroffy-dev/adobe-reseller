'use client';

import * as React from 'react';
import { Plus, Trash, ChevronDown, GripVertical, Copy, PackagePlus } from 'lucide-react';
import type { FieldDescriptor } from '@/lib/cms/fields';
import { isFieldVisible, readFieldPath, writeFieldPath } from '@/lib/cms/fields';
import { Field, Input, Textarea, Select, Switch, Label } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { MediaPicker } from '@/components/admin/media-picker';
import { RichTextEditor } from './rich-text-editor';
import { ProductMultiSelect, ProductSelect } from './product-select';
import { listProductsForImport } from '@/lib/actions/pickers';
import { FormSelect } from './form-select';
import { IconSelect } from './icon-select';
import { CategorySelect, BrandSelect } from './taxonomy-select';
import {
  BlogCategorySelect,
  BlogTagSelect,
  BlogPostSelect,
  BlogAuthorSelect,
  BlogPostMultiSelect,
  BlogCategoryMultiSelect,
} from './blog-select';
import { UnitInput, ColorInput } from './design-controls';
import { newItemId, withFreshItemIds } from '@/lib/cms/item-id';
import { cn } from '@/lib/utils/cn';

export type FieldValues = Record<string, unknown>;

const WIDTH_CLASS: Record<string, string> = {
  full: 'sm:col-span-2',
  half: 'sm:col-span-1',
  third: 'sm:col-span-1',
};

/**
 * Renders an entire block editor from its field descriptors.
 *
 * Nothing here knows about specific block types — that is what lets a new block
 * ship with only a schema and a renderer.
 */
export function FieldList({
  fields,
  values,
  onChange,
  idPrefix,
}: {
  fields: FieldDescriptor[];
  values: FieldValues;
  onChange: (name: string, value: unknown) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields
        .filter((field) => isFieldVisible(field, values))
        .map((field) => (
          <div
            key={field.name}
            className={cn(WIDTH_CLASS[('width' in field && field.width) || 'full'])}
          >
            <FieldControl
              field={field}
              value={readFieldPath(values, field.name)}
              onChange={(value) => onChange(field.name, value)}
              id={`${idPrefix}-${field.name}`}
            />
          </div>
        ))}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  id,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
  id: string;
}) {
  switch (field.kind) {
    case 'text':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <Input
            id={id}
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case 'url':
      return (
        <Field
          label={field.label}
          htmlFor={id}
          hint={field.help ?? 'Internal path (/pricing) or full URL'}
        >
          <Input
            id={id}
            type="text"
            inputMode="url"
            value={typeof value === 'string' ? value : ''}
            placeholder={field.placeholder ?? '/contact'}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case 'textarea':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <Textarea
            id={id}
            rows={field.rows ?? 3}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case 'richtext':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <RichTextEditor
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={onChange}
          />
        </Field>
      );

    case 'number':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <Input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
      );

    case 'boolean':
      return (
        <div className="rounded-lg border border-hairline p-3">
          <Switch
            checked={Boolean(value)}
            onChange={onChange}
            label={field.label}
            hint={field.help}
          />
        </div>
      );

    case 'select':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <Select
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );

    case 'media':
      return (
        <Field label={field.label} hint={field.help}>
          <MediaPicker
            value={typeof value === 'string' ? value : null}
            onChange={onChange}
            label={field.label}
          />
        </Field>
      );

    case 'form':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <FormSelect id={id} value={typeof value === 'string' ? value : ''} onChange={onChange} />
        </Field>
      );

    case 'products':
      return (
        <Field label={field.label} hint={field.help}>
          <ProductMultiSelect
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
          />
        </Field>
      );

    case 'product':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <ProductSelect
            id={id}
            value={typeof value === 'string' && value ? value : null}
            onChange={onChange}
          />
        </Field>
      );

    case 'productCategory':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <CategorySelect
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next || null)}
          />
        </Field>
      );

    case 'brand':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <BrandSelect
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next || null)}
          />
        </Field>
      );

    case 'blogCategory':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <BlogCategorySelect
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next || null)}
          />
        </Field>
      );

    case 'blogTag':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <BlogTagSelect
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next || null)}
          />
        </Field>
      );

    case 'blogPost':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <BlogPostSelect
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next || null)}
          />
        </Field>
      );

    case 'blogAuthor':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <BlogAuthorSelect
            id={id}
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(next || null)}
          />
        </Field>
      );

    case 'blogPosts':
      return (
        <Field label={field.label} hint={field.help}>
          <BlogPostMultiSelect
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
          />
        </Field>
      );

    case 'blogCategories':
      return (
        <Field label={field.label} hint={field.help}>
          <BlogCategoryMultiSelect
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
          />
        </Field>
      );

    case 'icon':
      return (
        <Field label={field.label} hint={field.help}>
          <IconSelect value={typeof value === 'string' ? value : ''} onChange={onChange} id={id} />
        </Field>
      );

    case 'color':
      return (
        <ColorInput
          label={field.label}
          id={id}
          hint={field.help}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
        />
      );

    case 'length':
      return (
        <Field label={field.label} htmlFor={id} hint={field.help}>
          <UnitInput
            id={id}
            value={typeof value === 'string' ? value : ''}
            aria-label={field.label}
            placeholder={field.placeholder}
            onChange={onChange}
          />
        </Field>
      );

    case 'repeater':
      return <Repeater field={field} value={value} onChange={onChange} idPrefix={id} />;

    default:
      return null;
  }
}

/**
 * Repeater with add / remove / reorder.
 *
 * A repeater whose item shape is a single field called "value" edits a plain
 * string[] (bullet lists), otherwise it edits an array of objects.
 */
function Repeater({
  field,
  value,
  onChange,
  idPrefix,
}: {
  field: Extract<FieldDescriptor, { kind: 'repeater' }>;
  value: unknown;
  onChange: (value: unknown) => void;
  idPrefix: string;
}) {
  const isPrimitive = field.fields.length === 1 && field.fields[0]?.name === 'value';
  const raw = Array.isArray(value) ? value : [];

  const items: FieldValues[] = isPrimitive
    ? raw.map((v) => ({ value: typeof v === 'string' ? v : '' }))
    : raw.map((v) => (typeof v === 'object' && v !== null ? (v as FieldValues) : {}));

  const [openIndex, setOpenIndex] = React.useState<number | null>(items.length === 0 ? null : 0);

  const commit = (next: FieldValues[]) => {
    onChange(isPrimitive ? next.map((item) => String(item.value ?? '')) : next);
  };

  /** A new row: each field at its default, and its own id when rows carry one. */
  const blankItem = (): FieldValues => {
    const blank: FieldValues = {};
    for (const sub of field.fields) {
      if (sub.defaultValue !== undefined) {
        blank[sub.name] = sub.defaultValue;
        continue;
      }
      blank[sub.name] =
        sub.kind === 'boolean'
          ? false
          : sub.kind === 'media' ||
              sub.kind === 'product' ||
              sub.kind === 'productCategory' ||
              sub.kind === 'brand' ||
              sub.kind === 'blogCategory' ||
              sub.kind === 'blogTag' ||
              sub.kind === 'blogPost' ||
              sub.kind === 'blogAuthor'
            ? null
            : sub.kind === 'repeater' ||
                sub.kind === 'products' ||
                sub.kind === 'blogPosts' ||
                sub.kind === 'blogCategories'
              ? []
              : '';
    }
    if (field.identity) blank.id = newItemId();
    return blank;
  };

  const add = () => {
    if (field.max && items.length >= field.max) return;
    commit([...items, blankItem()]);
    setOpenIndex(items.length);
  };

  const [importing, setImporting] = React.useState(false);
  const [importNote, setImportNote] = React.useState<string | null>(null);

  /**
   * Fills the list from the repeater's importer in one go. Rows already in the
   * list are left exactly as they are — their names and styles may have been
   * edited — and only what is missing is added, up to the repeater's limit.
   */
  const importAll = async () => {
    if (field.importer !== 'products') return;
    setImporting(true);
    setImportNote(null);
    try {
      const rows = await listProductsForImport();
      const present = new Set(items.map((item) => item.productId).filter(Boolean));
      const missing = rows.filter((row) => !present.has(row.productId));
      const room = field.max ? Math.max(field.max - items.length, 0) : missing.length;
      const added = missing.slice(0, room).map((row) => ({ ...blankItem(), productId: row.productId, name: row.name }));
      if (added.length > 0) {
        commit([...items, ...added]);
        setOpenIndex(null);
      }
      setImportNote(
        rows.length === 0
          ? 'No products found in this market.'
          : added.length === 0
            ? missing.length > 0
              ? `The list is full (${field.max} at most).`
              : 'Every product is already in the list.'
            : `Added ${added.length} product${added.length === 1 ? '' : 's'}${missing.length > added.length ? ` — ${missing.length - added.length} more did not fit (${field.max} at most)` : ''}. Save the section to keep them.`,
      );
    } catch {
      setImportNote('Products could not be loaded. Try again.');
    } finally {
      setImporting(false);
    }
  };

  const removeAll = () => {
    if (items.length === 0) return;
    if (!window.confirm(`Remove all ${items.length} ${field.itemLabel.toLowerCase()}s from this list?`)) return;
    commit([]);
    setOpenIndex(null);
    setImportNote(null);
  };

  /** A copy placed right after the original; with identity, every id is new. */
  const duplicate = (index: number) => {
    if (field.max && items.length >= field.max) return;
    const source = items[index];
    if (!source) return;
    const copy = field.identity ? withFreshItemIds(structuredClone(source)) : structuredClone(source);
    const next = [...items];
    next.splice(index + 1, 0, copy);
    commit(next);
    setOpenIndex(index + 1);
  };

  const remove = (index: number) => {
    commit(items.filter((_, i) => i !== index));
    setOpenIndex(null);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    commit(next);
    setOpenIndex(target);
  };

  const update = (index: number, name: string, fieldValue: unknown) => {
    commit(items.map((item, i) => (i === index ? { ...item, [name]: fieldValue } : item)));
  };

  return (
    <fieldset className="rounded-lg border border-hairline p-3">
      <legend className="px-1 text-sm font-medium text-content">{field.label}</legend>
      {field.help ? <p className="mb-2 text-xs text-muted">{field.help}</p> : null}

      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted">No {field.itemLabel.toLowerCase()}s yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const title = String(item[field.titleField] ?? '') || `${field.itemLabel} ${index + 1}`;
            const isOpen = openIndex === index;
            return (
              <li
                key={typeof item.id === 'string' && item.id ? item.id : index}
                className="rounded-lg border border-hairline bg-surface"
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <span className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${title} up`}
                      className="rounded px-1 text-[0.625rem] leading-none text-muted hover:text-content disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label={`Move ${title} down`}
                      className="rounded px-1 text-[0.625rem] leading-none text-muted hover:text-content disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </span>
                  <GripVertical className="h-4 w-4 shrink-0 text-muted/50" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="min-w-0 flex-1 truncate py-1 text-left text-sm text-content"
                  >
                    {title}
                  </button>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted transition-transform',
                      isOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                  {!isPrimitive ? (
                    <button
                      type="button"
                      onClick={() => duplicate(index)}
                      disabled={Boolean(field.max && items.length >= field.max)}
                      aria-label={`Duplicate ${title}`}
                      title="Duplicate"
                      className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content disabled:opacity-30"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${title}`}
                    className="rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isOpen ? (
                  <div className="border-t border-hairline p-3">
                    {isPrimitive ? (
                      <Field label={field.fields[0]!.label} htmlFor={`${idPrefix}-${index}`}>
                        <Input
                          id={`${idPrefix}-${index}`}
                          value={String(item.value ?? '')}
                          onChange={(e) => update(index, 'value', e.target.value)}
                        />
                      </Field>
                    ) : (
                      <FieldList
                        fields={field.fields}
                        values={item}
                        onChange={(name, fieldValue) => update(index, name, fieldValue)}
                        idPrefix={`${idPrefix}-${index}`}
                      />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={add}
          disabled={Boolean(field.max && items.length >= field.max)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add {field.itemLabel.toLowerCase()}
        </Button>
        {field.importer === 'products' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={importAll}
            disabled={importing || Boolean(field.max && items.length >= field.max)}
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            {importing ? 'Loading products…' : 'Add all products'}
          </Button>
        ) : null}
        {field.importer && items.length > 1 ? (
          <Button variant="ghost" size="sm" onClick={removeAll}>
            <Trash className="h-4 w-4" aria-hidden="true" />
            Remove all
          </Button>
        ) : null}
      </div>
      {importNote ? (
        <p className="mt-2 text-xs text-muted" role="status">
          {importNote}
        </p>
      ) : null}
    </fieldset>
  );
}

export { Label };
