import type { BlogListItem, BlogPostDetail, BlogCategoryItem, BlogTagItem } from '@/lib/services/blog';
import { countryPath } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';
import type { ResolvedBlogSettings, BlogCardSettings } from './blog-settings';
import type { TocItem } from './blog-toc';
import type { CardOverrides } from './blog-blocks';
import { links } from '@/lib/urls/links';

/**
 * Everything a blog block needs that is not its own content.
 *
 * The route resolves this once — settings, the archive query, the article being
 * read, the table of contents — and every block reads from it. Blocks never
 * query for the page they are on, which is what lets the same `blogGrid` block
 * work on the archive, a category archive and an article page.
 */

export type BlogArchiveContext = {
  /** `/blog`, `/blog/category/x` or `/blog/tag/y`. Pagination links hang off it. */
  basePath: string;
  query: string;
  categorySlug: string | null;
  tagSlug: string | null;
  page: number;
  pages: number;
  total: number;
  /** The already-executed result for the page's main grid. */
  posts: BlogListItem[];
  /** Query values to preserve across pagination links. */
  searchParams: Record<string, string | undefined>;
  categories: BlogCategoryItem[];
  tags: BlogTagItem[];
};

export type BlogArticleContext = {
  post: BlogPostDetail;
  /** Body HTML with heading anchors stamped in. */
  html: string;
  toc: TocItem[];
  shareUrl: string;
  /** Resolved per-post display decisions, already merged with the defaults. */
  visible: Record<string, boolean>;
  forms: { cta: string; sidebar: string; bottom: string };
};

export type SiteSocials = {
  siteName: string;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
};

export type BlogRenderContext = {
  /** The market this blog surface is being rendered for. */
  country: CountryContext;
  settings: ResolvedBlogSettings;
  archive: BlogArchiveContext | null;
  article: BlogArticleContext | null;
  socials: SiteSocials;
};

/**
 * Applies a section's card overrides on top of the blog-wide card settings.
 *
 * `inherit` is the default everywhere, so a section only differs from the rest
 * of the blog where an administrator deliberately made it differ.
 */
export function resolveCard(
  card: BlogCardSettings,
  overrides?: Partial<CardOverrides>,
): BlogCardSettings {
  if (!overrides) return card;

  const apply = (value: string | undefined, fallback: boolean): boolean =>
    value === 'show' ? true : value === 'hide' ? false : fallback;

  return {
    ...card,
    showImage: apply(overrides.cardImage, card.showImage),
    showCategory: apply(overrides.cardCategory, card.showCategory),
    showExcerpt: apply(overrides.cardExcerpt, card.showExcerpt),
    showAuthor: apply(overrides.cardAuthor, card.showAuthor),
    showDate: apply(overrides.cardDate, card.showDate),
    showReadTime: apply(overrides.cardReadTime, card.showReadTime),
    showTags: apply(overrides.cardTags, card.showTags),
    showCta: apply(overrides.cardCta, card.showCta),
  };
}

/**
 * Where the blog's URLs live, per market.
 *
 * Kept in one place so links never drift, and market-aware so the same blog
 * block renders `/blog/x` on the root market and `/ae/blog/x` on the UAE one
 * without knowing which market it is in.
 */
export const blogPath = (country: CountryContext) => countryPath(country, 'blog');
// Articles, categories and tags take their addresses from the URL registry.
// The blog is root-only, so the market does not change them.
export const categoryPath = (_country: CountryContext, slug: string) => links().blogCategory(slug);
export const tagPath = (_country: CountryContext, slug: string) => links().blogTag(slug);
export const postPath = (_country: CountryContext, slug: string) => links().post(slug);
