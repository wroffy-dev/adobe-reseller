'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isPrivatePath } from '@/lib/analytics/private-paths';

/** Snippets already handed to the browser in this page's lifetime. */
const injected = new Set<string>();

/**
 * Runs the GTM / Google tag snippets in the browser when the server HTML did
 * not already run them.
 *
 * The root layout writes the snippets into <head>, but React never executes a
 * <script> it renders on the client, so on three kinds of page the <head> copy
 * never runs:
 *   - the 404 page, which Next.js renders on the client;
 *   - a public page reached by client-side navigation from the admin, whose
 *     server HTML was the admin's and carried no tags;
 *   - the page re-rendered after the visitor accepts the consent banner.
 * This covers all three. Each snippet records itself on `window`, so when the
 * <head> copy has already run this does nothing — no second gtm.js, no second
 * page_view.
 */
export function GoogleTagsLoader({
  gtmSnippet,
  gtagSnippet,
}: {
  gtmSnippet: string | null;
  gtagSnippet: string | null;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (isPrivatePath(pathname ?? '/')) return;
    for (const code of [gtmSnippet, gtagSnippet]) {
      if (!code || injected.has(code)) continue;
      injected.add(code);
      const script = document.createElement('script');
      script.text = code;
      document.head.appendChild(script);
    }
  }, [pathname, gtmSnippet, gtagSnippet]);

  return null;
}
