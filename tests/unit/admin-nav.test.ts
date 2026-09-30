import { describe, it, expect } from 'vitest';
import { ADMIN_NAV, isItemActive, visibleModules, locateRoute } from '@/lib/admin/nav';
import {
  countActiveFilters,
  hasActiveFilters,
  describeFilters,
  NON_FILTER_KEYS,
  type FilterDefinition,
} from '@/lib/admin/filters';
import { ALL_PERMISSIONS, type PermissionKey } from '@/lib/auth/permissions';

const allowAll = () => true;

describe('admin navigation', () => {
  it('groups every destination under a module', () => {
    for (const group of ADMIN_NAV) {
      expect(group.label, 'a module needs a label').toBeTruthy();
      expect(group.icon, `${group.label} needs an icon`).toBeTruthy();
      // A module is either a single destination or a list of them, never both.
      expect(Boolean(group.href) !== Boolean(group.items?.length)).toBe(true);
    }
  });

  it('only references permissions that actually exist', () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const group of ADMIN_NAV) {
      for (const item of group.items ?? []) {
        const keys = Array.isArray(item.permission) ? item.permission : [item.permission];
        for (const key of keys) {
          expect(known.has(key), `${item.label} references unknown permission ${key}`).toBe(true);
        }
      }
    }
  });

  it('hides a module when the user cannot reach any of its items', () => {
    const salesOnly = (permission: PermissionKey) =>
      (['dashboard.view', 'leads.view', 'customers.view'] as string[]).includes(permission);
    const groups = visibleModules(salesOnly);
    const ids = groups.map((group) => group.id);

    expect(ids).toContain('crm');
    expect(ids).toContain('dashboard');
    // No pages/media/settings permission means no Website or Settings module.
    expect(ids).not.toContain('website');
    expect(ids).not.toContain('settings');

    const crm = groups.find((group) => group.id === 'crm')!;
    expect(crm.items.map((item) => item.label)).toEqual([
      'CRM Dashboard',
      'Leads',
      // Reading the consent notice needs only leads.view: the people who work
      // leads have to be able to see what those leads agreed to. Publishing a
      // new version needs leads.manageConsent, which this user lacks.
      'Consent notice',
      'Pipeline',
      'Customers',
    ]);
    // Forms and Submissions need forms.view, which this user does not have.
    expect(crm.items.map((item) => item.label)).not.toContain('Forms');
  });

  it('matches a detail route to its list item', () => {
    const leads = ADMIN_NAV.find((group) => group.id === 'crm')!.items!.find(
      (item) => item.href === '/admin/leads',
    )!;
    expect(isItemActive(leads, '/admin/leads')).toBe(true);
    expect(isItemActive(leads, '/admin/leads/abc123')).toBe(true);
    expect(isItemActive(leads, '/admin/pipeline')).toBe(false);
  });

  it('keeps sibling routes from stealing each other’s active state', () => {
    const items = ADMIN_NAV.find((group) => group.id === 'crm')!.items!;
    const forms = items.find((item) => item.href === '/admin/forms')!;
    const submissions = items.find((item) => item.href === '/admin/forms/submissions')!;

    // Submissions lives under /admin/forms but must not light up Forms.
    expect(isItemActive(forms, '/admin/forms/submissions')).toBe(false);
    expect(isItemActive(submissions, '/admin/forms/submissions')).toBe(true);
    expect(isItemActive(forms, '/admin/forms/abc')).toBe(true);
  });

  it('separates two entries that share a route via the query string', () => {
    const marketing = ADMIN_NAV.find((group) => group.id === 'marketing')!.items!;
    const attribution = marketing.find((item) => item.href.startsWith('/admin/reports'))!;
    const reports = ADMIN_NAV.find((group) => group.id === 'reports')!.items!.find(
      (item) => item.href === '/admin/reports',
    )!;

    expect(isItemActive(attribution, '/admin/reports', 'view=attribution')).toBe(true);
    expect(isItemActive(attribution, '/admin/reports', '')).toBe(false);
    expect(isItemActive(reports, '/admin/reports', '')).toBe(true);
    expect(isItemActive(reports, '/admin/reports', 'view=attribution')).toBe(false);
  });

  it('keeps the dashboard exact so every admin route does not match it', () => {
    const dashboard = ADMIN_NAV.find((group) => group.id === 'dashboard')!;
    expect(isItemActive(dashboard, '/admin')).toBe(true);
    expect(isItemActive(dashboard, '/admin/leads')).toBe(false);
  });

  it('locates the module and item that own a route, for breadcrumbs', () => {
    expect(locateRoute('/admin/leads')).toMatchObject({
      group: { label: 'Leads & CRM' },
      item: { label: 'Leads' },
    });
    // A detail route resolves to its list item.
    expect(locateRoute('/admin/pages/abc')).toMatchObject({
      group: { label: 'Website' },
      item: { label: 'Pages' },
    });
    expect(locateRoute('/admin')).toMatchObject({ group: { label: 'Dashboard' } });
    expect(locateRoute('/admin/nowhere')).toBeNull();
  });

  it('exposes every module to a super admin', () => {
    expect(visibleModules(allowAll).length).toBe(ADMIN_NAV.length);
  });

  /**
   * Seed Files is reachable by role, not by permission: `settings.manage` can
   * be granted to any role from the Staff screen, and running seed files
   * against the live database must not become delegable by ticking a box.
   */
  it('hides a super-admin-only item from everyone else, whatever they may do', () => {
    const forEveryone = visibleModules(allowAll).flatMap((group) => group.items);
    const forSuperAdmin = visibleModules(allowAll, true).flatMap((group) => group.items);

    // Seed files, SMTP and the plan's limits are the platform owner's alone.
    const superAdminOnly = ['/seed-files', '/admin/settings/email', '/admin/settings/plan'];
    for (const href of superAdminOnly) {
      expect(forEveryone.some((item) => item.href === href), href).toBe(false);
      expect(forSuperAdmin.some((item) => item.href === href), href).toBe(true);
    }
    // And they are the only difference between the two.
    expect(forSuperAdmin.length).toBe(forEveryone.length + superAdminOnly.length);
  });
});

describe('list filters', () => {
  const definitions: FilterDefinition[] = [
    { name: 'status', label: 'Status', options: [{ label: 'Qualified', value: 'QUALIFIED' }] },
    { name: 'source', label: 'Source', options: [{ label: 'Google', value: 'google' }] },
    { name: 'from', label: 'Date range', kind: 'date' },
  ];

  it('ignores paging and sorting when deciding whether filters are active', () => {
    expect(hasActiveFilters({ page: '3', sort: 'name', dir: 'asc' })).toBe(false);
    expect(hasActiveFilters({ status: 'QUALIFIED' })).toBe(true);
    expect(hasActiveFilters({})).toBe(false);
    for (const key of NON_FILTER_KEYS) {
      expect(hasActiveFilters({ [key]: 'x' })).toBe(false);
    }
  });

  it('counts a from/to pair as one date filter', () => {
    expect(countActiveFilters({ from: '2024-01-01', to: '2024-02-01' })).toBe(1);
    expect(countActiveFilters({ from: '2024-01-01' })).toBe(1);
    expect(countActiveFilters({ status: 'QUALIFIED', from: '2024-01-01', to: '2024-02-01' })).toBe(2);
    expect(countActiveFilters({ status: 'QUALIFIED', source: 'google', page: '2' })).toBe(2);
  });

  it('labels each chip with the option label rather than the raw value', () => {
    const chips = describeFilters({ status: 'QUALIFIED', source: 'google' }, definitions);
    expect(chips).toEqual([
      { name: 'status', label: 'Status', value: 'QUALIFIED', display: 'Qualified' },
      { name: 'source', label: 'Source', value: 'google', display: 'Google' },
    ]);
  });

  it('falls back to the raw value when an option has since disappeared', () => {
    const chips = describeFilters({ status: 'GONE' }, definitions);
    expect(chips[0]!.display).toBe('GONE');
  });

  it('leaves date filters to their own control instead of chipping them twice', () => {
    expect(describeFilters({ from: '2024-01-01' }, definitions)).toEqual([]);
  });
});
