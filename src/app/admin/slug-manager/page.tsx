import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { siteUrl } from '@/lib/env';
import { getUserCountryIds } from '@/lib/country/access';
import { AdminPageHeader } from '@/components/admin/page-header';
import { SlugManager } from '@/components/admin/urls/slug-manager';
import { listPatterns, listRoutes } from '@/lib/urls/manager';

export const metadata: Metadata = { title: 'Slug & URL Manager' };
export const dynamic = 'force-dynamic';

/**
 * SEO → Slug & URL Manager.
 *
 * Guarded by `seo.manage`, like every SEO and redirect screen, and narrowed to
 * the markets the signed-in user may work in. The first page of URLs is
 * rendered on the server; everything after that loads through Server Actions
 * without leaving the page.
 */
export default async function SlugManagerPage() {
  const user = await requirePermission('seo.manage');
  const assigned = user.role === 'super-admin' ? [] : await getUserCountryIds(user.id);
  const allowed = assigned.length ? assigned : null;

  const [routes, patternData, settings, countries, conflictCount, notFoundCount] = await Promise.all([
    listRoutes({ page: 1, pageSize: 25 }, allowed),
    listPatterns(),
    prisma.urlSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.country.findMany({
      select: { id: true, name: true, slug: true, code: true, isDefault: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.urlRoute.count({ where: { conflictPath: { not: null }, ...(allowed ? { countryId: { in: allowed } } : {}) } }),
    prisma.notFoundLog.count({ where: { resolvedAt: null } }),
  ]);

  const markets = countries.filter((country) => !allowed || allowed.includes(country.id));

  return (
    <div className="max-w-7xl">
      <AdminPageHeader
        title="Slug & URL Manager"
        description="Every public address on the site — products, pages, articles, categories, tags and landing pages — in one place. Change a URL, set URL patterns, manage redirects and fix what is broken."
        crumbs={[{ label: 'SEO', href: '/admin/seo' }, { label: 'Slug & URL Manager' }]}
      />
      <SlugManager
        initialRoutes={routes}
        markets={markets}
        origin={siteUrl()}
        canEdit={userCan(user, 'seo.manage')}
        canActivate={!allowed}
        resolverEnabled={Boolean(settings?.resolverEnabled)}
        patterns={patternData.patterns}
        counts={patternData.counts}
        conflictCount={conflictCount}
        notFoundCount={notFoundCount}
      />
    </div>
  );
}
