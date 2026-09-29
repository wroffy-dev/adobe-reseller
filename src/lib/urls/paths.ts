import { isReservedSegment } from '@/lib/country/routing';

/**
 * The URL policy, as pure functions.
 *
 * Everything that decides whether an address is valid, what it normalises to,
 * how a pattern turns a slug into a path and which addresses are off limits
 * lives here, free of Prisma and Next.js, so the admin, the resolver, the
 * backfill and the tests all apply exactly the same rules.
 */

export const URL_CONTENT_TYPES = [
  'PRODUCT',
  'PAGE',
  'BLOG_POST',
  'BLOG_CATEGORY',
  'BLOG_TAG',
  'CATEGORY_PAGE',
  'BRAND_PAGE',
] as const;

export type UrlContentType = (typeof URL_CONTENT_TYPES)[number];

export const URL_CONTENT_LABELS: Record<UrlContentType, string> = {
  PRODUCT: 'Product',
  PAGE: 'Page',
  BLOG_POST: 'Blog post',
  BLOG_CATEGORY: 'Blog category',
  BLOG_TAG: 'Blog tag',
  CATEGORY_PAGE: 'Category page',
  BRAND_PAGE: 'Brand page',
};

/**
 * The built-in structure of every type — exactly the addresses the site
 * served before the registry existed, so registering current content changes
 * no public URL.
 */
export const DEFAULT_PATTERNS: Record<UrlContentType, string> = {
  PRODUCT: '/products/{slug}',
  PAGE: '/{slug}',
  BLOG_POST: '/blog/{slug}',
  BLOG_CATEGORY: '/blog/category/{slug}',
  BLOG_TAG: '/blog/tag/{slug}',
  CATEGORY_PAGE: '/categories/{slug}',
  BRAND_PAGE: '/brands/{slug}',
};

/**
 * Types that exist once, at the site root. The blog is not per-market: one
 * article, one address, whichever market links to it.
 */
export const ROOT_ONLY_TYPES: ReadonlySet<UrlContentType> = new Set([
  'BLOG_POST',
  'BLOG_CATEGORY',
  'BLOG_TAG',
]);

export const SLUG_TOKEN = '{slug}';

/** Addresses no content may take, beyond the reserved first segments. */
export const RESERVED_PATHS: ReadonlySet<string> = new Set(['/blog']);

const SEGMENT = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const MAX_PATH_LENGTH = 300;
const MAX_DEPTH = 8;

export type PathResult = { ok: true; path: string } | { ok: false; error: string };

function splitRaw(value: string): string[] {
  return value.split('/').filter((segment) => segment.length > 0);
}

/** Decodes one segment, or null when it is not valid percent-encoding. */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Validates and normalises an address typed by a person.
 *
 * Accepts "software/dropbox", "/Software/Dropbox/" or "%2Fsoftware" alike and
 * returns "/software/dropbox". Refuses anything that is not a plain site path:
 * external URLs, query strings, fragments, backslashes, whitespace, control
 * characters, dot segments (traversal) and characters outside the slug
 * alphabet. Upper case is folded to lower case rather than refused, because
 * the site's slugs are lower case and "/Dropbox" can only mean "/dropbox".
 */
export function normalizeInputPath(input: string): PathResult {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, error: 'Enter a path.' };
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
    return { ok: false, error: 'Use a path on this site, not a full URL.' };
  }
  if (raw.includes('?') || raw.includes('#')) {
    return { ok: false, error: 'A path cannot contain a query string or #fragment.' };
  }
  if (raw.includes('\\')) return { ok: false, error: 'Use forward slashes (/) only.' };

  const segments: string[] = [];
  for (const piece of splitRaw(raw)) {
    const decoded = decodeSegment(piece);
    if (decoded === null) return { ok: false, error: `“${piece}” is not valid URL encoding.` };
    // A decoded slash would smuggle a separator past the split above.
    if (decoded.includes('/') || decoded.includes('\\')) {
      return { ok: false, error: 'Encoded slashes are not allowed.' };
    }
    if (decoded === '.' || decoded === '..') {
      return { ok: false, error: 'Dot segments (. and ..) are not allowed.' };
    }
    // eslint-disable-next-line no-control-regex
    if (/[\s\u0000-\u001f\u007f]/.test(decoded)) {
      return { ok: false, error: 'A path cannot contain spaces or control characters.' };
    }
    const lower = decoded.toLowerCase();
    if (!SEGMENT.test(lower)) {
      return {
        ok: false,
        error: `“${decoded}” may only use letters, numbers, hyphens and underscores, and must start and end with a letter or number.`,
      };
    }
    segments.push(lower);
  }

  if (segments.length > MAX_DEPTH) {
    return { ok: false, error: `A path can be at most ${MAX_DEPTH} levels deep.` };
  }
  const path = segments.length > 0 ? `/${segments.join('/')}` : '/';
  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, error: `A path can be at most ${MAX_PATH_LENGTH} characters.` };
  }
  return { ok: true, path };
}

/**
 * The comparison key of any path — typed, stored or requested.
 *
 * Lenient where `normalizeInputPath` is strict: it never refuses, because it is
 * also used on whatever a visitor's browser asks for. Two addresses that
 * differ only in case, repeated slashes or a trailing slash share a key.
 */
export function pathKey(path: string): string {
  const withoutQuery = String(path ?? '').split(/[?#]/)[0] ?? '';
  const segments = splitRaw(withoutQuery).map((segment) => {
    const decoded = decodeSegment(segment);
    return (decoded ?? segment).toLowerCase();
  });
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

/** "/ae" + "/dropbox" → "/ae/dropbox"; "" + "/" → "/". */
export function joinMarketPath(prefix: string, relative: string): string {
  const head = prefix.replace(/^\/+|\/+$/g, '');
  const rest = splitRaw(relative);
  const all = head ? [head, ...rest] : rest;
  return all.length > 0 ? `/${all.join('/')}` : '/';
}

/** The market-relative part of a full path, given the market's prefix. */
export function stripMarketPrefix(prefix: string, fullPath: string): string {
  const head = prefix.replace(/^\/+|\/+$/g, '');
  const segments = splitRaw(fullPath);
  if (head && segments[0] === head) segments.shift();
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

export type PatternResult = { ok: true; pattern: string } | { ok: false; error: string };

/**
 * Validates a URL structure such as "/{slug}" or "/software/{slug}".
 *
 * Literal segments follow the slug alphabet, `{slug}` appears exactly once and
 * is the last segment — which is what lets a nested page slug
 * ("solutions/backup") fill it — and the first literal segment may not be a
 * system route.
 */
export function validatePattern(input: string): PatternResult {
  const raw = String(input ?? '').trim();
  if (!raw.startsWith('/')) return { ok: false, error: 'A pattern starts with “/”.' };
  if (/[?#\\]/.test(raw)) return { ok: false, error: 'A pattern is a path only.' };

  const segments = splitRaw(raw).map((segment) => segment.toLowerCase());
  const tokens = segments.filter((segment) => segment === SLUG_TOKEN);
  if (tokens.length !== 1) {
    return { ok: false, error: 'A pattern must contain {slug} exactly once.' };
  }
  if (segments[segments.length - 1] !== SLUG_TOKEN) {
    return { ok: false, error: '{slug} must be the last part of the pattern.' };
  }
  if (segments.length > MAX_DEPTH) {
    return { ok: false, error: `A pattern can be at most ${MAX_DEPTH} levels deep.` };
  }
  for (const segment of segments.slice(0, -1)) {
    if (segment.includes('{') || segment.includes('}')) {
      return { ok: false, error: `Unknown placeholder “${segment}”. Only {slug} is supported.` };
    }
    if (!SEGMENT.test(segment)) {
      return { ok: false, error: `“${segment}” may only use letters, numbers, hyphens and underscores.` };
    }
  }
  const first = segments[0];
  if (first && first !== SLUG_TOKEN && isReservedSegment(first)) {
    return { ok: false, error: `“/${first}” is a system route and cannot start a pattern.` };
  }
  return { ok: true, pattern: `/${segments.join('/')}` };
}

/** Fills a validated pattern with a slug. A nested page slug fills it whole. */
export function applyPattern(pattern: string, slug: string): string {
  const cleanSlug = splitRaw(slug).join('/');
  const filled = pattern.replace(SLUG_TOKEN, cleanSlug);
  return pathKey(filled) === '/' ? '/' : `/${splitRaw(filled).join('/')}`;
}

/**
 * The pattern a route follows, by precedence: the market's own pattern, then
 * the global one, then the built-in default. (A route's custom path, when it
 * has one, beats all three and is applied by `routeRelativePath`.)
 */
export function effectivePattern(
  type: UrlContentType,
  countryId: string | null,
  patterns: ReadonlyArray<{ contentType: string; countryId: string | null; pattern: string }>,
): { pattern: string; source: 'country' | 'global' | 'default' } {
  if (countryId && !ROOT_ONLY_TYPES.has(type)) {
    const local = patterns.find((p) => p.contentType === type && p.countryId === countryId);
    if (local) return { pattern: local.pattern, source: 'country' };
  }
  const global = patterns.find((p) => p.contentType === type && p.countryId === null);
  if (global) return { pattern: global.pattern, source: 'global' };
  return { pattern: DEFAULT_PATTERNS[type], source: 'default' };
}

/**
 * The market-relative path of one route.
 *
 * The homepage is always "/", whatever the page pattern says: a market's home
 * is its root, and no structure setting can move it.
 */
export function routeRelativePath(input: {
  type: UrlContentType;
  slug: string;
  mode: 'PATTERN' | 'CUSTOM';
  customPath: string | null;
  pattern: string;
  isHomepage?: boolean;
}): string {
  if (input.type === 'PAGE' && (input.isHomepage || input.slug === '')) return '/';
  if (input.mode === 'CUSTOM' && input.customPath) return pathKey(input.customPath);
  return applyPattern(input.pattern, input.slug);
}

/**
 * Why a full public path may not be used, or null when it may.
 *
 * `marketPrefixes` are the configured market slugs. A root-market address
 * whose first segment is a market prefix would be swallowed by that market,
 * and one starting with a system route would never reach the site at all.
 */
export function reservedReason(
  fullPath: string,
  options: { marketPrefixes: readonly string[]; marketPrefix: string; isHomepage?: boolean },
): string | null {
  const key = pathKey(fullPath);
  const relative = stripMarketPrefix(options.marketPrefix, key);

  if (relative === '/' && !options.isHomepage) {
    return options.marketPrefix
      ? `/${options.marketPrefix} is this market’s home page.`
      : '/ is the home page.';
  }
  if (!options.marketPrefix && RESERVED_PATHS.has(key)) return `${key} is the blog archive.`;

  const segments = splitRaw(relative);
  const first = segments[0];
  if (first && isReservedSegment(first)) return `/${first} is a system route.`;
  if (!options.marketPrefix && first && options.marketPrefixes.includes(first)) {
    return `/${first} is a market prefix.`;
  }
  return null;
}

/**
 * The destination of a redirect with the visitor's query string carried over.
 *
 * Campaign parameters must survive a moved URL, or every UTM link printed
 * before the move loses its attribution. Parameters the destination already
 * sets win; everything else from the request is appended.
 */
export function withQuery(destination: string, search: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined): string {
  if (!search) return destination;
  const incoming =
    search instanceof URLSearchParams
      ? search
      : (() => {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(search)) {
            if (value === undefined) continue;
            for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
          }
          return params;
        })();
  if ([...incoming.keys()].length === 0) return destination;

  const [beforeHash, hash = ''] = destination.split('#');
  const [path = '', query = ''] = (beforeHash ?? '').split('?');
  const merged = new URLSearchParams(query);
  for (const [key, value] of incoming) {
    if (!merged.has(key)) merged.append(key, value);
  }
  const qs = merged.toString();
  return `${path}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
}

/** 308 and 307 are what Next's permanentRedirect()/redirect() actually send. */
export function redirectStatusLabel(type: 'PERMANENT' | 'TEMPORARY'): string {
  return type === 'PERMANENT' ? '308 Permanent' : '307 Temporary';
}

/**
 * Whether a redirect destination is on this site. External destinations are
 * allowed for manual rules but never fetched or followed server-side.
 */
export function isExternalDestination(destination: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(destination.trim()) || destination.trim().startsWith('//');
}

/**
 * Follows a redirect graph from `start` and returns the final destination, or
 * a cycle error. `next` looks up one hop. Pure so it can be tested.
 */
export function followRedirects(
  start: string,
  next: (key: string) => string | null,
  maxHops = 20,
): { ok: true; destination: string; hops: number } | { ok: false; cycle: string[] } {
  const seen: string[] = [pathKey(start)];
  let current = start;
  for (let hop = 0; hop < maxHops; hop += 1) {
    if (isExternalDestination(current)) return { ok: true, destination: current, hops: hop };
    const target = next(pathKey(current));
    if (!target) return { ok: true, destination: current, hops: hop };
    const key = pathKey(target);
    if (seen.includes(key)) return { ok: false, cycle: [...seen, key] };
    seen.push(key);
    current = target;
  }
  return { ok: false, cycle: seen };
}
