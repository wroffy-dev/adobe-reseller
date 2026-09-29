import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, UrlContentType, UrlRouteMode } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  effectivePattern,
  joinMarketPath,
  pathKey,
  reservedReason,
  routeRelativePath,
  ROOT_ONLY_TYPES,
  URL_CONTENT_LABELS,
} from './paths';
import { taxonomyPageSlug } from '@/lib/cms/taxonomy-pages';
import { revalidateUrlChanges } from './revalidate';

/**
 * The URL registry: the one authority for which content lives at which
 * public address.
 *
 * Every write that can move an address — saving content, a pattern change, a
 * bulk edit, an import, a restore — goes through the same planner and the same
 * applier, inside one transaction serialised by a Postgres advisory lock. The
 * unique index on `UrlRoute.pathKey` and `Redirect.sourceKey` is the database
 * backstop; the planner is what turns a collision into a clear message naming
 * the owner instead of an error.
 */

export type Tx = Prisma.TransactionClient;

/** Arbitrary, fixed: every registry write takes this transaction lock. */
const REGISTRY_LOCK = 7_340_021;

export type Actor = { id: string; email: string } | null;

/** The history/audit identity of a signed-in user. */
export function actorOf(user: { id: string; email: string } | null | undefined): Actor {
  return user ? { id: user.id, email: user.email } : null;
}

export type ContentKind = 'product' | 'page' | 'post' | 'blogCategory' | 'blogTag';

/** Which content table a route type reads from. */
export const KIND_OF_TYPE: Record<UrlContentType, ContentKind> = {
  PRODUCT: 'product',
  PAGE: 'page',
  CATEGORY_PAGE: 'page',
  BRAND_PAGE: 'page',
  BLOG_POST: 'post',
  BLOG_CATEGORY: 'blogCategory',
  BLOG_TAG: 'blogTag',
};

const TYPES_OF_KIND: Record<ContentKind, UrlContentType[]> = {
  product: ['PRODUCT'],
  page: ['PAGE', 'CATEGORY_PAGE', 'BRAND_PAGE'],
  post: ['BLOG_POST'],
  blogCategory: ['BLOG_CATEGORY'],
  blogTag: ['BLOG_TAG'],
};

export type Market = { id: string; slug: string; name: string; isDefault: boolean; isActive: boolean };

export type PatternRow = { contentType: UrlContentType; countryId: string | null; pattern: string };

export type RegistryContext = {
  markets: Market[];
  defaultMarket: Market;
  prefixes: string[];
  patterns: PatternRow[];
};

/** One route the content currently in the database should have. */
export type DesiredRoute = {
  type: UrlContentType;
  kind: ContentKind;
  contentId: string;
  countryId: string;
  slug: string;
  label: string;
  status: string;
  isPublic: boolean;
  isHomepage: boolean;
  /**
   * A category/brand landing page whose own slug was edited away from the
   * generated "categories/<slug>": that edit was a deliberate address, so the
   * route keeps it as a custom path instead of following the pattern.
   */
  forcedCustom?: string;
};

export type Scope =
  | { all: true }
  /** Exactly these pieces of content, of any kinds. */
  | { contents: Array<{ kind: ContentKind; id: string }> }
  | { kind: ContentKind; ids?: string[]; countryIds?: string[] }
  | { types: UrlContentType[]; countryIds?: string[] };

// ---------------------------------------------------------------------------
// Transactions and context
// ---------------------------------------------------------------------------

/** Runs `fn` in a transaction holding the registry lock. */
export async function withRegistryLock<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REGISTRY_LOCK})`;
      return fn(tx);
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

export async function loadContext(db: Tx | typeof prisma = prisma): Promise<RegistryContext> {
  const [countries, patterns] = await Promise.all([
    db.country.findMany({
      select: { id: true, slug: true, name: true, isDefault: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    db.urlPattern.findMany({ select: { contentType: true, countryId: true, pattern: true } }),
  ]);
  const markets = countries.length
    ? countries
    : [{ id: 'country_in', slug: '', name: 'India', isDefault: true, isActive: true }];
  const defaultMarket = markets.find((m) => m.isDefault) ?? markets[0]!;
  return {
    markets,
    defaultMarket,
    prefixes: markets.map((m) => m.slug).filter(Boolean),
    patterns,
  };
}

function marketOf(ctx: RegistryContext, countryId: string): Market {
  return ctx.markets.find((m) => m.id === countryId) ?? ctx.defaultMarket;
}

// ---------------------------------------------------------------------------
// What the content says
// ---------------------------------------------------------------------------

const now = () => new Date();

function isLive(status: string, publishedAt: Date | null): boolean {
  return status === 'PUBLISHED' && (!publishedAt || publishedAt <= now());
}

function inScope(scope: Scope, kind: ContentKind): boolean {
  if ('all' in scope) return true;
  if ('contents' in scope) return scope.contents.some((c) => c.kind === kind);
  if ('kind' in scope) return scope.kind === kind;
  return scope.types.some((type) => KIND_OF_TYPE[type] === kind);
}

function scopeIds(scope: Scope, kind: ContentKind): string[] | undefined {
  if ('contents' in scope) return scope.contents.filter((c) => c.kind === kind).map((c) => c.id);
  return 'kind' in scope && scope.kind === kind ? scope.ids : undefined;
}

function scopeCountries(scope: Scope): string[] | undefined {
  return 'all' in scope || 'contents' in scope ? undefined : scope.countryIds;
}

/**
 * Every route the content in scope should have, read in one query per kind.
 *
 * Soft-deleted content, products withdrawn from a market and articles outside
 * the root market have no route at all — so they can never be reached through
 * one, whatever their slug.
 */
export async function desiredRoutes(db: Tx, ctx: RegistryContext, scope: Scope): Promise<DesiredRoute[]> {
  const out: DesiredRoute[] = [];
  const countries = scopeCountries(scope);
  const root = ctx.defaultMarket.id;

  if (inScope(scope, 'product')) {
    const ids = scopeIds(scope, 'product');
    const rows = await db.productCountry.findMany({
      where: {
        deletedAt: null,
        product: { deletedAt: null },
        ...(ids ? { productId: { in: ids } } : {}),
        ...(countries ? { countryId: { in: countries } } : {}),
      },
      select: {
        countryId: true,
        status: true,
        publishedAt: true,
        product: { select: { id: true, name: true, slug: true } },
      },
    });
    for (const row of rows) {
      out.push({
        type: 'PRODUCT',
        kind: 'product',
        contentId: row.product.id,
        countryId: row.countryId,
        slug: row.product.slug,
        label: row.product.name,
        status: row.status,
        isPublic: isLive(row.status, row.publishedAt),
        isHomepage: false,
      });
    }
  }

  if (inScope(scope, 'page')) {
    const ids = scopeIds(scope, 'page');
    const pages = await db.page.findMany({
      where: {
        deletedAt: null,
        ...(ids ? { id: { in: ids } } : {}),
        ...(countries ? { countryId: { in: countries } } : {}),
      },
      select: {
        id: true,
        countryId: true,
        title: true,
        slug: true,
        status: true,
        publishedAt: true,
        isHomepage: true,
        taxonomyKind: true,
        taxonomyId: true,
      },
    });
    const categoryIds = pages.filter((p) => p.taxonomyKind === 'category' && p.taxonomyId).map((p) => p.taxonomyId!);
    const brandIds = pages.filter((p) => p.taxonomyKind === 'brand' && p.taxonomyId).map((p) => p.taxonomyId!);
    const [categories, brands] = await Promise.all([
      categoryIds.length
        ? db.productCategory.findMany({ where: { id: { in: categoryIds }, deletedAt: null }, select: { id: true, slug: true } })
        : [],
      brandIds.length
        ? db.brand.findMany({ where: { id: { in: brandIds }, deletedAt: null }, select: { id: true, slug: true } })
        : [],
    ]);
    const taxonomySlug = new Map<string, string>([
      ...categories.map((c) => [`category:${c.id}`, c.slug] as const),
      ...brands.map((b) => [`brand:${b.id}`, b.slug] as const),
    ]);

    for (const page of pages) {
      const linked = page.taxonomyKind && page.taxonomyId ? taxonomySlug.get(`${page.taxonomyKind}:${page.taxonomyId}`) : undefined;
      const type: UrlContentType = linked
        ? page.taxonomyKind === 'brand'
          ? 'BRAND_PAGE'
          : 'CATEGORY_PAGE'
        : 'PAGE';
      const generated = linked ? taxonomyPageSlug(page.taxonomyKind === 'brand' ? 'brand' : 'category', linked) : null;
      out.push({
        type,
        kind: 'page',
        contentId: page.id,
        countryId: page.countryId,
        slug: linked ?? page.slug,
        label: page.title,
        status: page.status,
        isPublic: isLive(page.status, page.publishedAt),
        isHomepage: page.isHomepage || page.slug === '',
        forcedCustom: generated && page.slug !== generated ? `/${page.slug}` : undefined,
      });
    }
  }

  // The blog lives at the root only.
  const rootInScope = !countries || countries.includes(root);

  if (inScope(scope, 'post') && rootInScope) {
    const ids = scopeIds(scope, 'post');
    const posts = await db.blogPost.findMany({
      where: { deletedAt: null, countryId: root, ...(ids ? { id: { in: ids } } : {}) },
      select: { id: true, title: true, slug: true, status: true, publishedAt: true },
    });
    for (const post of posts) {
      out.push({
        type: 'BLOG_POST',
        kind: 'post',
        contentId: post.id,
        countryId: root,
        slug: post.slug,
        label: post.title,
        status: post.status,
        isPublic: isLive(post.status, post.publishedAt),
        isHomepage: false,
      });
    }
  }

  if (inScope(scope, 'blogCategory') && rootInScope) {
    const ids = scopeIds(scope, 'blogCategory');
    const rows = await db.blogCategory.findMany({
      where: ids ? { id: { in: ids } } : {},
      select: { id: true, name: true, slug: true, isActive: true },
    });
    for (const row of rows) {
      out.push({
        type: 'BLOG_CATEGORY',
        kind: 'blogCategory',
        contentId: row.id,
        countryId: root,
        slug: row.slug,
        label: row.name,
        status: row.isActive ? 'PUBLISHED' : 'HIDDEN',
        isPublic: row.isActive,
        isHomepage: false,
      });
    }
  }

  if (inScope(scope, 'blogTag') && rootInScope) {
    const ids = scopeIds(scope, 'blogTag');
    const rows = await db.blogTag.findMany({
      where: ids ? { id: { in: ids } } : {},
      select: { id: true, name: true, slug: true, isActive: true },
    });
    for (const row of rows) {
      out.push({
        type: 'BLOG_TAG',
        kind: 'blogTag',
        contentId: row.id,
        countryId: root,
        slug: row.slug,
        label: row.name,
        status: row.isActive ? 'PUBLISHED' : 'HIDDEN',
        isPublic: row.isActive,
        isHomepage: false,
      });
    }
  }

  if ('types' in scope) return out.filter((route) => scope.types.includes(route.type));
  return out;
}

// ---------------------------------------------------------------------------
// The path index — every claimed address, loaded once per plan
// ---------------------------------------------------------------------------

type RouteRow = Prisma.UrlRouteGetPayload<object>;

export type PathIndex = {
  routes: Map<string, { id: string; label: string; contentType: UrlContentType; countryId: string }>;
  redirects: Map<string, { id: string; targetRouteId: string | null; destination: string; isActive: boolean }>;
};

async function loadPathIndex(db: Tx): Promise<PathIndex> {
  const [routes, redirects] = await Promise.all([
    db.urlRoute.findMany({ select: { id: true, pathKey: true, label: true, contentType: true, countryId: true } }),
    db.redirect.findMany({
      where: { sourceKey: { not: null } },
      select: { id: true, sourceKey: true, targetRouteId: true, destination: true, isActive: true },
    }),
  ]);
  return {
    routes: new Map(routes.map((r) => [r.pathKey, r])),
    redirects: new Map(redirects.map((r) => [r.sourceKey!, r])),
  };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type PlanOverrides = {
  /** Replaces the stored patterns while planning (pattern preview/apply). */
  patterns?: PatternRow[];
  /** New content slugs, keyed "kind:contentId". */
  slugs?: Map<string, string>;
  /** New route modes, keyed by route id. */
  routes?: Map<string, { mode: UrlRouteMode; customPath: string | null }>;
};

export type PlanItemStatus = 'create' | 'move' | 'unchanged' | 'remove' | 'conflict';

export type PlanItem = {
  status: PlanItemStatus;
  routeId: string | null;
  type: UrlContentType;
  kind: ContentKind;
  contentId: string;
  countryId: string;
  label: string;
  contentStatus: string;
  isPublic: boolean;
  isHomepage: boolean;
  slug: string;
  mode: UrlRouteMode;
  customPath: string | null;
  oldPath: string | null;
  newPath: string | null;
  /** Why a conflict could not be applied, naming the owner. */
  reason?: string;
  /** Set when the target is held by this route's own redirect, which is removed. */
  reclaimRedirectId?: string;
  /** Where the pattern came from, for the admin. */
  patternSource: 'custom' | 'country' | 'global' | 'default';
  pattern: string;
  /** The version of the route this plan was built from — stale-preview check. */
  version: string | null;
  /** Whether the route was public at its last sync. */
  wasPublic: boolean;
  /** Whether the stored row differs from what the content now says. */
  stale: boolean;
};

export type Plan = { items: PlanItem[]; token: string };

function key(type: UrlContentType, contentId: string, countryId: string) {
  return `${type}|${contentId}|${countryId}`;
}

function contentKey(kind: ContentKind, contentId: string) {
  return `${kind}:${contentId}`;
}

function describeOwner(owner: { label: string; contentType: UrlContentType }): string {
  return `${URL_CONTENT_LABELS[owner.contentType]} “${owner.label}”`;
}

/**
 * Plans the routes for everything in `scope`.
 *
 * Pure with respect to the database: it reads, decides and returns what would
 * happen, and never writes. The same function backs the admin preview and the
 * apply, so what was previewed is exactly what is applied — and a token over
 * the plan lets the apply refuse when anything moved in between.
 */
export async function planRoutes(
  db: Tx,
  ctx: RegistryContext,
  scope: Scope,
  overrides: PlanOverrides = {},
): Promise<Plan> {
  const patterns = overrides.patterns ?? ctx.patterns;
  const desired = await desiredRoutes(db, ctx, scope);

  const types = new Set<UrlContentType>();
  if ('all' in scope) Object.keys(KIND_OF_TYPE).forEach((t) => types.add(t as UrlContentType));
  else if ('contents' in scope) scope.contents.forEach((c) => TYPES_OF_KIND[c.kind].forEach((t) => types.add(t)));
  else if ('kind' in scope) TYPES_OF_KIND[scope.kind].forEach((t) => types.add(t));
  else scope.types.forEach((t) => types.add(t));

  const ids = 'kind' in scope ? scope.ids : 'contents' in scope ? scope.contents.map((c) => c.id) : undefined;
  const countries = scopeCountries(scope);
  const [existing, index] = await Promise.all([
    db.urlRoute.findMany({
      where: {
        contentType: { in: [...types] },
        ...(ids ? { contentId: { in: ids } } : {}),
        ...(countries ? { countryId: { in: countries } } : {}),
      },
    }),
    loadPathIndex(db),
  ]);

  const byKey = new Map<string, RouteRow>(existing.map((r) => [key(r.contentType, r.contentId, r.countryId), r]));
  // A page can change type (a taxonomy link added or its taxonomy deleted), so
  // match pages on id and market regardless of type.
  const byContent = new Map<string, RouteRow>(existing.map((r) => [`${KIND_OF_TYPE[r.contentType]}|${r.contentId}|${r.countryId}`, r]));

  const items: PlanItem[] = [];
  const seen = new Set<string>();

  for (const d of desired) {
    const ex = byKey.get(key(d.type, d.contentId, d.countryId)) ?? byContent.get(`${d.kind}|${d.contentId}|${d.countryId}`) ?? null;
    if (ex) seen.add(ex.id);

    const slug = overrides.slugs?.get(contentKey(d.kind, d.contentId)) ?? d.slug;
    const routeOverride = ex ? overrides.routes?.get(ex.id) : undefined;
    let mode: UrlRouteMode = routeOverride?.mode ?? ex?.mode ?? 'PATTERN';
    let customPath = routeOverride ? routeOverride.customPath : (ex?.customPath ?? null);
    if (!routeOverride && mode === 'PATTERN' && d.forcedCustom) {
      mode = 'CUSTOM';
      customPath = d.forcedCustom;
    }
    const market = marketOf(ctx, d.countryId);
    const pattern = effectivePattern(d.type, ROOT_ONLY_TYPES.has(d.type) ? null : d.countryId, patterns);
    const relative = routeRelativePath({ type: d.type, slug, mode, customPath, pattern: pattern.pattern, isHomepage: d.isHomepage });
    const newPath = joinMarketPath(market.slug, relative);

    items.push({
      status: !ex ? 'create' : ex.pathKey === pathKey(newPath) && ex.path === newPath ? 'unchanged' : 'move',
      routeId: ex?.id ?? null,
      type: d.type,
      kind: d.kind,
      contentId: d.contentId,
      countryId: d.countryId,
      label: d.label,
      contentStatus: d.status,
      isPublic: d.isPublic,
      isHomepage: d.isHomepage,
      slug,
      mode: d.isHomepage ? 'PATTERN' : mode,
      customPath: d.isHomepage ? null : customPath,
      oldPath: ex?.path ?? null,
      newPath,
      patternSource: mode === 'CUSTOM' && customPath && !d.isHomepage ? 'custom' : pattern.source,
      pattern: pattern.pattern,
      version: ex ? `${ex.id}:${ex.updatedAt.getTime()}` : null,
      wasPublic: ex?.isPublic ?? false,
      stale: ex
        ? ex.contentType !== d.type ||
          ex.contentSlug !== slug ||
          ex.label !== d.label ||
          ex.contentStatus !== d.status ||
          ex.isPublic !== d.isPublic ||
          ex.isHomepage !== d.isHomepage ||
          ex.mode !== (d.isHomepage ? 'PATTERN' : mode) ||
          (ex.customPath ?? null) !== (d.isHomepage || mode !== 'CUSTOM' ? null : customPath) ||
          ex.conflictPath !== null
        : true,
    });
  }

  for (const ex of existing) {
    if (seen.has(ex.id)) continue;
    items.push({
      status: 'remove',
      routeId: ex.id,
      type: ex.contentType,
      kind: KIND_OF_TYPE[ex.contentType],
      contentId: ex.contentId,
      countryId: ex.countryId,
      label: ex.label,
      contentStatus: ex.contentStatus,
      isPublic: ex.isPublic,
      isHomepage: ex.isHomepage,
      slug: ex.contentSlug,
      mode: ex.mode,
      customPath: ex.customPath,
      oldPath: ex.path,
      newPath: null,
      patternSource: ex.mode === 'CUSTOM' ? 'custom' : 'default',
      pattern: '',
      version: `${ex.id}:${ex.updatedAt.getTime()}`,
      wasPublic: ex.isPublic,
      stale: true,
    });
  }

  resolveConflicts(ctx, items, index);

  // The token covers what this plan would change and the routes it edits —
  // not every untouched route in scope, so an unrelated save elsewhere does
  // not invalidate a preview, while any change to these routes does.
  const edited = (i: PlanItem) =>
    Boolean(
      (i.routeId && overrides.routes?.has(i.routeId)) ||
        overrides.slugs?.has(contentKey(i.kind, i.contentId)),
    );
  const token = createHash('sha256')
    .update(
      items
        .filter((i) => i.status !== 'unchanged' || edited(i))
        .map((i) => `${i.status}|${i.routeId}|${i.type}|${i.contentId}|${i.countryId}|${i.oldPath}|${i.newPath}|${i.version}`)
        .sort()
        .join('\n'),
    )
    .digest('hex')
    .slice(0, 32);

  return { items, token };
}

/**
 * Marks every item whose target address is taken.
 *
 * Addresses vacated by routes moving in the same plan count as free — that is
 * what lets a bulk rename or a pattern change shuffle URLs around — but only
 * while the route vacating them actually moves, so the check repeats until
 * nothing changes.
 */
function resolveConflicts(ctx: RegistryContext, items: PlanItem[], index: PathIndex) {
  let changed = true;
  let guard = 0;
  while (changed && guard < 20) {
    changed = false;
    guard += 1;

    // Which route will hold each address once this plan is applied.
    const vacating = new Set<string>();
    for (const item of items) {
      if ((item.status === 'move' || item.status === 'remove') && item.oldPath) vacating.add(pathKey(item.oldPath));
    }
    const claimed = new Map<string, PlanItem>();

    for (const item of items) {
      if (item.status !== 'create' && item.status !== 'move') continue;
      const target = pathKey(item.newPath!);
      const market = marketOf(ctx, item.countryId);

      const reserved = reservedReason(item.newPath!, {
        marketPrefixes: ctx.prefixes,
        marketPrefix: market.slug,
        isHomepage: item.isHomepage,
      });
      if (reserved) {
        markConflict(item, reserved);
        changed = true;
        continue;
      }

      const twin = claimed.get(target);
      if (twin) {
        markConflict(item, `Also wanted by ${URL_CONTENT_LABELS[twin.type]} “${twin.label}” in this change.`);
        changed = true;
        continue;
      }

      const holder = index.routes.get(target);
      if (holder && holder.id !== item.routeId && !vacating.has(target)) {
        markConflict(item, `Already used by ${describeOwner(holder)}.`);
        changed = true;
        continue;
      }

      const redirect = index.redirects.get(target);
      if (redirect) {
        if (item.routeId && redirect.targetRouteId === item.routeId) {
          // Its own old address: moving back reclaims it and drops the redirect.
          item.reclaimRedirectId = redirect.id;
        } else {
          markConflict(item, `Already used by a redirect to ${redirect.destination}. Remove or change that redirect first.`);
          changed = true;
          continue;
        }
      }

      claimed.set(target, item);
    }
  }
}

function markConflict(item: PlanItem, reason: string) {
  item.reason = reason;
  item.reclaimRedirectId = undefined;
  // A route that cannot move stays where it is; one that cannot be created is
  // simply not registered yet.
  item.status = 'conflict';
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

export type ApplyOptions = {
  actor: Actor;
  action: string;
  batchId?: string;
  note?: string;
  /** Record history for created routes (off for the initial backfill). */
  recordCreates?: boolean;
  /** Persist the plan's slug overrides onto the content itself. */
  writeSlugs?: Map<string, string>;
  /** Persist route mode/custom path overrides. */
  writeRoutes?: Map<string, { mode: UrlRouteMode; customPath: string | null }>;
};

export type ApplyReport = {
  batchId: string;
  created: number;
  moved: number;
  removed: number;
  unchanged: number;
  redirectsCreated: number;
  conflicts: PlanItem[];
  changes: Array<{ label: string; oldPath: string | null; newPath: string | null; countryId: string; type: UrlContentType }>;
};

/**
 * Applies a plan inside the caller's locked transaction.
 *
 * Order matters and is fixed: released addresses first, then every moving
 * route parked on a unique temporary key, then the final paths — so a swap
 * between two routes never trips the unique index — then the redirects that
 * keep old public addresses alive, flattened so every historical address
 * reaches the current one in a single hop.
 */
export async function applyPlan(tx: Tx, ctx: RegistryContext, plan: Plan, options: ApplyOptions): Promise<ApplyReport> {
  const batchId = options.batchId ?? randomUUID();
  const report: ApplyReport = {
    batchId,
    created: 0,
    moved: 0,
    removed: 0,
    unchanged: 0,
    redirectsCreated: 0,
    conflicts: plan.items.filter((i) => i.status === 'conflict'),
    changes: [],
  };
  const history: Prisma.UrlChangeCreateManyInput[] = [];
  const stamp = {
    actorId: options.actor?.id ?? null,
    actorEmail: options.actor?.email ?? null,
    batchId,
  };

  // 1. Content slugs, when the plan renames content. A unique violation here
  // (two products with one slug) aborts the whole transaction.
  if (options.writeSlugs?.size) {
    for (const [ck, slug] of options.writeSlugs) {
      const [kind, id] = ck.split(':') as [ContentKind, string];
      if (!plan.items.some((i) => i.kind === kind && i.contentId === id && i.status !== 'conflict')) continue;
      await writeContentSlug(tx, kind, id, slug);
    }
  }

  // 2. Removed routes: keep their redirects' history, then release the address.
  for (const item of plan.items.filter((i) => i.status === 'remove')) {
    await tx.redirect.updateMany({ where: { targetRouteId: item.routeId! }, data: { targetLabel: item.label } });
    await tx.urlRoute.delete({ where: { id: item.routeId! } });
    report.removed += 1;
    history.push({
      ...stamp,
      routeId: item.routeId,
      contentType: item.type,
      contentId: item.contentId,
      countryId: item.countryId,
      contentLabel: item.label,
      oldPath: item.oldPath,
      newPath: null,
      action: 'deleted',
      note: item.isPublic
        ? 'The content is no longer public here. Its old address now answers 404 — map it to a replacement in URL Health.'
        : null,
    });
  }

  // 3. Redirects reclaimed by a route moving back onto its own old address.
  const reclaim = plan.items.map((i) => i.reclaimRedirectId).filter((id): id is string => Boolean(id));
  if (reclaim.length) await tx.redirect.deleteMany({ where: { id: { in: reclaim } } });

  const moving = plan.items.filter((i) => i.status === 'move');

  // 4. Park moving routes on temporary keys.
  for (const item of moving) {
    await tx.urlRoute.update({ where: { id: item.routeId! }, data: { pathKey: `~moving/${item.routeId}` } });
  }

  // 5. Final paths, and brand-new routes.
  const finalKeys = new Set<string>();
  for (const item of plan.items) {
    if (item.status === 'create' || item.status === 'move' || item.status === 'unchanged') {
      finalKeys.add(pathKey(item.newPath!));
    }
  }

  const routeOverride = (item: PlanItem) => (item.routeId ? options.writeRoutes?.get(item.routeId) : undefined);

  for (const item of plan.items) {
    const meta = {
      contentSlug: item.slug,
      label: item.label,
      contentStatus: item.contentStatus,
      isPublic: item.isPublic,
      isHomepage: item.isHomepage,
    };

    if (item.status === 'create') {
      const created = await tx.urlRoute.create({
        data: {
          contentType: item.type,
          contentId: item.contentId,
          countryId: item.countryId,
          path: item.newPath!,
          pathKey: pathKey(item.newPath!),
          mode: item.mode,
          customPath: item.mode === 'CUSTOM' ? item.customPath : null,
          ...meta,
        },
      });
      item.routeId = created.id;
      report.created += 1;
      if (options.recordCreates) {
        history.push({
          ...stamp,
          routeId: created.id,
          contentType: item.type,
          contentId: item.contentId,
          countryId: item.countryId,
          contentLabel: item.label,
          oldPath: null,
          newPath: item.newPath,
          action: 'created',
        });
      }
      report.changes.push({ label: item.label, oldPath: null, newPath: item.newPath, countryId: item.countryId, type: item.type });
      continue;
    }

    if (item.status === 'move') {
      const override = routeOverride(item);
      await tx.urlRoute.update({
        where: { id: item.routeId! },
        data: {
          contentType: item.type,
          path: item.newPath!,
          pathKey: pathKey(item.newPath!),
          conflictPath: null,
          conflictReason: null,
          mode: item.mode,
          customPath: item.mode === 'CUSTOM' ? item.customPath : null,
          ...meta,
        },
      });
      report.moved += 1;
      report.changes.push({ label: item.label, oldPath: item.oldPath, newPath: item.newPath, countryId: item.countryId, type: item.type });
      history.push({
        ...stamp,
        routeId: item.routeId,
        contentType: item.type,
        contentId: item.contentId,
        countryId: item.countryId,
        contentLabel: item.label,
        oldPath: item.oldPath,
        newPath: item.newPath,
        action: options.action,
        note: options.note ?? null,
      });
      continue;
    }

    if (item.status === 'unchanged') {
      // Touch the row only when something about it actually changed, so a
      // routine save does not invalidate every open preview.
      if (item.stale || routeOverride(item)) {
        await tx.urlRoute.update({
          where: { id: item.routeId! },
          data: {
            contentType: item.type,
            conflictPath: null,
            conflictReason: null,
            mode: item.mode,
            customPath: item.mode === 'CUSTOM' ? item.customPath : null,
            ...meta,
          },
        });
      }
      report.unchanged += 1;
      continue;
    }

    if (item.status === 'conflict' && item.routeId) {
      await tx.urlRoute.update({
        where: { id: item.routeId },
        data: { conflictPath: item.newPath, conflictReason: item.reason ?? null, ...meta },
      });
    }
  }

  // 6. Old public addresses keep working, straight to the new one.
  for (const item of moving) {
    const oldKey = pathKey(item.oldPath!);
    const newPath = item.newPath!;
    const wasPublic = item.isPublic || item.wasPublic;

    if (wasPublic && !finalKeys.has(oldKey)) {
      await tx.redirect.upsert({
        where: { sourceKey: oldKey },
        create: {
          source: item.oldPath!,
          sourceKey: oldKey,
          destination: newPath,
          type: 'PERMANENT',
          origin: 'AUTO',
          targetRouteId: item.routeId,
          targetLabel: item.label,
          isActive: true,
          note: `Kept alive when “${item.label}” moved.`,
          createdById: options.actor?.id ?? null,
        },
        update: {
          destination: newPath,
          type: 'PERMANENT',
          targetRouteId: item.routeId,
          targetLabel: item.label,
          isActive: true,
        },
      });
      report.redirectsCreated += 1;
    }

    // Every earlier address of this content now points straight here.
    await tx.redirect.updateMany({
      where: { targetRouteId: item.routeId! },
      data: { destination: newPath, targetLabel: item.label },
    });
    // Hand-written rules that pointed at the old address are re-aimed too, so
    // no chain is left behind.
    await tx.$executeRaw`
      UPDATE "Redirect"
      SET "destination" = ${newPath}, "targetRouteId" = ${item.routeId}, "updatedAt" = NOW()
      WHERE "targetRouteId" IS NULL
        AND "destination" !~* '^[a-z][a-z0-9+.-]*://'
        AND lower(regexp_replace('/' || btrim(split_part(split_part("destination", '?', 1), '#', 1), '/'), '/+', '/', 'g')) = ${oldKey}
    `;
  }

  // A redirect can never end up pointing at its own source.
  await tx.$executeRaw`
    DELETE FROM "Redirect"
    WHERE "sourceKey" IS NOT NULL
      AND "destination" !~* '^[a-z][a-z0-9+.-]*://'
      AND lower(regexp_replace('/' || btrim(split_part(split_part("destination", '?', 1), '#', 1), '/'), '/+', '/', 'g')) = "sourceKey"
  `;

  if (history.length) await tx.urlChange.createMany({ data: history });
  return report;
}

async function writeContentSlug(tx: Tx, kind: ContentKind, id: string, slug: string) {
  switch (kind) {
    case 'product':
      await tx.product.update({ where: { id }, data: { slug } });
      return;
    case 'page':
      await tx.page.update({ where: { id }, data: { slug } });
      return;
    case 'post':
      await tx.blogPost.update({ where: { id }, data: { slug } });
      return;
    case 'blogCategory':
      await tx.blogCategory.update({ where: { id }, data: { slug } });
      return;
    case 'blogTag':
      await tx.blogTag.update({ where: { id }, data: { slug } });
      return;
  }
}

// ---------------------------------------------------------------------------
// Entry points used by content actions
// ---------------------------------------------------------------------------

/**
 * Brings the routes of some content in line with the database.
 *
 * Called after every content write — create, edit, publish, delete, restore,
 * duplicate, a market added or withdrawn, a country sync. A path that another
 * owner holds is never taken: the route keeps its current address and is
 * listed under Conflicts. Never throws into the caller's save.
 */
export async function syncContentRoutes(
  scope: Scope,
  actor: Actor,
  action = 'renamed',
): Promise<ApplyReport | null> {
  try {
    const report = await withRegistryLock(async (tx) => {
      const ctx = await loadContext(tx);
      const plan = await planRoutes(tx, ctx, scope);
      return applyPlan(tx, ctx, plan, { actor, action, recordCreates: true });
    });
    invalidateLinkIndex();
    revalidateUrlChanges(report.changes);
    return report;
  } catch (error) {
    console.error('[urls] route sync failed', error);
    return null;
  }
}

/**
 * Whether saving `slug` on this content would take an address someone else
 * owns — checked before the content is saved, so the editor sees the problem
 * on the slug field rather than after the fact.
 *
 * `contentId` is null for content that does not exist yet; `countryIds` then
 * names the markets it will be created in.
 */
export async function checkSlugAvailability(input: {
  kind: ContentKind;
  contentId: string | null;
  slug: string;
  countryIds?: string[];
  type?: UrlContentType;
  isHomepage?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await loadContext();
  if (input.contentId) {
    const plan = await prisma.$transaction((tx) =>
      planRoutes(tx, ctx, { kind: input.kind, ids: [input.contentId!] }, {
        slugs: new Map([[contentKey(input.kind, input.contentId!), input.slug]]),
      }),
    );
    const conflict = plan.items.find((i) => i.status === 'conflict');
    return conflict ? { ok: false, message: `${conflict.newPath}: ${conflict.reason}` } : { ok: true };
  }

  // New content: compute where it would land and check each address.
  const type = input.type ?? TYPES_OF_KIND[input.kind][0]!;
  const countryIds = ROOT_ONLY_TYPES.has(type) ? [ctx.defaultMarket.id] : (input.countryIds ?? [ctx.defaultMarket.id]);
  const index = await prisma.$transaction((tx) => loadPathIndex(tx));
  for (const countryId of countryIds) {
    const market = marketOf(ctx, countryId);
    const pattern = effectivePattern(type, ROOT_ONLY_TYPES.has(type) ? null : countryId, ctx.patterns);
    const path = joinMarketPath(
      market.slug,
      routeRelativePath({ type, slug: input.slug, mode: 'PATTERN', customPath: null, pattern: pattern.pattern, isHomepage: input.isHomepage }),
    );
    const reserved = reservedReason(path, { marketPrefixes: ctx.prefixes, marketPrefix: market.slug, isHomepage: input.isHomepage });
    if (reserved) return { ok: false, message: `${path}: ${reserved}` };
    const holder = index.routes.get(pathKey(path));
    if (holder) return { ok: false, message: `${path} is already used by ${describeOwner(holder)}.` };
    const redirect = index.redirects.get(pathKey(path));
    if (redirect) return { ok: false, message: `${path} is already used by a redirect to ${redirect.destination}.` };
  }
  return { ok: true };
}

/** Whether a new slug's address is free — the check `uniqueSlug` loops on. */
export async function isAddressTaken(input: {
  kind: ContentKind;
  slug: string;
  countryIds?: string[];
  type?: UrlContentType;
}): Promise<boolean> {
  const result = await checkSlugAvailability({ ...input, contentId: null });
  return !result.ok;
}

// ---------------------------------------------------------------------------
// Settings and the link cache
// ---------------------------------------------------------------------------

export async function getUrlSettings(db: Tx | typeof prisma = prisma) {
  return db.urlSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

type LinkIndexListener = () => void;
const listeners = new Set<LinkIndexListener>();

/** Lets the link index drop its cache when routes change in this process. */
export function onRoutesChanged(listener: LinkIndexListener) {
  listeners.add(listener);
}

export function invalidateLinkIndex() {
  for (const listener of listeners) listener();
}
