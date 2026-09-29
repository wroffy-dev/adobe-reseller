import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Prisma, RedirectType, UrlContentType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { pageSlug, slugify } from '@/lib/utils/slug';
import { parseCsv, toCsv } from '@/lib/utils/csv';
import { isReservedSegment } from '@/lib/country/routing';
import {
  applyPattern,
  effectivePattern,
  followRedirects,
  isExternalDestination,
  joinMarketPath,
  normalizeInputPath,
  pathKey,
  ROOT_ONLY_TYPES,
  stripMarketPrefix,
  URL_CONTENT_LABELS,
  URL_CONTENT_TYPES,
  validatePattern,
} from './paths';
import {
  applyPlan,
  invalidateLinkIndex,
  KIND_OF_TYPE,
  loadContext,
  planRoutes,
  withRegistryLock,
  type Actor,
  type ContentKind,
  type PatternRow,
  type PlanItem,
  type RegistryContext,
  type Scope,
} from './registry';
import {
  findCanonicalOverrides,
  findReferences,
  updateCanonicalOverrides,
  updateReferences,
  type CanonicalHit,
  type LinkChange,
  type ReferenceHit,
} from './references';
import { revalidateUrlChanges } from './revalidate';

/**
 * The Slug & URL Manager's operations.
 *
 * Every change is two calls: a preview, which plans and reports without
 * writing, and an apply, which re-plans inside the registry lock and refuses
 * when the plan no longer matches the preview's token — so a stale screen can
 * never overwrite a newer edit. Authorisation and market access are checked
 * by the Server Actions that call these; `allowed` narrows every read and
 * write to the markets the signed-in user may work in (null = all).
 */

export type Allowed = string[] | null;

export class UrlManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlManagerError';
  }
}

const MAX_BATCH = 500;

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type RouteFilters = {
  q?: string;
  type?: UrlContentType | '';
  countryId?: string;
  status?: string;
  mode?: 'PATTERN' | 'CUSTOM' | '';
  conflicts?: boolean;
  page?: number;
  pageSize?: number;
};

export type RouteListRow = {
  id: string;
  type: UrlContentType;
  typeLabel: string;
  contentId: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  marketPrefix: string;
  label: string;
  path: string;
  status: string;
  isPublic: boolean;
  isHomepage: boolean;
  mode: 'PATTERN' | 'CUSTOM';
  customPath: string | null;
  slug: string;
  pattern: string;
  patternSource: 'country' | 'global' | 'default';
  inheritedPath: string;
  conflictPath: string | null;
  conflictReason: string | null;
  version: string;
  editHref: string | null;
};

function routeWhere(filters: RouteFilters, allowed: Allowed): Prisma.UrlRouteWhereInput {
  const where: Prisma.UrlRouteWhereInput = {};
  const and: Prisma.UrlRouteWhereInput[] = [];
  if (allowed) and.push({ countryId: { in: allowed } });
  if (filters.countryId) and.push({ countryId: filters.countryId });
  if (filters.type) and.push({ contentType: filters.type });
  if (filters.status === 'PUBLIC') and.push({ isPublic: true });
  else if (filters.status === 'NOT_PUBLIC') and.push({ isPublic: false });
  else if (filters.status) and.push({ contentStatus: filters.status });
  if (filters.mode) and.push({ mode: filters.mode });
  if (filters.conflicts) and.push({ conflictPath: { not: null } });
  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { label: { contains: q, mode: 'insensitive' } },
        { path: { contains: q.toLowerCase() } },
        { contentSlug: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

export function adminHrefFor(type: UrlContentType, contentId: string): string | null {
  switch (type) {
    case 'PRODUCT':
      return `/admin/products/${contentId}`;
    case 'PAGE':
    case 'CATEGORY_PAGE':
    case 'BRAND_PAGE':
      return `/admin/pages/${contentId}`;
    case 'BLOG_POST':
      return `/admin/blog/${contentId}`;
    case 'BLOG_CATEGORY':
      return '/admin/blog/categories';
    case 'BLOG_TAG':
      return '/admin/blog/tags';
    default:
      return null;
  }
}

function toListRow(ctx: RegistryContext, row: Prisma.UrlRouteGetPayload<object>): RouteListRow {
  const market = ctx.markets.find((m) => m.id === row.countryId) ?? ctx.defaultMarket;
  const pattern = effectivePattern(row.contentType, ROOT_ONLY_TYPES.has(row.contentType) ? null : row.countryId, ctx.patterns);
  const inheritedRelative = row.isHomepage ? '/' : applyPattern(pattern.pattern, row.contentSlug);
  return {
    id: row.id,
    type: row.contentType,
    typeLabel: URL_CONTENT_LABELS[row.contentType],
    contentId: row.contentId,
    countryId: row.countryId,
    countryName: market.name,
    countryCode: countryCodeOf(ctx, row.countryId),
    marketPrefix: market.slug,
    label: row.label,
    path: row.path,
    status: row.contentStatus,
    isPublic: row.isPublic,
    isHomepage: row.isHomepage,
    mode: row.mode,
    customPath: row.customPath,
    slug: row.contentSlug,
    pattern: pattern.pattern,
    patternSource: pattern.source,
    inheritedPath: joinMarketPath(market.slug, inheritedRelative),
    conflictPath: row.conflictPath,
    conflictReason: row.conflictReason,
    version: `${row.id}:${row.updatedAt.getTime()}`,
    editHref: adminHrefFor(row.contentType, row.contentId),
  };
}

const codes = new Map<string, string>();
function countryCodeOf(ctx: RegistryContext, countryId: string): string {
  return codes.get(countryId) ?? ctx.markets.find((m) => m.id === countryId)?.slug.toUpperCase() ?? '';
}

async function loadCodes() {
  const rows = await prisma.country.findMany({ select: { id: true, code: true } });
  for (const row of rows) codes.set(row.id, row.code);
}

/** One page of routes. One query for the rows, one for the count. */
export async function listRoutes(filters: RouteFilters, allowed: Allowed) {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 5), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const where = routeWhere(filters, allowed);
  const [ctx, total, rows] = await Promise.all([
    loadContext(),
    prisma.urlRoute.count({ where }),
    prisma.urlRoute.findMany({
      where,
      orderBy: [{ path: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    loadCodes(),
  ]);
  return { rows: rows.map((row) => toListRow(ctx, row)), total, page, pageSize };
}

export async function getRoute(routeId: string, allowed: Allowed): Promise<RouteListRow> {
  const [ctx, row] = await Promise.all([loadContext(), prisma.urlRoute.findUnique({ where: { id: routeId } }), loadCodes()]);
  if (!row || (allowed && !allowed.includes(row.countryId))) throw new UrlManagerError('That URL no longer exists.');
  return toListRow(ctx, row);
}

/** Every route matching the filters, for CSV export and bulk selection. Bounded. */
export async function allRouteIds(filters: RouteFilters, allowed: Allowed, limit = 5_000): Promise<string[]> {
  const rows = await prisma.urlRoute.findMany({ where: routeWhere(filters, allowed), select: { id: true }, orderBy: { path: 'asc' }, take: limit });
  return rows.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Edits: preview and apply
// ---------------------------------------------------------------------------

export type RouteEdit =
  | { routeId: string; action: 'custom'; path: string }
  | { routeId: string; action: 'reset' }
  | { routeId: string; action: 'slug'; slug: string };

export type EditError = { routeId: string | null; label: string; message: string };

export type PreviewItem = {
  routeId: string | null;
  type: UrlContentType;
  typeLabel: string;
  label: string;
  countryId: string;
  status: PlanItem['status'];
  oldPath: string | null;
  newPath: string | null;
  reason: string | null;
  isPublic: boolean;
  redirect: boolean;
};

export type Preview = {
  token: string;
  items: PreviewItem[];
  errors: EditError[];
  exclusions: EditError[];
  references: ReferenceHit[];
  canonicals: CanonicalHit[];
  summary: { changes: number; conflicts: number; redirects: number; unchanged: number };
};

type Prepared = {
  scope: Scope;
  routes: Map<string, { mode: 'PATTERN' | 'CUSTOM'; customPath: string | null }>;
  slugs: Map<string, string>;
  errors: EditError[];
  patterns?: PatternRow[];
};

function normaliseSlug(kind: ContentKind, raw: string): string {
  return kind === 'page' ? pageSlug(raw) : slugify(raw);
}

async function prepareEdits(db: Prisma.TransactionClient | typeof prisma, ctx: RegistryContext, edits: RouteEdit[], allowed: Allowed): Promise<Prepared> {
  if (edits.length > MAX_BATCH) throw new UrlManagerError(`At most ${MAX_BATCH} URLs per batch — larger jobs run in batches.`);
  const ids = [...new Set(edits.map((e) => e.routeId))];
  const rows = await db.urlRoute.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const errors: EditError[] = [];
  const routes = new Map<string, { mode: 'PATTERN' | 'CUSTOM'; customPath: string | null }>();
  const slugs = new Map<string, string>();
  const contents = new Map<string, { kind: ContentKind; id: string }>();

  for (const edit of edits) {
    const row = byId.get(edit.routeId);
    if (!row) {
      errors.push({ routeId: edit.routeId, label: edit.routeId, message: 'That URL no longer exists.' });
      continue;
    }
    if (allowed && !allowed.includes(row.countryId)) {
      errors.push({ routeId: row.id, label: row.label, message: 'You do not have access to this market.' });
      continue;
    }
    const kind = KIND_OF_TYPE[row.contentType];
    contents.set(`${kind}:${row.contentId}`, { kind, id: row.contentId });
    if (row.isHomepage) {
      errors.push({ routeId: row.id, label: row.label, message: 'A home page always lives at its market’s root.' });
      continue;
    }

    if (edit.action === 'reset') {
      routes.set(row.id, { mode: 'PATTERN', customPath: null });
      continue;
    }

    if (edit.action === 'slug') {
      if (row.contentType === 'CATEGORY_PAGE' || row.contentType === 'BRAND_PAGE') {
        errors.push({ routeId: row.id, label: row.label, message: 'A category or brand page takes its slug from the category or brand. Give it a custom path instead.' });
        continue;
      }
      const slug = normaliseSlug(kind, edit.slug);
      if (!slug) {
        errors.push({ routeId: row.id, label: row.label, message: 'Enter a slug.' });
        continue;
      }
      slugs.set(`${kind}:${row.contentId}`, slug);
      continue;
    }

    const normalised = normalizeInputPath(edit.path);
    if (!normalised.ok) {
      errors.push({ routeId: row.id, label: row.label, message: normalised.error });
      continue;
    }
    const market = ctx.markets.find((m) => m.id === row.countryId) ?? ctx.defaultMarket;
    // An admin may paste the full path with the market prefix; accept both.
    const relative = stripMarketPrefix(market.slug, normalised.path);
    if (relative === '/') {
      errors.push({ routeId: row.id, label: row.label, message: 'That is the home page address.' });
      continue;
    }
    const pattern = effectivePattern(row.contentType, ROOT_ONLY_TYPES.has(row.contentType) ? null : row.countryId, ctx.patterns);
    const inherited = applyPattern(pattern.pattern, row.contentSlug);
    routes.set(
      row.id,
      pathKey(relative) === pathKey(inherited) ? { mode: 'PATTERN', customPath: null } : { mode: 'CUSTOM', customPath: relative },
    );
  }

  return { scope: { contents: [...contents.values()] }, routes, slugs, errors };
}

function describe(plan: { items: PlanItem[] }, focus: Set<string> | null): PreviewItem[] {
  return plan.items
    .filter((i) => i.status !== 'unchanged' || (i.routeId && focus?.has(i.routeId)))
    .map((i) => ({
      routeId: i.routeId,
      type: i.type,
      typeLabel: URL_CONTENT_LABELS[i.type],
      label: i.label,
      countryId: i.countryId,
      status: i.status,
      oldPath: i.oldPath,
      newPath: i.newPath,
      reason: i.reason ?? null,
      isPublic: i.isPublic || i.wasPublic,
      redirect: i.status === 'move' && (i.isPublic || i.wasPublic),
    }));
}

function linkChanges(ctx: RegistryContext, items: PlanItem[]): LinkChange[] {
  return items
    .filter((i) => i.status === 'move' && i.oldPath && i.newPath)
    .map((i) => ({
      oldPath: i.oldPath!,
      newPath: i.newPath!,
      marketPrefix: (ctx.markets.find((m) => m.id === i.countryId) ?? ctx.defaultMarket).slug,
      countryId: i.countryId,
    }));
}

async function buildPreview(ctx: RegistryContext, prepared: Prepared, exclusions: EditError[] = []): Promise<Preview> {
  const plan = await prisma.$transaction((tx) =>
    planRoutes(tx, ctx, prepared.scope, { routes: prepared.routes, slugs: prepared.slugs, patterns: prepared.patterns }),
  );
  const focus = new Set(prepared.routes.keys());
  const items = describe(plan, focus);
  const changes = linkChanges(ctx, plan.items);
  const [references, canonicals] = await Promise.all([
    findReferences(changes),
    findCanonicalOverrides(changes.map((c) => c.oldPath)),
  ]);
  return {
    token: plan.token,
    items,
    errors: prepared.errors,
    exclusions,
    references,
    canonicals,
    summary: {
      changes: plan.items.filter((i) => i.status === 'move' || i.status === 'create').length,
      conflicts: plan.items.filter((i) => i.status === 'conflict').length,
      redirects: items.filter((i) => i.redirect).length,
      unchanged: plan.items.filter((i) => i.status === 'unchanged').length,
    },
  };
}

export async function previewEdits(edits: RouteEdit[], allowed: Allowed, exclusions: EditError[] = []): Promise<Preview> {
  const ctx = await loadContext();
  const prepared = await prepareEdits(prisma, ctx, edits, allowed);
  return buildPreview(ctx, prepared, exclusions);
}

export type ApplyInput = {
  token: string;
  updateLinks?: boolean;
  updateCanonicals?: boolean;
  actor: Actor;
  allowed: Allowed;
  action?: string;
  note?: string;
  batchId?: string;
  /** Refuse if anything in the plan conflicts, not only the edited routes. */
  strict?: boolean;
};

export type ApplyResult = {
  batchId: string;
  moved: number;
  created: number;
  redirects: number;
  linksUpdated: number;
  canonicalsUpdated: number;
  conflicts: number;
  changes: Array<{ label: string; oldPath: string | null; newPath: string | null }>;
};

async function applyPrepared(
  build: (tx: Prisma.TransactionClient, ctx: RegistryContext) => Promise<Prepared>,
  input: ApplyInput,
  afterPlan?: (tx: Prisma.TransactionClient, ctx: RegistryContext) => Promise<void>,
): Promise<ApplyResult> {
  const result = await withRegistryLock(async (tx) => {
    const ctx = await loadContext(tx);
    const prepared = await build(tx, ctx);
    if (prepared.errors.length) throw new UrlManagerError(prepared.errors.map((e) => `${e.label}: ${e.message}`).join(' '));
    if (afterPlan) await afterPlan(tx, ctx);
    const plan = await planRoutes(tx, ctx, prepared.scope, { routes: prepared.routes, slugs: prepared.slugs, patterns: prepared.patterns });
    if (plan.token !== input.token) {
      throw new UrlManagerError('These URLs changed since the preview. Preview again before applying.');
    }
    const conflicts = plan.items.filter((i) => i.status === 'conflict');
    const focused = input.strict ? conflicts : conflicts.filter((i) => (i.routeId && prepared.routes.has(i.routeId)) || prepared.slugs.has(`${i.kind}:${i.contentId}`));
    if (focused.length) {
      throw new UrlManagerError(`Not applied — ${focused.length} conflict(s): ${focused.map((i) => `${i.newPath} (${i.reason})`).join('; ')}`);
    }
    const report = await applyPlan(tx, ctx, plan, {
      actor: input.actor,
      action: input.action ?? 'renamed',
      batchId: input.batchId,
      note: input.note,
      recordCreates: true,
      writeSlugs: prepared.slugs,
      writeRoutes: prepared.routes,
    });
    const changes = linkChanges(ctx, plan.items);
    const linksUpdated = input.updateLinks ? await updateReferences(tx, changes) : 0;
    const canonicalsUpdated = input.updateCanonicals ? await updateCanonicalOverrides(tx, changes) : 0;
    return {
      batchId: report.batchId,
      moved: report.moved,
      created: report.created,
      redirects: report.redirectsCreated,
      linksUpdated,
      canonicalsUpdated,
      conflicts: conflicts.length,
      changes: report.changes.map((c) => ({ label: c.label, oldPath: c.oldPath, newPath: c.newPath })),
    };
  });
  invalidateLinkIndex();
  revalidateUrlChanges(result.changes);
  return result;
}

export async function applyEdits(edits: RouteEdit[], input: ApplyInput): Promise<ApplyResult> {
  return applyPrepared((tx, ctx) => prepareEdits(tx, ctx, edits, input.allowed), input);
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

export type PatternChange = { type: UrlContentType; countryId: string | null; pattern: string | null };

function patternScope(change: PatternChange): Scope {
  return change.countryId ? { types: [change.type], countryIds: [change.countryId] } : { types: [change.type] };
}

function validatePatternChange(ctx: RegistryContext, change: PatternChange, allowed: Allowed): { pattern: string | null } {
  if (!URL_CONTENT_TYPES.includes(change.type)) throw new UrlManagerError('Unknown content type.');
  if (change.countryId) {
    if (ROOT_ONLY_TYPES.has(change.type)) throw new UrlManagerError('The blog lives at the site root only, so it has a single global pattern.');
    if (!ctx.markets.some((m) => m.id === change.countryId)) throw new UrlManagerError('Unknown market.');
    if (allowed && !allowed.includes(change.countryId)) throw new UrlManagerError('You do not have access to this market.');
  } else if (allowed) {
    throw new UrlManagerError('Global patterns affect every market; only staff with access to all markets can change them.');
  }
  if (change.pattern === null) return { pattern: null };
  const valid = validatePattern(change.pattern);
  if (!valid.ok) throw new UrlManagerError(valid.error);
  const first = valid.pattern.split('/')[1];
  if (first && first !== '{slug}' && ctx.prefixes.includes(first)) {
    throw new UrlManagerError(`“/${first}” is a market prefix and cannot start a pattern.`);
  }
  if (first && isReservedSegment(first)) throw new UrlManagerError(`“/${first}” is a system route.`);
  return { pattern: valid.pattern };
}

function patternsWith(ctx: RegistryContext, change: PatternChange, pattern: string | null): PatternRow[] {
  const rest = ctx.patterns.filter((p) => !(p.contentType === change.type && p.countryId === change.countryId));
  return pattern ? [...rest, { contentType: change.type, countryId: change.countryId, pattern }] : rest;
}

export async function previewPattern(change: PatternChange, allowed: Allowed): Promise<Preview> {
  const ctx = await loadContext();
  const { pattern } = validatePatternChange(ctx, change, allowed);
  const scope = patternScope(change);
  const exclusions = (
    await prisma.urlRoute.findMany({
      where: { contentType: change.type, mode: 'CUSTOM', ...(change.countryId ? { countryId: change.countryId } : {}) },
      select: { id: true, label: true, path: true },
      take: 500,
    })
  ).map((r) => ({ routeId: r.id, label: r.label, message: `Keeps its custom path ${r.path}.` }));
  return buildPreview(ctx, { scope, routes: new Map(), slugs: new Map(), errors: [], patterns: patternsWith(ctx, change, pattern) }, exclusions);
}

export async function applyPatternChange(change: PatternChange, input: ApplyInput): Promise<ApplyResult> {
  let saved: string | null = null;
  return applyPrepared(
    async (_tx, ctx) => {
      const { pattern } = validatePatternChange(ctx, change, input.allowed);
      saved = pattern;
      return { scope: patternScope(change), routes: new Map(), slugs: new Map(), errors: [], patterns: patternsWith(ctx, change, pattern) };
    },
    { ...input, strict: true, action: 'pattern', note: `Pattern for ${URL_CONTENT_LABELS[change.type]} ${change.countryId ? 'in one market' : 'everywhere'} set to ${change.pattern ?? 'inherited'}` },
    async (tx) => {
      const scopeKey = change.countryId ?? '*';
      if (saved === null) {
        await tx.urlPattern.deleteMany({ where: { contentType: change.type, scopeKey } });
      } else {
        await tx.urlPattern.upsert({
          where: { contentType_scopeKey: { contentType: change.type, scopeKey } },
          create: { contentType: change.type, scopeKey, countryId: change.countryId, pattern: saved, updatedById: input.actor?.id ?? null },
          update: { pattern: saved, updatedById: input.actor?.id ?? null },
        });
      }
    },
  );
}

export async function listPatterns() {
  const [ctx, rows] = await Promise.all([loadContext(), prisma.urlPattern.findMany({ orderBy: { updatedAt: 'desc' } })]);
  const counts = await prisma.urlRoute.groupBy({ by: ['contentType', 'countryId', 'mode'], _count: { _all: true } });
  return {
    markets: ctx.markets,
    patterns: rows.map((r) => ({ id: r.id, contentType: r.contentType, countryId: r.countryId, pattern: r.pattern, updatedAt: r.updatedAt.toISOString() })),
    counts: counts.map((c) => ({ contentType: c.contentType, countryId: c.countryId, mode: c.mode, count: c._count._all })),
  };
}

// ---------------------------------------------------------------------------
// Bulk: prefix replacement, reset, CSV
// ---------------------------------------------------------------------------

export type BulkOperation =
  | { op: 'prefix'; from: string; to: string }
  | { op: 'reset' };

/** Turns a bulk operation over selected routes into edits, with the rows it skips. */
export async function bulkEdits(routeIds: string[], operation: BulkOperation, allowed: Allowed): Promise<{ edits: RouteEdit[]; exclusions: EditError[] }> {
  if (routeIds.length > MAX_BATCH) throw new UrlManagerError(`Select at most ${MAX_BATCH} URLs per batch.`);
  const ctx = await loadContext();
  const rows = await prisma.urlRoute.findMany({ where: { id: { in: routeIds } } });
  const edits: RouteEdit[] = [];
  const exclusions: EditError[] = [];

  let from = '/';
  let to = '/';
  if (operation.op === 'prefix') {
    const a = operation.from.trim() === '/' || operation.from.trim() === '' ? { ok: true as const, path: '/' } : normalizeInputPath(operation.from);
    const b = operation.to.trim() === '/' || operation.to.trim() === '' ? { ok: true as const, path: '/' } : normalizeInputPath(operation.to);
    if (!a.ok) throw new UrlManagerError(`Replace: ${a.error}`);
    if (!b.ok) throw new UrlManagerError(`With: ${b.error}`);
    from = a.path;
    to = b.path;
    if (from === to) throw new UrlManagerError('The prefix and its replacement are the same.');
  }

  for (const row of rows) {
    if (allowed && !allowed.includes(row.countryId)) {
      exclusions.push({ routeId: row.id, label: row.label, message: 'No access to this market.' });
      continue;
    }
    if (row.isHomepage) {
      exclusions.push({ routeId: row.id, label: row.label, message: 'Home pages stay at their market’s root.' });
      continue;
    }
    if (operation.op === 'reset') {
      if (row.mode === 'PATTERN') exclusions.push({ routeId: row.id, label: row.label, message: 'Already follows its pattern.' });
      else edits.push({ routeId: row.id, action: 'reset' });
      continue;
    }
    const market = ctx.markets.find((m) => m.id === row.countryId) ?? ctx.defaultMarket;
    const relative = stripMarketPrefix(market.slug, row.path);
    const matches = from === '/' ? true : relative === from || relative.startsWith(`${from}/`);
    if (!matches) {
      exclusions.push({ routeId: row.id, label: row.label, message: `Does not start with ${from}.` });
      continue;
    }
    const rest = from === '/' ? relative : relative.slice(from.length) || '/';
    const next = to === '/' ? rest : `${to}${rest === '/' ? '' : rest}`;
    if (next === '/' ) {
      exclusions.push({ routeId: row.id, label: row.label, message: 'Would become the home page address.' });
      continue;
    }
    edits.push({ routeId: row.id, action: 'custom', path: next });
  }
  return { edits, exclusions };
}

export const CSV_HEADER = ['route_id', 'content_type', 'content_id', 'country_code', 'name', 'status', 'mode', 'current_path', 'target_path'];

export async function exportCsv(filters: RouteFilters, allowed: Allowed): Promise<string> {
  const [ctx, rows] = await Promise.all([
    loadContext(),
    prisma.urlRoute.findMany({ where: routeWhere(filters, allowed), orderBy: { path: 'asc' }, take: 20_000 }),
    loadCodes(),
  ]);
  return toCsv([
    CSV_HEADER,
    ...rows.map((r) => [r.id, r.contentType, r.contentId, countryCodeOf(ctx, r.countryId), r.label, r.contentStatus, r.mode, r.path, '']),
  ]);
}

export type CsvRowReport = {
  line: number;
  routeId: string | null;
  label: string;
  current: string | null;
  target: string;
  status: 'change' | 'unchanged' | 'invalid' | 'duplicate' | 'not-found' | 'skipped';
  message: string | null;
};

/**
 * Validates every row of an import before anything is applied: the route
 * exists (by id, or by type + content id + country), the target is a valid
 * path in that route's market, no two rows target one address, and rows that
 * change nothing are reported as unchanged rather than silently skipped.
 */
export async function importCsv(text: string, allowed: Allowed): Promise<{ rows: CsvRowReport[]; edits: RouteEdit[] }> {
  const table = parseCsv(text, 5_001);
  if (table.length === 0) throw new UrlManagerError('The file is empty.');
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('target_path') < 0 || (col('route_id') < 0 && (col('content_id') < 0 || col('content_type') < 0))) {
    throw new UrlManagerError('The file needs a target_path column and either route_id or content_type + content_id + country_code.');
  }
  const body = table.slice(1);
  if (body.length > 5_000) throw new UrlManagerError('At most 5,000 rows per import.');

  const [ctx, countries] = await Promise.all([loadContext(), prisma.country.findMany({ select: { id: true, code: true } })]);
  const codeToId = new Map(countries.map((c) => [c.code.toUpperCase(), c.id]));
  const ids = body.map((r) => r[col('route_id')]?.trim()).filter((v): v is string => Boolean(v));
  const byId = new Map((await prisma.urlRoute.findMany({ where: { id: { in: ids } } })).map((r) => [r.id, r]));
  const byIdentity = new Map(
    (
      await prisma.urlRoute.findMany({
        where: { contentId: { in: body.map((r) => r[col('content_id')]?.trim() ?? '').filter(Boolean) } },
      })
    ).map((r) => [`${r.contentType}|${r.contentId}|${r.countryId}`, r]),
  );

  const rows: CsvRowReport[] = [];
  const edits: RouteEdit[] = [];
  const targets = new Map<string, number>();

  body.forEach((cells, index) => {
    const line = index + 2;
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '');
    const target = get('target_path');
    let route = get('route_id') ? byId.get(get('route_id')) : undefined;
    if (!route && get('content_type') && get('content_id')) {
      const countryId = codeToId.get(get('country_code').toUpperCase()) ?? ctx.defaultMarket.id;
      route = byIdentity.get(`${get('content_type').toUpperCase()}|${get('content_id')}|${countryId}`);
    }
    if (!route) {
      rows.push({ line, routeId: null, label: get('name') || '—', current: null, target, status: 'not-found', message: 'No URL with that id (or type, content id and country).' });
      return;
    }
    const base = { line, routeId: route.id, label: route.label, current: route.path, target };
    if (allowed && !allowed.includes(route.countryId)) {
      rows.push({ ...base, status: 'invalid', message: 'You do not have access to this market.' });
      return;
    }
    if (!target) {
      rows.push({ ...base, status: 'skipped', message: 'No target_path — left as it is.' });
      return;
    }
    const normalised = normalizeInputPath(target);
    if (!normalised.ok) {
      rows.push({ ...base, status: 'invalid', message: normalised.error });
      return;
    }
    const market = ctx.markets.find((m) => m.id === route!.countryId) ?? ctx.defaultMarket;
    if (market.slug && !(normalised.path === `/${market.slug}` || normalised.path.startsWith(`/${market.slug}/`))) {
      rows.push({ ...base, status: 'invalid', message: `A ${market.name} URL must start with /${market.slug}.` });
      return;
    }
    if (pathKey(normalised.path) === pathKey(route.path)) {
      rows.push({ ...base, status: 'unchanged', message: null });
      return;
    }
    const key = pathKey(normalised.path);
    const seen = targets.get(key);
    if (seen !== undefined) {
      rows.push({ ...base, status: 'duplicate', message: `Line ${seen} targets the same address.` });
      const first = rows.find((r) => r.line === seen);
      if (first && first.status === 'change') {
        first.status = 'duplicate';
        first.message = `Line ${line} targets the same address.`;
      }
      return;
    }
    targets.set(key, line);
    rows.push({ ...base, target: normalised.path, status: 'change', message: null });
  });

  for (const row of rows) {
    if (row.status === 'change' && row.routeId) edits.push({ routeId: row.routeId, action: 'custom', path: row.target });
  }
  return { rows, edits };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function listHistory(input: { page?: number; q?: string; routeId?: string }, allowed: Allowed) {
  const pageSize = 30;
  const page = Math.max(input.page ?? 1, 1);
  const where: Prisma.UrlChangeWhereInput = {
    ...(input.routeId ? { routeId: input.routeId } : {}),
    ...(allowed ? { OR: [{ countryId: { in: allowed } }, { countryId: null }] } : {}),
    ...(input.q?.trim()
      ? {
          AND: [
            {
              OR: [
                { contentLabel: { contains: input.q.trim(), mode: 'insensitive' } },
                { oldPath: { contains: input.q.trim().toLowerCase() } },
                { newPath: { contains: input.q.trim().toLowerCase() } },
              ],
            },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.urlChange.count({ where }),
    prisma.urlChange.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      batchId: r.batchId,
      routeId: r.routeId,
      type: r.contentType,
      label: r.contentLabel,
      oldPath: r.oldPath,
      newPath: r.newPath,
      action: r.action,
      note: r.note,
      actor: r.actorEmail ?? 'System',
      createdAt: r.createdAt.toISOString(),
      restorable: Boolean(r.routeId && r.oldPath && r.newPath),
    })),
  };
}

/** Plans putting a route back at an address it had, after checking it is still that content's. */
export async function restoreEdit(changeId: string, allowed: Allowed): Promise<RouteEdit> {
  const change = await prisma.urlChange.findUnique({ where: { id: changeId } });
  if (!change || !change.routeId || !change.oldPath) throw new UrlManagerError('That change cannot be restored.');
  const route = await prisma.urlRoute.findUnique({ where: { id: change.routeId } });
  if (!route || route.contentId !== change.contentId) {
    throw new UrlManagerError('The content this URL belonged to no longer has an address here — nothing to restore.');
  }
  if (allowed && !allowed.includes(route.countryId)) throw new UrlManagerError('You do not have access to this market.');
  if (pathKey(route.path) === pathKey(change.oldPath)) throw new UrlManagerError('It is already at that address.');
  return { routeId: route.id, action: 'custom', path: change.oldPath };
}

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

export type RedirectInput = {
  id?: string | null;
  source: string;
  destination: string;
  type: RedirectType;
  isActive: boolean;
  note?: string | null;
  origin?: 'MANUAL' | 'HEALTH' | 'IMPORT';
};

function normaliseDestination(raw: string): string {
  const value = raw.trim();
  if (!value) throw new UrlManagerError('Enter a destination.');
  if (isExternalDestination(value)) {
    if (!/^https?:\/\//i.test(value)) throw new UrlManagerError('External destinations must be http(s) URLs.');
    return value;
  }
  const [pathPart = '', ...rest] = value.split(/(?=[?#])/);
  const normalised = normalizeInputPath(pathPart || '/');
  if (!normalised.ok && pathPart !== '/') throw new UrlManagerError(`Destination: ${normalised.error}`);
  return `${normalised.ok ? normalised.path : '/'}${rest.join('')}`;
}

function marketOfPath(ctx: RegistryContext, fullPath: string): string {
  const first = fullPath.split('/')[1] ?? '';
  const market = ctx.markets.find((m) => m.slug && m.slug === first);
  return (market ?? ctx.defaultMarket).id;
}

/**
 * Saves a manual redirect after checking it against every address the site
 * owns. The source may not be a system route, a live page or another rule's
 * source; the destination may not lead back to the source, and a destination
 * that is itself redirected is followed to its end so no chain is stored.
 * Rules pointing at this rule's source are re-aimed to its destination.
 */
export async function saveRedirect(input: RedirectInput, actor: Actor, allowed: Allowed) {
  const result = await withRegistryLock(async (tx) => {
    const ctx = await loadContext(tx);
    const source = normalizeInputPath(input.source);
    if (!source.ok) throw new UrlManagerError(`Source: ${source.error}`);
    if (source.path === '/') throw new UrlManagerError('The home page cannot be redirected.');
    const first = source.path.split('/')[1]!;
    if (isReservedSegment(first)) throw new UrlManagerError(`/${first} is a system route and cannot be redirected.`);
    if (ctx.prefixes.includes(first) && source.path === `/${first}`) throw new UrlManagerError('A market’s home cannot be redirected.');
    const countryId = marketOfPath(ctx, source.path);
    if (allowed && !allowed.includes(countryId)) throw new UrlManagerError('You do not have access to this market.');

    const key = pathKey(source.path);
    const owner = await tx.urlRoute.findUnique({ where: { pathKey: key }, select: { label: true, contentType: true } });
    if (owner) throw new UrlManagerError(`${source.path} is the live address of ${URL_CONTENT_LABELS[owner.contentType]} “${owner.label}”. Change that URL instead.`);
    const clash = await tx.redirect.findFirst({ where: { sourceKey: key, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
    if (clash) throw new UrlManagerError(`A redirect already exists for ${source.path}.`);

    let destination = normaliseDestination(input.destination);
    if (!isExternalDestination(destination) && pathKey(destination) === key) throw new UrlManagerError('A redirect cannot point at itself.');

    // Follow the destination through existing rules, so this rule is one hop.
    const all = await tx.redirect.findMany({
      where: { isActive: true, sourceKey: { not: null }, ...(input.id ? { id: { not: input.id } } : {}) },
      select: { sourceKey: true, destination: true },
    });
    const graph = new Map(all.map((r) => [r.sourceKey!, r.destination]));
    graph.set(key, destination);
    const walk = followRedirects(destination, (k) => (k === key ? destination : (graph.get(k) ?? null)));
    if (!walk.ok) throw new UrlManagerError(`That would create a redirect loop: ${walk.cycle.join(' → ')}`);
    const flattened = walk.destination !== destination;
    destination = walk.destination;
    if (!isExternalDestination(destination) && pathKey(destination) === key) throw new UrlManagerError('That destination redirects back to this address.');

    const target = isExternalDestination(destination)
      ? null
      : await tx.urlRoute.findUnique({ where: { pathKey: pathKey(destination) }, select: { id: true, label: true } });

    const data = {
      source: source.path,
      sourceKey: key,
      destination,
      type: input.type,
      isActive: input.isActive,
      note: input.note?.trim() || null,
      targetRouteId: target?.id ?? null,
      targetLabel: target?.label ?? null,
    };
    const saved = input.id
      ? await tx.redirect.update({ where: { id: input.id }, data })
      : await tx.redirect.create({ data: { ...data, origin: input.origin ?? 'MANUAL', createdById: actor?.id ?? null } });

    // Anything that pointed at this source now points straight at its end.
    await tx.$executeRaw`
      UPDATE "Redirect" SET "destination" = ${destination}, "updatedAt" = NOW()
      WHERE "id" <> ${saved.id}
        AND "destination" !~* '^[a-z][a-z0-9+.-]*://'
        AND lower(regexp_replace('/' || btrim(split_part(split_part("destination", '?', 1), '#', 1), '/'), '/+', '/', 'g')) = ${key}
    `;

    await tx.urlChange.create({
      data: {
        contentLabel: `Redirect ${source.path}`,
        oldPath: source.path,
        newPath: destination,
        countryId,
        action: 'redirect',
        note: input.id ? 'Redirect updated' : 'Redirect created',
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
      },
    });
    return { id: saved.id, destination, flattened };
  });
  return result;
}

export async function setRedirectActive(id: string, isActive: boolean, allowed: Allowed) {
  const ctx = await loadContext();
  const row = await prisma.redirect.findUnique({ where: { id } });
  if (!row) throw new UrlManagerError('That redirect no longer exists.');
  if (allowed && !allowed.includes(marketOfPath(ctx, row.sourceKey ?? pathKey(row.source)))) throw new UrlManagerError('You do not have access to this market.');
  if (isActive && row.sourceKey) {
    const owner = await prisma.urlRoute.findUnique({ where: { pathKey: row.sourceKey }, select: { id: true } });
    if (owner) throw new UrlManagerError('Its source is now a live page’s address, so it cannot be switched on.');
  }
  await prisma.redirect.update({ where: { id }, data: { isActive } });
}

export async function deleteRedirect(id: string, allowed: Allowed) {
  const ctx = await loadContext();
  const row = await prisma.redirect.findUnique({ where: { id } });
  if (!row) throw new UrlManagerError('That redirect no longer exists.');
  if (allowed && !allowed.includes(marketOfPath(ctx, row.sourceKey ?? pathKey(row.source)))) throw new UrlManagerError('You do not have access to this market.');
  await prisma.redirect.delete({ where: { id } });
  return row;
}

export async function listRedirects(input: { q?: string; origin?: string; page?: number }, allowed: Allowed) {
  const pageSize = 30;
  const page = Math.max(input.page ?? 1, 1);
  const ctx = await loadContext();
  const where: Prisma.RedirectWhereInput = {
    ...(input.origin ? { origin: input.origin as 'MANUAL' } : {}),
    ...(input.q?.trim()
      ? { OR: [{ source: { contains: input.q.trim(), mode: 'insensitive' } }, { destination: { contains: input.q.trim(), mode: 'insensitive' } }, { note: { contains: input.q.trim(), mode: 'insensitive' } }] }
      : {}),
  };
  const rows = await prisma.redirect.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5_000 });
  const visible = allowed ? rows.filter((r) => allowed.includes(marketOfPath(ctx, r.sourceKey ?? pathKey(r.source)))) : rows;
  return {
    total: visible.length,
    page,
    pageSize,
    rows: visible.slice((page - 1) * pageSize, page * pageSize).map((r) => ({
      id: r.id,
      source: r.source,
      destination: r.destination,
      type: r.type,
      isActive: r.isActive,
      hitCount: r.hitCount,
      lastHitAt: r.lastHitAt?.toISOString() ?? null,
      note: r.note,
      origin: r.origin,
      targetLabel: r.targetLabel,
      keyed: Boolean(r.sourceKey),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

const SYSTEM_PATHS = new Set(['/', '/blog']);

/**
 * URL Health: real recorded 404s, links in content that lead nowhere,
 * registry conflicts and redirect problems. Bounded work: fixed row limits
 * and a handful of queries, never a fetch of any URL.
 */
export async function healthReport(allowed: Allowed) {
  const ctx = await loadContext();
  const [notFound, routes, redirects, settings, navItems, ctas, sections] = await Promise.all([
    prisma.notFoundLog.findMany({ where: { resolvedAt: null }, orderBy: [{ hits: 'desc' }, { lastSeenAt: 'desc' }], take: 200 }),
    prisma.urlRoute.findMany({ select: { id: true, pathKey: true, path: true, label: true, contentType: true, countryId: true, conflictPath: true, conflictReason: true, isPublic: true } }),
    prisma.redirect.findMany({ select: { id: true, source: true, sourceKey: true, destination: true, isActive: true, targetRouteId: true, targetLabel: true, note: true, origin: true } }),
    prisma.urlSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.navigationItem.findMany({ where: { linkType: { in: ['INTERNAL', 'EXTERNAL'] }, url: { startsWith: '/' } }, select: { id: true, label: true, url: true, navigation: { select: { countryId: true, name: true } } }, take: 1_000 }),
    prisma.product.findMany({ where: { deletedAt: null, ctaUrl: { startsWith: '/' } }, select: { id: true, name: true, ctaUrl: true }, take: 1_000 }),
    prisma.pageSection.findMany({ where: { page: { deletedAt: null } }, select: { id: true, content: true, page: { select: { id: true, title: true, countryId: true } } }, take: 800, orderBy: { updatedAt: 'desc' } }),
  ]);

  const routeKeys = new Map(routes.map((r) => [r.pathKey, r]));
  const redirectKeys = new Map(redirects.filter((r) => r.sourceKey && r.isActive).map((r) => [r.sourceKey!, r]));
  const inMarket = (countryId: string | null) => !allowed || !countryId || allowed.includes(countryId);

  const resolves = (href: string, countryId: string | null): boolean => {
    const path = href.split(/[?#]/)[0] || '/';
    const key = pathKey(path);
    if (SYSTEM_PATHS.has(key) || isReservedSegment(key.split('/')[1] ?? '')) return true;
    const market = ctx.markets.find((m) => m.id === countryId);
    const candidates = [key];
    if (market?.slug && !key.startsWith(`/${market.slug}`)) candidates.push(pathKey(`/${market.slug}${key}`));
    return candidates.some((k) => routeKeys.has(k) || redirectKeys.has(k) || ctx.prefixes.some((p) => k === `/${p}`));
  };

  const broken: Array<{ where: string; label: string; href: string; adminHref: string }> = [];
  for (const item of navItems) {
    if (!inMarket(item.navigation?.countryId ?? null)) continue;
    if (item.url && !resolves(item.url, item.navigation?.countryId ?? null)) {
      broken.push({ where: `Menu “${item.navigation?.name ?? ''}”`, label: item.label, href: item.url, adminHref: '/admin/navigation' });
    }
  }
  for (const product of ctas) {
    if (product.ctaUrl && !resolves(product.ctaUrl, ctx.defaultMarket.id)) {
      broken.push({ where: 'Product button', label: product.name, href: product.ctaUrl, adminHref: `/admin/products/${product.id}` });
    }
  }
  const HREF = /"(\/[a-z][a-z0-9/_-]*)(?:[?#][^"]*)?"/gi;
  for (const section of sections) {
    if (!inMarket(section.page.countryId)) continue;
    const text = JSON.stringify(section.content);
    const seen = new Set<string>();
    for (const match of text.matchAll(HREF)) {
      const href = match[1]!;
      if (seen.has(href) || href.startsWith('/uploads') || href.startsWith('/media')) continue;
      seen.add(href);
      if (!resolves(href, section.page.countryId)) {
        broken.push({ where: 'Page content', label: section.page.title, href, adminHref: `/admin/pages/${section.page.id}` });
      }
      if (broken.length >= 300) break;
    }
  }

  const redirectProblems: Array<{ id: string; source: string; destination: string; problem: string }> = [];
  for (const r of redirects) {
    if (!inMarket(marketOfPath(ctx, r.sourceKey ?? pathKey(r.source)))) continue;
    if (!r.sourceKey) {
      redirectProblems.push({ id: r.id, source: r.source, destination: r.destination, problem: r.note?.startsWith('Shadowed') ? 'Shadowed by live content — never applies.' : 'Duplicate of another rule once normalised — never applies.' });
      continue;
    }
    if (!r.isActive) continue;
    if (isExternalDestination(r.destination)) continue;
    const dest = pathKey(r.destination);
    if (dest === r.sourceKey) redirectProblems.push({ id: r.id, source: r.source, destination: r.destination, problem: 'Points at itself.' });
    else if (redirectKeys.has(dest)) redirectProblems.push({ id: r.id, source: r.source, destination: r.destination, problem: 'Chain: the destination is itself redirected.' });
    else if (!routeKeys.has(dest) && !SYSTEM_PATHS.has(dest) && !ctx.prefixes.some((p) => dest === `/${p}`)) {
      redirectProblems.push({ id: r.id, source: r.source, destination: r.destination, problem: r.targetLabel ? `Its content (“${r.targetLabel}”) no longer has an address — choose a replacement.` : 'The destination is not a live address.' });
    }
  }

  const conflicts = routes
    .filter((r) => r.conflictPath && inMarket(r.countryId))
    .map((r) => ({ routeId: r.id, label: r.label, type: URL_CONTENT_LABELS[r.contentType], path: r.path, wanted: r.conflictPath!, reason: r.conflictReason }));

  return {
    notFound: notFound.map((n) => ({ id: n.id, path: n.path, hits: n.hits, referrerHost: n.referrerHost, firstSeenAt: n.firstSeenAt.toISOString(), lastSeenAt: n.lastSeenAt.toISOString() })),
    broken: broken.slice(0, 300),
    conflicts,
    backfillCollisions: (settings?.lastCollisions as unknown as Array<{ kind: string; path: string; label: string; reason: string }>) ?? [],
    redirectProblems,
    settings: settings
      ? { resolverEnabled: settings.resolverEnabled, backfilledAt: settings.backfilledAt?.toISOString() ?? null, activatedAt: settings.activatedAt?.toISOString() ?? null }
      : { resolverEnabled: false, backfilledAt: null, activatedAt: null },
  };
}

/** Maps a recorded 404 to a published destination the user may link to. */
export async function mapNotFound(logId: string, destination: string, actor: Actor, allowed: Allowed) {
  const log = await prisma.notFoundLog.findUnique({ where: { id: logId } });
  if (!log) throw new UrlManagerError('That entry no longer exists.');
  const dest = normaliseDestination(destination);
  if (isExternalDestination(dest)) throw new UrlManagerError('Map a missing address to a page on this site.');
  const route = await prisma.urlRoute.findUnique({ where: { pathKey: pathKey(dest) }, select: { isPublic: true, countryId: true } });
  if (!route || !route.isPublic) throw new UrlManagerError('Choose a published page, product or article as the destination.');
  if (allowed && !allowed.includes(route.countryId)) throw new UrlManagerError('You do not have access to that market.');
  const saved = await saveRedirect({ source: log.path, destination: dest, type: 'PERMANENT', isActive: true, note: 'Mapped from URL Health', origin: 'HEALTH' }, actor, allowed);
  await prisma.notFoundLog.update({ where: { id: logId }, data: { resolvedAt: new Date(), resolution: `Redirected to ${saved.destination}` } });
  return saved;
}

export async function dismissNotFound(logId: string) {
  await prisma.notFoundLog.update({ where: { id: logId }, data: { resolvedAt: new Date(), resolution: 'Dismissed' } });
}

export function newBatchId(): string {
  return randomUUID();
}
