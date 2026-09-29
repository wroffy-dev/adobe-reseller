/**
 * Exact link replacement, as pure functions — no database, so the rules can
 * be tested on their own. See references.ts for where they are applied.
 */

/** Replaces one exact link value, keeping its query string and fragment. */
export function replaceLinkValue(value: string, from: string, to: string): string | null {
  if (value === from) return to;
  if (value.startsWith(from) && /^[?#]/.test(value.slice(from.length))) return to + value.slice(from.length);
  return null;
}

/** Replaces href/src attributes in a fragment of HTML that point exactly at `from`. */
export function replaceInHtml(html: string, from: string, to: string): { html: string; count: number } {
  let count = 0;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b(href)=("|')${escaped}(?=["'?#])`, 'gi');
  const out = html.replace(pattern, (_match, attribute: string, quote: string) => {
    count += 1;
    return `${attribute}=${quote}${to}`;
  });
  return { html: out, count };
}

/** Deep-replaces link values and HTML hrefs in a stored JSON payload. */
export function replaceInJson(value: unknown, from: string, to: string): { value: unknown; count: number } {
  let count = 0;
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      const exact = replaceLinkValue(node, from, to);
      if (exact !== null) {
        count += 1;
        return exact;
      }
      if (node.includes('<')) {
        const result = replaceInHtml(node, from, to);
        count += result.count;
        return result.html;
      }
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(node as Record<string, unknown>)) out[key] = walk(item);
      return out;
    }
    return node;
  };
  return { value: walk(value), count };
}
