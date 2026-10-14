/**
 * Whether a compiled robots.txt disallows a path for general crawlers.
 *
 * Reads the `User-agent: *` group of the file the site actually serves
 * (compiled by `compileRobots`), and applies the standard rule: the longest
 * matching Allow or Disallow wins, Allow winning a tie.
 */
export function robotsDisallows(body: string, path: string): boolean {
  const rules: Array<{ allow: boolean; value: string }> = [];
  let inStar = false;
  let sawRule = false;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [field = '', ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const key = field.trim().toLowerCase();
    if (key === 'user-agent') {
      if (sawRule) {
        inStar = false;
        sawRule = false;
      }
      if (value === '*') inStar = true;
      continue;
    }
    if (key === 'allow' || key === 'disallow') {
      sawRule = true;
      if (inStar && value) rules.push({ allow: key === 'allow', value });
    }
  }

  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules) {
    const pattern = rule.value.endsWith('$') ? rule.value.slice(0, -1) : rule.value;
    const exact = rule.value.endsWith('$');
    const regex = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${exact ? '$' : ''}`);
    if (!regex.test(path)) continue;
    const length = rule.value.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? !best.allow : false;
}
