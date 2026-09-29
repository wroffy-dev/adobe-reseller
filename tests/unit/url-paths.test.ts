import { describe, it, expect } from 'vitest';
import {
  applyPattern,
  effectivePattern,
  followRedirects,
  joinMarketPath,
  normalizeInputPath,
  pathKey,
  redirectStatusLabel,
  reservedReason,
  routeRelativePath,
  stripMarketPrefix,
  validatePattern,
  withQuery,
} from '@/lib/urls/paths';
import { parseCsv, toCsv } from '@/lib/utils/csv';
import { replaceInHtml, replaceInJson, replaceLinkValue } from '@/lib/urls/references-pure';

/** The URL policy the registry, the resolver and the admin all share. */

describe('normalizeInputPath', () => {
  it('normalises separators, case and slashes', () => {
    expect(normalizeInputPath('Software//Dropbox/')).toEqual({ ok: true, path: '/software/dropbox' });
    expect(normalizeInputPath('/dropbox')).toEqual({ ok: true, path: '/dropbox' });
    expect(normalizeInputPath('%64ropbox')).toEqual({ ok: true, path: '/dropbox' });
  });

  it('refuses traversal, encoded separators and anything that is not a site path', () => {
    for (const bad of ['/a/../b', '/./x', '/a%2Fb', 'https://evil.test/x', '//evil.test', '/x?utm=1', '/x#top', '/a\\b', '/has space', '/café', '/-lead', '/%zz']) {
      expect(normalizeInputPath(bad).ok, bad).toBe(false);
    }
  });
});

describe('pathKey', () => {
  it('treats case, trailing and repeated slashes and queries as one address', () => {
    expect(pathKey('/Dropbox/')).toBe('/dropbox');
    expect(pathKey('dropbox?utm_source=x')).toBe('/dropbox');
    expect(pathKey('//ae//dropbox')).toBe('/ae/dropbox');
    expect(pathKey('')).toBe('/');
  });
});

describe('patterns', () => {
  it('accepts {slug} once, last', () => {
    expect(validatePattern('/{slug}')).toEqual({ ok: true, pattern: '/{slug}' });
    expect(validatePattern('/Software/{slug}')).toEqual({ ok: true, pattern: '/software/{slug}' });
    expect(validatePattern('/{slug}/x').ok).toBe(false);
    expect(validatePattern('/a/{slug}/{slug}').ok).toBe(false);
    expect(validatePattern('/software').ok).toBe(false);
    expect(validatePattern('/admin/{slug}').ok).toBe(false);
    expect(validatePattern('/{id}/{slug}').ok).toBe(false);
    expect(validatePattern('software/{slug}').ok).toBe(false);
  });

  it('fills a pattern, nested page slugs included', () => {
    expect(applyPattern('/products/{slug}', 'dropbox')).toBe('/products/dropbox');
    expect(applyPattern('/{slug}', 'solutions/backup')).toBe('/solutions/backup');
    expect(applyPattern('/{slug}', '')).toBe('/');
  });

  it('applies precedence: market pattern, then global, then built-in', () => {
    const patterns = [
      { contentType: 'PRODUCT', countryId: null, pattern: '/software/{slug}' },
      { contentType: 'PRODUCT', countryId: 'ae', pattern: '/{slug}' },
    ];
    expect(effectivePattern('PRODUCT', 'ae', patterns)).toEqual({ pattern: '/{slug}', source: 'country' });
    expect(effectivePattern('PRODUCT', 'in', patterns)).toEqual({ pattern: '/software/{slug}', source: 'global' });
    expect(effectivePattern('PAGE', 'in', patterns)).toEqual({ pattern: '/{slug}', source: 'default' });
    // The blog is root-only: a market pattern never applies to it.
    expect(effectivePattern('BLOG_POST', 'ae', [{ contentType: 'BLOG_POST', countryId: 'ae', pattern: '/x/{slug}' }]).source).toBe('default');
  });

  it('lets a custom path beat every pattern, and keeps homes at the root', () => {
    expect(routeRelativePath({ type: 'PRODUCT', slug: 'dropbox', mode: 'CUSTOM', customPath: '/Software/Dropbox', pattern: '/products/{slug}' })).toBe('/software/dropbox');
    expect(routeRelativePath({ type: 'PRODUCT', slug: 'dropbox', mode: 'PATTERN', customPath: '/ignored', pattern: '/{slug}' })).toBe('/dropbox');
    expect(routeRelativePath({ type: 'PAGE', slug: '', mode: 'CUSTOM', customPath: '/elsewhere', pattern: '/pages/{slug}', isHomepage: true })).toBe('/');
  });
});

describe('market paths', () => {
  it('adds and strips market prefixes', () => {
    expect(joinMarketPath('ae', '/dropbox')).toBe('/ae/dropbox');
    expect(joinMarketPath('', '/')).toBe('/');
    expect(joinMarketPath('ae', '/')).toBe('/ae');
    expect(stripMarketPrefix('ae', '/ae/products/dropbox')).toBe('/products/dropbox');
    expect(stripMarketPrefix('ae', '/aeon')).toBe('/aeon');
  });
});

describe('reserved addresses', () => {
  const root = { marketPrefixes: ['ae', 'qa'], marketPrefix: '' };
  it('protects the home page, system routes, the blog archive and market prefixes', () => {
    expect(reservedReason('/', root)).toMatch(/home page/);
    expect(reservedReason('/', { ...root, isHomepage: true })).toBeNull();
    expect(reservedReason('/admin/x', root)).toMatch(/system route/);
    expect(reservedReason('/api', root)).toMatch(/system route/);
    expect(reservedReason('/uploads/x', root)).toMatch(/system route/);
    expect(reservedReason('/blog', root)).toMatch(/blog archive/);
    expect(reservedReason('/ae', root)).toMatch(/market prefix/);
    expect(reservedReason('/qa/x', root)).toMatch(/market prefix/);
    expect(reservedReason('/dropbox', root)).toBeNull();
  });

  it('checks a market’s own addresses inside its prefix', () => {
    const uae = { marketPrefixes: ['ae'], marketPrefix: 'ae' };
    expect(reservedReason('/ae', uae)).toMatch(/home page/);
    expect(reservedReason('/ae/dropbox', uae)).toBeNull();
    expect(reservedReason('/ae/admin', uae)).toMatch(/system route/);
  });
});

describe('redirects', () => {
  it('carries the visitor’s query string, UTM tags included, without overriding the destination’s own', () => {
    expect(withQuery('/dropbox', new URLSearchParams('utm_source=mail&utm_medium=email'))).toBe('/dropbox?utm_source=mail&utm_medium=email');
    expect(withQuery('/dropbox?ref=a', { ref: 'b', utm_campaign: 'x' })).toBe('/dropbox?ref=a&utm_campaign=x');
    expect(withQuery('/dropbox#top', { q: '1' })).toBe('/dropbox?q=1#top');
    expect(withQuery('/dropbox', {})).toBe('/dropbox');
  });

  it('labels the status codes Next actually sends', () => {
    expect(redirectStatusLabel('PERMANENT')).toBe('308 Permanent');
    expect(redirectStatusLabel('TEMPORARY')).toBe('307 Temporary');
  });

  it('follows a chain to its end and detects cycles', () => {
    const graph = new Map([['/a', '/b'], ['/b', '/c']]);
    expect(followRedirects('/a', (k) => graph.get(k) ?? null)).toEqual({ ok: true, destination: '/c', hops: 2 });
    graph.set('/c', '/a');
    expect(followRedirects('/a', (k) => graph.get(k) ?? null).ok).toBe(false);
    expect(followRedirects('https://x.test/a', () => '/never')).toEqual({ ok: true, destination: 'https://x.test/a', hops: 0 });
  });
});

describe('stored links', () => {
  it('replaces whole link values only, keeping query and fragment', () => {
    expect(replaceLinkValue('/products/dropbox', '/products/dropbox', '/dropbox')).toBe('/dropbox');
    expect(replaceLinkValue('/products/dropbox?x=1', '/products/dropbox', '/dropbox')).toBe('/dropbox?x=1');
    expect(replaceLinkValue('/products/dropbox-2', '/products/dropbox', '/dropbox')).toBeNull();
    expect(replaceLinkValue('see /products/dropbox', '/products/dropbox', '/dropbox')).toBeNull();
  });

  it('rewrites exact hrefs in HTML and nothing else', () => {
    const html = '<a href="/products/dropbox">x</a> <a href="/products/dropbox-2">y</a> /products/dropbox <a href=\'/products/dropbox#p\'>z</a>';
    const out = replaceInHtml(html, '/products/dropbox', '/dropbox');
    expect(out.count).toBe(2);
    expect(out.html).toBe('<a href="/dropbox">x</a> <a href="/products/dropbox-2">y</a> /products/dropbox <a href=\'/dropbox#p\'>z</a>');
  });

  it('walks JSON block content', () => {
    const content = { primaryCtaUrl: '/products/dropbox', items: [{ url: '/products/dropbox?a=1' }, { url: '/other' }], body: '<p><a href="/products/dropbox">x</a></p>' };
    const out = replaceInJson(content, '/products/dropbox', '/dropbox');
    expect(out.count).toBe(3);
    expect(out.value).toEqual({ primaryCtaUrl: '/dropbox', items: [{ url: '/dropbox?a=1' }, { url: '/other' }], body: '<p><a href="/dropbox">x</a></p>' });
  });
});

describe('CSV', () => {
  it('round-trips an export, quotes, commas, newlines and the formula guard included', () => {
    const rows = [
      ['route_id', 'name', 'target_path'],
      ['r1', 'Plans, "business"', '/software/dropbox'],
      ['r2', 'Line\nbreak', '-starts-with-dash'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('accepts LF files, a BOM and trailing blank lines', () => {
    expect(parseCsv('﻿a,b\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});
