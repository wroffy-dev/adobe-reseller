import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BLOCK_PICKER_LIST, blockDefaults, getBlock, parseBlockContent, blocksForSurface } from '@/lib/cms/blocks';
import {
  manualPricingTableSchema,
  safePricingUrl,
  MAX_PRICING_PLANS,
  MAX_PLAN_FEATURES,
  type ManualPricingTableContent,
} from '@/lib/cms/pricing-blocks';
import { uniqueItemIds, withFreshItemIds, ITEM_ID_PATTERN } from '@/lib/cms/item-id';
import { DEFAULT_SECTION_DESIGN, parseSectionDesign } from '@/lib/cms/design';
import { ManualPricingTableBlock } from '@/components/cms/blocks/pricing-blocks';
import type { BlockContext } from '@/components/cms/blocks/shared';
import { testCountryContext } from '../helpers';

const ctx = (design = DEFAULT_SECTION_DESIGN): BlockContext => ({
  sectionId: 'sec1',
  country: testCountryContext() as BlockContext['country'],
  inverted: false,
  isFirst: false,
  design,
});

const render = (content: unknown, design = DEFAULT_SECTION_DESIGN) =>
  renderToStaticMarkup(
    createElement(ManualPricingTableBlock, {
      content: parseBlockContent<ManualPricingTableContent>('manualPricingTable', content),
      ctx: ctx(design),
    }),
  );

const plan = (name: string, features: string[], extra: Record<string, unknown> = {}) => ({
  name,
  description: `${name} description`,
  ctaLabel: 'Request quote',
  ctaUrl: '/contact',
  features: features.map((text) => ({ text })),
  ...extra,
});

describe('Manual Pricing Comparison — registry', () => {
  it('is offered in Pages → Add Section, in the Content group', () => {
    const block = getBlock('manualPricingTable')!;
    expect(block.label).toBe('Manual Pricing Comparison');
    expect(block.group).toBe('Content');
    expect(BLOCK_PICKER_LIST.some((b) => b.type === 'manualPricingTable')).toBe(true);
    expect(blocksForSurface('page').some((b) => b.type === 'manualPricingTable')).toBe(true);
    expect(blocksForSurface('blogSidebar').some((b) => b.type === 'manualPricingTable')).toBe(false);
  });

  it('never uses a product picker or product source field', () => {
    const block = getBlock('manualPricingTable')!;
    const kinds = JSON.stringify(block.fields);
    expect(kinds).not.toMatch(/"kind":"(products|productCategory|brand)"/);
    expect(kinds).not.toContain('productIds');
  });

  it('leaves the product comparison table unchanged', () => {
    const table = getBlock('productTable')!;
    expect(table.label).toBe('Product comparison table');
    expect(Object.keys(blockDefaults('productTable'))).toContain('source');
  });

  it('keeps product data out of the renderer', () => {
    const source = readFileSync('src/components/cms/blocks/pricing-blocks.tsx', 'utf8');
    expect(source).not.toMatch(/prisma|services\/products|getPublicProduct|productCountry/i);
  });
});

describe('Manual Pricing Comparison — schema', () => {
  it('starts empty with the reference defaults', () => {
    const d = blockDefaults('manualPricingTable') as ManualPricingTableContent;
    expect(d.plans).toEqual([]);
    expect(d.columns).toBe(3);
    expect(d.cardBorderColor).toBe('#E5E7EB');
    expect(d.highlightBorderColor).toBe('#E1251B');
    expect(d.buttonBg).toBe('#FFE1E1');
    expect(d.buttonWidth).toBe('full');
  });

  it('parses malformed and older data safely', () => {
    const parsed = manualPricingTableSchema.parse({ plans: 'nope', columns: 'x', cardShadow: 'huge', buttonBg: 'red;}' });
    expect(parsed.plans).toEqual([]);
    expect(parsed.columns).toBe(3);
    expect(parsed.cardShadow).toBe('sm');
    expect(parsed.buttonBg).toBe('#FFE1E1');
    const legacy = manualPricingTableSchema.parse({ plans: [{ name: 'Old', features: [{ text: 'a' }, null] }] });
    expect(legacy.plans[0]!.features).toEqual([]);
    expect(manualPricingTableSchema.parse({ plans: [{ name: 'Old' }] }).plans[0]!.features).toEqual([]);
  });

  it('gives plans and features stable, unique ids, and keeps the ones they have', () => {
    const parsed = manualPricingTableSchema.parse({
      plans: [
        { id: 'plan-a', name: 'A', features: [{ id: 'f1', text: 'x' }, { id: 'f1', text: 'dup' }] },
        { id: 'plan-a', name: 'Copy' },
        { name: 'No id' },
      ],
    });
    const ids = parsed.plans.map((p) => p.id);
    expect(ids[0]).toBe('plan-a');
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => ITEM_ID_PATTERN.test(id))).toBe(true);
    expect(parsed.plans[0]!.features[0]!.id).toBe('f1');
    expect(parsed.plans[0]!.features[1]!.id).not.toBe('f1');
    expect(uniqueItemIds([{ id: 'a' }, { id: 'a' }]).map((i) => i.id)[0]).toBe('a');
  });

  it('duplicates a plan with fresh ids for it and its features', () => {
    const source = { id: 'p1', name: 'Plan', features: [{ id: 'f1', text: 'x' }] };
    const copy = withFreshItemIds(source);
    expect(copy.name).toBe('Plan');
    expect(copy.id).not.toBe('p1');
    expect(copy.features[0]!.id).not.toBe('f1');
    expect(copy.features[0]!.text).toBe('x');
  });

  it('bounds plans and features', () => {
    const many = manualPricingTableSchema.safeParse({ plans: Array.from({ length: MAX_PRICING_PLANS + 1 }, () => ({})) });
    expect(many.success && many.data.plans).toEqual([]);
    const features = manualPricingTableSchema.parse({
      plans: [{ features: Array.from({ length: MAX_PLAN_FEATURES + 1 }, () => ({ text: 'f' })) }],
    });
    expect(features.plans[0]!.features).toEqual([]);
  });

  it('only keeps safe button links', () => {
    expect(safePricingUrl('/contact')).toBe('/contact');
    expect(safePricingUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safePricingUrl('mailto:sales@example.com')).toBe('mailto:sales@example.com');
    expect(safePricingUrl('#quote')).toBe('#quote');
    expect(safePricingUrl('javascript:alert(1)')).toBe('');
    expect(safePricingUrl('data:text/html,hi')).toBe('');
    expect(safePricingUrl('//evil.example')).toBe('');
    expect(manualPricingTableSchema.parse({ plans: [{ ctaUrl: 'javascript:x' }] }).plans[0]!.ctaUrl).toBe('');
  });
});

describe('Manual Pricing Comparison — rendering', () => {
  it('renders nothing for an empty section', () => {
    expect(render({})).toBe('');
    expect(render(null)).toBe('');
  });

  it('renders three cards with different feature counts, checkmarks and buttons', () => {
    const html = render({
      heading: 'Choose a plan',
      plans: [
        plan('Photoshop for Teams', ['Annual plan, billed monthly', 'Photoshop on desktop']),
        plan('Creative Cloud Standard', ['One', 'Two', 'Three', 'Four'], { highlight: true, badge: 'Most popular' }),
        plan('Creative Cloud Pro', ['Only one']),
      ],
    });
    expect(html.match(/<article/g)).toHaveLength(3);
    expect(html.match(/<li class="mpt-feature/g)).toHaveLength(7);
    expect(html.match(/class="mpt-btn mpt-btn--full"/g)).toHaveLength(3);
    expect(html).toContain('href="/contact"');
    expect(html).toContain('Most popular');
    expect(html).toContain('<h2');
    expect(html).toContain('<h3');
    // Only the plan marked highlighted is highlighted — not "the second one".
    expect(html.match(/data-highlight=""/g)).toHaveLength(1);
    expect(html).toContain('--mpt-border-color:#E1251B');
  });

  it('highlights any number of plans, including none', () => {
    const none = render({ plans: [plan('A', ['x']), plan('B', ['y'])] });
    expect(none).not.toContain('data-highlight');
    const both = render({ plans: [plan('A', ['x'], { highlight: true }), plan('B', ['y'], { highlight: true, highlightBorderColor: '#0000FF' })] });
    expect(both.match(/data-highlight=""/g)).toHaveLength(2);
    expect(both).toContain('--mpt-border-color:#0000FF');
  });

  it('applies per-plan button and card overrides', () => {
    const html = render({
      plans: [
        plan('A', ['x'], {
          customButton: true,
          buttonBg: '#111111',
          buttonText: '#FFFFFF',
          buttonWidth: 'auto',
          buttonAlign: 'left',
          buttonHoverBg: '#333333',
          newTab: true,
          customStyle: true,
          background: '#F9FAFB',
          padding: '32px',
          order: 2,
        }),
      ],
    });
    expect(html).toContain('--mpt-btn-bg:#111111');
    expect(html).toContain('--mpt-btn-hover-bg:#333333');
    expect(html).toContain('class="mpt-btn"');
    expect(html).toContain('justify-content:flex-start');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('--mpt-bg:#F9FAFB');
    expect(html).toContain('--mpt-pad:32px');
    expect(html).toContain('order:2');
  });

  it('hides hidden plans, hidden rows, and buttons without a safe link', () => {
    const html = render({
      plans: [
        plan('Shown', ['visible'], { features: [{ text: 'visible' }, { text: 'hidden row', visible: false }] }),
        plan('Hidden', ['x'], { visible: false }),
        plan('No link', ['x'], { ctaUrl: 'javascript:alert(1)' }),
        plan('No button', ['x'], { showCta: false }),
      ],
    });
    expect(html).toContain('Shown');
    expect(html).not.toContain('Hidden');
    expect(html).not.toContain('hidden row');
    expect(html.match(/class="mpt-btn/g)).toHaveLength(1);
    expect(html).not.toContain('javascript:');
  });

  it('styles individual rows and honours checkmark and emphasis settings', () => {
    const html = render({
      plans: [
        plan('A', [], {
          features: [
            { id: 'r1', text: 'Bold row', emphasis: 'bold', customStyle: true, color: '#AA0000', background: '#FFF0F0', padding: '6px' },
            { id: 'r2', text: 'No check', showCheck: false },
          ],
        }),
      ],
    });
    expect(html).toContain('font-semibold');
    expect(html).toContain('color:#AA0000');
    expect(html).toContain('background:#FFF0F0');
    expect(html).toContain('mpt-check-space');
  });

  it('lines rows up by label across plans when asked', () => {
    const html = render({
      compareRows: true,
      plans: [
        plan('A', [], { features: [{ text: '1 TB', rowLabel: 'Storage' }, { text: '24×7', rowLabel: 'Support' }] }),
        plan('B', [], { features: [{ text: '5 TB', rowLabel: 'Storage' }] }),
      ],
    });
    expect(html.match(/Storage: /g)).toHaveLength(2);
    expect(html).toContain('aria-label="Not included"');
  });

  it('applies columns, responsive columns, gaps, width and spans', () => {
    const design = parseSectionDesign({ tablet: { columns: 2 } });
    const html = render(
      {
        columns: 4,
        mobileColumns: 1,
        columnGap: '32px',
        gridMaxWidth: '1200px',
        gridAlign: 'left',
        equalWidth: false,
        plans: [plan('Wide', ['x'], { span: 3 }), plan('B', ['y'])],
      },
      design,
    );
    expect(html).toContain('--grid-cols:4');
    expect(html).toContain('--grid-cols-tablet:2');
    expect(html).toContain('--grid-cols-mobile:1');
    expect(html).toContain('--mpt-col-gap:32px');
    expect(html).toContain('--mpt-max-w:1200px');
    expect(html).toContain('mr-auto');
    // A span never exceeds the columns available at that width.
    expect(html).toContain('--mpt-span:3;--mpt-span-t:2;--mpt-span-m:1');
  });

  it('keeps every card one column wide when columns are equal', () => {
    const html = render({ plans: [plan('A', ['x'], { span: 3 })] });
    expect(html).toContain('--mpt-span:1');
  });
});
