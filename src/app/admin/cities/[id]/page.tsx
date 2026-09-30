import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { userCanAccessCountry } from '@/lib/country/access';
import { getCountryById } from '@/lib/country/registry';
import { siteUrl } from '@/lib/env';
import { AdminPageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { CityDetail } from '@/components/admin/cities/city-detail';
import { getCityDetail, pagePathTemplates } from '@/lib/services/cities';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const city = await prisma.city.findUnique({ where: { id }, select: { name: true } });
  return { title: city ? `${city.name} — City` : 'City' };
}

export default async function CityAdmin({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('cities.view');
  const { id } = await params;
  const city = await getCityDetail(id);
  if (!city || !(await userCanAccessCountry(user, city.country.id))) notFound();

  const country = await getCountryById(city.country.id);
  const templates = country ? await pagePathTemplates([country]) : {};

  return (
    <>
      <AdminPageHeader
        title={city.name}
        description={[city.region, city.country.name].filter(Boolean).join(', ')}
        backHref="/admin/cities"
        backLabel="All cities"
        status={city.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Archived</Badge>}
      />
      <CityDetail
        city={{
          ...city,
          productPages: city.productPages.map((row) => ({ ...row, scores: row.scores })),
        }}
        origin={siteUrl().replace(/\/$/, '')}
        template={templates[city.country.id]}
        canManage={userCan(user, 'cities.manage')}
        canPublish={userCan(user, 'pages.publish')}
      />
    </>
  );
}
