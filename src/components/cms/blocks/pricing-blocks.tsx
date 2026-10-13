import type * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { safeUrl } from '@/lib/utils/sanitize';
import { resolveColumns } from '@/lib/cms/design';
import type { ManualPricingTableContent, PricingFeature, PricingPlan } from '@/lib/cms/pricing-blocks';
import { SectionHeading, type BlockContext } from './shared';

/**
 * Manual Pricing Comparison.
 *
 * Renders only what was typed into the section: no product, price or feature
 * is ever read from the catalogue. Styling is carried as CSS variables on each
 * card and button (see `.mpt-*` in globals.css), so every colour, size and
 * spacing an administrator sets is applied without generating classes, and
 * the hover and desktop-only emphasis states still work.
 */

const SHADOW: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
  md: '0 4px 14px rgb(15 23 42 / 0.08)',
  lg: '0 14px 36px rgb(15 23 42 / 0.12)',
};

const ALIGN: Record<string, string> = { stretch: 'stretch', start: 'start', center: 'center', end: 'end' };
const JUSTIFY: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
const EMPHASIS: Record<PricingFeature['emphasis'], string> = {
  normal: '',
  medium: 'font-medium',
  bold: 'font-semibold',
  italic: 'italic',
};

type Vars = React.CSSProperties & Record<`--${string}`, string | number | undefined>;

/** Sets a CSS variable only when it has a value, so CSS fallbacks still apply. */
function vars(entries: Record<string, string | number | null | undefined>): Vars {
  const out: Vars = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === '' || value === null || value === undefined) continue;
    (out as Record<string, string | number>)[key] = value;
  }
  return out;
}

type Row = { key: string; feature: PricingFeature | null; label: string };

/**
 * A plan's feature rows. With "line up rows" on, labelled rows follow one
 * shared order across every plan — a plan without that row shows a dash — and
 * unlabelled rows follow; otherwise each plan lists its own rows as entered.
 */
function rowsFor(plan: PricingPlan, sharedLabels: string[] | null): Row[] {
  const visible = plan.features.filter((f) => f.visible && (f.text.trim() || f.rowLabel.trim()));
  if (!sharedLabels) return visible.map((f) => ({ key: f.id, feature: f, label: '' }));
  const byLabel = new Map(visible.filter((f) => f.rowLabel.trim()).map((f) => [f.rowLabel.trim().toLowerCase(), f]));
  const labelled = sharedLabels.map((label) => {
    const feature = byLabel.get(label.toLowerCase()) ?? null;
    return { key: feature?.id ?? `missing-${label}`, feature, label };
  });
  const rest = visible.filter((f) => !f.rowLabel.trim()).map((f) => ({ key: f.id, feature: f, label: '' }));
  return [...labelled, ...rest];
}

export function ManualPricingTableBlock({
  content,
  ctx,
}: {
  content: ManualPricingTableContent;
  ctx: BlockContext;
}) {
  const plans = content.plans.filter((plan) => plan.visible);
  const showIntro = content.showIntro && Boolean(content.heading || content.description);
  if (plans.length === 0 && !showIntro) return null;

  const columns = resolveColumns(ctx.design, content.columns, {
    tablet: content.tabletColumns || undefined,
    mobile: content.mobileColumns || undefined,
  });

  const sharedLabels = content.compareRows
    ? [
        ...new Set(
          plans.flatMap((plan) =>
            plan.features.filter((f) => f.visible && f.rowLabel.trim()).map((f) => f.rowLabel.trim()),
          ),
        ),
      ].filter((label, index, all) => all.findIndex((l) => l.toLowerCase() === label.toLowerCase()) === index)
    : null;

  const PlanHeading = showIntro && content.heading ? 'h3' : 'h2';
  const equalHeight = content.cardHeight === 'equal';

  const gridStyle = vars({
    '--grid-cols': columns.desktop,
    '--grid-cols-tablet': columns.tablet,
    '--grid-cols-mobile': columns.mobile,
    '--mpt-col-gap': content.columnGap,
    '--mpt-row-gap': content.rowGap,
    '--mpt-align': equalHeight ? 'stretch' : ALIGN[content.cardAlign],
    '--mpt-max-w': content.gridMaxWidth,
    '--mpt-feature-gap': content.featureSpacing,
  });

  return (
    <>
      {showIntro ? (
        <SectionHeading
          heading={content.heading}
          description={content.description}
          align={content.align}
          inverted={ctx.inverted}
          as={ctx.isFirst ? 'h1' : 'h2'}
          className="mb-10"
        />
      ) : null}

      {plans.length > 0 ? (
        <div
          className={cn(
            'mpt-grid',
            content.gridAlign === 'left' && 'mr-auto',
            content.gridAlign === 'center' && 'mx-auto',
            content.gridAlign === 'right' && 'ml-auto',
          )}
          style={gridStyle}
        >
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              content={content}
              rows={rowsFor(plan, sharedLabels)}
              span={content.equalWidth ? 1 : plan.span}
              columns={columns}
              equalHeight={equalHeight}
              Heading={PlanHeading}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function PlanCard({
  plan,
  content,
  rows,
  span,
  columns,
  equalHeight,
  Heading,
}: {
  plan: PricingPlan;
  content: ManualPricingTableContent;
  rows: Row[];
  span: number;
  columns: { desktop: number; tablet: number; mobile: number };
  equalHeight: boolean;
  Heading: 'h2' | 'h3';
}) {
  const custom = plan.customStyle;
  const highlight = plan.highlight;

  const borderColor = highlight
    ? plan.highlightBorderColor || content.highlightBorderColor
    : (custom && plan.borderColor) || content.cardBorderColor;
  const borderWidth = highlight
    ? plan.highlightBorderWidth || content.highlightBorderWidth
    : content.cardBorderWidth;
  const background =
    (highlight && plan.highlightBackground) || (custom && plan.background) || content.cardBackground;
  const shadow =
    (highlight && plan.highlightShadow) || (custom && plan.shadow) || content.cardShadow;

  const cardStyle = vars({
    '--mpt-bg': background,
    '--mpt-border-color': borderColor || 'transparent',
    '--mpt-border-w': borderWidth || '0px',
    '--mpt-radius': (custom && plan.radius) || content.cardRadius,
    '--mpt-pad': (custom && plan.padding) || content.cardPadding,
    '--mpt-shadow': SHADOW[shadow] ?? SHADOW.sm,
    '--mpt-text': (custom && plan.textColor) || content.textColor,
    '--mpt-heading': (custom && plan.headingColor) || content.headingColor,
    '--mpt-check': content.checkColor,
    '--mpt-span': Math.min(span, columns.desktop),
    '--mpt-span-t': Math.min(span, columns.tablet),
    '--mpt-span-m': Math.min(span, columns.mobile),
    '--mpt-scale': highlight && plan.highlightScale > 1 ? plan.highlightScale : undefined,
    '--mpt-offset': highlight ? plan.highlightOffset : undefined,
  });
  if (plan.order > 0) cardStyle.order = plan.order;
  if (custom && plan.verticalAlign !== 'inherit') cardStyle.alignSelf = ALIGN[plan.verticalAlign];
  if (custom && plan.maxWidth) {
    cardStyle.maxWidth = plan.maxWidth;
    cardStyle.justifySelf = 'center';
    cardStyle.width = '100%';
  }

  const badgeStyle = vars({
    '--mpt-badge-bg': plan.badgeBg || content.badgeBg,
    '--mpt-badge-text': plan.badgeText || content.badgeText,
  });

  return (
    <article
      className={cn('mpt-card', equalHeight && 'mpt-card--equal')}
      style={cardStyle}
      data-highlight={highlight ? '' : undefined}
      data-emphasis={highlight && (plan.highlightScale > 1 || plan.highlightOffset) ? '' : undefined}
    >
      {plan.badge ? (
        <p className="mpt-badge" style={badgeStyle}>
          {plan.badge}
        </p>
      ) : null}

      {plan.name ? (
        <Heading className="mpt-name font-heading text-base font-semibold leading-snug sm:text-[1.0625rem]">
          {plan.name}
        </Heading>
      ) : null}

      {plan.description ? <p className="mpt-text mt-2.5 text-[0.8125rem] leading-relaxed sm:text-sm">{plan.description}</p> : null}

      {plan.price ? (
        <p className="mt-4">
          <span className="mpt-name font-heading text-2xl font-bold tracking-tight">{plan.price}</span>
          {plan.billing ? <span className="mpt-text ml-1.5 text-xs">{plan.billing}</span> : null}
        </p>
      ) : plan.billing ? (
        <p className="mpt-text mt-3 text-xs">{plan.billing}</p>
      ) : null}

      {rows.length > 0 ? (
        <>
          {content.showSeparator ? (
            <hr className="mpt-separator" style={vars({ '--mpt-sep': content.separatorColor })} aria-hidden="true" />
          ) : (
            <div className="mt-5" aria-hidden="true" />
          )}
          <ul className="mpt-features">
            {rows.map((row) => (
              <FeatureRow key={row.key} row={row} />
            ))}
          </ul>
        </>
      ) : null}

      <PlanButton plan={plan} content={content} equalHeight={equalHeight} />
    </article>
  );
}

function FeatureRow({ row }: { row: Row }) {
  const feature = row.feature;
  if (!feature) {
    return (
      <li className="mpt-feature mpt-text">
        <span className="mpt-check-space" aria-hidden="true" />
        <span className="min-w-0">
          <span className="mpt-row-label">{row.label}</span> <span aria-label="Not included">—</span>
        </span>
      </li>
    );
  }
  const style = feature.customStyle
    ? vars({ color: feature.color, background: feature.background, padding: feature.padding })
    : undefined;
  if (style && feature.background) style.borderRadius = '6px';
  return (
    <li className={cn('mpt-feature', !style?.color && 'mpt-text')} style={style}>
      {feature.showCheck ? (
        <Check className="mpt-check" aria-hidden="true" />
      ) : (
        <span className="mpt-check-space" aria-hidden="true" />
      )}
      <span className={cn('min-w-0', EMPHASIS[feature.emphasis])}>
        {row.label ? <span className="mpt-row-label">{row.label}: </span> : null}
        {feature.text}
      </span>
    </li>
  );
}

function PlanButton({
  plan,
  content,
  equalHeight,
}: {
  plan: PricingPlan;
  content: ManualPricingTableContent;
  equalHeight: boolean;
}) {
  const href = safeUrl(plan.ctaUrl);
  if (!plan.showCta || !plan.ctaLabel.trim() || !href) return null;

  const own = plan.customButton;
  const pick = <K extends keyof PricingPlan & keyof ManualPricingTableContent>(key: K) =>
    (own && plan[key]) || content[key];

  const width = (own && plan.buttonWidth) || content.buttonWidth;
  const align = (own && plan.buttonAlign) || content.buttonAlign;
  const style = vars({
    '--mpt-btn-bg': pick('buttonBg') as string,
    '--mpt-btn-text': pick('buttonText') as string,
    '--mpt-btn-border': pick('buttonBorder') as string,
    '--mpt-btn-hover-bg': pick('buttonHoverBg') as string,
    '--mpt-btn-hover-text': pick('buttonHoverText') as string,
    '--mpt-btn-radius': pick('buttonRadius') as string,
    '--mpt-btn-fs': pick('buttonFontSize') as string,
    '--mpt-btn-fw': pick('buttonFontWeight') as string,
    '--mpt-btn-py': pick('buttonPadding') as string,
    '--mpt-btn-tt': content.buttonUppercase ? 'uppercase' : 'none',
  });

  const className = cn('mpt-btn', width === 'full' && 'mpt-btn--full');
  const external = /^https?:\/\//i.test(href);
  const label = plan.ctaLabel.trim();

  return (
    <div
      className={cn('mpt-actions', equalHeight && content.buttonPlacement === 'bottom' && 'mpt-actions--bottom')}
      style={{ justifyContent: JUSTIFY[align] }}
    >
      {external || plan.newTab ? (
        <a
          href={href}
          className={className}
          style={style}
          {...(plan.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
          {plan.newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
        </a>
      ) : (
        <Link href={href} className={className} style={style}>
          {label}
        </Link>
      )}
    </div>
  );
}
