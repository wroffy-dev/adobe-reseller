'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { authorize, type SessionUser } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { getUserCountryIds } from '@/lib/country/access';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { URL_CONTENT_TYPES } from '@/lib/urls/paths';
import { prisma } from '@/lib/db/prisma';
import { actorOf } from '@/lib/urls/registry';
import { runBackfill, setResolverEnabled, type BackfillReport } from '@/lib/urls/backfill';
import {
  applyEdits,
  applyPatternChange,
  bulkEdits,
  deleteRedirect,
  dismissNotFound,
  exportCsv,
  getRoute,
  importCsv,
  listHistory,
  listRedirects,
  listRoutes,
  mapNotFound,
  newBatchId,
  previewEdits,
  previewPattern,
  restoreEdit,
  saveRedirect,
  setRedirectActive,
  healthReport,
  allRouteIds,
  UrlManagerError,
  type Allowed,
  type ApplyResult,
  type CsvRowReport,
  type Preview,
  type RouteEdit,
  type RouteFilters,
} from '@/lib/urls/manager';

/**
 * Server Actions for the Slug & URL Manager.
 *
 * Every action authorises `seo.manage` — the permission that already governs
 * SEO and redirects — and narrows its work to the markets the signed-in user
 * may work in, so a UAE-only editor can neither read nor move an Indian URL
 * through this screen. The same checks apply to bulk edits, imports,
 * patterns and redirects.
 */

const PERMISSION = 'seo.manage' as const;

async function scope(): Promise<{ user: SessionUser; allowed: Allowed }> {
  const user = await authorize(PERMISSION);
  if (user.role === 'super-admin') return { user, allowed: null };
  const assigned = await getUserCountryIds(user.id);
  return { user, allowed: assigned.length ? assigned : null };
}

/** URL changes only take effect through the registry resolver. */
async function requireResolver() {
  const settings = await prisma.urlSettings.findUnique({ where: { id: 'singleton' }, select: { resolverEnabled: true } });
  if (!settings?.resolverEnabled) {
    throw new UrlManagerError('Register current URLs and switch the URL registry on (Settings tab) before changing addresses.');
  }
}

function fail(error: unknown): ActionResult<never> {
  if (error instanceof UrlManagerError) return failure(error.message);
  return toActionError(error);
}

function revalidateAll() {
  revalidatePath('/admin/slug-manager');
  revalidatePath('/sitemap.xml');
  revalidatePath('/', 'layout');
}

const filtersSchema = z.object({
  q: z.string().max(200).optional(),
  type: z.enum([...URL_CONTENT_TYPES, '']).optional(),
  countryId: z.string().max(60).optional(),
  status: z.string().max(20).optional(),
  mode: z.enum(['PATTERN', 'CUSTOM', '']).optional(),
  conflicts: z.boolean().optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: z.number().int().min(5).max(100).optional(),
});

const editSchema = z.discriminatedUnion('action', [
  z.object({ routeId: z.string().min(1), action: z.literal('custom'), path: z.string().max(400) }),
  z.object({ routeId: z.string().min(1), action: z.literal('reset') }),
  z.object({ routeId: z.string().min(1), action: z.literal('slug'), slug: z.string().max(200) }),
]);

const applySchema = z.object({
  token: z.string().min(1).max(64),
  updateLinks: z.boolean().optional(),
  updateCanonicals: z.boolean().optional(),
  batchId: z.string().max(64).optional(),
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function fetchRoutes(input: unknown) {
  try {
    const { allowed } = await scope();
    return success(await listRoutes(filtersSchema.parse(input) as RouteFilters, allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function fetchRoute(routeId: string) {
  try {
    const { allowed } = await scope();
    return success(await getRoute(z.string().min(1).parse(routeId), allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function fetchRouteIds(input: unknown): Promise<ActionResult<string[]>> {
  try {
    const { allowed } = await scope();
    return success(await allRouteIds(filtersSchema.parse(input) as RouteFilters, allowed, 500));
  } catch (error) {
    return fail(error);
  }
}

export async function fetchHistory(input: unknown) {
  try {
    const { allowed } = await scope();
    const parsed = z.object({ page: z.number().int().min(1).optional(), q: z.string().max(200).optional(), routeId: z.string().optional() }).parse(input);
    return success(await listHistory(parsed, allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function fetchRedirects(input: unknown) {
  try {
    const { allowed } = await scope();
    const parsed = z.object({ page: z.number().int().min(1).optional(), q: z.string().max(200).optional(), origin: z.string().max(20).optional() }).parse(input);
    return success(await listRedirects(parsed, allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function fetchHealth() {
  try {
    const { allowed } = await scope();
    return success(await healthReport(allowed));
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Single and bulk edits
// ---------------------------------------------------------------------------

export async function previewRouteEdits(input: unknown): Promise<ActionResult<Preview>> {
  try {
    const { allowed } = await scope();
    const edits = z.array(editSchema).min(1).max(500).parse(input) as RouteEdit[];
    return success(await previewEdits(edits, allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function applyRouteEdits(editsInput: unknown, optionsInput: unknown): Promise<ActionResult<ApplyResult>> {
  try {
    const { user, allowed } = await scope();
    await requireResolver();
    const edits = z.array(editSchema).min(1).max(500).parse(editsInput) as RouteEdit[];
    const options = applySchema.parse(optionsInput);
    const result = await applyEdits(edits, { ...options, actor: actorOf(user), allowed, action: edits.length > 1 ? 'bulk' : edits[0]!.action === 'reset' ? 'reset' : 'renamed' });
    await recordAudit({
      actor: user,
      action: 'url.changed',
      entity: 'UrlRoute',
      entityId: edits.length === 1 ? edits[0]!.routeId : null,
      summary: `${result.moved} URL(s) changed, ${result.redirects} redirect(s) kept, ${result.linksUpdated} link(s) updated`,
      after: { batchId: result.batchId, changes: result.changes.slice(0, 50) },
    });
    revalidateAll();
    return success(result, result.moved ? `${result.moved} URL(s) updated.` : 'Nothing needed to change.');
  } catch (error) {
    return fail(error);
  }
}

const bulkSchema = z.object({
  routeIds: z.array(z.string().min(1)).min(1).max(500),
  operation: z.discriminatedUnion('op', [
    z.object({ op: z.literal('prefix'), from: z.string().max(200), to: z.string().max(200) }),
    z.object({ op: z.literal('reset') }),
  ]),
});

export async function previewBulk(input: unknown): Promise<ActionResult<Preview & { edits: RouteEdit[] }>> {
  try {
    const { allowed } = await scope();
    const { routeIds, operation } = bulkSchema.parse(input);
    const { edits, exclusions } = await bulkEdits(routeIds, operation, allowed);
    if (edits.length === 0) return failure(exclusions.length ? `Nothing to change: ${exclusions[0]!.message}` : 'Nothing to change.');
    const preview = await previewEdits(edits, allowed, exclusions);
    return success({ ...preview, edits });
  } catch (error) {
    return fail(error);
  }
}

export async function restoreHistoryPreview(changeId: string): Promise<ActionResult<Preview & { edits: RouteEdit[] }>> {
  try {
    const { allowed } = await scope();
    const edit = await restoreEdit(z.string().min(1).parse(changeId), allowed);
    const preview = await previewEdits([edit], allowed);
    return success({ ...preview, edits: [edit] });
  } catch (error) {
    return fail(error);
  }
}

export async function restoreHistoryApply(changeId: string, optionsInput: unknown): Promise<ActionResult<ApplyResult>> {
  try {
    const { user, allowed } = await scope();
    await requireResolver();
    // Ownership is re-checked here, not trusted from the preview.
    const edit = await restoreEdit(z.string().min(1).parse(changeId), allowed);
    const options = applySchema.parse(optionsInput);
    const result = await applyEdits([edit], { ...options, actor: actorOf(user), allowed, action: 'restored', note: `Restored from history ${changeId}` });
    await recordAudit({ actor: user, action: 'url.restored', entity: 'UrlRoute', entityId: edit.routeId, summary: `Restored URL from history`, after: { changes: result.changes } });
    revalidateAll();
    return success(result, 'Address restored.');
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export async function exportRoutesCsv(input: unknown): Promise<ActionResult<string>> {
  try {
    const { allowed } = await scope();
    return success(await exportCsv(filtersSchema.parse(input) as RouteFilters, allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function validateCsvImport(text: string): Promise<ActionResult<{ rows: CsvRowReport[]; edits: RouteEdit[] }>> {
  try {
    const { allowed } = await scope();
    const body = z.string().max(2_000_000).parse(text);
    return success(await importCsv(body, allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function startBatch(): Promise<ActionResult<string>> {
  try {
    await scope();
    return success(newBatchId());
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const patternSchema = z.object({
  type: z.enum(URL_CONTENT_TYPES),
  countryId: z.string().min(1).nullable(),
  pattern: z.string().max(200).nullable(),
});

export async function previewPatternChange(input: unknown): Promise<ActionResult<Preview>> {
  try {
    const { allowed } = await scope();
    return success(await previewPattern(patternSchema.parse(input), allowed));
  } catch (error) {
    return fail(error);
  }
}

export async function applyPatternChangeAction(input: unknown, optionsInput: unknown): Promise<ActionResult<ApplyResult>> {
  try {
    const { user, allowed } = await scope();
    await requireResolver();
    const change = patternSchema.parse(input);
    const options = applySchema.parse(optionsInput);
    const result = await applyPatternChange(change, { ...options, actor: actorOf(user), allowed });
    await recordAudit({
      actor: user,
      action: 'url.pattern',
      entity: 'UrlPattern',
      entityId: null,
      summary: `${change.type} pattern ${change.countryId ? `for ${change.countryId}` : 'global'} → ${change.pattern ?? 'inherited'}; ${result.moved} URL(s) moved`,
    });
    revalidateAll();
    return success(result, `Pattern saved. ${result.moved} URL(s) moved.`);
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

const redirectSchema = z.object({
  id: z.string().nullable().optional(),
  source: z.string().min(1).max(400),
  destination: z.string().min(1).max(1000),
  type: z.enum(['PERMANENT', 'TEMPORARY']),
  isActive: z.boolean(),
  note: z.string().max(500).nullable().optional(),
});

export async function saveRedirectAction(input: unknown) {
  try {
    const { user, allowed } = await scope();
    const parsed = redirectSchema.parse(input);
    const saved = await saveRedirect(parsed, actorOf(user), allowed);
    await recordAudit({ actor: user, action: parsed.id ? 'updated' : 'created', entity: 'Redirect', entityId: saved.id, summary: `${parsed.source} → ${saved.destination}` });
    revalidateAll();
    revalidatePath('/admin/redirects');
    return success(saved, saved.flattened ? `Saved. Its destination was itself redirected, so it now points straight at ${saved.destination}.` : 'Redirect saved.');
  } catch (error) {
    return fail(error);
  }
}

export async function toggleRedirectAction(id: string, isActive: boolean) {
  try {
    const { user, allowed } = await scope();
    await setRedirectActive(z.string().min(1).parse(id), z.boolean().parse(isActive), allowed);
    await recordAudit({ actor: user, action: isActive ? 'enabled' : 'disabled', entity: 'Redirect', entityId: id });
    revalidateAll();
    return success(undefined, isActive ? 'Redirect enabled.' : 'Redirect disabled.');
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRedirectAction(id: string) {
  try {
    const { user, allowed } = await scope();
    const row = await deleteRedirect(z.string().min(1).parse(id), allowed);
    await recordAudit({ actor: user, action: 'deleted', entity: 'Redirect', entityId: id, summary: `Removed ${row.source} → ${row.destination}` });
    revalidateAll();
    return success(undefined, 'Redirect deleted.');
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Health and activation
// ---------------------------------------------------------------------------

export async function mapNotFoundAction(logId: string, destination: string) {
  try {
    const { user, allowed } = await scope();
    const saved = await mapNotFound(z.string().min(1).parse(logId), z.string().min(1).max(1000).parse(destination), actorOf(user), allowed);
    await recordAudit({ actor: user, action: 'created', entity: 'Redirect', entityId: saved.id, summary: `Mapped a 404 to ${saved.destination}` });
    revalidateAll();
    return success(saved, `Mapped to ${saved.destination}.`);
  } catch (error) {
    return fail(error);
  }
}

export async function dismissNotFoundAction(logId: string) {
  try {
    await scope();
    await dismissNotFound(z.string().min(1).parse(logId));
    revalidatePath('/admin/slug-manager');
    return success(undefined, 'Dismissed.');
  } catch (error) {
    return fail(error);
  }
}

/** Registers every current URL. Idempotent; changes no public address. */
export async function runBackfillAction(): Promise<ActionResult<BackfillReport>> {
  try {
    const { user, allowed } = await scope();
    if (allowed) return failure('Registering every URL touches every market; only staff with access to all markets can run it.');
    const report = await runBackfill(actorOf(user));
    await recordAudit({ actor: user, action: 'url.backfill', entity: 'UrlSettings', entityId: 'singleton', summary: `Registered ${report.registered}, ${report.collisions.length} collision(s)` });
    revalidatePath('/admin/slug-manager');
    return success(report, `Registered ${report.registered} new URL(s); ${report.collisions.length} collision(s) to review.`);
  } catch (error) {
    return fail(error);
  }
}

export async function setResolverAction(enabled: boolean): Promise<ActionResult> {
  try {
    const { user, allowed } = await scope();
    if (allowed) return failure('Only staff with access to all markets can switch the URL resolver.');
    await setResolverEnabled(z.boolean().parse(enabled));
    await recordAudit({ actor: user, action: enabled ? 'url.resolver.on' : 'url.resolver.off', entity: 'UrlSettings', entityId: 'singleton' });
    revalidateAll();
    return success(undefined, enabled ? 'The URL registry now resolves the public site.' : 'The public site is back on its built-in URLs.');
  } catch (error) {
    return fail(error);
  }
}
