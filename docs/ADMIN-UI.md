# Admin UI — Liquid Glass design system

The admin is an Apple-inspired SaaS interface: a floating glass sidebar and
topbar, calm solid work surfaces, and Light / Dark / System themes. It changes
**the admin only** — the public website is pixel-identical (checked at 1440px
and 390px on the home page, a content page, a form page and a city page).

## How it is scoped

- `src/app/admin/admin-ui.css` holds the whole system and is imported by the
  admin layout only. Every rule needs `.admin-ui` to match
  (`tests/unit/admin-ui-scope.test.ts` enforces this).
- The admin shell sets `.admin-ui` on its root and on `<body>` while mounted, so
  portalled dialogs, menus and toasts inherit it.
- The app's generic tokens (`--brand-text`, `--brand-muted`, `--brand-border`,
  `--brand-background`) are re-pointed inside `.admin-ui`, so every existing
  screen (`text-content`, `border-hairline`, `bg-surface`) picks the system up
  with no markup change. The brand colour stays the **accent** (active nav,
  focus ring, links); the primary action is near-black.
- Shared primitives carry marker classes (`ui-btn`, `ui-input`, `ui-card`,
  `ui-menu`, `ui-th`…) that have no styles outside the admin, so the website's
  own buttons and cards are untouched.
- An in-admin preview of a public component can use `.admin-site-preview` to
  get the website's own colours and fonts back; `.ui-keep-white` keeps a white
  surface in dark mode.

## Glass (≈30%) vs solid (≈70%)

| Glass | Solid |
| --- | --- |
| `glass-rail` sidebar, `glass-bar` topbar, `glass-menu` fly-outs, `ui-menu` menus, `glass-card` KPI tiles and the filter strip, `glass-panel` dashboard cards (`<Card glass>`) over the `.ambient` wash | Tables, forms, editors, builders, dialogs and drawers |

Fallbacks: `@supports not (backdrop-filter)` and
`prefers-reduced-transparency: reduce` switch glass to an opaque tint.

## Shell

- Sidebar: floating rail inset 12px, 256px wide, section headings, nested
  items with a guide line, a 3px accent bar on the active item. The collapse
  toggle sits beside the logo; collapsed it is 76px with tooltips and
  fly-outs (persisted as `admin:nav:collapsed`). No footer. On < 1024px it is an
  off-canvas drawer (Esc, backdrop click and navigation close it).
- Topbar: breadcrumbs (from the nav config), ⌘K search, country, Create ▾,
  theme toggle, View website (new tab), profile menu. On phones the theme
  options move into the profile menu.

## Themes

Preference `light | dark | system` in `localStorage['admin:theme']` (default
`system`); applied as `data-admin-theme` on `<html>` by an inline script in the
admin layout before the shell paints, so there is no flash. "System" follows the
OS live. Dark rules are written `:root[data-admin-theme='dark'] .admin-ui …`,
including mappings for hard-coded `bg-white` and the tinted status utilities
(`bg-*-50/100`, `text-*-600…950`, `border-*-200/300`).

## Page patterns

- List screens: full width; title + description, primary action top right,
  optional KPI tiles (2 columns on phones, 4 from `xl`), preset pills, the glass
  filter strip, then the table card.
- Form and settings screens: a readable max width, left-aligned, so the title
  sits in the same place on every screen.
- Dashboard: welcome line, KPI tiles, needs-attention and quick actions, trends,
  recent records — glass panels over the ambient wash.
