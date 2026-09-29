import { describe, it, expect } from 'vitest';
import { mockAuth } from '../helpers';

// An editor who can edit pages but not SEO: every URL action must refuse.
mockAuth(['pages.view', 'pages.edit', 'products.edit'], 'editor');

const actions = await import('@/lib/actions/url-manager');
const seo = await import('@/lib/actions/seo');

describe('Slug & URL Manager permissions', () => {
  it('refuses every read and write without seo.manage', async () => {
    const results = await Promise.all([
      actions.fetchRoutes({}),
      actions.previewRouteEdits([{ routeId: 'x', action: 'reset' }]),
      actions.applyRouteEdits([{ routeId: 'x', action: 'reset' }], { token: 't' }),
      actions.previewBulk({ routeIds: ['x'], operation: { op: 'reset' } }),
      actions.validateCsvImport('route_id,target_path\n'),
      actions.exportRoutesCsv({}),
      actions.previewPatternChange({ type: 'PRODUCT', countryId: null, pattern: '/{slug}' }),
      actions.saveRedirectAction({ source: '/a', destination: '/b', type: 'PERMANENT', isActive: true }),
      actions.deleteRedirectAction('x'),
      actions.mapNotFoundAction('x', '/b'),
      actions.runBackfillAction(),
      actions.setResolverAction(true),
      actions.fetchHealth(),
      actions.restoreHistoryPreview('x'),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/permission/i);
    }
  });

  it('keeps the classic Redirects screen behind the same permission', async () => {
    const form = new FormData();
    form.set('source', '/a');
    form.set('destination', '/b');
    const result = await seo.saveRedirect(null, form);
    expect(result.ok).toBe(false);
  });
});
