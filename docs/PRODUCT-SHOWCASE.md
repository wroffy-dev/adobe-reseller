# Product Showcase

A page section that shows a grid of products, or of anything else, as
clickable tiles: logos with names, cards with a paragraph, a compact list, or
simple chips like "Startups · Schools · CA Firms".

It is a regular page block (Products group), so it is offered both in
**Pages → Add section** and in the **product page layout** builder.

---

## Filling the grid

| Action | What it does |
| --- | --- |
| **Add all products** | Adds one tile per product sold in the market you are editing (up to 100 tiles). Products already in the grid are skipped. |
| **Add** | Adds one empty tile. Pick a product for it, or leave "No product — written by hand" and type a name. |
| **Remove all** | Clears the grid (asks first). |
| Drag / duplicate / delete | Per tile, as in every other list in the editor. |

Nothing is stored until you **Save** the section.

### What a tile shows

- **Name** — leave empty to use the product's name; type one to override it.
- **Paragraph** — optional text under the name (shown when *Show paragraphs* is on).
- **Image** — the product's image by default; choose another, or tick *No image on this tile*.
- **Link** — the product's page by default; type a link to send it elsewhere, optionally in a new tab. A tile without a product or link is a plain, unclickable box.
- **Badge** — a short label such as "New".
- **Show this tile** — untick to keep a tile without showing it.
- **Custom style for this tile** — background, border and text colour for this tile only.

A tile tied to a product follows its image and page. **Add all products**
copies each product's name into the tile so it can be edited; clear the name to
follow the product's own name instead. If the product is not sold (not published) in a market,
its tile is left out there unless the tile has a link of its own.

## Layout and design

| Group | Settings |
| --- | --- |
| Tile style | Tile (centred box), Card (image on top), List (image beside the name), Chip (compact pill), Minimal (text link) |
| Tiles per row | Desktop 1–6 (default 5), tablet and mobile (0 = automatic) |
| Spacing | Column gap, row gap, grid max width, grid alignment, equal heights |
| Tile design | Background, border colour and width, corner radius, padding, minimum height, shadow |
| Text | Name colour, size and weight; paragraph colour; alignment; accent and badge colours |
| Images | Show/hide, size, shape (rounded, square, circle), fit (contain, cover) |
| Hover | Lift, border, shadow, fill or none, with hover colours |

All values are CSS variables on the grid (`.psc-*` in `globals.css`), so a
setting left empty keeps the chosen style's own value.

## Code

| File | Role |
| --- | --- |
| `src/lib/cms/showcase-blocks.ts` | Schema, defaults and editor fields |
| `src/lib/cms/showcase-resolve.ts` | Pure rules: what each tile shows and whether it appears |
| `src/components/cms/blocks/showcase-blocks.tsx` | Server renderer |
| `src/lib/actions/pickers.ts` → `listProductsForImport` | Products for "Add all products" (`products.view`) |
| `src/lib/services/products.ts` → `getPublicProductsByIds` | Published products of a market by id |
| `tests/unit/product-showcase.test.ts`, `tests/integration/product-showcase.test.ts` | Tests |
