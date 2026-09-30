'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isPrivatePath } from '@/lib/analytics/private-paths';

/**
 * Silences GA4 on private paths reached by client-side navigation.
 *
 * Tags only render on the public site, but once loaded they stay in memory: a
 * browser Back into the admin, or a router.replace('/admin') after "View
 * site", keeps gtag alive, and GA4 enhanced measurement would log those
 * history changes as admin page views. Google's documented opt-out flag stops
 * it while the path is private and lifts it again on the way back out.
 */
export function TrackingRouteGuard({ measurementIds }: { measurementIds: string[] }) {
  const pathname = usePathname();

  useEffect(() => {
    const disabled = isPrivatePath(pathname ?? '/');
    const flags = window as unknown as Record<string, boolean>;
    for (const id of measurementIds) flags[`ga-disable-${id}`] = disabled;
  }, [pathname, measurementIds]);

  return null;
}
