# Slug & URL Manager

**Admin → Content & SEO → Slug & URL Manager** (`/admin/slug-manager`). One place
for every public address on the site: products, CMS pages, blog posts, blog
categories and tags, and the generated category/brand landing pages.

- Move `/products/dropbox` to `/dropbox`, or `/dropbox` to `/software/dropbox-business`.
- Give the UAE its own `/ae/dropbox` without renaming the product in India.
- Change a whole URL structure with a pattern (`/{slug}`, `/software/{slug}`).
- Keep every old public address alive with one permanent redirect to the current one.
- See real 404s, broken internal links, conflicts and redirect problems.

Permission: `seo.manage` (the permission that already governs SEO and
redirects), narrowed by the markets a staff member may work in. Global patterns,
registration and switching the registry need access to every market.

---

## Contents

- [How it works](#how-it-works)
- [Precedence](#precedence)
- [The tabs](#the-tabs)
- [Redirects and status codes](#redirects-and-status-codes)
- [What is protected](#what-is-protected)
- [Rollout](#rollout)
- [Recovery](#recovery)
- [Data model](#data-model)
- [Limits](#limits)

---

## How it works

```
                 ┌─────────────────────────────┐
  content save → │  URL registry (UrlRoute)    │ ← manager edits, patterns,
  (every action) │  one row per content ×      │   bulk, CSV, restore
                 │  market, pathKey UNIQUE     │
                 └──────────────┬──────────────┘
                                │
     public request ──▶ resolver (catch-all AND /products, /blog routes)
                        1. registry        → render that content by id
                        2. redirects       → 308/307 before any byte streams
                        3. legacy address  → 308 to the registered one
                        4. 404             → recorded for URL Health
```

- **One authority.** `UrlRoute` maps a normalised public path to a content id and a
  market. Content identity (the product id) is separate from its address, so a
  market can have its own URL for a shared product.
- **One set of rules.** `lib/urls/paths.ts` (pure) decides what is a valid path,
  what a pattern produces and which addresses are reserved; `lib/urls/registry.ts`
  plans and applies changes; everything else calls those two.
- **Nothing bypasses it.** Every content action — create, edit, publish, delete,
  restore, duplicate, market pricing added or withdrawn, country sync, trash,
  market prefix change, backup restore — re-syncs the registry through the same
  planner, and slug edits are checked against every content type before they are
  saved.
- **Links follow.** Cards, menus, breadcrumbs, related content, canonical and
  Open Graph URLs, JSON-LD, sitemaps, hreflang and the market switcher all read
  the registry through `lib/urls/links.ts` — one cached query per request, never
  one per row. Editing a URL needs no rebuild or redeploy.

## Precedence

For each route, the first that applies wins:

1. **The route's own custom path** (per content, per market).
2. **The market's pattern** for that content type.
3. **The global pattern** for that content type.
4. **The built-in default** — exactly the pre-registry address:

| Type | Default |
| --- | --- |
| Product | `/products/{slug}` |
| Page | `/{slug}` (home pages are always the market root) |
| Blog post | `/blog/{slug}` |
| Blog category | `/blog/category/{slug}` |
| Blog tag | `/blog/tag/{slug}` |
| Category page | `/categories/{slug}` |
| Brand page | `/brands/{slug}` |

A global pattern change never moves a URL with a custom path — the preview lists
those as exclusions. The blog is root-only, so blog types have one global pattern.
A market prefix (`/ae`) is always added by the system; patterns never contain it.

Editing a title never changes an address: only the slug field, a custom path or
a pattern does, and each shows its effect before it is applied.

## The tabs

| Tab | What it does |
| --- | --- |
| **All URLs** | Search; filter by type, market, status and default/custom; server-side pagination; select rows (or every match, up to 500); edit one in a side drawer; bulk “Replace prefix” and “Reset to pattern”; CSV export and import. Filters live in the address bar. |
| **URL Patterns** | Global and per-market patterns per type, with the number of URLs following each and a preview of every URL a change would move, its conflicts and its exclusions. |
| **Redirects** | Every redirect, automatic or manual: source, destination, the real status code, hits and last hit, note, on/off, edit, delete. |
| **Conflicts** | Routes that could not take the address their pattern or override asks for, and collisions found at registration. Resolve opens the editor. |
| **History** | Who changed which address, when, from what to what. Restore puts an earlier address back after re-checking it still belongs to the same content. |
| **URL Health** | Register current URLs, switch the registry on/off, recorded 404s (map one to a published destination or dismiss it), broken internal links, redirect problems. |

### The edit drawer

Current URL, content slug, inherited pattern and its source, custom override,
and the final, domain-aware address (the domain comes from `NEXT_PUBLIC_SITE_URL`,
never hardcoded). **Preview & check** validates availability across every content
type, redirect source and reserved route, lists the old → new mapping, the
redirect it will keep, stored links that point at the old address (optional,
exact update) and hand-typed canonical overrides that name it (optional, after
review). **Apply** is refused if anything changed since the preview.

### Bulk and CSV

- Up to 200 URLs apply atomically against the preview shown. Larger jobs run in
  atomic batches of 200, each re-previewed just before it is applied, with a
  progress bar; a failed batch stops the run, earlier batches stay applied, and
  **Resume** continues from the failed one.
- CSV columns: `route_id, content_type, content_id, country_code, name, status,
  mode, current_path, target_path`. Import needs `target_path` and either
  `route_id` or `content_type + content_id + country_code`. Every row is validated
  first and reported as change / unchanged / skipped / invalid / duplicate /
  not-found. A market URL's target must include its prefix (`/ae/…`).

## Redirects and status codes

- A **public** address that moves leaves a permanent redirect behind,
  automatically. Drafts leave none.
- Every earlier address of the content is re-aimed at the newest one, so there is
  never a chain; loops, self-redirects and a redirect over a live address are
  refused. Moving back to an old address removes the redirect that sent it away.
- Next.js `permanentRedirect()` sends **308** and `redirect()` sends **307** —
  that is what the admin shows. Resolution happens in `generateMetadata`, before
  the response streams, so the status and `Location` header are real HTTP.
- The visitor's query string is carried over (UTM tags included); parameters the
  destination sets itself win.
- **Cached permanent redirects:** browsers and search engines remember 308s. After
  changing or deleting one, a visitor who already followed it may keep going to
  the old destination until their cache clears. Use a temporary (307) rule while
  undecided.
- Deleted content keeps its history. Its old address answers 404 and shows up in
  URL Health; map it to a replacement deliberately. Nothing is sent to the home
  page automatically.

## What is protected

- The home page (`/`, `/ae`), `/blog`, every system route (`/admin`, `/api`,
  `/auth`, the sign-in path, `/uploads`, `/media`, `/_next`, `/sitemaps`, dotted
  files …) and every configured market prefix.
- Paths are lower-case `a-z 0-9 - _` segments; `.`/`..`, encoded slashes,
  backslashes, spaces, control characters, queries and fragments are refused;
  upper case is folded.
- Uniqueness: `UrlRoute.pathKey` and `Redirect.sourceKey` are unique indexes,
  and every registry write runs in one transaction holding a Postgres advisory
  lock, so two concurrent saves can never take one address — the second is
  refused with the owner named. A published address is never overwritten or
  silently suffixed.
- Drafts, archived, deleted and withdrawn content has no public route; a route
  whose content is not public renders 404, and legacy addresses only ever resolve
  to published content. A route in an inactive market is not served.
- 404s are recorded as the normalised path only (never the query string) with the
  referring host, capped at 5,000 addresses. Health checks look at stored data
  only; no URL is ever fetched server-side.

## Rollout

The migration is non-destructive and **changes no public address**: the
registry resolver stays off until you switch it on.

```bash
npm run db:deploy          # 1. apply prisma/migrations/20260929100000_url_registry
npm run urls:backfill      # 2. register every current URL (or: URL Health → Register current URLs)
```

3. Review collisions (URL Health / Conflicts). Content collisions are two things
   that share one address today; the one the site actually serves is registered,
   the other keeps being served at its old address outside the registry until
   you give it its own.
4. **URL Health → Switch registry on** (or `npm run urls:backfill -- --activate`,
   which refuses while content collisions remain).
5. Now change URLs. For `/products/x` → `/x` everywhere: **URL Patterns →
   Product → Global → `/{slug}`**, preview, apply.

The backfill is idempotent: run it again after a restore, an import or a deploy.

## Recovery

- **Undo one change:** History → Restore.
- **Undo a pattern:** set it back (or “Use built-in”) — the preview shows the moves.
- **Everything misbehaving:** URL Health → **Switch registry off**. The site goes
  back to its built-in addresses immediately (redirects still apply); custom URLs
  stop resolving until it is switched on again. No data is lost.
- **Backups:** the registry is part of the database dump. A restore re-registers
  URLs afterwards (idempotent), so restoring a pre-registry backup works too.
- **Rolling the code back:** the new tables and columns are additive; older code
  ignores them.

## Data model

| Model | Purpose |
| --- | --- |
| `UrlRoute` | content type + id + market → `path`, unique `pathKey`, mode (pattern/custom), custom path, label/status snapshot, conflict |
| `UrlPattern` | content type + scope (`*` or market) → pattern |
| `UrlChange` | history: actor, time, old/new path, action, batch — no foreign keys, so it outlives content |
| `NotFoundLog` | recorded 404s for URL Health |
| `UrlSettings` | `resolverEnabled`, last registration, collisions |
| `Redirect` (+) | `sourceKey` (unique), `origin`, `targetRouteId`, `targetLabel`, `lastHitAt`, `createdById` |
| `Page` (+) | `taxonomyKind` + `taxonomyId`: category/brand landing pages tied by id, not slug |

Code: `src/lib/urls/` (`paths`, `registry`, `resolver`, `links`, `manager`,
`references`, `backfill`), `src/app/(public)/_surfaces/dispatch.tsx`,
`src/lib/actions/url-manager.ts`, `src/components/admin/urls/`.

## Limits

- Pages pair across markets (hreflang, switcher) by slug; a market page with a
  different slug is its own page. Products pair by id.
- Stored-link updates cover page/product/blog sections, blog post bodies, menu
  links, product and market CTA links and popup CTAs; other free-text fields keep
  working through the redirect.
- The blog archive stays at `/blog`; post, category and tag URLs are configurable.
- There is no separate “SEO Intelligence” module in this codebase; the SEO
  screen, sitemaps and structured data all use the registry.
