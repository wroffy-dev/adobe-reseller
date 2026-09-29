'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AdminTabs, TabPanel, type AdminTab } from '@/components/admin/admin-tabs';
import { Alert } from '@/components/ui/states';
import type { RouteListRow } from '@/lib/urls/manager';
import { AllUrlsTab } from './all-urls-tab';
import { PatternsTab } from './patterns-tab';
import { RedirectsTab } from './redirects-tab';
import { HistoryTab } from './history-tab';
import { ConflictsTab, HealthTab } from './health-tab';
import type { Market, PatternRowView } from './types';

const TAB_IDS = ['urls', 'patterns', 'redirects', 'conflicts', 'history', 'health'] as const;
type TabId = (typeof TAB_IDS)[number];

/**
 * SEO → Slug & URL Manager.
 *
 * Six tabs over one registry. The active tab lives in the address bar (?tab=)
 * and is switched without navigation, so filters, pagination, scroll position
 * and any open drawer survive; saving refreshes only the data that changed.
 */
export function SlugManager({
  initialRoutes,
  markets,
  origin,
  canEdit,
  canActivate,
  resolverEnabled,
  patterns,
  counts,
  conflictCount,
  notFoundCount,
}: {
  initialRoutes: { rows: RouteListRow[]; total: number; page: number; pageSize: number };
  markets: Market[];
  origin: string;
  canEdit: boolean;
  canActivate: boolean;
  resolverEnabled: boolean;
  patterns: PatternRowView[];
  counts: Array<{ contentType: string; countryId: string; mode: string; count: number }>;
  conflictCount: number;
  notFoundCount: number;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>('urls');
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted && (TAB_IDS as readonly string[]).includes(wanted)) setTab(wanted as TabId);
  }, []);

  const select = (id: string) => {
    setTab(id as TabId);
    const params = new URLSearchParams(window.location.search);
    if (id === 'urls') params.delete('tab');
    else params.set('tab', id);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };

  // Soft refresh: server data (counts, patterns, flags) without a page reload.
  const changed = React.useCallback(() => {
    setVersion((v) => v + 1);
    router.refresh();
  }, [router]);

  const tabs: AdminTab[] = [
    { id: 'urls', label: 'All URLs', badge: initialRoutes.total || undefined },
    { id: 'patterns', label: 'URL Patterns' },
    { id: 'redirects', label: 'Redirects' },
    { id: 'conflicts', label: 'Conflicts', badge: conflictCount || undefined },
    { id: 'history', label: 'History' },
    { id: 'health', label: 'URL Health', badge: notFoundCount || undefined },
  ];

  return (
    <div className="space-y-4">
      {!resolverEnabled ? (
        <Alert tone="warning" title="The URL registry is not active yet">
          The site is serving its built-in addresses. Open <button type="button" className="font-medium underline" onClick={() => select('health')}>URL Health</button>, register the current URLs, review any collisions and switch the registry on — then addresses can be changed here.
        </Alert>
      ) : null}
      <AdminTabs tabs={tabs} active={tab} onChange={select} />
      <TabPanel id="urls" active={tab}>
        <AllUrlsTab key={`urls-${version}`} initial={initialRoutes} markets={markets} origin={origin} canEdit={canEdit} resolverEnabled={resolverEnabled} />
      </TabPanel>
      <TabPanel id="patterns" active={tab}>
        <PatternsTab
          patterns={patterns}
          counts={counts}
          markets={markets}
          origin={origin}
          canEdit={canEdit}
          canEditGlobal={canActivate}
          resolverEnabled={resolverEnabled}
          onChanged={changed}
        />
      </TabPanel>
      <TabPanel id="redirects" active={tab}>
        {tab === 'redirects' ? <RedirectsTab canEdit={canEdit} /> : null}
      </TabPanel>
      <TabPanel id="conflicts" active={tab}>
        {tab === 'conflicts' ? <ConflictsTab origin={origin} canEdit={canEdit} resolverEnabled={resolverEnabled} onChanged={changed} /> : null}
      </TabPanel>
      <TabPanel id="history" active={tab}>
        {tab === 'history' ? <HistoryTab origin={origin} canEdit={canEdit && resolverEnabled} onChanged={changed} /> : null}
      </TabPanel>
      <TabPanel id="health" active={tab}>
        {tab === 'health' ? <HealthTab origin={origin} canEdit={canEdit} canActivate={canActivate} onChanged={changed} /> : null}
      </TabPanel>
    </div>
  );
}
