import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { siteUrl } from '@/lib/env';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import { Card } from '@/components/ui/card';
import { CitiesTable } from '@/components/admin/cities/cities-table';
import { CityCreateDrawer } from '@/components/admin/cities/city-create-drawer';
import type { FilterDefinition } from '@/lib/admin/filters';
import { resolveListCountry, countryFilterDefinition } from '@/lib/admin/country-filter';
import { listCities, pagePathTemplates, type CityStatusFilter } from '@/lib/services/cities';

export const metadata: Metadata = { title: 'Cities' };
export const dynamic = 'force-dynamic';

export default async function CitiesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; status?: string; q?: string }>;
}) {
  const user = await requirePermission('cities.view');
  const params = await searchParams;
  const scope = await resolveListCountry(user, params.country);
  const accessible = scope.countries.map((c) => c.id);
  const status: CityStatusFilter = params.status === 'active' || params.status === 'archived' ? params.status : 'all';
  const canManage = userCan(user, 'cities.manage');
  const activeCountries = scope.countries.filter((c) => c.isActive);

  const [rows, templates, templatePages] = await Promise.all([
    listCities({ countryIds: accessible, countryId: scope.countryId, status, q: params.q?.trim() || null }),
    pagePathTemplates(activeCountries),
    canManage
      ? prisma.page.findMany({
          where: { deletedAt: null, countryId: { in: activeCountries.map((c) => c.id) } },
          orderBy: { title: 'asc' },
          take: 300,
          select: { id: true, title: true, countryId: true },
        })
      : [],
  ]);

  const definitions: FilterDefinition[] = [
    ...countryFilterDefinition(scope),
    {
      name: 'status',
      label: 'Status',
      allLabel: 'Any status',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ],
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Cities"
        description="Local landing pages for the cities each market serves. Every city page is an ordinary page: built in the page builder, addressed by the URL Manager, listed in the sitemap."
        crumbs={[{ label: 'Website' }, { label: 'Cities' }]}
        actions={
          canManage && activeCountries.length ? (
            <CityCreateDrawer
              countries={activeCountries.map((c) => ({ id: c.id, name: c.name }))}
              defaultCountryId={scope.current.isActive ? scope.current.id : activeCountries[0]!.id}
              templates={templates}
              origin={siteUrl().replace(/\/$/, '')}
              templatePages={templatePages}
              canPublish={userCan(user, 'pages.publish')}
            />
          ) : null
        }
      />
      <FilterBar searchPlaceholder="Search cities" definitions={definitions} />
      <Card>
        <CitiesTable
          rows={rows.map((row) => ({ ...row, scores: row.scores ? { ...row.scores, analyzedAt: row.scores.analyzedAt.toISOString() } : null }))}
          canManage={canManage}
          showCountry={scope.multiCountry}
          filtered={Boolean(params.q || params.status)}
        />
      </Card>
    </>
  );
}
