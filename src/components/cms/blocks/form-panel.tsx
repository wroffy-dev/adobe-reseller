import type * as React from 'react';
import type { PublicForm } from '@/lib/services/forms';
import { PublicFormRenderer } from '@/components/forms/public-form';
import {
  applyFormStyle,
  formCardStyle,
  wantsFormCard,
  type FormStyle,
} from '@/lib/cms/form-style';
import { cn } from '@/lib/utils/cn';

/** The card drawn around a form in a block that has none of its own. */
const STYLED_CARD = 'cms-surface rounded-[var(--layout-card-radius)] p-6';

/**
 * A form inside a section, restyled for this placement.
 *
 * Every block that embeds a form draws it through here, so the section's Form
 * tab — heading, text colours, fields, button and card — reaches it the same
 * way everywhere. The block passes its old card classes, which is why an
 * untouched section renders exactly as it did; the form's own design comes
 * from Forms and only the values chosen on the tab are laid over a copy of it.
 */
export function FormPanel({
  form,
  formStyle,
  instanceKey,
  cardClassName,
  className,
  heading,
  description,
  buttonLabel,
  headingAs: HeadingTag = 'h3',
  headingClassName = 'font-heading text-lg font-semibold text-content',
  descriptionClassName = 'mt-1.5 text-sm leading-relaxed text-muted',
  bodyClassName = 'mt-5',
  productId,
  leadMagnetId,
  ctaLocation,
  compact,
  context,
  children,
}: {
  form: PublicForm;
  formStyle: FormStyle | null | undefined;
  /** The section or widget id; see PublicFormRenderer. */
  instanceKey: string;
  /** The block's own card. Without one, a card is drawn only when the Form tab asks for it. */
  cardClassName?: string;
  /** Always on the wrapper, card or not. */
  className?: string;
  /**
   * The heading, description and button text, when the block keeps them in
   * fields of its own. Undefined falls back to the Form tab's.
   */
  heading?: string | null;
  description?: string | null;
  buttonLabel?: string | null;
  headingAs?: 'h2' | 'h3' | 'h4' | 'p';
  headingClassName?: string;
  descriptionClassName?: string;
  /** Spacing between the heading and the form, used only when there is a heading. */
  bodyClassName?: string;
  productId?: string | null;
  leadMagnetId?: string | null;
  ctaLocation?: string;
  compact?: boolean;
  context?: Record<string, string>;
  /** Anything the block shows under the form, such as a footnote. */
  children?: React.ReactNode;
}) {
  const style = formStyle ?? undefined;
  const headingText = heading !== undefined ? heading : style?.heading;
  const descriptionText = description !== undefined ? description : style?.description;
  const submitLabel = (buttonLabel !== undefined ? buttonLabel : style?.buttonLabel) || form.submitLabel;

  const align = style && style.headingAlign !== 'inherit' ? style.headingAlign : undefined;
  const headingStyle: React.CSSProperties = {
    textAlign: align,
    color: style?.headingColor || undefined,
    fontSize: style?.headingSize || undefined,
  };
  const descriptionStyle: React.CSSProperties = {
    textAlign: align,
    color: style?.descriptionColor || undefined,
  };

  const card = cardClassName ?? (wantsFormCard(style) ? cn(STYLED_CARD, style?.cardBorderColor && 'border') : '');

  return (
    <div className={cn(card, className) || undefined} style={formCardStyle(style)}>
      {headingText ? (
        <HeadingTag className={headingClassName} style={headingStyle}>
          {headingText}
        </HeadingTag>
      ) : null}
      {descriptionText ? (
        <p className={descriptionClassName} style={descriptionStyle}>
          {descriptionText}
        </p>
      ) : null}
      <div className={headingText || descriptionText ? bodyClassName : undefined}>
        <PublicFormRenderer
          form={{ ...form, design: applyFormStyle(form.design, style), submitLabel }}
          instanceKey={instanceKey}
          productId={productId}
          leadMagnetId={leadMagnetId}
          ctaLocation={ctaLocation}
          compact={compact}
          context={context}
        />
      </div>
      {children}
    </div>
  );
}
