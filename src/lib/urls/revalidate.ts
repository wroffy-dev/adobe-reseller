import 'server-only';
import { revalidatePath } from 'next/cache';

/**
 * Drops cached renders for addresses that just moved — the old one, so it
 * starts answering with its redirect, and the new one, so it renders — plus
 * the sitemaps that list them. Safe outside a request (scripts, tests): the
 * framework call is skipped there.
 */
export function revalidateUrlChanges(changes: Array<{ oldPath: string | null; newPath: string | null }>): void {
  if (changes.length === 0) return;
  try {
    for (const change of changes.slice(0, 500)) {
      if (change.oldPath) revalidatePath(change.oldPath);
      if (change.newPath) revalidatePath(change.newPath);
    }
    revalidatePath('/sitemap.xml');
    revalidatePath('/sitemaps/[name]', 'page');
  } catch {
    // No request scope — nothing is cached to invalidate.
  }
}
