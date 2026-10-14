import type { AnalysisInput, AnalysisResult, Finding } from './types';
import { scoreOf } from './finding';
import { seoFindings } from './seo-score';
import { aeoFindings } from './aeo-score';
import { geoFindings } from './geo-score';
import { localFindings } from './local-seo';

/**
 * Runs every rule over one piece of content and combines the scores.
 *
 *   overall = 50% SEO + 25% AEO + 25% GEO
 *
 * For a city page the SEO score itself is 80% general SEO and 20% local SEO,
 * so a city page is judged on being local without its other checks being
 * diluted. Pure: the same input always produces the same result.
 */

export const WEIGHTS = { seo: 0.5, aeo: 0.25, geo: 0.25 } as const;
export const LOCAL_SHARE = 0.2;

/** Bump when a rule changes, so stored results are recalculated. */
export const RULES_VERSION = 1;

export function combine(seo: number, aeo: number, geo: number): number {
  return Math.round(seo * WEIGHTS.seo + aeo * WEIGHTS.aeo + geo * WEIGHTS.geo);
}

export function countFindings(findings: readonly Finding[]) {
  return {
    critical: findings.filter((f) => !f.passed && f.severity === 'critical').length,
    warning: findings.filter((f) => !f.passed && f.severity === 'warning').length,
    passed: findings.filter((f) => f.passed).length,
  };
}

export function analyze(input: AnalysisInput): AnalysisResult {
  const seoList = seoFindings(input);
  const aeoList = aeoFindings(input);
  const geoList = geoFindings(input);
  const localList = localFindings(input);

  const base = scoreOf(seoList);
  const local = localList.length ? scoreOf(localList) : null;
  const seo = local === null ? base : Math.round(base * (1 - LOCAL_SHARE) + local * LOCAL_SHARE);
  const aeo = scoreOf(aeoList);
  const geo = scoreOf(geoList);
  const findings = [...seoList, ...localList, ...aeoList, ...geoList];

  return {
    scores: { seo, aeo, geo, local, overall: combine(seo, aeo, geo) },
    findings,
    counts: countFindings(findings),
  };
}
