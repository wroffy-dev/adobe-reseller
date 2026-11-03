import type { GoogleTags } from '@/lib/analytics/google-tags';

/**
 * GTM and the Google tag, written into the server HTML's `<head>`.
 *
 * Plain inline `<script>` elements, not `next/script`: these must be in the
 * page source so they run as the document parses and so Google's own checkers
 * can find them. See src/lib/analytics/google-tags.ts.
 */
export function GoogleTagsHead({ tags }: { tags: GoogleTags }) {
  return (
    <>
      {tags.gtmSnippet ? (
        <script id="google-tag-manager" dangerouslySetInnerHTML={{ __html: tags.gtmSnippet }} />
      ) : null}
      {tags.gtagSnippet ? (
        <script id="google-tag" dangerouslySetInnerHTML={{ __html: tags.gtagSnippet }} />
      ) : null}
    </>
  );
}

/** GTM's no-JavaScript fallback, meant to sit right after `<body>` opens. */
export function GoogleTagManagerNoscript({ gtmId }: { gtmId: string | null }) {
  if (!gtmId) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
