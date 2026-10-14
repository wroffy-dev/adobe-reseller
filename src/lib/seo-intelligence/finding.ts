import type { Category, Finding, Severity } from './types';

/**
 * Builds a finding. `points` is clamped to 0…maxPoints; a check passes when
 * it earned everything it could.
 */
export function finding(input: {
  id: string;
  category: Category;
  severity: Severity;
  points: number;
  maxPoints: number;
  title: string;
  description: string;
  recommendation?: string;
}): Finding {
  const points = Math.max(0, Math.min(input.maxPoints, Math.round(input.points * 10) / 10));
  const passed = points >= input.maxPoints;
  return {
    id: input.id,
    category: input.category,
    severity: input.severity,
    passed,
    points,
    maxPoints: input.maxPoints,
    title: input.title,
    description: input.description,
    recommendation: passed ? '' : (input.recommendation ?? ''),
  };
}

/** Points earned as a share of points available, 0–100. */
export function scoreOf(findings: readonly Finding[]): number {
  const max = findings.reduce((sum, f) => sum + f.maxPoints, 0);
  if (max === 0) return 100;
  const earned = findings.reduce((sum, f) => sum + f.points, 0);
  return Math.round((earned / max) * 100);
}

export function quote(value: string): string {
  return `“${value}”`;
}
