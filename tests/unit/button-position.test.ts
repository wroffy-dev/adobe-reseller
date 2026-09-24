import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildSectionStyles, buttonPositionCss, parseSectionDesign } from '@/lib/cms/design';
import { BLOCK_LIST } from '@/lib/cms/blocks';

/**
 * Button position, per screen size: Default, Left, Centre, Right or Full for a
 * section's row of buttons and its embedded form's submit.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const BLOCK_DIR = 'src/components/cms/blocks';
const blockFiles = fs
  .readdirSync(path.join(root, BLOCK_DIR))
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => `${BLOCK_DIR}/${file}`);

const css = (design: Record<string, unknown>) =>
  buildSectionStyles(parseSectionDesign(design), 'abc').css;

describe('the setting', () => {
  it('defaults to inherit on every breakpoint and refuses anything else', () => {
    const design = parseSectionDesign({});
    expect(design.desktop.buttonPosition).toBe('inherit');
    expect(design.tablet.buttonPosition).toBe('inherit');
    expect(design.mobile.buttonPosition).toBe('inherit');
    expect(parseSectionDesign({ desktop: { buttonPosition: 'diagonal' } }).desktop.buttonPosition).toBe(
      'inherit',
    );
  });

  it('emits no CSS when left on Default', () => {
    expect(css({})).toBe('');
    expect(buttonPositionCss('sec-abc', 'inherit')).toBe('');
  });

  it('aligns the row and the form, giving the form back its own width', () => {
    expect(buttonPositionCss('sec-abc', 'center')).toBe(
      '.sec-abc .cms-actions,.sec-abc .cms-form-follow .fd-actions{justify-content:center}' +
        '.sec-abc .cms-actions>.btn-tokens{width:auto}' +
        '.sec-abc .cms-form-follow .fd-submit{width:var(--fd-btn-w, auto)}',
    );
    expect(buttonPositionCss('sec-abc', 'left')).toContain('justify-content:flex-start');
    expect(buttonPositionCss('sec-abc', 'right')).toContain('justify-content:flex-end');
  });

  it('stretches the buttons and the submit for full', () => {
    expect(buttonPositionCss('sec-abc', 'full')).toBe(
      '.sec-abc .cms-actions>.btn-tokens{width:100%}' +
        '.sec-abc .cms-form-follow .fd-submit{width:100%}',
    );
  });

  it('writes desktop unconditioned, tablet and mobile inside their media queries', () => {
    const out = css({
      desktop: { buttonPosition: 'center' },
      tablet: { buttonPosition: 'right' },
      mobile: { buttonPosition: 'full' },
    });
    expect(out.startsWith('.sec-abc .cms-actions,.sec-abc .cms-form-follow .fd-actions{justify-content:center}')).toBe(true);
    expect(out).toContain('@media (max-width:1023px){.sec-abc .cms-actions,.sec-abc .cms-form-follow .fd-actions{justify-content:flex-end}');
    expect(out).toContain('@media (max-width:767px){.sec-abc .cms-actions>.btn-tokens{width:100%}');
  });

  it('counts in the breakpoint override badge', () => {
    expect(read('src/components/cms/design-panel.tsx')).toContain(
      "if (bp.buttonPosition !== 'inherit') count += 1;",
    );
  });
});

describe('which blocks offer it', () => {
  /** block type -> renderer component, from the two dispatch switches. */
  const renderers = new Map<string, string>();
  for (const file of ['src/components/cms/section-renderer.tsx', 'src/components/cms/blog-sidebar.tsx']) {
    const source = read(file);
    for (const match of source.matchAll(/((?:case '\w+':\s*)+)return <(\w+)/g)) {
      for (const type of match[1]!.matchAll(/case '(\w+)'/g)) renderers.set(type[1]!, match[2]!);
    }
  }

  const sources = blockFiles.map(read).join('\n');
  const body = (name: string) => {
    const start = sources.search(new RegExp(`function ${name}\\b`));
    if (start < 0) return '';
    const next = sources.indexOf('\nexport ', start + 1);
    return sources.slice(start, next < 0 ? undefined : next);
  };

  it('matches the renderer in both directions', () => {
    let checked = 0;
    for (const block of BLOCK_LIST) {
      const renderer = renderers.get(block.type);
      if (!renderer) continue;
      const draws = /cms-actions|<FormPanel/.test(body(renderer));
      const offers = (block.design ?? []).includes('buttons');
      expect(offers, `${block.type} (${renderer})`).toBe(draws);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('shows the control only where the block supports it', () => {
    const panel = read('src/components/cms/design-panel.tsx');
    expect(panel).toContain("supports.includes('buttons')");
    for (const icon of ['AlignHorizontalJustifyStart', 'AlignHorizontalJustifyCenter', 'AlignHorizontalJustifyEnd', 'MoveHorizontal']) {
      expect(panel, icon).toContain(icon);
    }
    expect(read('src/components/cms/section-editor-panel.tsx')).toContain('supports={definition.design}');
  });
});

describe('every button row', () => {
  /** The opening tag of the nearest element that encloses `index`. */
  const enclosingTag = (source: string, index: number) => {
    const before = source.slice(0, index);
    const start = Math.max(before.lastIndexOf('<div'), before.lastIndexOf('<td'));
    return source.slice(start, source.indexOf('>', start) + 1);
  };

  it('puts each CtaLink in a cms-actions row', () => {
    let seen = 0;
    for (const file of blockFiles) {
      const source = read(file);
      for (const match of source.matchAll(/<CtaLink\b/g)) {
        expect(enclosingTag(source, match.index!), `${file}:${match.index}`).toContain('cms-actions');
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(15);
  });

  it('puts each ProductCta in one too, except the product grid list rows', () => {
    for (const file of blockFiles) {
      const source = read(file);
      for (const match of source.matchAll(/<ProductCta\b/g)) {
        const snippet = source.slice(match.index!, source.indexOf('/>', match.index!));
        if (snippet.includes('ctaLocation="product-grid"')) continue;
        expect(enclosingTag(source, match.index!), `${file}:${match.index}`).toContain('cms-actions');
      }
    }
  });

  it('lets a form follow unless its own Form tab chose an alignment', () => {
    expect(read(`${BLOCK_DIR}/form-panel.tsx`)).toContain(
      "(style?.buttonAlign ?? 'inherit') === 'inherit' && 'cms-form-follow'",
    );
  });

  it('is a wrapping flex row', () => {
    expect(read('src/app/globals.css')).toMatch(
      /\.cms-actions \{\s*display: flex;\s*flex-wrap: wrap;\s*align-items: center;\s*gap: 0\.75rem;\s*\}/,
    );
  });
});
