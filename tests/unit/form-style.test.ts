import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  formStyleSchema,
  formStyleField,
  DEFAULT_FORM_STYLE,
  applyFormStyle,
  formCardStyle,
  wantsFormCard,
  formStyleGroups,
} from '@/lib/cms/form-style';
import { DEFAULT_FORM_DESIGN, type FormDesign } from '@/lib/forms/form-design';
import { BLOCK_LIST, blockDefaults } from '@/lib/cms/blocks';
import type { FieldDescriptor } from '@/lib/cms/fields';

/**
 * The Form tab: one placement of a form, restyled. Blank is no change, the
 * form's own design is never mutated, and every block that embeds a form
 * offers the tab and draws its form through FormPanel.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const style = (values: Record<string, unknown>) => formStyleSchema.parse(values);

describe('formStyleSchema', () => {
  it('is blank by default', () => {
    for (const [key, value] of Object.entries(DEFAULT_FORM_STYLE)) {
      // A card's position does nothing until it is given a width.
      if (key === 'cardPosition') continue;
      expect(['', 'inherit'], key).toContain(value);
    }
    expect(DEFAULT_FORM_STYLE.cardPosition).toBe('center');
  });

  it('normalises colours and drops what is not one', () => {
    expect(style({ labelColor: '#ff0000' }).labelColor).toBe('#FF0000');
    expect(style({ labelColor: 'red' }).labelColor).toBe('');
    expect(style({ buttonBackground: 'url(x)' }).buttonBackground).toBe('');
  });

  it('normalises lengths, a bare number becoming px', () => {
    expect(style({ inputRadius: '12' }).inputRadius).toBe('12px');
    expect(style({ cardPadding: '2rem' }).cardPadding).toBe('2rem');
    expect(style({ cardRadius: 'big' }).cardRadius).toBe('');
  });

  it('falls back to blank for a stored value that no longer parses', () => {
    expect(formStyleField.parse('nonsense')).toEqual(DEFAULT_FORM_STYLE);
    expect(formStyleField.parse(undefined)).toEqual(DEFAULT_FORM_STYLE);
    expect(style({ buttonAlign: 'diagonal' }).buttonAlign).toBe('inherit');
  });
});

describe('applyFormStyle', () => {
  const design = DEFAULT_FORM_DESIGN;

  it('changes nothing when every value is blank, and returns a copy', () => {
    const out = applyFormStyle(design, DEFAULT_FORM_STYLE);
    expect(out).toEqual(design);
    expect(out).not.toBe(design);
  });

  it('never mutates the cached design', () => {
    const before = JSON.stringify(design);
    applyFormStyle(design, style({ labelColor: '#111111', buttonAlign: 'full', inputBorderColor: '#222222' }));
    expect(JSON.stringify(design)).toBe(before);
  });

  it('lays each set value over its part of the design', () => {
    const out = applyFormStyle(
      design,
      style({
        labelColor: '#111111',
        inputTextColor: '#222222',
        helpColor: '#333333',
        inputBackground: '#444444',
        inputBorderColor: '#555555',
        inputRadius: '6px',
        buttonBackground: '#666666',
        buttonTextColor: '#777777',
        buttonHoverBackground: '#888888',
        buttonHoverTextColor: '#999999',
        buttonRadius: '999px',
      }),
    );
    expect(out.typography.label.color).toBe('#111111');
    expect(out.typography.input.color).toBe('#222222');
    expect(out.typography.help.color).toBe('#333333');
    expect(out.input.background).toBe('#444444');
    expect(out.input.border.color).toBe('#555555');
    expect(out.input.border.style).toBe('solid');
    expect(out.input.border.radius).toBe('6px');
    expect(out.button.background).toBe('#666666');
    expect(out.button.textColor).toBe('#777777');
    expect(out.button.hoverBackground).toBe('#888888');
    expect(out.button.hoverTextColor).toBe('#999999');
    expect(out.button.border.radius).toBe('999px');
  });

  it('stretches the button for full, and aligns it otherwise', () => {
    expect(applyFormStyle(design, style({ buttonAlign: 'full' })).button.width).toBe('full');
    const full: FormDesign = structuredClone(design);
    full.button.width = 'full';
    const centred = applyFormStyle(full, style({ buttonAlign: 'center' }));
    expect(centred.button.align).toBe('center');
    expect(centred.button.width).toBe('auto');
  });
});

describe('the card', () => {
  it('has no style and no card when nothing is set', () => {
    expect(formCardStyle(DEFAULT_FORM_STYLE)).toEqual({});
    expect(wantsFormCard(DEFAULT_FORM_STYLE)).toBe(false);
  });

  it('draws what is set', () => {
    expect(
      formCardStyle(style({ cardBackground: '#FFFFFF', cardBorderColor: '#000000', cardRadius: '8px', cardPadding: '2rem', cardShadow: 'md' })),
    ).toEqual({
      backgroundColor: '#FFFFFF',
      borderColor: '#000000',
      borderRadius: '8px',
      padding: '2rem',
      boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
    });
  });

  it('asks for a card only for a background, a border colour or a visible shadow', () => {
    expect(wantsFormCard(style({ cardBackground: '#FFFFFF' }))).toBe(true);
    expect(wantsFormCard(style({ cardBorderColor: '#000000' }))).toBe(true);
    expect(wantsFormCard(style({ cardShadow: 'lg' }))).toBe(true);
    expect(wantsFormCard(style({ cardShadow: 'none' }))).toBe(false);
    expect(wantsFormCard(style({ cardPadding: '2rem' }))).toBe(false);
  });
});

describe('the Form tab', () => {
  const names = (groups: ReturnType<typeof formStyleGroups>) =>
    groups.flatMap((group) => group.fields.map((field) => field.name));

  it('offers every schema key, and reads every one somewhere', () => {
    const offered = names(formStyleGroups());
    const readers = read('src/lib/cms/form-style.ts') + read('src/components/cms/blocks/form-panel.tsx');
    for (const key of Object.keys(formStyleSchema.shape)) {
      expect(offered, key).toContain(`formStyle.${key}`);
      expect(readers, key).toMatch(new RegExp(`style\\??\\.${key}\\b`));
    }
  });

  it('points at a block’s own fields instead of duplicating them', () => {
    const offered = names(formStyleGroups({ heading: 'formHeading', buttonLabel: 'ctaLabel', card: false }));
    expect(offered).toContain('formHeading');
    expect(offered).toContain('ctaLabel');
    expect(offered).not.toContain('formStyle.heading');
    expect(offered).not.toContain('formStyle.cardBackground');
  });
});

describe('every block that embeds a form', () => {
  const flat = (fields: FieldDescriptor[]): FieldDescriptor[] =>
    fields.flatMap((field) => (field.kind === 'repeater' ? [field, ...flat(field.fields)] : [field]));

  const withForm = BLOCK_LIST.filter((block) => flat(block.fields).some((field) => field.kind === 'form'));

  it('includes the ones this site has', () => {
    expect(withForm.map((block) => block.type).sort()).toEqual(
      ['blogNewsletter', 'cta', 'formBlock', 'hero', 'leadMagnet', 'productPriceBox', 'widgetForm', 'widgetNewsletter'].sort(),
    );
  });

  it('declares the Form tab and stores formStyle', () => {
    for (const block of withForm) {
      expect(block.formFields, block.type).toBeDefined();
      expect(blockDefaults(block.type), block.type).toHaveProperty('formStyle');
    }
  });

  it('never shows a field on both tabs', () => {
    for (const block of withForm) {
      const content = new Set(flat(block.fields).map((field) => field.name));
      for (const group of block.formFields ?? []) {
        for (const field of group.fields) {
          expect(content.has(field.name), `${block.type}: ${field.name}`).toBe(false);
        }
      }
    }
  });

  it('points the form picker at the Form tab', () => {
    for (const block of withForm) {
      const picker = flat(block.fields).find((field) => field.kind === 'form');
      expect(picker?.help, block.type).toContain('Form tab');
    }
  });

  it('draws its form only through FormPanel, with an instanceKey', () => {
    const files = [
      'src/components/cms/blocks/hero-block.tsx',
      'src/components/cms/blocks/conversion-blocks.tsx',
      'src/components/cms/blocks/blog-blocks.tsx',
      'src/components/cms/blocks/blog-widgets.tsx',
      'src/components/cms/blocks/product-detail-blocks.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toContain('PublicFormRenderer');
      const panels = source.match(/<FormPanel[\s\S]*?\/?>/g) ?? [];
      expect(panels.length, file).toBeGreaterThan(0);
      for (const panel of panels) expect(panel, file).toContain('instanceKey=');
    }
  });
});

describe('two placements of one form', () => {
  it('scope their styles and ids by the placement', () => {
    const source = read('src/components/forms/public-form.tsx');
    expect(source).toContain('const scope = instanceKey ? `${form.slug}-${instanceKey}` : form.slug;');
    expect(source).toContain('buildFormStyles(design, scope)');
    expect(source).toContain('formSlug={scope}');
    expect(source).toContain('id={`hp-${scope}`}');
    expect(source).toContain('idPrefix={scope}');
    // What is submitted is still the form's own slug.
    expect(source).toContain('formSlug: form.slug,');
  });

  it('show the Form tab in the section editor', () => {
    const editor = read('src/components/cms/section-editor-panel.tsx');
    expect(editor).toContain("definition.formFields ? [{ id: 'form', label: 'Form' }] : []");
    expect(editor).toContain('Restyles the form in this section only.');
  });
});
