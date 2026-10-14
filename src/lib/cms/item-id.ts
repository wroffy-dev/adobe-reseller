import { z } from 'zod';

/**
 * Stable identities for repeated items inside a section's content.
 *
 * A repeater row is addressed by its position while it is being edited, but
 * the position changes every time a row is moved — so anything that has to
 * keep pointing at the same row (a React key, a "this feature" style, a
 * duplicate that must become its own row) needs an id of its own. Ids are
 * short, URL-safe and only have to be unique within one section.
 */

export const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export function newItemId(): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `i${Date.now().toString(36)}${random}`;
}

/** An item id: kept when valid, minted when missing or malformed. */
export const itemIdSchema = z
  .string()
  .regex(ITEM_ID_PATTERN)
  .catch(() => newItemId());

/**
 * Gives every item in a list a unique id, keeping the ones it already has.
 * A second item carrying the same id — content copied by hand, or saved before
 * ids existed — gets a fresh one rather than silently sharing the first's.
 */
export function uniqueItemIds<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }
    let id = newItemId();
    while (seen.has(id)) id = newItemId();
    seen.add(id);
    return { ...item, id };
  });
}

/**
 * A deep copy with every item id replaced — what "Duplicate" produces, so the
 * copy and the original are independently editable rows.
 */
export function withFreshItemIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => withFreshItemIds(entry)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = key === 'id' && typeof entry === 'string' ? newItemId() : withFreshItemIds(entry);
    }
    return out as T;
  }
  return value;
}
