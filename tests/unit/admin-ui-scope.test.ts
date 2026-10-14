import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ADMIN_THEME_SCRIPT } from '@/components/admin/theme';

const css = readFileSync(path.resolve(import.meta.dirname, '../../src/app/admin/admin-ui.css'), 'utf8');

/** Every selector in the stylesheet, with comments and at-rule preludes removed. */
function selectors(source: string): string[] {
  const out: string[] = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const prelude = match[1]!.trim();
    if (!prelude || prelude.startsWith('@')) continue;
    // Declarations inside a rule body are never followed by "{", so anything
    // here is a selector list.
    out.push(...splitTopLevel(prelude));
  }
  return out;
}

/** Splits a selector list on its top-level commas, not those inside :is(…). */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of list) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

describe('admin UI stylesheet', () => {
  const all = selectors(css);

  it('scopes every rule to the admin, so the public website cannot change', () => {
    // The only unscoped rules: capturing the site's own brand values (variable
    // definitions only), and the admin's base font size, which needs the admin
    // class on <body> to match at all.
    const allowed = new Set([':root', ':root:has(body.admin-ui)']);
    const unscoped = all.filter((s) => !s.includes('.admin-ui') && !allowed.has(s));
    expect(unscoped).toEqual([]);
    expect(all.length).toBeGreaterThan(50);
  });

  it('keeps the unscoped :root rule to variable definitions', () => {
    const rootBlock = /:root\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))![1]!;
    const declarations = rootBlock.split(';').map((d) => d.trim()).filter(Boolean);
    expect(declarations.every((d) => d.startsWith('--'))).toBe(true);
  });

  it('writes every dark rule against both the theme attribute and the admin scope', () => {
    const dark = all.filter((s) => s.includes('data-admin-theme'));
    expect(dark.length).toBeGreaterThan(10);
    expect(dark.every((s) => s.startsWith(":root[data-admin-theme='dark'] .admin-ui"))).toBe(true);
  });

  it('defines the glass family with fallbacks', () => {
    for (const name of ['glass-bar', 'glass-rail', 'glass-card', 'glass-menu', 'glass-panel']) {
      expect(css).toContain(`.admin-ui .${name}`);
    }
    expect(css).toContain('@supports not ((backdrop-filter: blur(1px))');
    expect(css).toContain('prefers-reduced-transparency: reduce');
  });
});

describe('admin theme script', () => {
  it('reads the stored preference, defaults to system and sets the attribute before paint', () => {
    expect(ADMIN_THEME_SCRIPT).toContain("localStorage.getItem('admin:theme')||'system'");
    expect(ADMIN_THEME_SCRIPT).toContain('prefers-color-scheme: dark');
    expect(ADMIN_THEME_SCRIPT).toContain("setAttribute('data-admin-theme'");
  });

  it('applies the theme for every preference', () => {
    const run = (stored: string | null, prefersDark: boolean) => {
      const attributes: Record<string, string> = {};
      const fn = new Function('localStorage', 'matchMedia', 'document', ADMIN_THEME_SCRIPT);
      fn(
        { getItem: () => stored },
        () => ({ matches: prefersDark }),
        { documentElement: { setAttribute: (k: string, v: string) => (attributes[k] = v) } },
      );
      return attributes['data-admin-theme'];
    };
    expect(run(null, true)).toBe('dark');
    expect(run(null, false)).toBe('light');
    expect(run('system', true)).toBe('dark');
    expect(run('light', true)).toBe('light');
    expect(run('dark', false)).toBe('dark');
  });
});
