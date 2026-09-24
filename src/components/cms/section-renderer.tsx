import { parseBlockContent } from '@/lib/cms/blocks';
import {
  parseSectionDesign,
  buildSectionStyles,
  resolveAnchors,
  type SectionDesign,
} from '@/lib/cms/design';
import { getMedia } from '@/lib/services/media';
import type {
  HeroContent,
  RichTextContent,
  FeatureGridContent,
  ImageContentContent,
  ProductCardsContent,
  ProductTableContent,
  ProductGridContent,
  FaqContent,
  TestimonialsContent,
  CtaContent,
  LeadMagnetContent,
  FormBlockContent,
  LogoWallContent,
  StatsContent,
  StepsContent,
  ImageCardsContent,
  IconCardsContent,
  ImageBoxContent,
  IconBoxContent,
  ListSectionContent,
  HeadingTextContent,
  TextListImageContent,
  StatisticsContent,
} from '@/lib/cms/blocks';
import type {
  LogoSliderContent,
  ImageSliderContent,
  TestimonialSliderContent,
  ContentSliderContent,
  TextBoxSliderContent,
  ProductSliderContent,
  BlogSliderContent,
} from '@/lib/cms/slider-blocks';
import type {
  BlogHeroContent,
  BlogBreadcrumbContent,
  BlogCategoryFilterContent,
  BlogSearchContent,
  BlogFeaturedContent,
  BlogGridContent,
  BlogPaginationContent,
  BlogNewsletterContent,
  DividerContent,
  SpacerContent,
  ArticleHeaderContent,
  ArticleImageContent,
  ArticleTocContent,
  ArticleContentContent,
  ArticleShareContent,
  ArticleTagsContent,
  ArticleAuthorContent,
  ArticleRelatedContent,
  ArticlePrevNextContent,
} from '@/lib/cms/blog-blocks';
import type { BlogRenderContext } from '@/lib/cms/blog-render';
import type {
  ProductHeaderContent,
  ProductMediaContent,
  ProductDescriptionContent,
  ProductFeaturesContent,
  ProductSpecsContent,
  ProductRelatedContent,
  ProductPriceBoxContent,
} from '@/lib/cms/product-blocks';
import type { ProductRenderContext } from '@/lib/cms/product-render';
import { localiseContent } from '@/lib/country/routing';
import { getRequestCountry } from '@/lib/country/request';
import type { CountryContext } from '@/lib/country/types';

import type { BlockContext } from './blocks/shared';
import { HeroBlock } from './blocks/hero-block';
import {
  RichTextBlock,
  ImageContentBlock,
  FeatureGridBlock,
  StatsBlock,
  StepsBlock,
  LogoWallBlock,
} from './blocks/content-blocks';
import { ProductCardsBlock, ProductTableBlock, ProductGridBlock } from './blocks/product-blocks';
import { FaqBlock, TestimonialsBlock } from './blocks/social-blocks';
import { CtaBlock, FormBlock, LeadMagnetBlock } from './blocks/conversion-blocks';
import {
  ImageCardsBlock,
  IconCardsBlock,
  ImageBoxBlock,
  IconBoxBlock,
  ListSectionBlock,
  HeadingTextBlock,
  TextListImageBlock,
  StatisticsBlock,
} from './blocks/card-blocks';
import {
  LogoSliderBlock,
  ImageSliderBlock,
  TestimonialSliderBlock,
  ContentSliderBlock,
  TextBoxSliderBlock,
  ProductSliderBlock,
  BlogSliderBlock,
} from './blocks/slider-blocks';
import {
  BlogHeroBlock,
  BlogBreadcrumbBlock,
  BlogCategoryFilterBlock,
  BlogSearchBlock,
  BlogFeaturedBlock,
  BlogGridBlock,
  BlogPaginationBlock,
  BlogNewsletterBlock,
  DividerBlock,
  SpacerBlock,
  ArticleBreadcrumbBlock,
  ArticleHeaderBlock,
  ArticleImageBlock,
  ArticleTocBlock,
  ArticleContentBlock,
  ArticleShareBlock,
  ArticleTagsBlock,
  ArticleAuthorBlock,
  ArticleRelatedBlock,
  ArticlePrevNextBlock,
} from './blocks/blog-blocks';
import {
  ProductHeaderBlock,
  ProductMediaBlock,
  ProductDescriptionBlock,
  ProductFeaturesBlock,
  ProductSpecsBlock,
  ProductRelatedBlock,
  ProductPriceBoxBlock,
} from './blocks/product-detail-blocks';

/**
 * The minimum a row needs to be rendered.
 *
 * `PageSection` and `BlogSection` both satisfy it, which is what lets one
 * renderer serve pages, the blog archive and the article page. A surface's
 * fallback arrangement, which has no database row behind it, satisfies it too.
 */
export type RenderableSection = {
  id: string;
  blockType: string;
  content: unknown;
  settings: unknown;
  isVisible: boolean;
  sortOrder: number;
};

/**
 * Dispatches one stored section to its renderer.
 *
 * This switch is the single mapping from a CMS block type to a frontend
 * component. Adding a block means adding a schema in lib/cms/blocks.ts, a
 * component, and one case here — never a new page-specific component tree.
 * Unknown block types render nothing rather than breaking the page.
 */
async function BlockBody({ section, ctx }: { section: RenderableSection; ctx: BlockContext }) {
  const { blockType } = section;
  /*
   * Internal links inside stored block content are rewritten into the market
   * being rendered, once, here — so no block component has to know about
   * markets to link correctly. For the root market this is the identity
   * function and the payload is not walked at all, which is why the original
   * single-country rendering is bit-for-bit unchanged.
   */
  const content = localiseContent(section.content, ctx.country);
  const parse = <T,>() => parseBlockContent<T>(blockType, content);

  switch (blockType) {
    case 'hero':
      return <HeroBlock content={parse<HeroContent>()} ctx={ctx} />;
    case 'richText':
      return <RichTextBlock content={parse<RichTextContent>()} ctx={ctx} />;
    case 'featureGrid':
      return <FeatureGridBlock content={parse<FeatureGridContent>()} ctx={ctx} />;
    case 'imageContent':
      return <ImageContentBlock content={parse<ImageContentContent>()} ctx={ctx} />;
    case 'productCards':
      return <ProductCardsBlock content={parse<ProductCardsContent>()} ctx={ctx} />;
    case 'productTable':
      return <ProductTableBlock content={parse<ProductTableContent>()} ctx={ctx} />;
    case 'productGrid':
      return <ProductGridBlock content={parse<ProductGridContent>()} ctx={ctx} />;
    case 'faq':
      return <FaqBlock content={parse<FaqContent>()} ctx={ctx} />;
    case 'testimonials':
      return <TestimonialsBlock content={parse<TestimonialsContent>()} ctx={ctx} />;
    case 'cta':
      return <CtaBlock content={parse<CtaContent>()} ctx={ctx} />;
    case 'leadMagnet':
      return <LeadMagnetBlock content={parse<LeadMagnetContent>()} ctx={ctx} />;
    case 'formBlock':
      return <FormBlock content={parse<FormBlockContent>()} ctx={ctx} />;
    case 'logoWall':
      return <LogoWallBlock content={parse<LogoWallContent>()} ctx={ctx} />;
    case 'stats':
      return <StatsBlock content={parse<StatsContent>()} ctx={ctx} />;
    case 'steps':
      return <StepsBlock content={parse<StepsContent>()} ctx={ctx} />;
    case 'imageCards':
      return <ImageCardsBlock content={parse<ImageCardsContent>()} ctx={ctx} />;
    case 'iconCards':
      return <IconCardsBlock content={parse<IconCardsContent>()} ctx={ctx} />;
    case 'imageBox':
      return <ImageBoxBlock content={parse<ImageBoxContent>()} ctx={ctx} />;
    case 'iconBox':
      return <IconBoxBlock content={parse<IconBoxContent>()} ctx={ctx} />;
    case 'listSection':
      return <ListSectionBlock content={parse<ListSectionContent>()} ctx={ctx} />;
    case 'headingText':
      return <HeadingTextBlock content={parse<HeadingTextContent>()} ctx={ctx} />;
    case 'textListImage':
      return <TextListImageBlock content={parse<TextListImageContent>()} ctx={ctx} />;
    case 'statistics':
      return <StatisticsBlock content={parse<StatisticsContent>()} ctx={ctx} />;

    // --- sliders ---
    case 'logoSlider':
      return <LogoSliderBlock content={parse<LogoSliderContent>()} ctx={ctx} />;
    case 'imageSlider':
      return <ImageSliderBlock content={parse<ImageSliderContent>()} ctx={ctx} />;
    case 'testimonialSlider':
      return <TestimonialSliderBlock content={parse<TestimonialSliderContent>()} ctx={ctx} />;
    case 'contentSlider':
      return <ContentSliderBlock content={parse<ContentSliderContent>()} ctx={ctx} />;
    case 'textBoxSlider':
      return <TextBoxSliderBlock content={parse<TextBoxSliderContent>()} ctx={ctx} />;
    case 'productSlider':
      return <ProductSliderBlock content={parse<ProductSliderContent>()} ctx={ctx} />;
    case 'blogSlider':
      return <BlogSliderBlock content={parse<BlogSliderContent>()} ctx={ctx} />;

    // --- blog listing ---
    case 'blogHero':
      return <BlogHeroBlock content={parse<BlogHeroContent>()} ctx={ctx} />;
    case 'blogBreadcrumb':
      return <BlogBreadcrumbBlock content={parse<BlogBreadcrumbContent>()} ctx={ctx} />;
    case 'blogCategoryFilter':
      return <BlogCategoryFilterBlock content={parse<BlogCategoryFilterContent>()} ctx={ctx} />;
    case 'blogSearch':
      return <BlogSearchBlock content={parse<BlogSearchContent>()} ctx={ctx} />;
    case 'blogFeatured':
      return <BlogFeaturedBlock content={parse<BlogFeaturedContent>()} ctx={ctx} />;
    case 'blogGrid':
      return <BlogGridBlock content={parse<BlogGridContent>()} ctx={ctx} />;
    case 'blogPagination':
      return <BlogPaginationBlock content={parse<BlogPaginationContent>()} ctx={ctx} />;
    case 'blogNewsletter':
      return <BlogNewsletterBlock content={parse<BlogNewsletterContent>()} ctx={ctx} />;
    case 'divider':
      return <DividerBlock content={parse<DividerContent>()} ctx={ctx} />;
    case 'spacer':
      return <SpacerBlock content={parse<SpacerContent>()} ctx={ctx} />;

    // --- blog article ---
    case 'articleBreadcrumb':
      return <ArticleBreadcrumbBlock content={parse<BlogBreadcrumbContent>()} ctx={ctx} />;
    case 'articleHeader':
      return <ArticleHeaderBlock content={parse<ArticleHeaderContent>()} ctx={ctx} />;
    case 'articleImage':
      return <ArticleImageBlock content={parse<ArticleImageContent>()} ctx={ctx} />;
    case 'articleToc':
      return <ArticleTocBlock content={parse<ArticleTocContent>()} ctx={ctx} />;
    case 'articleContent':
      return <ArticleContentBlock content={parse<ArticleContentContent>()} ctx={ctx} />;
    case 'articleShare':
      return <ArticleShareBlock content={parse<ArticleShareContent>()} ctx={ctx} />;
    case 'articleTags':
      return <ArticleTagsBlock content={parse<ArticleTagsContent>()} ctx={ctx} />;
    case 'articleAuthor':
      return <ArticleAuthorBlock content={parse<ArticleAuthorContent>()} ctx={ctx} />;
    case 'articleRelated':
      return <ArticleRelatedBlock content={parse<ArticleRelatedContent>()} ctx={ctx} />;
    case 'articlePrevNext':
      return <ArticlePrevNextBlock content={parse<ArticlePrevNextContent>()} ctx={ctx} />;

    // --- product pages ---
    case 'productHeader':
      return <ProductHeaderBlock content={parse<ProductHeaderContent>()} ctx={ctx} />;
    case 'productMedia':
      return <ProductMediaBlock content={parse<ProductMediaContent>()} ctx={ctx} />;
    case 'productDescription':
      return <ProductDescriptionBlock content={parse<ProductDescriptionContent>()} ctx={ctx} />;
    case 'productFeatures':
      return <ProductFeaturesBlock content={parse<ProductFeaturesContent>()} ctx={ctx} />;
    case 'productSpecs':
      return <ProductSpecsBlock content={parse<ProductSpecsContent>()} ctx={ctx} />;
    case 'productRelated':
      return <ProductRelatedBlock content={parse<ProductRelatedContent>()} ctx={ctx} />;
    case 'productPriceBox':
      return <ProductPriceBoxBlock content={parse<ProductPriceBoxContent>()} ctx={ctx} />;


    default:
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[cms] no renderer registered for block type "${blockType}"`);
      }
      return null;
  }
}

/**
 * Renders one section: its design wrapper, background layers and block body.
 *
 * Desktop design values are written as inline CSS custom properties; tablet and
 * mobile overrides ship as one small <style> element per section, and a section
 * left at its defaults emits no CSS at all.
 */
export async function SectionRenderer({
  section,
  isFirst = false,
  anchorId,
  design: providedDesign,
  blog,
  product,
  country: providedCountry,
  container = true,
}: {
  section: RenderableSection;
  isFirst?: boolean;
  anchorId?: string;
  design?: SectionDesign;
  /** The market to render for. Resolved from the request when not supplied. */
  country?: CountryContext;
  /** Blog surfaces pass their resolved context down to every block. */
  blog?: BlogRenderContext;
  /** Product surfaces do the same with the product being rendered. */
  product?: ProductRenderContext;
  /**
   * Wrap the block in the standard centred container. The article column has
   * its own width, so its sections opt out and fill the column instead.
   */
  container?: boolean;
}) {
  const design = providedDesign ?? parseSectionDesign(section.settings);
  const country = providedCountry ?? blog?.country ?? product?.country ?? (await getRequestCountry());

  const backgroundMedia =
    design.background.type === 'image' && design.background.imageId
      ? await getMedia(design.background.imageId)
      : null;

  const styles = buildSectionStyles(design, section.id, backgroundMedia?.url ?? null);
  const ctx: BlockContext = {
    sectionId: section.id,
    country,
    inverted: styles.inverted,
    isFirst,
    design,
    blog,
    product,
  };

  /*
   * A section that paints a background inside a column — the article's CTA, say
   * — reads as a card rather than a full-bleed band, because the column it
   * lives in is not the full width of the page.
   */
  const painted =
    design.preset !== 'default' ||
    design.background.type !== 'none' ||
    Boolean(design.colors.background);

  return (
    <>
      {styles.css ? <style dangerouslySetInnerHTML={{ __html: styles.css }} /> : null}
      <section
        id={anchorId || design.anchorId || undefined}
        data-block={section.blockType}
        className={`cms-section ${!container && painted ? 'cms-section--card ' : ''}${styles.className}${styles.modifiers ? ` ${styles.modifiers}` : ''}`}
        style={styles.style as React.CSSProperties}
      >
        {styles.layer ? (
          <div
            className="cms-section-layer"
            aria-hidden="true"
            style={{
              backgroundImage: styles.layer.image ?? undefined,
              backgroundPosition: styles.layer.position,
              backgroundSize: styles.layer.size,
              backgroundRepeat: styles.layer.repeat,
              backgroundAttachment: styles.layer.attachment,
            }}
          />
        ) : null}
        {styles.overlay ? (
          <div className="cms-section-overlay" aria-hidden="true" style={{ backgroundColor: styles.overlay }} />
        ) : null}

        {container ? (
          <div className="cms-container">
            <BlockBody section={section} ctx={ctx} />
          </div>
        ) : (
          <BlockBody section={section} ctx={ctx} />
        )}
      </section>
    </>
  );
}

/**
 * Renders every visible section of a page in order.
 *
 * Anchor IDs are de-duplicated across the page here rather than per section, so
 * two sections that were both given `#pricing` cannot emit the same DOM id.
 */
export async function SectionList({
  sections,
  blog,
  product,
  country: providedCountry,
  container = true,
  allowFirst = true,
}: {
  sections: RenderableSection[];
  blog?: BlogRenderContext;
  /** Product surfaces pass their resolved context down to every section. */
  product?: ProductRenderContext;
  /** The market to render for. Resolved from the request when not supplied. */
  country?: CountryContext;
  container?: boolean;
  /**
   * Whether the leading section may own the page's `<h1>`.
   *
   * False where the page already has one — the article page's title lives in
   * the article header, so nothing after it, in either column, may claim a
   * second `<h1>` just by being first in its list.
   */
  allowFirst?: boolean;
}) {
  const visible = sections.filter((s) => s.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  const anchors = resolveAnchors(visible);
  // Resolved once for the whole list rather than per section.
  const country = providedCountry ?? blog?.country ?? product?.country ?? (await getRequestCountry());

  return (
    <>
      {visible.map((section, index) => (
        <SectionRenderer
          key={section.id}
          section={section}
          isFirst={allowFirst && index === 0}
          anchorId={anchors.get(section.id)}
          blog={blog}
          product={product}
          country={country}
          container={container}
        />
      ))}
    </>
  );
}
