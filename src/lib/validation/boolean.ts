import { z } from 'zod';

/**
 * A switch or checkbox as a form posts it.
 *
 * `z.coerce.boolean()` is `Boolean(value)`, and every non-empty string is
 * truthy — so a switch the form sends as "false" was saved as true. Turning
 * "Ask search engines not to index this market" off and saving turned it back
 * on. This reads the words a form actually sends; a missing value takes the
 * default.
 */
const TRUE = new Set(['true', 'on', '1', 'yes']);
const FALSE = new Set(['false', 'off', '0', 'no', '']);

export function formBoolean(fallback: boolean) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (TRUE.has(text)) return true;
    if (FALSE.has(text)) return false;
    return value;
  }, z.boolean().default(fallback));
}
