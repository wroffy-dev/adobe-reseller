import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { StatCard } from '@/components/admin/stat-card';
import { Card } from '@/components/ui/card';
import { AnalysisTable, RecalculateAllButton } from '@/components/admin/seo-intelligence/seo-dashboard';
import type { FilterDefinition, FilterPreset } from '@/lib/admin/filters';
import { resolveListCountry, countryFilterDefinition } from '@/lib/admin/country-filter';
import { analysisSummary, listAnalyses } from '@/lib/services/seo-intelligence';
import { ENTITY_LABELS, ENTITY_TYPES, HEALTH_LABELS, HEALTH_RANGES, healthOf, type Health } from '@/lib/seo-intelligence/types';
import type { StatTone } from '@/components/admin/stat-card';

export const metadata: Metadata = { title: 'SEO Intelligence' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 25;

function tone(score: number): StatTone {
  const health = healthOf(score);
  return health === 'excellent' ? 'success' : health === 'good' ? 'brand' : health === 'needs-improvement' ? 'warning' : 'danger';
}

export default async function SeoIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission('seo.manage');
  const params = await searchParams;
  const scope = await resolveListCountry(user, params.country);
  const countryIds = scope.countries.map((c) => c.id);
  const page = Math.max(1, Number(params.page) || 1);

  const filters = {
    countryIds,
    countryId: scope.countryId,
    type: params.type ?? null,
    cityId: params.city ?? null,
    health: params.health ?? null,
    status: params.status ?? null,
    q: params.q ?? null,
  };

  const [summary, list, cities] = await Promise.all([
    analysisSummary(filters),
    listAnalyses(filters, page, PER_PAGE, params.sort ?? null),
    prisma.city.findMany({
      where: { countryId: scope.countryId ? scope.countryId : { in: countryIds } },
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, country: { select: { code: true } } },
    }),
  ]);

  const definitions: FilterDefinition[] = [
    ...countryFilterDefinition(scope),
    {
      name: 'type',
      label: 'Content type',
      allLabel: 'Any type',
      options: ENTITY_TYPES.map((type) => ({ label: ENTITY_LABELS[type], value: type })),
    },
    {
      name: 'health',
      label: 'Score',
      allLabel: 'Any score',
      options: (Object.keys(HEALTH_RANGES) as Health[]).map((health) => ({
        label: `${HEALTH_LABELS[health]} (${HEALTH_RANGES[health][0]}–${HEALTH_RANGES[health][1]})`,
        value: health,
      })),
    },
    {
      name: 'status',
      label: 'Status',
      allLabel: 'Any status',
      options: [
        { label: 'Published', value: 'PUBLISHED' },
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Scheduled', value: 'SCHEDULED' },
        { label: 'Archived', value: 'ARCHIVED' },
      ],
    },
    ...(cities.length
      ? [
          {
            name: 'city',
            label: 'City',
            allLabel: 'Any city',
            advanced: true,
            options: cities.map((city) => ({ label: scope.multiCountry ? `${city.name} (${city.country.code})` : city.name, value: city.id })),
          },
        ]
      : []),
    {
      name: 'sort',
      label: 'Sort',
      allLabel: 'Lowest score first',
      advanced: true,
      options: [
        { label: 'Highest score first', value: 'best' },
        { label: 'Most critical issues', value: 'critical' },
        { label: 'Name', value: 'label' },
      ],
    },
  ];

  const presets: FilterPreset[] = [
    { id: 'all', label: 'Everything', params: {} },
    { id: 'poor', label: 'Poor', params: { health: 'poor' } },
    { id: 'cities', label: 'City pages', params: { type: 'CITY_PAGE' } },
    { id: 'products', label: 'Products', params: { type: 'PRODUCT' } },
  ];

  const countryNames = Object.fromEntries(scope.countries.map((c) => [c.id, c.name]));
  const filtered = Boolean(params.q || params.type || params.health || params.status || params.city);

  return (
    <>
      <AdminPageHeader
        title="SEO Intelligence"
        description="SEO, AEO and GEO scores for every page, product and city page, with the reason behind each point. AEO and GEO are this site’s own heuristics, not scores published by Google or AI platforms."
        crumbs={[{ label: 'Content & SEO' }, { label: 'SEO Intelligence' }]}
        actions={<RecalculateAllButton />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Overall SEO" value={summary.overall} tone={tone(summary.overall)} hint={HEALTH_LABELS[healthOf(summary.overall)]} />
        <StatCard label="SEO score" value={summary.seo} tone={tone(summary.seo)} hint="Search engines" />
        <StatCard label="AEO score" value={summary.aeo} tone={tone(summary.aeo)} hint="Answer engines" />
        <StatCard label="GEO score" value={summary.geo} tone={tone(summary.geo)} hint="Generative engines" />
        <StatCard label="Critical issues" value={summary.critical} tone={summary.critical ? 'danger' : 'success'} />
        <StatCard label="Warnings" value={summary.warnings} tone={summary.warnings ? 'warning' : 'success'} />
        <StatCard label="Passed checks" value={summary.passed} tone="success" />
        <StatCard
          label="Pages analysed"
          value={summary.analyzed}
          hint={summary.lastAnalyzedAt ? `Last run ${summary.lastAnalyzedAt.toLocaleString()}` : 'Not run yet'}
        />
      </div>

      <FilterBar searchPlaceholder="Search by page name or URL" definitions={definitions} presets={presets} />

      <Card>
        <AnalysisTable rows={list.rows} countryNames={countryNames} showCountry={scope.multiCountry} filtered={filtered} />
        {list.rows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(list.total / PER_PAGE))}
            total={list.total}
            basePath="/admin/seo-intelligence"
            params={params}
          />
        ) : null}
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Scores update automatically when content is saved. Checks that compare pages with each other — duplicate titles,
        copy shared between city pages — are refreshed for the whole site by <strong>Recalculate all</strong>. Health bands:
        90–100 Excellent, 75–89 Good, 50–74 Needs improvement, 0–49 Poor. Nothing is hidden, changed or removed
        automatically.
      </p>
    </>
  );
}
