import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isStretched, segmentDetail, type SegmentSection } from '@/lib/cms/product-segments';

/**
 * A product page's layout: which sections run in the boxed column and which
 * span the screen like a page's sections — a hero always among the latter.
 */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

let order = 0;
const section = (blockType: string, settings: unknown = {}, isVisible = true): SegmentSection => ({
  id: `${blockType}-${(order += 1)}`,
  blockType,
  settings,
  isVisible,
  sortOrder: order * 10,
});

const shape = (segments: ReturnType<typeof segmentDetail>) =>
  segments.map((segment) => [
    segment.stretch ? 'stretched' : 'boxed',
    segment.sections.map((s) => s.blockType),
    segment.withSidebar,
  ]);

describe('isStretched', () => {
  it('always stretches a hero, whatever its settings say', () => {
    expect(isStretched({ blockType: 'hero', settings: {} })).toBe(true);
    expect(isStretched({ blockType: 'hero', settings: { stretch: false } })).toBe(true);
    // A hero saved in the original settings shape still stretches.
    expect(isStretched({ blockType: 'hero', settings: { background: 'gradient', paddingTop: 'xl' } })).toBe(true);
  });

  it('stretches any other section only when it asks to', () => {
    expect(isStretched({ blockType: 'faq', settings: {} })).toBe(false);
    expect(isStretched({ blockType: 'faq', settings: { stretch: true } })).toBe(true);
  });
});

describe('segmentDetail', () => {
  it('puts a leading hero above the sidebar and the rest beside it', () => {
    const segments = segmentDetail(
      [section('hero'), section('productHeader'), section('productDescription')],
      true,
    );
    expect(shape(segments)).toEqual([
      ['stretched', ['hero'], false],
      ['boxed', ['productHeader', 'productDescription'], true],
    ]);
  });

  it('keeps a hero beside the sidebar in its column', () => {
    const segments = segmentDetail([section('productHeader'), section('hero'), section('faq')], true);
    expect(shape(segments)).toEqual([['boxed', ['productHeader', 'hero', 'faq'], true]]);
  });

  it('breaks out wherever it stands without a sidebar', () => {
    const segments = segmentDetail(
      [section('productHeader'), section('hero'), section('faq')],
      false,
    );
    expect(shape(segments)).toEqual([
      ['boxed', ['productHeader'], false],
      ['stretched', ['hero'], false],
      ['boxed', ['faq'], false],
    ]);
  });

  it('ignores hidden sections and still draws a column for a product with none', () => {
    expect(shape(segmentDetail([section('hero', {}, false)], false))).toEqual([['boxed', [], false]]);
  });

  it('is what the product page renders with', () => {
    expect(read('src/app/(public)/_surfaces/product.tsx')).toContain(
      "import { segmentDetail } from '@/lib/cms/product-segments';",
    );
  });

  it('does not offer a hero the switch it no longer needs', () => {
    expect(read('src/components/cms/section-editor-panel.tsx')).toContain(
      "offerStretch={surface === 'productDetail' && section.blockType !== 'hero'}",
    );
  });
});
