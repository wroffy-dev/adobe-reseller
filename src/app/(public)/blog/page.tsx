import type { Metadata } from 'next';
import { loadLinks } from '@/lib/urls/links';
import { getDefaultCountry } from '@/lib/country/registry';
import {
  blogArchiveMetadata,
  BlogArchiveSurface,
  type BlogSearchParams,
} from '../_surfaces/blog';

type SearchParams = Promise<BlogSearchParams>;

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically. Declaring `revalidate` here made Next try
// anyway and every request failed with DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

/**
 * The root market's blog archive.
 *
 * A prefixed market reaches the same surface through the public catch-all, so
 * this route only declares the URL — the rendering is shared and there is one
 * implementation to maintain.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [country, params] = await Promise.all([getDefaultCountry(), searchParams]);
  return blogArchiveMetadata(country, params);
}

export default async function BlogIndex({ searchParams }: { searchParams: SearchParams }) {
  const [country, params] = await Promise.all([getDefaultCountry(), searchParams, loadLinks()]);
  return <BlogArchiveSurface country={country} searchParams={params} />;
}
