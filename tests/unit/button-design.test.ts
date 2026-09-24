import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buttonStylesheet,
  buttonLook,
  previewLook,
  BUTTON_COLOR_KEYS,
  BUTTON_ROLES,
  buttonField,
  type ButtonSettings,
} from '@/lib/cms/buttons';
import { buttonClasses } from '@/components/ui/button';

/**
 * The Primary and Secondary button designs.
 *
 * Blank means "keep what it looks like now": a site that never opens the
 * screen gets no CSS at all, and every value that is set lands in its own
 * role's rule and nowhere else.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const DEFAULTS: ButtonSettings = {
  colorPrimary: '#0061FF',
  colorSecondary: '#0B1B34',
  buttonPrimaryStyle: 'solid',
  buttonSecondaryStyle: 'outline',
};

const PRIMARY = ':root .btn-tokens.btn-role-primary';
const SECONDARY = ':root .btn-tokens.btn-role-secondary';

describe('buttonStylesheet', () => {
  it('is empty when every value is blank and each role keeps its default style', () => {
    expect(buttonStylesheet(DEFAULTS)).toBe('');
    expect(buttonStylesheet({})).toBe('');
  });

  it('puts a primary background in the primary rule only, with a darkened hover', () => {
    const css = buttonStylesheet({ ...DEFAULTS, buttonPrimaryBg: '#ff0000' });
    expect(css).toContain(`${PRIMARY}{background-color:#FF0000;border-color:#FF0000}`);
    expect(css).toContain(
      `${PRIMARY}:hover{background-color:color-mix(in srgb, #FF0000 88%, #000);border-color:color-mix(in srgb, #FF0000 88%, #000)}`,
    );
    expect(css).not.toContain('btn-role-secondary');
  });

  it('puts every secondary colour in the secondary rule only', () => {
    for (const key of BUTTON_COLOR_KEYS) {
      const css = buttonStylesheet({ ...DEFAULTS, [buttonField('secondary', key)]: '#123456' });
      expect(css, key).toContain('#123456');
      expect(css, key).not.toContain('btn-role-primary');
    }
  });

  it('carries typed text and border colours into hover', () => {
    const look = buttonLook({ ...DEFAULTS, buttonPrimaryText: '#111111', buttonPrimaryBorder: '#222222' }, 'primary');
    expect(look.hoverText).toBe('#111111');
    expect(look.hoverBorder).toBe('#222222');
  });

  it('lets a typed hover colour win over the derived one', () => {
    const look = buttonLook({ ...DEFAULTS, buttonPrimaryBg: '#FF0000', buttonPrimaryHoverBg: '#00FF00' }, 'primary');
    expect(look.hoverBackground).toBe('#00FF00');
  });

  it('ignores values that are not colours or lengths', () => {
    const css = buttonStylesheet({
      ...DEFAULTS,
      buttonPrimaryBg: 'red',
      buttonPrimaryText: '#12',
      buttonSecondaryBorder: 'url(javascript:alert(1))',
      buttonSecondaryHoverBg: 'rgb(0 0 0)',
      buttonBorderWidth: '2',
    });
    expect(css).toBe('');
  });

  it('draws a border colour with a solid border at the chosen width, else 1px', () => {
    expect(buttonStylesheet({ ...DEFAULTS, buttonPrimaryBorder: '#000000' })).toContain(
      'border-color:#000000;border-style:solid;border-width:1px',
    );
    expect(
      buttonStylesheet({ ...DEFAULTS, buttonPrimaryBorder: '#000000', buttonBorderWidth: '3px' }),
    ).toContain('border-style:solid;border-width:3px');
  });

  it('only thickens existing borders when a width is set on its own', () => {
    const css = buttonStylesheet({ ...DEFAULTS, buttonBorderWidth: '2px' });
    expect(css).toBe(
      `${PRIMARY}.border{border-width:2px}${SECONDARY}.border{border-width:2px}`,
    );
  });

  it('fills in a whole look when a role leaves its default style', () => {
    const soft = buttonStylesheet({ ...DEFAULTS, buttonPrimaryStyle: 'soft' });
    expect(soft).toContain('background-color:color-mix(in srgb, #0061FF 14%, transparent)');
    expect(soft).toContain(':hover{background-color:color-mix(in srgb, #0061FF 24%, transparent)');

    const solidSecondary = buttonStylesheet({ ...DEFAULTS, buttonSecondaryStyle: 'solid' });
    expect(solidSecondary).toContain(`${SECONDARY}{background-color:#0B1B34;color:#FFFFFF`);

    const outlinePrimary = buttonStylesheet({ ...DEFAULTS, buttonPrimaryStyle: 'outline' });
    expect(outlinePrimary).toContain(`${PRIMARY}{background-color:transparent;color:#0061FF;border-color:#0061FF`);
  });

  it('never reads a section variable', () => {
    const everything: ButtonSettings = { ...DEFAULTS, buttonBorderWidth: '2px', buttonPrimaryStyle: 'soft', buttonSecondaryStyle: 'solid' };
    for (const role of BUTTON_ROLES) {
      for (const key of BUTTON_COLOR_KEYS) everything[buttonField(role, key)] = '#ABCDEF';
    }
    expect(buttonStylesheet(everything)).not.toContain('--sec-');
    expect(read('src/lib/cms/buttons.ts')).not.toContain('--sec-');
  });
});

describe('previewLook', () => {
  it('is complete for an untouched role', () => {
    for (const role of BUTTON_ROLES) {
      const look = previewLook(DEFAULTS, role);
      expect(look.background, role).not.toBe('');
      expect(look.text, role).not.toBe('');
    }
    expect(previewLook(DEFAULTS, 'primary').background).toBe('#0061FF');
  });

  it('shows what was chosen over the default', () => {
    expect(previewLook({ ...DEFAULTS, buttonPrimaryBg: '#FF0000' }, 'primary').background).toBe('#FF0000');
  });
});

describe('buttonClasses', () => {
  it('adds the role each variant belongs to', () => {
    expect(buttonClasses('primary')).toContain('btn-role-primary');
    expect(buttonClasses('secondary')).toContain('btn-role-secondary');
    expect(buttonClasses('outline')).toContain('btn-role-secondary');
    for (const variant of ['ghost', 'subtle', 'danger', 'link'] as const) {
      expect(buttonClasses(variant), variant).not.toContain('btn-role-');
    }
  });

  it('lets an explicit role win over the variant', () => {
    const classes = buttonClasses('outline', 'md', undefined, 'primary');
    expect(classes).toContain('btn-role-primary');
    expect(classes).not.toContain('btn-role-secondary');
    expect(buttonClasses('primary', 'md', undefined, null)).not.toContain('btn-role-');
  });

  it('marks the size, except on a link', () => {
    expect(buttonClasses('primary', 'sm').split(' ')).toContain('btn-sm');
    expect(buttonClasses('primary', 'md').split(' ')).toContain('btn-md');
    expect(buttonClasses('primary', 'lg').split(' ')).toContain('btn-lg');
    expect(buttonClasses('link', 'lg')).not.toMatch(/\bbtn-(sm|md|lg)\b/);
  });
});

describe('wiring', () => {
  const FIELDS = [
    'buttonBorderWidth',
    ...BUTTON_ROLES.flatMap((role) => BUTTON_COLOR_KEYS.map((key) => buttonField(role, key))),
  ];

  it('has every new field in the Prisma schema, the migration and the save schema', () => {
    const schema = read('prisma/schema.prisma');
    const migration = read('prisma/migrations/20260924100000_button_roles/migration.sql');
    const actions = read('src/lib/actions/settings.ts');
    expect(FIELDS).toHaveLength(13);
    for (const field of FIELDS) {
      expect(schema, field).toMatch(new RegExp(`\\b${field}\\s+String @default\\(""\\)`));
      expect(migration, field).toContain(`ADD COLUMN "${field}" TEXT NOT NULL DEFAULT ''`);
      expect(actions, field).toMatch(new RegExp(`\\b${field}: optional(Color|Length),`));
    }
  });

  it('offers every colour and the border width in the admin', () => {
    const fields = read('src/components/admin/settings/button-role-fields.tsx');
    const form = read('src/components/admin/settings/settings-form.tsx');
    expect(fields).toContain('BUTTON_COLOR_KEYS.map');
    expect(form).toContain("set('buttonBorderWidth'");
    expect(form).toContain('<ButtonRoleFields');
    expect(form).toContain("(['primary', 'secondary'] as const).map");
  });

  it('injects the stylesheet on the public site', () => {
    expect(read('src/components/public/brand-style.tsx')).toContain('buttonStylesheet(settings)');
  });

  it('gives every public button btn-tokens', () => {
    expect(read('src/components/cms/blocks/shared.tsx')).toContain("'btn-tokens'");
    expect(read('src/components/public/site-header.tsx')).toContain("'btn-tokens'");
    expect(read('src/components/products/product-cta.tsx').match(/'btn-tokens'/g)?.length).toBe(3);
    expect(read('src/components/blog/blog-search.tsx')).toContain(
      "buttonClasses('primary', compact ? 'sm' : 'md', 'btn-tokens shrink-0')",
    );
    expect(read('src/components/cms/blocks/blog-widgets.tsx')).toContain('btn-tokens');
  });

  it('never gives an admin button btn-tokens', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [path.join(dir, entry.name)]
            : [],
      );
    for (const file of [...walk('src/components/admin'), ...walk('src/app/admin')]) {
      expect(read(file), file).not.toContain('btn-tokens');
    }
  });

  it('lets the button settings outrank the size utilities', () => {
    const css = read('src/app/globals.css');
    expect(css).toContain('.btn-tokens:is(.btn-sm, .btn-md, .btn-lg)');
    expect(css).toMatch(/\.btn-tokens\.btn-lg\s*\{/);
    expect(css).toMatch(/\.btn-tokens\.btn-sm\s*\{/);
  });
});
