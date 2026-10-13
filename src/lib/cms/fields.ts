/**
 * Declarative field descriptors.
 *
 * The admin block editor is generated from these, so adding a new CMS block
 * means adding a schema + field list — never touching the editor UI.
 */

export type FieldWidth = 'full' | 'half' | 'third';

/**
 * Conditional visibility. A control with `showWhen` stays hidden until another
 * field in the same group holds one of the listed values, which keeps the basic
 * editing surface small without pushing advanced options into raw JSON.
 */
export type FieldCondition = { field: string; equals: Array<string | number | boolean> };

type FieldVariant =
  | {
      kind: 'text';
      name: string;
      label: string;
      help?: string;
      placeholder?: string;
      width?: FieldWidth;
    }
  | {
      kind: 'textarea';
      name: string;
      label: string;
      help?: string;
      rows?: number;
      width?: FieldWidth;
    }
  | { kind: 'richtext'; name: string; label: string; help?: string; width?: FieldWidth }
  | {
      kind: 'number';
      name: string;
      label: string;
      help?: string;
      min?: number;
      max?: number;
      width?: FieldWidth;
    }
  | { kind: 'boolean'; name: string; label: string; help?: string; width?: FieldWidth }
  | {
      kind: 'select';
      name: string;
      label: string;
      help?: string;
      options: Array<{ label: string; value: string }>;
      width?: FieldWidth;
    }
  | {
      kind: 'url';
      name: string;
      label: string;
      help?: string;
      placeholder?: string;
      width?: FieldWidth;
    }
  | { kind: 'media'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'form'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'products'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'productCategory'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'brand'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Single blog category, loaded from Blog → Categories. */
  | { kind: 'blogCategory'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Single blog tag, loaded from Blog → Tags. */
  | { kind: 'blogTag'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Single published post. */
  | { kind: 'blogPost'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Ordered, hand-picked list of posts. */
  | { kind: 'blogPosts'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Ordered, hand-picked list of categories. */
  | { kind: 'blogCategories'; name: string; label: string; help?: string; width?: FieldWidth }
  /** A staff member used as the post author. */
  | { kind: 'blogAuthor'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Searchable picker over the allow-listed CMS icon set. */
  | { kind: 'icon'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Colour picker and hex input, kept in sync. */
  | { kind: 'color'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Number + unit control producing a CSS length such as "40px". */
  | {
      kind: 'length';
      name: string;
      label: string;
      help?: string;
      placeholder?: string;
      width?: FieldWidth;
    }
  | {
      kind: 'repeater';
      name: string;
      label: string;
      help?: string;
      itemLabel: string;
      /** Field on the item used as the collapsed row title. */
      titleField: string;
      fields: FieldDescriptor[];
      max?: number;
      /**
       * Items carry a stable `id`: a new or duplicated row gets its own, so a
       * row keeps its identity when rows are reordered.
       */
      identity?: boolean;
    };

export type FieldDescriptor = FieldVariant & {
  showWhen?: FieldCondition;
  /**
   * What a new repeater item starts this field at.
   *
   * Without one a blank item takes the empty value for its kind, which is
   * right for a text box and wrong for a switch the block's schema defaults to
   * on: the row would be saved with the switch off and the administrator would
   * have to turn on something nobody turned off.
   */
  defaultValue?: unknown;
};

export type FieldKind = FieldVariant['kind'];

/** Evaluates a descriptor's `showWhen` against the current values of its group. */
/**
 * Reads a field value, following dots into nested objects.
 *
 * A field name may address a nested key — `panel.background.type` — so a block
 * can group related controls under one object in its schema rather than
 * flattening them into prefixed names. A plain name is a direct lookup.
 */
export function readFieldPath(values: Record<string, unknown>, name: string): unknown {
  if (!name.includes('.')) return values[name];
  return name.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, values);
}

/**
 * Returns a copy of `values` with the (possibly nested) field set.
 *
 * Every level is cloned rather than mutated, so React sees a new object and
 * re-renders; missing intermediate objects are created on the way down.
 */
export function writeFieldPath(
  values: Record<string, unknown>,
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (!name.includes('.')) return { ...values, [name]: value };

  const segments = name.split('.');
  const next = { ...values } as Record<string, unknown>;
  let cursor = next;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    const existing = cursor[key];
    cursor[key] =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor = cursor[key] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]!] = value;
  return next;
}

export function isFieldVisible(field: FieldDescriptor, values: Record<string, unknown>): boolean {
  if (!field.showWhen) return true;
  const current = readFieldPath(values, field.showWhen.field);
  return field.showWhen.equals.some((candidate) => candidate === current);
}
