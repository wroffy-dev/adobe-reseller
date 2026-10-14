import { createHash } from 'node:crypto';

/**
 * Text handling for the analyser: normalising copy, matching phrases and
 * measuring how alike two pieces of copy are. Pure and deterministic — the
 * same input always gives the same score.
 */

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

export function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/** Visible text of an HTML fragment. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr|td|th|blockquote)>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower case, accents removed, punctuation to spaces, single-spaced. */
export function normalise(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function words(value: string): string[] {
  const n = normalise(value);
  return n ? n.split(' ') : [];
}

export function wordCount(value: string): number {
  return words(value).length;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'in', 'on', 'of', 'for', 'to', 'at', 'by', 'with', 'from', 'or', 'is', 'are', 'my', 'your', 'our', 'near', 'me',
]);

/** The words of a phrase that carry meaning: "adobe reseller in delhi" → adobe, reseller, delhi. */
export function significantTokens(phrase: string): string[] {
  return words(phrase).filter((w) => !STOPWORDS.has(w));
}

/** Whether `text` contains `phrase` as whole words. */
export function containsPhrase(text: string, phrase: string): boolean {
  const p = normalise(phrase);
  if (!p) return false;
  return ` ${normalise(text)} `.includes(` ${p} `);
}

/** How many times `phrase` occurs in `text` as whole words. */
export function countPhrase(text: string, phrase: string): number {
  const p = normalise(phrase);
  if (!p) return 0;
  const haystack = ` ${normalise(text)} `;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(` ${p} `, from);
    if (at === -1) return count;
    count += 1;
    from = at + p.length + 1;
  }
}

/** Share of the phrase's meaningful words that appear anywhere in `text`. */
export function tokenCoverage(text: string, phrase: string): number {
  const tokens = significantTokens(phrase);
  if (tokens.length === 0) return 0;
  const present = new Set(words(text));
  return tokens.filter((t) => present.has(t) || present.has(`${t}s`) || (t.endsWith('s') && present.has(t.slice(0, -1)))).length / tokens.length;
}

export type MatchLevel = 'exact' | 'partial' | 'none';

/** Exact phrase, most of its words (60%+), or neither. */
export function matchLevel(text: string, phrase: string): MatchLevel {
  if (containsPhrase(text, phrase)) return 'exact';
  return tokenCoverage(text, phrase) >= 0.6 ? 'partial' : 'none';
}

/** A slug read as words: "adobe-acrobat-pro/delhi" → "adobe acrobat pro delhi". */
export function slugWords(slug: string): string {
  return slug.replace(/[/_-]+/g, ' ');
}

/** A short, stable hash for comparing values across rows. */
export function hashKey(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Near-duplicate detection
// ---------------------------------------------------------------------------

export const SIGNATURE_SIZE = 64;
const SHINGLE = 4;

function fnv1a(value: string, seed: number): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A MinHash signature of the copy: 64 numbers whose agreement with another
 * page's approximates how much of the two pages' wording is shared.
 *
 * `replace` names words to neutralise first — a city page passes the city's
 * name, so two pages that differ only by the city they mention come out
 * identical, which is exactly the doorway pattern this is here to catch.
 * Values are stored in a Postgres integer column, so they are kept signed.
 */
export function minhashSignature(text: string, replace: readonly string[] = []): number[] {
  let normalised = ` ${normalise(text)} `;
  for (const term of replace) {
    const t = normalise(term);
    if (t) normalised = normalised.split(` ${t} `).join(' placeholder ');
  }
  const tokens = normalised.trim().split(' ').filter(Boolean);
  if (tokens.length < SHINGLE) return [];
  const shingles = new Set<string>();
  for (let i = 0; i + SHINGLE <= tokens.length; i += 1) shingles.add(tokens.slice(i, i + SHINGLE).join(' '));
  const signature: number[] = [];
  for (let seed = 0; seed < SIGNATURE_SIZE; seed += 1) {
    let min = 0xffffffff;
    for (const shingle of shingles) {
      const h = fnv1a(shingle, seed * 0x9e3779b1);
      if (h < min) min = h;
    }
    signature.push(min | 0);
  }
  return signature;
}

/** Estimated share of wording two signatures have in common, 0–1. */
export function signatureSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== SIGNATURE_SIZE || b.length !== SIGNATURE_SIZE) return 0;
  let same = 0;
  for (let i = 0; i < SIGNATURE_SIZE; i += 1) if (a[i] === b[i]) same += 1;
  return same / SIGNATURE_SIZE;
}
