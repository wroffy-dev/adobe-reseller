'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { authorize, authorizeAny, type SessionUser } from '@/lib/auth/guards';
import type { PermissionKey } from '@/lib/auth/permissions';
import { userCanAccessCountry } from '@/lib/country/access';
import { recordAudit } from '@/lib/services/audit';
import { analyzeAll, analyzeTargets, type Target } from '@/lib/seo-intelligence/collect';
import { analysesForEntity, toDetail, type AnalysisDetail } from '@/lib/services/seo-intelligence';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import type { EntityType } from '@/lib/seo-intelligence/types';

/**
 * Recalculating SEO Intelligence scores.
 *
 * The dashboard needs `seo.manage`. An editor's score card may also be
 * refreshed by whoever can edit that content, so the scores sit where the
 * work is done without handing out SEO settings.
 */

const EDIT_PERMISSION: Record<Target['kind'], PermissionKey[]> = {
  page: ['seo.manage', 'pages.edit', 'cities.manage'],
  product: ['seo.manage', 'products.edit'],
  post: ['seo.manage', 'blog.edit'],
};

const TYPES_OF: Record<Target['kind'], EntityType[]> = {
  page: ['PAGE', 'CITY_PAGE', 'CITY_PRODUCT_PAGE'],
  product: ['PRODUCT'],
  post: ['BLOG_POST'],
};

async function visible(user: SessionUser, rows: AnalysisDetail[]) {
  const out: AnalysisDetail[] = [];
  for (const row of rows) if (await userCanAccessCountry(user, row.countryId)) out.push(row);
  return out;
}

/** Analyses the whole site now. Stored results are replaced. */
export async function recalculateAllSeo(): Promise<ActionResult<{ analyzed: number }>> {
  try {
    const user = await authorize('seo.manage');
    const started = Date.now();
    const result = await analyzeAll();
    await recordAudit({
      actor: user,
      action: 'recalculated',
      entity: 'SeoIntelligence',
      summary: `Recalculated SEO Intelligence for ${result.analyzed} item(s) in ${Math.round((Date.now() - started) / 1000)}s`,
    });
    revalidatePath('/admin/seo-intelligence');
    revalidatePath('/admin/cities');
    return success({ analyzed: result.analyzed }, `${result.analyzed} item(s) analysed.`);
  } catch (error) {
    return toActionError(error);
  }
}

/** Re-analyses one page, product or article and returns its results. */
export async function recalculateSeoEntity(target: Target): Promise<ActionResult<AnalysisDetail[]>> {
  try {
    if (!target || !(target.kind in EDIT_PERMISSION) || typeof target.id !== 'string') return failure('Nothing to analyse.');
    const user = await authorizeAny(EDIT_PERMISSION[target.kind]);
    await analyzeTargets([{ kind: target.kind, id: target.id }]);
    const rows = await visible(user, await analysesForEntity(target.id, TYPES_OF[target.kind]));
    revalidatePath('/admin/seo-intelligence');
    return success(rows, 'Analysis updated.');
  } catch (error) {
    return toActionError(error);
  }
}

/** One stored result with its findings, for the detail panel. */
export async function getSeoAnalysis(id: string): Promise<ActionResult<AnalysisDetail>> {
  try {
    const user = await authorizeAny(['seo.manage', 'pages.view', 'products.view', 'blog.view', 'cities.view']);
    const row = await prisma.seoAnalysis.findUnique({ where: { id } });
    if (!row) return failure('That analysis is no longer available. Recalculate to refresh it.');
    if (!(await userCanAccessCountry(user, row.countryId))) return failure('You do not have access to that country.');
    return success(toDetail(row));
  } catch (error) {
    return toActionError(error);
  }
}
