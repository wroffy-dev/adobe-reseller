import type { Metadata } from 'next';
import { publicMetadata, PublicPage, type PublicSearchParams } from '../../../_surfaces/dispatch';

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically.
export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<PublicSearchParams>;

/**
 * A literal route Next matches before the catch-all. It renders nothing of its
 * own: the full path goes to the shared dispatcher, so an address here that
 * has moved is redirected by this route, and one that now belongs to other
 * content resolves to it.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return publicMetadata(['blog', 'category', slug], query);
}

export default async function CategoryArchive({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <PublicPage segments={['blog', 'category', slug]} query={query} />;
}
