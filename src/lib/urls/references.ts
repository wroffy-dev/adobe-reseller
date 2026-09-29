import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { siteUrl } from '@/lib/env';
import { pathKey } from './paths';
import type { Tx } from './registry';

/**
 * Internal links stored in content, found and updated precisely.
 *
 * An editor types "/products/dropbox" into a CTA, a menu or rich text. When
 * that address moves, the redirect keeps the link working, but the link
 * itself should point at the new address. This finds exact references — a
 * whole link value, or an href attribute — and replaces those only. It never
 * does a broad text replace: "/products/dropbox" inside "/products/dropbox-2"
 * or in body prose is left alone.
 *
 * Market scoping: content typed in a market's own pages is root-relative and
 * localised when rendered, so "/contact" on a UAE page means "/ae/contact".
 * A market-relative link is therefore matched only in content owned by the
 * same market; a full "/ae/…" link is matched everywhere.
 */

export type LinkChange = {
  /** The full old and new public paths, prefix included. */
  oldPath: string;
  newPath: string;
  /** The market's prefix ("" for the root market). */
  marketPrefix: string;
  countryId: string;
};

export type ReferenceHit = {
  table: string;
  id: string;
  label: string;
  field: string;
  count: number;
  /** Where to edit it by hand. */
  adminHref: string | null;
  countryId: string | null;
};

/** Candidate spellings of an address as an editor might have stored it. */
function forms(change: LinkChange, owned: boolean): Array<{ from: string; to: string }> {
  const origin = siteUrl();
  const out = [
    { from: change.oldPath, to: change.newPath },
    { from: `${origin}${change.oldPath}`, to: `${origin}${change.newPath}` },
  ];
  if (owned && change.marketPrefix) {
    const strip = (path: string) => path.replace(new RegExp(`^/${change.marketPrefix}(?=/|$)`), '') || '/';
    out.push({ from: strip(change.oldPath), to: strip(change.newPath) });
  }
  return out.filter((f) => f.from !== '/' && f.from !== f.to);
}

import { replaceInHtml, replaceInJson, replaceLinkValue } from './references-pure';

export { replaceInHtml, replaceInJson, replaceLinkValue };

const LIMIT = 200;

type Source = {
  table: string;
  field: string;
  kind: 'json' | 'html' | 'url';
  /** Rows whose text contains the needle, with their owning market. */
  load: (db: Tx | typeof prisma, needle: string) => Promise<Array<{ id: string; value: unknown; label: string; countryId: string | null; adminHref: string | null }>>;
  save: (db: Tx, id: string, value: unknown) => Promise<unknown>;
};

const like = (needle: string) => `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const SOURCES: Source[] = [
  {
    table: 'Page section',
    field: 'content',
    kind: 'json',
    load: async (db, needle) => {
      const rows = await db.$queryRaw<Array<{ id: string; content: unknown; title: string; countryId: string; pageId: string }>>`
        SELECT s."id", s."content", p."title", p."countryId", p."id" AS "pageId"
        FROM "PageSection" s JOIN "Page" p ON p."id" = s."pageId"
        WHERE p."deletedAt" IS NULL AND s."content"::text ILIKE ${like(needle)}
        LIMIT ${LIMIT}`;
      return rows.map((r) => ({ id: r.id, value: r.content, label: r.title, countryId: r.countryId, adminHref: `/admin/pages/${r.pageId}` }));
    },
    save: (db, id, value) => db.pageSection.update({ where: { id }, data: { content: value as Prisma.InputJsonValue } }),
  },
  {
    table: 'Product section',
    field: 'content',
    kind: 'json',
    load: async (db, needle) => {
      const rows = await db.$queryRaw<Array<{ id: string; content: unknown; name: string; productId: string }>>`
        SELECT s."id", s."content", p."name", p."id" AS "productId"
        FROM "ProductSection" s JOIN "Product" p ON p."id" = s."productId"
        WHERE p."deletedAt" IS NULL AND s."content"::text ILIKE ${like(needle)}
        LIMIT ${LIMIT}`;
      return rows.map((r) => ({ id: r.id, value: r.content, label: r.name, countryId: null, adminHref: `/admin/products/${r.productId}/layout` }));
    },
    save: (db, id, value) => db.productSection.update({ where: { id }, data: { content: value as Prisma.InputJsonValue } }),
  },
  {
    table: 'Blog section',
    field: 'content',
    kind: 'json',
    load: async (db, needle) => {
      const rows = await db.$queryRaw<Array<{ id: string; content: unknown; name: string | null; blockType: string }>>`
        SELECT s."id", s."content", s."name", s."blockType"
        FROM "BlogSection" s
        WHERE s."content"::text ILIKE ${like(needle)}
        LIMIT ${LIMIT}`;
      return rows.map((r) => ({ id: r.id, value: r.content, label: r.name || r.blockType, countryId: null, adminHref: '/admin/blog/layout' }));
    },
    save: (db, id, value) => db.blogSection.update({ where: { id }, data: { content: value as Prisma.InputJsonValue } }),
  },
  {
    table: 'Blog post',
    field: 'content',
    kind: 'html',
    load: async (db, needle) => {
      const rows = await db.blogPost.findMany({
        where: { deletedAt: null, content: { contains: needle } },
        select: { id: true, content: true, title: true, countryId: true },
        take: LIMIT,
      });
      return rows.map((r) => ({ id: r.id, value: r.content, label: r.title, countryId: r.countryId, adminHref: `/admin/blog/${r.id}` }));
    },
    save: (db, id, value) => db.blogPost.update({ where: { id }, data: { content: String(value) } }),
  },
  {
    table: 'Menu item',
    field: 'url',
    kind: 'url',
    load: async (db, needle) => {
      const rows = await db.navigationItem.findMany({
        where: { url: { contains: needle } },
        select: { id: true, url: true, label: true, navigation: { select: { countryId: true, id: true } } },
        take: LIMIT,
      });
      return rows.map((r) => ({
        id: r.id,
        value: r.url,
        label: r.label,
        countryId: r.navigation?.countryId ?? null,
        adminHref: '/admin/navigation',
      }));
    },
    save: (db, id, value) => db.navigationItem.update({ where: { id }, data: { url: String(value) } }),
  },
  {
    table: 'Product',
    field: 'ctaUrl',
    kind: 'url',
    load: async (db, needle) => {
      const rows = await db.product.findMany({
        where: { deletedAt: null, ctaUrl: { contains: needle } },
        select: { id: true, ctaUrl: true, name: true },
        take: LIMIT,
      });
      return rows.map((r) => ({ id: r.id, value: r.ctaUrl, label: r.name, countryId: null, adminHref: `/admin/products/${r.id}` }));
    },
    save: (db, id, value) => db.product.update({ where: { id }, data: { ctaUrl: String(value) } }),
  },
  {
    table: 'Product in market',
    field: 'ctaUrl',
    kind: 'url',
    load: async (db, needle) => {
      const rows = await db.productCountry.findMany({
        where: { deletedAt: null, ctaUrl: { contains: needle } },
        select: { id: true, ctaUrl: true, countryId: true, product: { select: { id: true, name: true } } },
        take: LIMIT,
      });
      return rows.map((r) => ({ id: r.id, value: r.ctaUrl, label: r.product.name, countryId: r.countryId, adminHref: `/admin/products/${r.product.id}` }));
    },
    save: (db, id, value) => db.productCountry.update({ where: { id }, data: { ctaUrl: String(value) } }),
  },
  {
    table: 'Popup',
    field: 'ctaUrl',
    kind: 'url',
    load: async (db, needle) => {
      const rows = await db.popup.findMany({
        where: { deletedAt: null, ctaUrl: { contains: needle } },
        select: { id: true, ctaUrl: true, name: true, countryId: true },
        take: LIMIT,
      });
      return rows.map((r) => ({ id: r.id, value: r.ctaUrl, label: r.name, countryId: r.countryId, adminHref: '/admin/popups' }));
    },
    save: (db, id, value) => db.popup.update({ where: { id }, data: { ctaUrl: String(value) } }),
  },
];

function apply(kind: Source['kind'], value: unknown, from: string, to: string): { value: unknown; count: number } {
  if (kind === 'json') return replaceInJson(value, from, to);
  if (kind === 'html') {
    const result = replaceInHtml(String(value ?? ''), from, to);
    return { value: result.html, count: result.count };
  }
  const replaced = replaceLinkValue(String(value ?? ''), from, to);
  return replaced === null ? { value, count: 0 } : { value: replaced, count: 1 };
}

/**
 * Finds content that links to the old addresses. Bounded: at most LIMIT rows
 * per source and address, read with one query each — never one per row.
 */
export async function findReferences(changes: LinkChange[], db: Tx | typeof prisma = prisma): Promise<ReferenceHit[]> {
  const hits = new Map<string, ReferenceHit>();
  for (const change of changes.slice(0, 50)) {
    for (const source of SOURCES) {
      for (const form of forms(change, true)) {
        const rows = await source.load(db, form.from);
        for (const row of rows) {
          // A market-relative link only means this address inside its market.
          const isRelative = change.marketPrefix && !form.from.startsWith(`/${change.marketPrefix}`) && !form.from.startsWith('http');
          if (isRelative && row.countryId !== change.countryId) continue;
          const { count } = apply(source.kind, row.value, form.from, form.to);
          if (count === 0) continue;
          const key = `${source.table}|${row.id}`;
          const hit = hits.get(key);
          if (hit) hit.count += count;
          else
            hits.set(key, {
              table: source.table,
              id: row.id,
              label: row.label,
              field: source.field,
              count,
              adminHref: row.adminHref,
              countryId: row.countryId,
            });
        }
      }
    }
  }
  return [...hits.values()];
}

/** Rewrites the references found by `findReferences`, inside the caller's transaction. */
export async function updateReferences(tx: Tx, changes: LinkChange[]): Promise<number> {
  let total = 0;
  for (const change of changes.slice(0, 50)) {
    for (const source of SOURCES) {
      for (const form of forms(change, true)) {
        const rows = await source.load(tx, form.from);
        for (const row of rows) {
          const isRelative = change.marketPrefix && !form.from.startsWith(`/${change.marketPrefix}`) && !form.from.startsWith('http');
          if (isRelative && row.countryId !== change.countryId) continue;
          const { value, count } = apply(source.kind, row.value, form.from, form.to);
          if (count === 0) continue;
          await source.save(tx, row.id, value);
          total += count;
        }
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Canonical overrides
// ---------------------------------------------------------------------------

export type CanonicalHit = { table: string; id: string; label: string; canonicalUrl: string; adminHref: string | null };

/** Explicit canonical URLs that still name an old address — listed for review, never rewritten blindly. */
export async function findCanonicalOverrides(oldPaths: string[], db: Tx | typeof prisma = prisma): Promise<CanonicalHit[]> {
  if (oldPaths.length === 0) return [];
  const origin = siteUrl();
  const keys = new Set(oldPaths.map((p) => pathKey(p)));
  const matches = (value: string | null) => {
    if (!value) return false;
    const path = value.startsWith(origin) ? value.slice(origin.length) || '/' : value.startsWith('/') ? value : null;
    return path !== null && keys.has(pathKey(path));
  };
  const [pages, products, markets, posts] = await Promise.all([
    db.page.findMany({ where: { deletedAt: null, canonicalUrl: { not: null } }, select: { id: true, title: true, canonicalUrl: true }, take: 2000 }),
    db.product.findMany({ where: { deletedAt: null, canonicalUrl: { not: null } }, select: { id: true, name: true, canonicalUrl: true }, take: 2000 }),
    db.productCountry.findMany({ where: { deletedAt: null, canonicalUrl: { not: null } }, select: { id: true, canonicalUrl: true, product: { select: { id: true, name: true } } }, take: 2000 }),
    db.blogPost.findMany({ where: { deletedAt: null, canonicalUrl: { not: null } }, select: { id: true, title: true, canonicalUrl: true }, take: 2000 }),
  ]);
  return [
    ...pages.filter((r) => matches(r.canonicalUrl)).map((r) => ({ table: 'Page', id: r.id, label: r.title, canonicalUrl: r.canonicalUrl!, adminHref: `/admin/pages/${r.id}` })),
    ...products.filter((r) => matches(r.canonicalUrl)).map((r) => ({ table: 'Product', id: r.id, label: r.name, canonicalUrl: r.canonicalUrl!, adminHref: `/admin/products/${r.id}` })),
    ...markets.filter((r) => matches(r.canonicalUrl)).map((r) => ({ table: 'Product in market', id: r.id, label: r.product.name, canonicalUrl: r.canonicalUrl!, adminHref: `/admin/products/${r.product.id}` })),
    ...posts.filter((r) => matches(r.canonicalUrl)).map((r) => ({ table: 'Blog post', id: r.id, label: r.title, canonicalUrl: r.canonicalUrl!, adminHref: `/admin/blog/${r.id}` })),
  ];
}

/** Points reviewed canonical overrides at the new address (same form: absolute or relative). */
export async function updateCanonicalOverrides(tx: Tx, changes: Array<{ oldPath: string; newPath: string }>): Promise<number> {
  const origin = siteUrl();
  const hits = await findCanonicalOverrides(changes.map((c) => c.oldPath), tx);
  let count = 0;
  for (const hit of hits) {
    const absolute = hit.canonicalUrl.startsWith(origin);
    const path = absolute ? hit.canonicalUrl.slice(origin.length) || '/' : hit.canonicalUrl;
    const change = changes.find((c) => pathKey(c.oldPath) === pathKey(path));
    if (!change) continue;
    const next = absolute ? `${origin}${change.newPath}` : change.newPath;
    const data = { canonicalUrl: next };
    if (hit.table === 'Page') await tx.page.update({ where: { id: hit.id }, data });
    else if (hit.table === 'Product') await tx.product.update({ where: { id: hit.id }, data });
    else if (hit.table === 'Product in market') await tx.productCountry.update({ where: { id: hit.id }, data });
    else if (hit.table === 'Blog post') await tx.blogPost.update({ where: { id: hit.id }, data });
    count += 1;
  }
  return count;
}
