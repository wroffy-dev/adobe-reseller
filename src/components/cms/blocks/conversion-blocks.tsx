import Image from 'next/image';
import { prisma } from '@/lib/db/prisma';
import type { CtaContent, FormBlockContent, LeadMagnetContent } from '@/lib/cms/blocks';
import { getPublicForm, getDefaultForm } from '@/lib/services/forms';
import { getMedia } from '@/lib/services/media';
import { cn } from '@/lib/utils/cn';
import { Check } from 'lucide-react';
import { SectionHeading, CtaLink, type BlockContext, mainCtaVariant, ctaVisible } from './shared';
import { FormPanel } from './form-panel';
import { buildPanelStyles } from '@/lib/cms/design';

export async function CtaBlock({ content, ctx }: { content: CtaContent; ctx: BlockContext }) {
  const inverted = ctx.inverted;
  const form =
    content.variant === 'split' && content.formSlug ? await getPublicForm(content.formSlug) : null;

  // Panel styling is resolved here so the frontend actually reflects what the
  // admin chose. Until they choose something, `hasBackground` stays false and
  // the panel keeps its original brand look.
  const panelImage =
    content.panel.background.type === 'image' && content.panel.background.imageId
      ? await getMedia(content.panel.background.imageId)
      : null;
  const panel = buildPanelStyles(content.panel, panelImage?.url ?? null);

  const align = content.alignment;
  const alignClass =
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const justifyClass =
    align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

  const showPrimary =
    content.showPrimaryCta && ctaVisible(content.primaryCtaLabel, content.primaryCtaUrl);
  const showSecondary =
    content.showSecondaryCta && ctaVisible(content.secondaryCtaLabel, content.secondaryCtaUrl);
  const hasButtons = showPrimary || showSecondary;

  const buttonRow = (variantFor: {
    primary: 'primary' | 'outline';
    secondary: 'outline' | 'ghost';
  }) =>
    hasButtons ? (
      <div className={cn('cms-actions', justifyClass)}>
        {showPrimary ? (
          <CtaLink
            label={content.primaryCtaLabel}
            url={content.primaryCtaUrl}
            variant={variantFor.primary}
            role="primary"
          />
        ) : null}
        {showSecondary ? (
          <CtaLink
            label={content.secondaryCtaLabel}
            url={content.secondaryCtaUrl}
            variant={variantFor.secondary}
          />
        ) : null}
      </div>
    ) : null;

  if (content.variant === 'split' && form) {
    return (
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            eyebrow={content.eyebrow}
            heading={content.heading}
            description={content.description}
            align="left"
            inverted={inverted}
          />
          {hasButtons ? (
            <div className="mt-7">
              <div className="cms-actions">
                {showPrimary ? (
                  <CtaLink
                    label={content.primaryCtaLabel}
                    url={content.primaryCtaUrl}
                    variant={mainCtaVariant(ctx)}
                    role="primary"
                  />
                ) : null}
                {showSecondary ? (
                  <CtaLink
                    label={content.secondaryCtaLabel}
                    url={content.secondaryCtaUrl}
                    variant={inverted ? 'ghost' : 'outline'}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <FormPanel
          form={form}
          formStyle={content.formStyle}
          instanceKey={ctx.sectionId}
          cardClassName="cms-surface rounded-2xl border border-hairline bg-surface p-6 shadow-lg sm:p-8"
          ctaLocation={content.ctaLocation || 'cta-block'}
          compact
        />
      </div>
    );
  }

  if (content.variant === 'panel') {
    // The brand panel is the *fallback*, not a hardcoded rule: as soon as the
    // admin sets any panel background it takes over, and the light-on-dark text
    // treatment goes with it.
    const usingCustom = panel.hasBackground;
    return (
      <div
        className={cn(
          'relative overflow-hidden px-6 py-12 sm:px-12',
          alignClass,
          !panel.style.borderRadius && 'rounded-2xl',
          usingCustom ? undefined : inverted ? 'bg-white/10 backdrop-blur' : 'bg-brand text-white',
        )}
        style={panel.style}
      >
        {panel.overlay ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: panel.overlay }}
          />
        ) : null}

        <div className="relative">
          <SectionHeading
            eyebrow={content.eyebrow}
            heading={content.heading}
            description={content.description}
            align={align}
            inverted={!usingCustom}
            headingStyle={
              content.panel.headingColor ? { color: content.panel.headingColor } : undefined
            }
            descriptionStyle={
              content.panel.textColor ? { color: content.panel.textColor } : undefined
            }
          />
          {hasButtons ? (
            <div className="mt-8">
              {buttonRow(
                usingCustom
                  ? { primary: 'primary', secondary: 'outline' }
                  : { primary: mainCtaVariant(ctx, true), secondary: 'ghost' },
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // `plain` (historical) and `simple` both render without a panel.
  return (
    <div className={alignClass}>
      <SectionHeading
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        align={align}
        inverted={inverted}
      />
      {hasButtons ? (
        <div className="mt-8">
          {buttonRow({
            primary: mainCtaVariant(ctx),
            secondary: inverted ? 'ghost' : 'outline',
          })}
        </div>
      ) : null}
    </div>
  );
}

export async function FormBlock({
  content,
  ctx,
}: {
  content: FormBlockContent;
  ctx: BlockContext;
}) {
  const inverted = ctx.inverted;
  const form = content.formSlug ? await getPublicForm(content.formSlug) : await getDefaultForm();

  if (!form) {
    return (
      <SectionHeading
        heading={content.heading}
        description="No form has been configured for this section yet."
        inverted={inverted}
      />
    );
  }

  const formPanel = (
    <FormPanel
      form={form}
      formStyle={content.formStyle}
      instanceKey={ctx.sectionId}
      cardClassName="cms-surface rounded-2xl border border-hairline bg-surface p-6 shadow-sm sm:p-8"
      ctaLocation={content.ctaLocation || 'form-block'}
    />
  );

  if (content.layout === 'split') {
    const bullets = content.sideBullets.filter(Boolean);
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <SectionHeading
            heading={content.heading}
            description={content.description}
            align="left"
            inverted={inverted}
          />
          {content.sideHeading ? (
            <h3
              className={cn(
                'mt-8 font-heading text-sm font-semibold uppercase tracking-wide',
                inverted ? 'text-white/70' : 'text-muted',
              )}
            >
              {content.sideHeading}
            </h3>
          ) : null}
          {bullets.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {bullets.map((bullet, index) => (
                <li key={index} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                      inverted ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand',
                    )}
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span className={cn('text-sm', inverted ? 'text-white/80' : 'text-muted')}>
                    {bullet}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {formPanel}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-8"
      />
      {formPanel}
    </div>
  );
}

export async function LeadMagnetBlock({
  content,
  ctx,
}: {
  content: LeadMagnetContent;
  ctx: BlockContext;
}) {
  const inverted = ctx.inverted;
  const magnet = content.leadMagnetSlug
    ? await prisma.leadMagnet.findFirst({
        where: { slug: content.leadMagnetSlug, isActive: true, deletedAt: null },
        include: {
          image: { select: { url: true, altText: true, width: true, height: true } },
          form: true,
        },
      })
    : null;

  const heading = content.heading || magnet?.title || '';
  const description = content.description || magnet?.description || '';
  const overrideImage = await getMedia(content.imageId);
  const image =
    overrideImage ??
    (magnet?.image ? { ...magnet.image, id: '', altText: magnet.image.altText ?? '' } : null);

  const formSlug = content.formSlug || (magnet?.form?.isActive ? magnet.form.slug : null);
  const form = formSlug ? await getPublicForm(formSlug) : null;

  if (!magnet && !form) {
    return (
      <SectionHeading
        heading={heading || 'Lead magnet'}
        description="Select an active lead magnet or form for this section."
        inverted={inverted}
      />
    );
  }

  return (
    <div
      className={cn(
        'grid items-center gap-8 rounded-2xl p-6 sm:p-10 lg:grid-cols-2 lg:gap-14',
        inverted ? 'bg-white/10 backdrop-blur' : 'border border-hairline bg-surface shadow-sm',
      )}
    >
      <div>
        {image ? (
          <Image
            src={image.url}
            alt={image.altText || heading}
            width={image.width ?? 480}
            height={image.height ?? 320}
            className="mb-6 h-auto w-full max-w-xs rounded-xl border border-hairline object-cover"
          />
        ) : null}
        <SectionHeading
          heading={heading}
          description={description}
          align="left"
          inverted={inverted}
        />
      </div>

      <div>
        {form ? (
          <FormPanel
            form={form}
            formStyle={content.formStyle}
            instanceKey={ctx.sectionId}
            buttonLabel={content.ctaLabel || magnet?.ctaLabel || null}
            leadMagnetId={magnet?.id ?? null}
            compact
            ctaLocation={content.ctaLocation || 'lead-magnet'}
          />
        ) : (
          <p className={cn('text-sm', inverted ? 'text-white/70' : 'text-muted')}>
            Attach a form to this lead magnet to start collecting downloads.
          </p>
        )}
      </div>
    </div>
  );
}
