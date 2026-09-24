import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildSectionStyles, parseSectionDesign } from '@/lib/cms/design';
import { mainCtaVariant, type BlockContext } from '@/components/cms/blocks/shared';

/**
 * Precedence: the defaults < Website Design's Primary and Secondary buttons <
 * a section's own Button colour and Button text colour.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

const styles = (colors: Record<string, unknown> = {}) =>
  buildSectionStyles(parseSectionDesign({ colors }), 'sec1');

describe('the section button variables', () => {
  it('are not set, and carry no modifier, when the section chose no colour', () => {
    const out = styles();
    expect(out.style).not.toHaveProperty('--sec-button');
    expect(out.style).not.toHaveProperty('--sec-button-text');
    expect(out.modifiers).toBe('');
  });

  it('appear with their modifier only when chosen', () => {
    const button = styles({ button: '#FFFFFF' });
    expect(button.style['--sec-button']).toBe('#FFFFFF');
    expect(button.modifiers).toBe('cms-section--button');

    const text = styles({ buttonText: '#000000' });
    expect(text.style['--sec-button-text']).toBe('#000000');
    expect(text.modifiers).toBe('cms-section--button-text');

    expect(styles({ button: '#FFFFFF', buttonText: '#000000' }).modifiers).toBe(
      'cms-section--button cms-section--button-text',
    );
  });

  it('take the section primary colour as the button colour when no button colour is set', () => {
    const out = styles({ primary: '#FF8800' });
    expect(out.style['--sec-button']).toBe('#FF8800');
    expect(out.modifiers).toBe('cms-section--button');
  });

  it('reach the section element', () => {
    expect(read('src/components/cms/section-renderer.tsx')).toContain('styles.modifiers');
  });
});

describe('the rules', () => {
  const css = read('src/app/globals.css');

  it('keep the two-class defaults with brand fallbacks', () => {
    expect(css).toMatch(/\.cms-section \.cms-btn-primary \{\s*background-color: var\(--sec-button, rgb\(var\(--brand-primary\)\)\)/);
    expect(css).toMatch(/\.cms-section \.cms-btn-outline \{/);
  });

  it('put the section colours five classes deep, under the modifiers', () => {
    expect(css).toContain(':root .cms-section.cms-section--button .btn-tokens.cms-btn-primary {');
    expect(css).toContain(':root .cms-section.cms-section--button .btn-tokens.cms-btn-primary:hover {');
    expect(css).toContain(':root .cms-section.cms-section--button-text .btn-tokens.cms-btn-primary,');
    expect(css).toContain(':root .cms-section.cms-section--button .btn-tokens.cms-btn-outline {');
    expect(css).toContain(':root .cms-section.cms-section--button .btn-tokens.cms-btn-outline:hover {');
    expect(css).toContain('.cms-section .cms-btn-ghost { color: inherit; }');
  });

  it('never let the global button design read a section variable', () => {
    expect(read('src/lib/cms/buttons.ts')).not.toContain('--sec-button');
  });
});

describe('the main call to action', () => {
  const ctx = (inverted: boolean, button = '') =>
    ({ inverted, design: parseSectionDesign({ colors: { button } }) }) as unknown as BlockContext;

  it('is an outline on a dark section with no button colour, else filled', () => {
    expect(mainCtaVariant(ctx(true))).toBe('outline');
    expect(mainCtaVariant(ctx(true, '#FFFFFF'))).toBe('primary');
    expect(mainCtaVariant(ctx(false))).toBe('primary');
    expect(mainCtaVariant(ctx(false), true)).toBe('outline');
  });

  const BLOCKS = [
    'hero-block.tsx',
    'content-blocks.tsx',
    'card-blocks.tsx',
    'conversion-blocks.tsx',
    'blog-blocks.tsx',
  ].map((file) => `src/components/cms/blocks/${file}`);

  it('no longer picks its variant from inverted alone', () => {
    for (const file of BLOCKS) {
      expect(read(file), file).not.toMatch(/inverted[^?\n]*\? 'outline' : 'primary'/);
    }
  });

  it('carries role="primary" wherever it is drawn', () => {
    for (const file of BLOCKS) {
      const links = read(file).match(/<CtaLink[\s\S]*?\/>/g) ?? [];
      for (const link of links) {
        if (/mainCtaVariant\(|variantFor\.primary/.test(link)) {
          expect(link, file).toContain('role="primary"');
        }
      }
    }
  });

  it('passes the role through to buttonClasses and marks ghost buttons', () => {
    const shared = read('src/components/cms/blocks/shared.tsx');
    expect(shared).toContain('buttonClasses(variant, size, cn(tone, className), role)');
    expect(shared).toContain("variant === 'ghost' && 'cms-btn-ghost'");
  });
});
