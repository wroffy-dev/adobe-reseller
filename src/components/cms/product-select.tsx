'use client';

import * as React from 'react';
import { listProductOptions, type PickerOption } from '@/lib/actions/pickers';
import { OrderedMultiSelect } from './ordered-multi-select';
import { Select } from '@/components/ui/field';

/**
 * Ordered product picker.
 *
 * The add/reorder/remove behaviour moved into `OrderedMultiSelect` when the
 * blog needed the same control for posts and categories, so there is one
 * implementation rather than three.
 */
export function ProductMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [options, setOptions] = React.useState<PickerOption[]>([]);

  React.useEffect(() => {
    listProductOptions()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  return (
    <OrderedMultiSelect
      value={value}
      onChange={onChange}
      options={options}
      addLabel="Add a product…"
      emptyLabel="No products selected."
      itemNoun="product"
    />
  );
}

/**
 * One product, or none. A product chosen earlier that the market no longer
 * lists stays selected and is named as such, rather than silently cleared.
 */
export function ProductSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [options, setOptions] = React.useState<PickerOption[] | null>(null);

  React.useEffect(() => {
    listProductOptions()
      .then(setOptions)
      .catch(() => setOptions([]));
  }, []);

  const known = options === null || !value || options.some((o) => o.value === value);
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{options === null ? 'Loading products…' : 'No product — written by hand'}</option>
      {!known && value ? <option value={value}>A product this market no longer lists</option> : null}
      {(options ?? []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
