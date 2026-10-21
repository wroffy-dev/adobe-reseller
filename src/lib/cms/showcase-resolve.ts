import type { ProductShowcaseContent, ShowcaseItem } from './showcase-blocks';

/**
 * What a Product Showcase tile becomes once its product and image are known.
 *
 * Pure, so the rules a visitor sees — what a tile shows and where it goes — are
 * tested without a database: the renderer loads the products and media, and
 * this decides.
 */

export type ShowcaseProduct = {
  name: string;
  href: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type ShowcaseMedia = { url: string; altText: string; width: number | null; height: number | null };

export type ShowcaseTile = {
  id: string;
  name: string;
  description: string;
  /** Empty when the tile links nowhere; it then renders as a plain box. */
  href: string;
  newTab: boolean;
  badge: string;
  image: { url: string; alt: string; width: number | null; height: number | null } | null;
  style: { background: string; borderColor: string; textColor: string } | null;
};

/**
 * One tile, or null when it should not appear:
 *  - hidden by the administrator;
 *  - tied to a product this market does not sell, with no link of its own —
 *    a tile that would lead to a missing page is left out rather than shown;
 *  - nothing to call it (no name typed and no product to name it).
 *
 * Every override wins over the product: a typed name, a chosen image, a link.
 */
export function resolveShowcaseTile(
  item: ShowcaseItem,
  content: Pick<ProductShowcaseContent, 'showImages' | 'showDescriptions'>,
  products: Map<string, ShowcaseProduct>,
  media: Map<string, ShowcaseMedia>,
): ShowcaseTile | null {
  if (!item.visible) return null;
  const product = item.productId ? (products.get(item.productId) ?? null) : null;
  if (item.productId && !product && !item.url) return null;

  const name = item.name.trim() || product?.name.trim() || '';
  if (!name) return null;

  let image: ShowcaseTile['image'] = null;
  if (content.showImages && !item.hideImage) {
    const chosen = item.imageId ? media.get(item.imageId) : undefined;
    if (chosen) {
      image = { url: chosen.url, alt: chosen.altText || name, width: chosen.width, height: chosen.height };
    } else if (product?.imageUrl) {
      image = { url: product.imageUrl, alt: product.imageAlt || name, width: null, height: null };
    }
  }

  return {
    id: item.id,
    name,
    description: content.showDescriptions ? item.description.trim() : '',
    href: item.url || product?.href || '',
    newTab: item.newTab,
    badge: item.badge.trim(),
    image,
    style: item.customStyle
      ? { background: item.background, borderColor: item.borderColor, textColor: item.textColor }
      : null,
  };
}

export function resolveShowcaseTiles(
  content: Pick<ProductShowcaseContent, 'items' | 'showImages' | 'showDescriptions'>,
  products: Map<string, ShowcaseProduct>,
  media: Map<string, ShowcaseMedia>,
): ShowcaseTile[] {
  return content.items
    .map((item) => resolveShowcaseTile(item, content, products, media))
    .filter((tile): tile is ShowcaseTile => tile !== null);
}

/** The ids the renderer has to load: products of visible tiles, and chosen images. */
export function showcaseLookups(content: Pick<ProductShowcaseContent, 'items' | 'showImages'>): {
  productIds: string[];
  mediaIds: string[];
} {
  const visible = content.items.filter((item) => item.visible);
  return {
    productIds: [...new Set(visible.map((item) => item.productId).filter((id): id is string => Boolean(id)))],
    mediaIds: content.showImages
      ? [
          ...new Set(
            visible
              .filter((item) => !item.hideImage)
              .map((item) => item.imageId)
              .filter((id): id is string => Boolean(id)),
          ),
        ]
      : [],
  };
}
