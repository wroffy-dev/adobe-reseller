import 'server-only';
import { after } from 'next/server';
import { analyzeTargets, type Target } from './collect';

/**
 * Re-analyses content after the response that changed it has been sent, so
 * saving a page never waits on its SEO analysis and a failed analysis never
 * fails the save. The next save, the editor's score card or "Recalculate"
 * catches anything missed.
 */
export function queueSeoAnalysis(targets: Target[]): void {
  if (targets.length === 0 || process.env.NODE_ENV === 'test') return;
  const run = () =>
    analyzeTargets(targets).catch((error) => {
      console.error('[seo-intelligence] analysis failed', error);
    });
  try {
    after(run);
  } catch {
    // Outside a request (a script, a job): run it now, still detached.
    void run();
  }
}
