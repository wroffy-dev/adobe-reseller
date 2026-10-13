# Manual Pricing Comparison section

A page section (`manualPricingTable`) for pricing cards written entirely in
the CMS. It never reads products, prices or categories: every plan, feature
and button is stored in the section's own `content` JSON by the ordinary
section save, so changing wording or styling never needs code.

## Adding one

Pages → edit a page → **Add section** → *Manual Pricing Comparison* (Content
group). Add plans in **Plans**; each plan has its own **Features** list.
Rows can be added, removed, **duplicated** and reordered. Save as usual.

## Content tab

| Area | Controls |
| --- | --- |
| Intro | Show heading/intro, heading, subtitle, alignment |
| Plan | Name, short description, price, billing text, badge, show/hide, features |
| Feature row | Text, show/hide, checkmark, emphasis (medium/bold/italic), optional row label; *Custom row style*: text colour, background, padding |
| Button | Show, text, link (safe protocols only), new tab; *Custom button style*: background, text, border, hover background/text, radius, font size/weight, padding, width (full/fit), alignment |
| Highlight | *Highlight this plan* (any number of plans): border colour/thickness, background, shadow, badge colours, enlarge or raise on desktop |
| Card | *Custom card layout and style*: display order, column span, max width, vertical alignment, background, border, text/heading colour, padding, radius, shadow |
| Layout options | Plans per row (desktop/tablet/mobile), equal-width columns, card height (equal/fit), card alignment, button placement, column/row gap, feature spacing, card area width and alignment, line up rows by row label |
| Card style / Button style | Section-wide defaults for every card and button, including highlight and badge colours |

Section width (boxed, full, custom max-width such as 1200px/1400px/100%),
padding, background and per-breakpoint columns stay on the **Design** and
**Responsive** tabs, as for every section. Responsive columns there override
the block's own.

## Notes

- Defaults reproduce the reference: white cards, hairline grey border, 12px
  radius, pale pink buttons with red uppercase text, red border and pale pink
  badge on a highlighted plan.
- Plans and features carry stable ids, so reordering never mixes up rows and
  a duplicated plan gets its own ids. Up to 12 plans and 30 features per plan.
- Links are restricted to site paths, anchors, mailto/tel and http(s).
- "Line up rows" keeps labelled rows in one shared order across plans (a plan
  without that row shows a dash); row heights are not forced equal, so long
  text in one card can still push its rows lower than its neighbours'.
