import type { DuplicateInfo } from './types';
import { SIGNATURE_SIZE, signatureSimilarity } from './text';

/**
 * Finds content in the same market that shares a title, a description, an
 * H1, or most of its copy.
 *
 * Copy similarity uses locality-sensitive hashing over the MinHash
 * signatures: only pairs that agree on a whole band are compared, so a market
 * with thousands of pages costs roughly one pass rather than every pair.
 */

export type Comparable = {
  key: string;
  label: string;
  countryId: string;
  titleKey: string | null;
  descriptionKey: string | null;
  h1Key: string | null;
  signature: readonly number[];
};

const BANDS = 16;
const ROWS = SIGNATURE_SIZE / BANDS;
export const SIMILARITY_THRESHOLD = 0.7;

export function findDuplicates(targets: readonly Comparable[], all: readonly Comparable[]): Map<string, DuplicateInfo> {
  const out = new Map<string, DuplicateInfo>();
  const byTitle = new Map<string, Comparable[]>();
  const byDescription = new Map<string, Comparable[]>();
  const byH1 = new Map<string, Comparable[]>();
  const buckets = new Map<string, Comparable[]>();
  const push = (map: Map<string, Comparable[]>, key: string, row: Comparable) => {
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  };

  for (const row of all) {
    if (row.titleKey) push(byTitle, `${row.countryId}:${row.titleKey}`, row);
    if (row.descriptionKey) push(byDescription, `${row.countryId}:${row.descriptionKey}`, row);
    if (row.h1Key) push(byH1, `${row.countryId}:${row.h1Key}`, row);
    if (row.signature.length === SIGNATURE_SIZE) {
      for (let band = 0; band < BANDS; band += 1) {
        push(buckets, `${row.countryId}:${band}:${row.signature.slice(band * ROWS, (band + 1) * ROWS).join(',')}`, row);
      }
    }
  }

  const others = (list: Comparable[] | undefined, self: Comparable) => (list ?? []).filter((r) => r.key !== self.key).map((r) => r.label);

  for (const target of targets) {
    const similar = new Map<string, { label: string; score: number }>();
    if (target.signature.length === SIGNATURE_SIZE) {
      for (let band = 0; band < BANDS; band += 1) {
        const bucket = buckets.get(`${target.countryId}:${band}:${target.signature.slice(band * ROWS, (band + 1) * ROWS).join(',')}`);
        for (const candidate of bucket ?? []) {
          if (candidate.key === target.key || similar.has(candidate.key)) continue;
          const score = signatureSimilarity(target.signature, candidate.signature);
          if (score >= SIMILARITY_THRESHOLD) similar.set(candidate.key, { label: candidate.label, score });
        }
      }
    }
    out.set(target.key, {
      titleWith: target.titleKey ? others(byTitle.get(`${target.countryId}:${target.titleKey}`), target) : [],
      descriptionWith: target.descriptionKey ? others(byDescription.get(`${target.countryId}:${target.descriptionKey}`), target) : [],
      h1With: target.h1Key ? others(byH1.get(`${target.countryId}:${target.h1Key}`), target) : [],
      similar: [...similar.values()].sort((a, b) => b.score - a.score),
    });
  }
  return out;
}
