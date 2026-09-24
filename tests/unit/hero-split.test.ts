import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { blockDefaults, getBlock, parseBlockContent, type HeroContent } from '@/lib/cms/blocks';
import { heroColumns, heroTextShare } from '@/lib/cms/hero';
import { formCardStyle, formStyleSchema, formStyleGroups } from '@/lib/cms/form-style';

/**
 * The hero's column split, and a form card narrower than its column.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const hero = (values: Record<string, unknown>) => parseBlockContent<HeroContent>('hero', values);

describe('the column split', () => {
  it('defaults to an equal split', () => {
    const defaults = blockDefaults('hero');
    expect(defaults.columnSplit).toBe('50');
    expect(defaults.columnSplitCustom).toBe(50);
    expect(heroTextShare(hero({}))).toBe(50);
  });

  it('falls back on a bad value, and clamps nothing silently into range', () => {
    expect(hero({ columnSplit: '90' }).columnSplit).toBe('50');
    expect(hero({ columnSplit: 'custom', columnSplitCustom: 95 }).columnSplitCustom).toBe(50);
    expect(hero({ columnSplit: 'custom', columnSplitCustom: 'wide' }).columnSplitCustom).toBe(50);
  });

  it('reads the preset or the custom share', () => {
    expect(heroTextShare(hero({ columnSplit: '70' }))).toBe(70);
    expect(heroTextShare(hero({ columnSplit: '40' }))).toBe(40);
    expect(heroTextShare(hero({ columnSplit: 'custom', columnSplitCustom: 62 }))).toBe(62);
  });

  it('orders the tracks the way they are seen', () => {
    expect(heroColumns(70, false)).toBe('minmax(0,70fr) minmax(0,30fr)');
    // The image or form on the left: its share comes first.
    expect(heroColumns(70, true)).toBe('minmax(0,30fr) minmax(0,70fr)');
  });

  it('offers a Column split select and a custom share only for Custom', () => {
    const fields = getBlock('hero')!.fields;
    const split = fields.find((field) => field.name === 'columnSplit');
    const custom = fields.find((field) => field.name === 'columnSplitCustom');
    expect(split?.kind).toBe('select');
    expect(split?.label).toBe('Column split');
    if (split?.kind === 'select') {
      expect(split.options.map((option) => option.label)).toEqual([
        'Equal (50 / 50)',
        '55 / 45',
        '60 / 40',
        '65 / 35',
        '70 / 30',
        '45 / 55',
        '40 / 60',
        'Custom',
      ]);
    }
    expect(custom?.label).toBe('Text column (%)');
    expect(custom?.showWhen).toEqual({ field: 'columnSplit', equals: ['custom'] });
  });

  it('keeps the original grid at 50 and uses the variable otherwise', () => {
    const source = read('src/components/cms/blocks/hero-block.tsx');
    expect(source).toContain("textShare === 50 ? 'lg:grid-cols-2' : 'lg:grid-cols-[var(--hero-cols)]'");
    expect(source).toContain("className={centred || textShare !== 50 ? undefined : 'max-w-xl'}");
  });
});

describe('a narrower form card', () => {
  const style = (values: Record<string, unknown>) => formStyleSchema.parse(values);

  it('fills the column when no width is set, whatever the position', () => {
    expect(formCardStyle(style({ cardPosition: 'right' }))).toEqual({});
  });

  it('sits centred, left or right when a width is set', () => {
    expect(formCardStyle(style({ cardWidth: '380px' }))).toEqual({
      maxWidth: '380px',
      marginLeft: 'auto',
      marginRight: 'auto',
    });
    expect(formCardStyle(style({ cardWidth: '380', cardPosition: 'left' }))).toEqual({
      maxWidth: '380px',
      marginLeft: 0,
      marginRight: 'auto',
    });
    expect(formCardStyle(style({ cardWidth: '24rem', cardPosition: 'right' }))).toEqual({
      maxWidth: '24rem',
      marginLeft: 'auto',
      marginRight: 0,
    });
  });

  it('ignores a width that is not a length and a position that does not exist', () => {
    expect(style({ cardWidth: 'narrow' }).cardWidth).toBe('');
    expect(style({ cardPosition: 'top' }).cardPosition).toBe('center');
  });

  it('is offered in the Card group', () => {
    const card = formStyleGroups().find((group) => group.title === 'Card');
    const names = card?.fields.map((field) => field.name);
    expect(names).toContain('formStyle.cardWidth');
    expect(names).toContain('formStyle.cardPosition');
  });
});
