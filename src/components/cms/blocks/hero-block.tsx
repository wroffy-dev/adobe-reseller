import { Check } from 'lucide-react';
import type { HeroContent } from '@/lib/cms/blocks';
import { getMedia } from '@/lib/services/media';
import { getPublicForm } from '@/lib/services/forms';
import { resolveCmsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import { SectionHeading, CtaLink, CmsImage, type BlockContext, mainCtaVariant } from './shared';
import { FormPanel } from './form-panel';

/**
 * Hero.
 *
 * The layout picker decides which of the optional slots appear. Both the image
 * and the form are genuinely optional, and the form is whichever active form the
 * admin selected in Form management — nothing about it is hardcoded here.
 */
export async function HeroBlock({ content, ctx }: { content: HeroContent; ctx: BlockContext }) {
  const layout = content.layout;
  const wantsImage = layout === 'contentImage' || layout === 'contentImageForm';
  const wantsForm = content.showForm || layout === 'contentForm' || layout === 'contentImageForm';
  const isBackdrop = layout === 'backgroundImage';

  const [image, form] = await Promise.all([
    content.imageId ? getMedia(content.imageId) : Promise.resolve(null),
    wantsForm && content.formSlug ? getPublicForm(content.formSlug) : Promise.resolve(null),
  ]);

  const inverted = ctx.inverted || isBackdrop;
  const showImage = wantsImage && Boolean(image);
  const showForm = wantsForm && Boolean(form);
  const bullets = content.bullets.filter(Boolean);
  const badges = content.badges.filter((badge) => badge.label);

  // Only a content-only hero centres by default; a two-column hero reads better left-aligned.
  const centred = isBackdrop || (content.alignment === 'center' && !showImage && !showForm);

  const copy = (
    <div className={cn(centred && 'mx-auto max-w-3xl text-center')}>
      <SectionHeading
        as={ctx.isFirst ? 'h1' : 'h2'}
        eyebrow={content.eyebrow}
        heading={content.heading}
        description={content.description}
        align={centred ? 'center' : 'left'}
        inverted={inverted}
        className={centred ? undefined : 'max-w-xl'}
      />

      {bullets.length > 0 ? (
        <ul
          className={cn(
            'mt-7 space-y-2.5',
            centred && 'inline-flex flex-col items-start text-left',
          )}
        >
          {bullets.map((bullet, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  inverted ? 'bg-white/20 text-white' : 'bg-brand/10 cms-accent',
                )}
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
              <span className={cn('text-sm', inverted ? 'text-white/85' : 'text-muted')}>
                {bullet}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {content.primaryCtaLabel || content.secondaryCtaLabel ? (
        <div className={cn('mt-9 flex flex-wrap gap-3', centred && 'justify-center')}>
          <CtaLink
            label={content.primaryCtaLabel}
            url={content.primaryCtaUrl}
            variant={mainCtaVariant(ctx, inverted)}
            role="primary"
          />
          <CtaLink
            label={content.secondaryCtaLabel}
            url={content.secondaryCtaUrl}
            variant={inverted ? 'ghost' : 'outline'}
          />
        </div>
      ) : null}

      {badges.length > 0 ? (
        <ul
          className={cn(
            'mt-8 flex flex-wrap items-center gap-x-5 gap-y-3',
            centred && 'justify-center',
          )}
        >
          {badges.map((badge, index) => {
            const Icon = resolveCmsIcon(badge.icon);
            return (
              <li
                key={index}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium',
                  inverted ? 'text-white/70' : 'text-muted',
                )}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {badge.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );

  const formPanel = showForm ? (
    <FormPanel
      form={form!}
      formStyle={content.formStyle}
      instanceKey={ctx.sectionId}
      cardClassName="cms-surface rounded-[var(--layout-card-radius)] border border-hairline bg-surface p-6 shadow-xl sm:p-7"
      heading={content.formHeading}
      description={content.formDescription}
      headingAs="h2"
      ctaLocation={content.ctaLocation || 'hero'}
      compact
    />
  ) : null;

  const picture = showImage ? (
    <CmsImage
      media={image}
      alt={content.imageAlt}
      ratio={content.imageRatio}
      fit={content.imageFit}
      position={content.imagePosition}
      width={content.imageWidth || undefined}
      priority={ctx.isFirst}
      sizes="(max-width: 1023px) 100vw, 50vw"
      wrapperClassName="rounded-2xl border border-hairline bg-muted/5 shadow-xl"
    />
  ) : null;

  // Background-image hero: the picture is the backdrop, everything sits on top.
  if (isBackdrop) {
    return (
      <div className="relative isolate">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-10 h-full w-full rounded-[var(--layout-card-radius)]"
            style={{
              objectFit: content.imageFit as 'cover',
              objectPosition: content.imagePosition,
            }}
          />
        ) : null}
        <div
          className="absolute inset-0 -z-10 rounded-[var(--layout-card-radius)] bg-black/55"
          aria-hidden="true"
        />
        <div className="px-4 py-20 sm:px-10 sm:py-28">
          {copy}
          {formPanel ? <div className="mx-auto mt-10 max-w-lg">{formPanel}</div> : null}
        </div>
      </div>
    );
  }

  const aside = formPanel ?? picture;

  if (!aside) {
    return copy;
  }

  // Content + image + form stacks the form under the image in the same column,
  // which keeps the hero to two columns at every width.
  const asideContent =
    formPanel && picture ? (
      <div className="space-y-6">
        {picture}
        {formPanel}
      </div>
    ) : (
      aside
    );

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
      <div className={cn(content.imagePlacement === 'left' && 'lg:order-2')}>{copy}</div>
      <div className={cn(content.imagePlacement === 'left' && 'lg:order-1')}>{asideContent}</div>
    </div>
  );
}
