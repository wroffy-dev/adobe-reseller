import type { Metadata } from 'next';
import { publicMetadata, PublicPage, type PublicSearchParams } from '../_surfaces/dispatch';

type Params = { slug?: string[] };
type SearchParams = Promise<PublicSearchParams>;

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically. Declaring `revalidate` here made Next try
// anyway and every request failed with DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

/**
 * The public catch-all, for every market.
 *
 * Resolution lives in `_surfaces/dispatch.tsx` and the URL registry
 * (`lib/urls/resolver.ts`): the first segment may name a market, the registry
 * decides which content owns the address, and redirects, legacy addresses and
 * 404s are handled in that one place for this route and for the concrete
 * `/products` and `/blog` routes alike.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return publicMetadata(slug ?? [], query);
}

export default async function PublicCatchAll({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: SearchParams;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <PublicPage segments={slug ?? []} query={query} />;
}
