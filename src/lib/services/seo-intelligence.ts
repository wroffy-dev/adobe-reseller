import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ENTITY_TYPES, HEALTH_RANGES, type EntityType, type Finding, type Health } from '@/lib/seo-intelligence/types';

/**
 * Reading stored SEO Intelligence results. Nothing here analyses anything:
 * the dashboard is a query over `SeoAnalysis`, so it stays fast however large
 * the site is.
 */

export type AnalysisFilters = {
  countryIds: string[];
  countryId?: string | null;
  type?: string | null;
  cityId?: string | null;
  health?: string | null;
  status?: string | null;
  q?: string | null;
};

function whereOf(filters: AnalysisFilters): Prisma.SeoAnalysisWhereInput {
  const where: Prisma.SeoAnalysisWhereInput = {
    countryId: filters.countryId && filters.countryIds.includes(filters.countryId) ? filters.countryId : { in: filters.countryIds },
  };
  if (filters.type && (ENTITY_TYPES as readonly string[]).includes(filters.type)) where.entityType = filters.type;
  if (filters.cityId) where.cityId = filters.cityId;
  if (filters.health && filters.health in HEALTH_RANGES) {
    const [min, max] = HEALTH_RANGES[filters.health as Health];
    where.overallScore = { gte: min, lte: max };
  }
  if (filters.status) where.status = filters.status;
  if (filters.q?.trim()) {
    where.OR = [
      { label: { contains: filters.q.trim(), mode: 'insensitive' } },
      { path: { contains: filters.q.trim(), mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function analysisSummary(filters: AnalysisFilters) {
  const where = whereOf(filters);
  const [agg, lastRun] = await Promise.all([
    prisma.seoAnalysis.aggregate({
      where,
      _avg: { seoScore: true, aeoScore: true, geoScore: true, overallScore: true },
      _sum: { criticalCount: true, warningCount: true, passedCount: true },
      _count: { _all: true },
    }),
    prisma.seoAnalysis.findFirst({ where: { countryId: { in: filters.countryIds } }, orderBy: { analyzedAt: 'desc' }, select: { analyzedAt: true } }),
  ]);
  return {
    analyzed: agg._count._all,
    overall: Math.round(agg._avg.overallScore ?? 0),
    seo: Math.round(agg._avg.seoScore ?? 0),
    aeo: Math.round(agg._avg.aeoScore ?? 0),
    geo: Math.round(agg._avg.geoScore ?? 0),
    critical: agg._sum.criticalCount ?? 0,
    warnings: agg._sum.warningCount ?? 0,
    passed: agg._sum.passedCount ?? 0,
    lastAnalyzedAt: lastRun?.analyzedAt ?? null,
  };
}

export type AnalysisRow = {
  id: string;
  entityType: EntityType;
  entityId: string;
  countryId: string;
  label: string;
  path: string;
  status: string;
  seo: number;
  aeo: number;
  geo: number;
  local: number | null;
  overall: number;
  critical: number;
  warnings: number;
  keywords: string[];
  analyzedAt: string;
};

export async function listAnalyses(filters: AnalysisFilters, page: number, perPage: number, sort: string | null) {
  const where = whereOf(filters);
  const orderBy: Prisma.SeoAnalysisOrderByWithRelationInput[] =
    sort === 'best'
      ? [{ overallScore: 'desc' }]
      : sort === 'label'
        ? [{ label: 'asc' }]
        : sort === 'critical'
          ? [{ criticalCount: 'desc' }, { overallScore: 'asc' }]
          : [{ overallScore: 'asc' }, { criticalCount: 'desc' }];
  const [rows, total] = await Promise.all([
    prisma.seoAnalysis.findMany({
      where,
      orderBy: [...orderBy, { id: 'asc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        countryId: true,
        label: true,
        path: true,
        status: true,
        seoScore: true,
        aeoScore: true,
        geoScore: true,
        localScore: true,
        overallScore: true,
        criticalCount: true,
        warningCount: true,
        keywords: true,
        analyzedAt: true,
      },
    }),
    prisma.seoAnalysis.count({ where }),
  ]);
  return {
    total,
    rows: rows.map(
      (r): AnalysisRow => ({
        id: r.id,
        entityType: r.entityType as EntityType,
        entityId: r.entityId,
        countryId: r.countryId,
        label: r.label,
        path: r.path,
        status: r.status,
        seo: r.seoScore,
        aeo: r.aeoScore,
        geo: r.geoScore,
        local: r.localScore,
        overall: r.overallScore,
        critical: r.criticalCount,
        warnings: r.warningCount,
        keywords: r.keywords,
        analyzedAt: r.analyzedAt.toISOString(),
      }),
    ),
  };
}

export type AnalysisDetail = AnalysisRow & { findings: Finding[]; passed: number };

export function toDetail(r: Prisma.SeoAnalysisGetPayload<object>): AnalysisDetail {
  return {
    id: r.id,
    entityType: r.entityType as EntityType,
    entityId: r.entityId,
    countryId: r.countryId,
    label: r.label,
    path: r.path,
    status: r.status,
    seo: r.seoScore,
    aeo: r.aeoScore,
    geo: r.geoScore,
    local: r.localScore,
    overall: r.overallScore,
    critical: r.criticalCount,
    warnings: r.warningCount,
    passed: r.passedCount,
    keywords: r.keywords,
    analyzedAt: r.analyzedAt.toISOString(),
    findings: (Array.isArray(r.findings) ? r.findings : []) as unknown as Finding[],
  };
}

/** Stored results for one piece of content — one per market it lives in. */
export async function analysesForEntity(entityId: string, types: EntityType[]): Promise<AnalysisDetail[]> {
  const rows = await prisma.seoAnalysis.findMany({
    where: { entityId, entityType: { in: types } },
    orderBy: { countryId: 'asc' },
  });
  return rows.map(toDetail);
}
