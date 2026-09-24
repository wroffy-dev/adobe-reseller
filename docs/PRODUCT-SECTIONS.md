# Product sections and design

A product page is built the way a CMS page is built: from sections, in the
order an administrator drags them into. There are two screens.

| Screen | What it controls | Scope |
| --- | --- | --- |
| **Products → *a product* → Page layout** (`/admin/products/<id>/layout`) | The sections on that product's page, and the widgets in its sidebar | That product only |
| **Products → Product Design** (`/admin/products/design`) | Card style, image sizes, the page's two columns, the product type scale | Every product |

Both need `products.view` to open and `products.edit` to change.

## Sections belong to the product

There is no global product layout. Every `ProductSection` row carries a
`productId`, so rearranging one product's page leaves every other product
exactly as it was.

A product nobody has arranged has no rows at all, and renders the built-in
arrangement from `src/lib/cms/product-defaults.ts`:

```
DETAIL   productHeader → productMedia → productDescription → productFeatures → productRelated
SIDEBAR  productPriceBox
```

That is the product page this application has always rendered, expressed as
sections — which is why adding the builder changed nothing about any live
page. Opening the builder and pressing **Customise this product page** writes
that arrangement out as real rows, so the first edit starts from what is
already live rather than from an empty screen. **Reset to the built-in
arrangement** deletes the rows again and the page goes back to the default.

## What can go on a product page

- **Every page block.** A hero, a FAQ, testimonials, a slider, a form — if it
  can go on a page, it can go on a product page, including blocks added later.
  This is one rule in `blocksForSurface`, not two lists that have to be kept in
  step.
- **The product's own blocks**, which read the product being rendered:
  `productHeader`, `productMedia`, `productDescription`, `productFeatures`,
  `productSpecs`, `productRelated` and `productPriceBox`.

Each product block is a **singleton**: a product has one title and one price
box, so they can be reordered, hidden and styled but never stacked twice.

The **sidebar** is narrower, so it offers only the blocks written for it
(`productPriceBox`, `productSpecs`) rather than everything a page can hold.

## Design

Four groups, stored as validated JSON on the `ProductSettings` singleton.
Every value is an *override*: blank means "inherit", from the website's own
design settings or from the component's original value.

- **Images** — card image width, height, ratio, fit and radius; the main
  product image's maximum width, ratio, fit and radius; gallery columns,
  thumbnail height, ratio, fit, radius and gap.
- **Product cards** — background, border, radius, padding, shadow, alignment,
  title and price size, weight and colour, feature and tick colour, grid gaps.
- **Layout** — container width, section spacing, the sidebar (on/off, side,
  width, gap, sticky, offset, where it goes on a phone), the product palette,
  and the "Other plans" rail.
- **Typography** — size, weight, line height and letter spacing for eight
  roles, product pages only.

Everything reaches the page as CSS custom properties (`--product-card-*`,
`--product-main-image-*`, `--product-title-*`, …), each used with the
component's original value as its fallback. A site that has never opened the
design screen renders exactly what it rendered before.

Product cards appear on ordinary pages too, so the product grid, cards, slider
and "Other plans" blocks each carry these variables down with them.

### Page width and full-width sections

**Layout → Container width** is a list: *Website default* (blank — the
website's own container), *Narrow* (768px), *Match the header* (whatever
width Settings gives the header, so the page lines up with the logo and the
menu), *Full width* (100%), or *Custom* for any CSS length.

A section on a product page can also leave the boxed column altogether: on its
**Responsive** tab, under *Width & height*, **Stretch to the screen edges**.
Its background then runs edge to edge and its content sits in the same
container as a page's sections — exactly as the homepage's do — at any width
or zoom, with no negative margins. Leave its *Layout* on *Boxed* for that. It is how a product page opens with a full-width hero.

With a sidebar, only stretched sections at the very top or bottom of the page
break out; one in between shares its row with the sidebar and stays in its
column. Without a sidebar, any stretched section breaks out where it stands.

### Image sizes, in three places

| Where | Setting | Default |
| --- | --- | --- |
| The small mark on a card | Images → Card image | 56 × 56, cover, 8px radius |
| The large image on a product page | Images → Main product image | Full column width, original ratio |
| The thumbnails under it | Images → Gallery | 3 columns, original ratio |

A single product can override the main image's size on its own
`productMedia` section — tick **Use custom sizes for this product**. Left off,
it follows the design screen so every product page matches.

## Data

```prisma
enum ProductSurface { DETAIL SIDEBAR }

model ProductSection {   // one reorderable part of one product's page
  surface   ProductSurface
  productId String        // always set: no global layout
  blockType String        // a key in the block registry
  content   Json          // validated by that block's Zod schema
  settings  Json          // the universal section design record
}

model ProductSettings {   // singleton: cardSettings, imageSettings,
  id String @id @default("singleton")   // layoutSettings, typography
}
```

`ProductSection` is deliberately the same shape as `PageSection` and
`BlogSection`, so products reuse the page builder's registry, editor, design
panel, drag-and-drop outline and renderer rather than growing a third builder.

Migration: `prisma/migrations/20260921090000_product_sections_and_design`.

## Not included

The **products listing page** has no section builder. `/products` is not a
route in this application — the listing is an ordinary CMS page, so it is
already built from sections in Pages, and a second mechanism would shadow it.
Giving the listing its own surface means first deciding whether `/products`
becomes a real route, which would take precedence over whatever CMS page is
serving that address today.
