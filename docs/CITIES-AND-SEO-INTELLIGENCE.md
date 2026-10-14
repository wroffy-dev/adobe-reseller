# Cities (local SEO) and SEO Intelligence

## Cities — Website → Cities (`/admin/cities`)

A city is a thin record (`City`: country, name, slug, optional region, active,
sort order, landing page) over **ordinary CMS pages**. Nothing new renders,
routes or lists them:

| Concern | Handled by |
| --- | --- |
| Content, sections, forms, CTAs, drafts, publishing | Page builder (`Page` + `PageSection`) |
| Address, collisions, reserved paths, patterns, custom URLs, history | URL registry / Slug & URL Manager (`PAGE` routes) |
| Market prefix (`/ae/dubai`) | Country registry + `countryPath` |
| Sitemap, robots, canonical, hreflang, OG, Twitter | Existing sitemap/robots/`buildMetadata` |
| Prices | `Product` + `ProductCountry` only, via product blocks |

- **Landing page**: `/<slug>` in the city's market — `/delhi`, `/ae/dubai`,
  `/qa/doha`. Created with suggested, fully editable SEO (title, H1,
  description, three keywords) from the city name and a "what the page offers"
  phrase, or copied once from a template page with `{{city}}`, `{{region}}`,
  `{{country}}` filled in. After that it is an independent page: no sync,
  nothing overwrites it, and editing one city never touches another.
- **Product landing pages**: `CityProductPage (cityId, productId, pageId)`,
  unique per city and product, for products the market sells — page slug
  `delhi/adobe-acrobat-pro`. The starter layout's price comes from a
  `productCards` block that reads `ProductCountry` at render time; no price is
  copied or stored.
- **Moving a city** (new slug) moves its landing page and every page under it
  in one transaction, checked against the registry first; each published old
  address gets a permanent (308) redirect and a history entry. Renaming the
  landing page in the page editor moves the city with it.
- **Archive** takes the city's pages off the site (Archived); **restore**
  brings them back as drafts. **Delete** removes only the city record — its
  pages stay as ordinary pages.
- Public output for city pages: breadcrumbs `Home → Delhi` and
  `Home → Delhi → Product`, and a `Service` schema with the organisation as
  provider and the city as `areaServed` (no LocalBusiness address is claimed
  for a city the business is not located in).

Permissions: `cities.view`, `cities.manage` (granted to Admin and
Content & Marketing by the migration). Publishing still needs `pages.publish`.

## Primary keywords

Pages, products and each product's market (`ProductCountry`) carry up to three
`primaryKeywords`. A market with none uses the product's. Blog posts use their
existing focus keyword. They feed SEO Intelligence and `<meta name="keywords">`.

## SEO Intelligence — Content & SEO → SEO Intelligence (`/admin/seo-intelligence`)

Needs `seo.manage`. Scores are **this site's own, deterministic heuristics** —
not Google, OpenAI or any platform's scores. Code: `src/lib/seo-intelligence/`.

**Overall = 50% SEO + 25% AEO + 25% GEO.** For city pages, SEO = 80% general
SEO + 20% Local SEO. Health bands: 90–100 Excellent, 75–89 Good, 50–74 Needs
improvement, 0–49 Poor.

| Score | Groups (points) |
| --- | --- |
| SEO | Metadata 30 (title, length, description, length, canonical, OG, indexable) · Keywords 25 (title, H1, description, first section, subheadings, URL, natural use — stuffing scores 0) · Content 30 (one H1, heading structure, 600+ words, alt text, internal links, CTA, unique title/description/H1) · Technical 15 (in served sitemap, URL registry health, structured data, robots.txt) |
| AEO | FAQ 20 · FAQPage schema 10 · question headings 15 · concise answers 15 · lists 10 · opening explanation 10 · buyer intents 10 · contact clarity 10 |
| GEO | entity named 15 · organisation details 10 · schema types 15 · product names 10 · concrete figures 15 · location 10 · unique copy 15 · trust/support 10 |
| Local (city pages) | city in H1 15 · in title 10 · local keyword 10 · city intro 10 · not city-swapped 20 · local contact 10 · local FAQs 10 · product links 10 · hierarchy 5 |
| Website (per market) | indexable 20 · sitemap 15 · robots 15 · homepage 15 · defaults 10 · organisation 15 · verification 5 · share image 5 |

Every finding stores `id, category, severity, passed, points, maxPoints,
title, description (why), recommendation (what to do)`.

**Duplicates / doorway pages**: copy is compared with MinHash signatures
(city names neutralised, so pages differing only by city match 100%), plus
exact title/description/H1 hashes, within each market. It only warns — nothing
is noindexed, hidden or deleted.

**Storage**: results live in `SeoAnalysis` (one row per entity and market,
with scores, findings, keywords, signature, content hash, `analyzedAt`). Saving
a page, section, product, market pricing or post re-analyses it after the
response; editors show a compact SEO/AEO/GEO card that refreshes when stale.
**Recalculate all** re-runs everything in batches (cross-page checks included).

## Upgrading

```bash
npm run db:deploy   # applies 20261001100000_cities_seo_intelligence (additive)
```

Then open SEO Intelligence and press **Recalculate all** once.
