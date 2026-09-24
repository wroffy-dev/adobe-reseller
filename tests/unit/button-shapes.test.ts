import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BUTTON_SHAPES, buttonShapeOf, buttonStylesheet } from '@/lib/cms/buttons';

/**
 * Button shapes: one for every button, and one each for the Primary and the
 * Secondary button. A blank role shape follows the shared one and emits
 * nothing.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('BUTTON_SHAPES', () => {
  it('is four presets, each only a radius', () => {
    expect(BUTTON_SHAPES.map((shape) => [shape.label, shape.radius])).toEqual([
      ['Square', '0px'],
      ['Slightly rounded', '0.25rem'],
      ['Rounded', '0.5rem'],
      ['Pill', '999px'],
    ]);
  });
});

describe('buttonShapeOf', () => {
  it('names the preset a radius is', () => {
    // The default buttonRadius shows "Rounded" selected.
    expect(buttonShapeOf('0.5rem')?.label).toBe('Rounded');
    expect(buttonShapeOf(' 999px ')?.label).toBe('Pill');
    expect(buttonShapeOf('0px')?.label).toBe('Square');
  });

  it('is null for a custom or blank radius', () => {
    for (const value of ['', '12px', '0.3rem', null, undefined]) {
      expect(buttonShapeOf(value), String(value)).toBeNull();
    }
  });
});

describe('per-role shapes in the stylesheet', () => {
  it('emits nothing for a blank role shape', () => {
    expect(buttonStylesheet({ buttonPrimaryRadius: '', buttonSecondaryRadius: '' })).toBe('');
  });

  it('puts each role shape in its own rule only', () => {
    const css = buttonStylesheet({ buttonPrimaryRadius: '999px', buttonSecondaryRadius: '0px' });
    expect(css).toContain(':root .btn-tokens.btn-role-primary{border-radius:999px}');
    expect(css).toContain(':root .btn-tokens.btn-role-secondary{border-radius:0px}');

    const primaryOnly = buttonStylesheet({ buttonPrimaryRadius: '999px' });
    expect(primaryOnly).not.toContain('btn-role-secondary');
  });

  it('ignores an invalid shape', () => {
    expect(buttonStylesheet({ buttonPrimaryRadius: 'round' })).toBe('');
    expect(buttonStylesheet({ buttonSecondaryRadius: '999' })).toBe('');
  });
});

describe('wiring', () => {
  it('stores both role shapes', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read('prisma/migrations/20260924110000_button_shapes/migration.sql');
    const actions = read('src/lib/actions/settings.ts');
    for (const field of ['buttonPrimaryRadius', 'buttonSecondaryRadius']) {
      expect(schema, field).toMatch(new RegExp(`\\b${field}\\s+String @default\\(""\\)`));
      expect(migration, field).toContain(`ADD COLUMN "${field}" TEXT NOT NULL DEFAULT ''`);
      expect(actions, field).toContain(`${field}: optionalLength,`);
    }
  });

  it('offers the shared shape without an inherit chip and each role with one', () => {
    const form = read('src/components/admin/settings/settings-form.tsx');
    expect(form).toMatch(/<ButtonShapePicker\s+id="buttonRadius"\s+label="Button shape"/);
    expect(form).toContain('inheritLabel="Same as all buttons"');
    expect(form).not.toMatch(/<Input\s+id="buttonRadius"/);
  });

  it('draws the picker as pressed chips with a Custom mode', () => {
    const picker = read('src/components/admin/settings/button-shape-picker.tsx');
    expect(picker).toContain('aria-pressed');
    expect(picker).toContain('Custom');
    expect(picker).toMatch(/useState\(\(\) => value\.trim\(\) !== '' && !preset\)/);
  });

  it('previews the role shape, else the shared one', () => {
    expect(read('src/components/admin/settings/button-role-fields.tsx')).toMatch(
      /buttonPrimaryRadius[\s\S]*buttonRadius/,
    );
  });
});
