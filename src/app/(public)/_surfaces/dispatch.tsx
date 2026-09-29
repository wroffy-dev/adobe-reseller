import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { after } from 'next/server';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import type { CountryContext } from '@/lib/country/types';
import { recordNotFound, resolvePublicRequest, type Resolution, type LegacySurface } from '@/lib/urls/resolver';
import { withQuery } from '@/lib/urls/paths';
import { cmsPageMetadata, CmsPageSurface } from './cms-page';
import {
  blogArchiveMetadata,
  BlogArchiveSurface,
  blogPostMetadata,
  BlogPostSurface,
  blogCategoryMetadata,
  BlogCategorySurface,
  blogTagMetadata,
  BlogTagSurface,
  type BlogSearchParams,
} from './blog';
import { productMetadata, ProductSurface } from './product';

/**
 * The one public dispatcher.
 *
 * Every public route file — the catch-all and the concrete `/products/[slug]`,
 * `/blog/[slug]`, `/blog/category/[slug]` and `/blog/tag/[slug]` — hands its
 * full path here. Resolution is cached per request, and it runs in
 * `generateMetadata`, which Next awaits before the first byte is streamed: a
 * redirect therefore goes out as a real HTTP 308/307 with a Location header,
 * not as a client-side navigation.
 */

export type PublicSearchParams = Record<string, string | string[] | undefined>;

function key(segments: readonly string[]): string {
  return segments.map((segment) => segment.trim()).filter(Boolean).join('/');
}

function blogParams(query: PublicSearchParams): BlogSearchParams {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return { page: one(query.page), q: one(query.q), tag: one(query.tag) };
}

/** Sends a redirect resolution. Never returns. */
function follow(resolution: Extract<Resolution, { kind: 'redirect' }>, query: PublicSearchParams): never {
  const destination = withQuery(resolution.destination, query);
  if (resolution.permanent) permanentRedirect(destination);
  redirect(destination);
}

/** Records the miss for URL Health after the response, then 404s. */
async function missing(requested: string): Promise<never> {
  let referrer: string | null = null;
  try {
    referrer = (await headers()).get('referer');
  } catch {
    referrer = null;
  }
  try {
    after(() => recordNotFound(requested, referrer));
  } catch {
    // Outside a request (tests) there is nothing to defer to.
  }
  notFound();
}

/** The current slug of the content a route points at. One indexed read. */
const slugOf = cache(async (type: string, id: string): Promise<string | null> => {
  switch (type) {
    case 'PRODUCT':
      return (await prisma.product.findFirst({ where: { id, deletedAt: null }, select: { slug: true } }))?.slug ?? null;
    case 'PAGE':
    case 'CATEGORY_PAGE':
    case 'BRAND_PAGE':
      return (await prisma.page.findFirst({ where: { id, deletedAt: null }, select: { slug: true } }))?.slug ?? null;
    case 'BLOG_POST':
      return (await prisma.blogPost.findFirst({ where: { id, deletedAt: null }, select: { slug: true } }))?.slug ?? null;
    case 'BLOG_CATEGORY':
      return (await prisma.blogCategory.findUnique({ where: { id }, select: { slug: true } }))?.slug ?? null;
    case 'BLOG_TAG':
      return (await prisma.blogTag.findUnique({ where: { id }, select: { slug: true } }))?.slug ?? null;
    default:
      return null;
  }
});

export async function publicMetadata(
  segments: readonly string[],
  query: PublicSearchParams,
): Promise<Metadata> {
  const resolution = await resolvePublicRequest(key(segments));

  switch (resolution.kind) {
    case 'redirect':
      return follow(resolution, query);
    case 'missing':
      return { title: 'Page not found', robots: { index: false, follow: false } };
    case 'legacy':
      return legacyMetadata(resolution.country, resolution.surface, query);
    case 'route': {
      const { route, country } = resolution;
      const slug = await slugOf(route.contentType, route.contentId);
      if (slug === null) return { title: 'Page not found', robots: { index: false, follow: false } };
      switch (route.contentType) {
        case 'PRODUCT':
          return productMetadata(country, slug, route.path);
        case 'BLOG_POST':
          return blogPostMetadata(country, slug, route.path);
        case 'BLOG_CATEGORY':
          return blogCategoryMetadata(country, slug, blogParams(query), route.path);
        case 'BLOG_TAG':
          return blogTagMetadata(country, slug, blogParams(query), route.path);
        default:
          return cmsPageMetadata(country, slug, route.path);
      }
    }
  }
}

export async function PublicPage({
  segments,
  query,
}: {
  segments: readonly string[];
  query: PublicSearchParams;
}) {
  const resolution = await resolvePublicRequest(key(segments));

  switch (resolution.kind) {
    case 'redirect':
      return follow(resolution, query);
    case 'missing':
      return missing(resolution.requested);
    case 'legacy':
      return <LegacySurfaceView country={resolution.country} surface={resolution.surface} query={query} />;
    case 'route': {
      const { route, country } = resolution;
      const slug = await slugOf(route.contentType, route.contentId);
      if (slug === null) return missing(resolution.requested);
      switch (route.contentType) {
        case 'PRODUCT':
          return <ProductSurface country={country} slug={slug} path={route.path} />;
        case 'BLOG_POST':
          return <BlogPostSurface country={country} slug={slug} path={route.path} />;
        case 'BLOG_CATEGORY':
          return <BlogCategorySurface country={country} slug={slug} searchParams={blogParams(query)} path={route.path} />;
        case 'BLOG_TAG':
          return <BlogTagSurface country={country} slug={slug} searchParams={blogParams(query)} path={route.path} />;
        default:
          return <CmsPageSurface country={country} slug={slug} path={route.path} />;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pre-registry behaviour, unchanged
// ---------------------------------------------------------------------------

function legacyMetadata(country: CountryContext, surface: LegacySurface, query: PublicSearchParams): Promise<Metadata> | Metadata {
  switch (surface.kind) {
    case 'blog':
      return blogArchiveMetadata(country, blogParams(query));
    case 'post':
      return blogPostMetadata(country, surface.slug);
    case 'category':
      return blogCategoryMetadata(country, surface.slug, blogParams(query));
    case 'tag':
      return blogTagMetadata(country, surface.slug, blogParams(query));
    case 'product':
      return productMetadata(country, surface.slug);
    case 'page':
      return cmsPageMetadata(country, surface.slug);
    default:
      return { title: 'Page not found', robots: { index: false, follow: false } };
  }
}

function LegacySurfaceView({
  country,
  surface,
  query,
}: {
  country: CountryContext;
  surface: LegacySurface;
  query: PublicSearchParams;
}) {
  switch (surface.kind) {
    case 'blog':
      return <BlogArchiveSurface country={country} searchParams={blogParams(query)} />;
    case 'post':
      return <BlogPostSurface country={country} slug={surface.slug} />;
    case 'category':
      return <BlogCategorySurface country={country} slug={surface.slug} searchParams={blogParams(query)} />;
    case 'tag':
      return <BlogTagSurface country={country} slug={surface.slug} searchParams={blogParams(query)} />;
    case 'product':
      return <ProductSurface country={country} slug={surface.slug} />;
    case 'page':
      return <CmsPageSurface country={country} slug={surface.slug} />;
    default:
      notFound();
  }
}
