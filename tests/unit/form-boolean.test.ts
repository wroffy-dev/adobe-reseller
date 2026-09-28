import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { formBoolean } from '@/lib/validation/boolean';
import { countrySettingsSchema, countrySchema } from '@/lib/validation/country';

/**
 * A switch posted as "false" is false.
 *
 * `z.coerce.boolean()` turned every non-empty string into true, so turning
 * "Ask search engines not to index this market" off and saving turned it
 * straight back on.
 */

const schema = z.object({ off: formBoolean(false), on: formBoolean(true) });

describe('formBoolean', () => {
  it('reads what a form sends', () => {
    for (const value of ['true', 'on', '1', 'yes', 'TRUE', true, 1]) {
      expect(schema.parse({ off: value }).off, String(value)).toBe(true);
    }
    for (const value of ['false', 'off', '0', 'no', '', false, 0]) {
      expect(schema.parse({ on: value }).on, String(value)).toBe(false);
    }
  });

  it('takes the default when nothing is sent', () => {
    expect(schema.parse({})).toEqual({ off: false, on: true });
    expect(schema.parse({ off: null, on: undefined })).toEqual({ off: false, on: true });
  });

  it('refuses a value it cannot read rather than guessing true', () => {
    expect(() => schema.parse({ off: 'maybe' })).toThrow();
  });
});

describe('the market switches', () => {
  it('save "false" as false', () => {
    const parsed = countrySettingsSchema.parse({ noIndexCountry: 'false', excludeFromSitemap: 'false' });
    expect(parsed.noIndexCountry).toBe(false);
    expect(parsed.excludeFromSitemap).toBe(false);
  });

  it('save "true" as true', () => {
    const parsed = countrySettingsSchema.parse({ noIndexCountry: 'true', excludeFromSitemap: 'true' });
    expect(parsed.noIndexCountry).toBe(true);
    expect(parsed.excludeFromSitemap).toBe(true);
  });

  it('never use z.coerce.boolean in a form schema', async () => {
    const fs = await import('node:fs');
    for (const file of ['country', 'product', 'page', 'blog']) {
      const source = fs.readFileSync(`src/lib/validation/${file}.ts`, 'utf8');
      expect(source, file).not.toContain('z.coerce.boolean()');
    }
  });

  it('keeps a published market published unless told otherwise', () => {
    const shape = countrySchema.shape;
    expect(shape.isPublished.parse(undefined)).toBe(true);
    expect(shape.isPublished.parse('false')).toBe(false);
  });
});
