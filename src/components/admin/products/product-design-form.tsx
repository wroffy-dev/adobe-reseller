'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { saveProductDesign } from '@/lib/actions/product-layout';
import {
  SHADOWS,
  IMAGE_RATIOS,
  SIDEBAR_WIDTHS,
  CONTAINER_WIDTH_PRESETS,
  MOBILE_SIDEBAR,
  PRODUCT_TYPE_ROLES,
  PRODUCT_TYPE_ROLE_LABELS,
  type ResolvedProductSettings,
  type ProductCardSettings,
  type ProductImageSettings,
  type ProductLayoutSettings,
  type ProductTypography,
  type ProductTypeRole,
} from '@/lib/cms/product-settings';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { SettingsSection, SettingsDivider } from '@/components/admin/settings-section';
import { SaveStateIndicator, type SaveState } from '@/components/admin/save-state';
import { ColorInput, UnitInput } from '@/components/cms/design-controls';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Product design.
 *
 * The parts of a product's presentation that are settings rather than
 * sections: how a product card looks everywhere one appears, how big its
 * images are, how the page and its sidebar share the width, and the product
 * pages' own type scale. Everything is an override — blank inherits the
 * website's own design — so an untouched catalogue matches the rest of the
 * site, which is why adding this screen changed nothing.
 *
 * These apply to every product. What one product does differently belongs in
 * that product's own layout.
 */

const TABS = [
  { id: 'images', label: 'Images' },
  { id: 'cards', label: 'Product cards' },
  { id: 'layout', label: 'Layout' },
  { id: 'typography', label: 'Typography' },
];

const FITS = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'fill', label: 'Fill' },
  { value: 'none', label: 'None' },
];

const RATIO_LABELS: Record<string, string> = {
  auto: 'Original',
  '16/9': 'Widescreen (16:9)',
  '4/3': 'Landscape (4:3)',
  '3/2': 'Landscape (3:2)',
  '1/1': 'Square (1:1)',
  '21/9': 'Ultrawide (21:9)',
};

const MOBILE_SIDEBAR_LABELS: Record<string, string> = {
  above: 'Above the description',
  below: 'Below the description',
  hidden: 'Hidden on phones',
};

export function ProductDesignForm({
  initial,
  canEdit,
}: {
  initial: ResolvedProductSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState('images');
  const [values, setValues] = React.useState<ResolvedProductSettings>(initial);
  const [state, setState] = React.useState<SaveState>('idle');
  /*
   * "Custom" is a choice of its own, not only a value no preset matches: an
   * administrator who picks it expects the length box even while the value
   * still happens to equal a preset.
   */
  const [customContainer, setCustomContainer] = React.useState(
    () => !CONTAINER_WIDTH_PRESETS.some((preset) => preset.value === initial.layout.containerWidth),
  );

  const dirty = state === 'dirty' || state === 'error';

  const setCard = <K extends keyof ProductCardSettings>(key: K, value: ProductCardSettings[K]) => {
    setValues((current) => ({ ...current, card: { ...current.card, [key]: value } }));
    setState('dirty');
  };
  const setImage = <K extends keyof ProductImageSettings>(
    key: K,
    value: ProductImageSettings[K],
  ) => {
    setValues((current) => ({ ...current, image: { ...current.image, [key]: value } }));
    setState('dirty');
  };
  const setLayout = <K extends keyof ProductLayoutSettings>(
    key: K,
    value: ProductLayoutSettings[K],
  ) => {
    setValues((current) => ({ ...current, layout: { ...current.layout, [key]: value } }));
    setState('dirty');
  };
  const setType = (
    role: ProductTypeRole,
    key: keyof ProductTypography[ProductTypeRole],
    value: string,
  ) => {
    setValues((current) => ({
      ...current,
      typography: { ...current.typography, [role]: { ...current.typography[role], [key]: value } },
    }));
    setState('dirty');
  };

  async function save() {
    setState('saving');
    const result = await saveProductDesign({
      cardSettings: values.card,
      imageSettings: values.image,
      layoutSettings: values.layout,
      typography: values.typography,
    });

    if (!result.ok) {
      setState('error');
      toast(result.error, 'error');
      return;
    }
    setState('saved');
    toast(result.message ?? 'Saved.');
    router.refresh();
    window.setTimeout(() => setState((c) => (c === 'saved' ? 'idle' : c)), 2500);
  }

  return (
    <div className="space-y-4">
      <AdminTabs tabs={TABS} active={tab} onChange={setTab} />

      <Card>
        <CardBody>
          <fieldset disabled={!canEdit || state === 'saving'}>
            {/* --- Images ------------------------------------------------ */}
            <TabPanel id="images" active={tab}>
              <SettingsSection
                title="Card image"
                description="The image on a product card, wherever cards appear. Blank keeps the size the card already used."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Width" hint="e.g. 56px, 4rem or 100%.">
                    <UnitInput
                      value={values.image.cardWidth}
                      aria-label="Card image width"
                      onChange={(v) => setImage('cardWidth', v)}
                    />
                  </Field>
                  <Field label="Height">
                    <UnitInput
                      value={values.image.cardHeight}
                      aria-label="Card image height"
                      onChange={(v) => setImage('cardHeight', v)}
                    />
                  </Field>
                  <Field label="Aspect ratio" htmlFor="card-ratio">
                    <Select
                      id="card-ratio"
                      value={values.image.cardRatio}
                      onChange={(e) =>
                        setImage('cardRatio', e.target.value as ProductImageSettings['cardRatio'])
                      }
                    >
                      {IMAGE_RATIOS.map((value) => (
                        <option key={value} value={value}>
                          {RATIO_LABELS[value] ?? value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Fit" htmlFor="card-fit">
                    <Select
                      id="card-fit"
                      value={values.image.cardFit}
                      onChange={(e) =>
                        setImage('cardFit', e.target.value as ProductImageSettings['cardFit'])
                      }
                    >
                      {FITS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Corner radius">
                    <UnitInput
                      value={values.image.cardRadius}
                      aria-label="Card image radius"
                      onChange={(v) => setImage('cardRadius', v)}
                    />
                  </Field>
                  <Switch
                    label="Fill the card's width"
                    hint="Off keeps the small square mark the card has always used."
                    checked={values.image.cardFullWidth}
                    onChange={(checked) => setImage('cardFullWidth', checked)}
                  />
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Main product image"
                description="The large image at the top of a product page."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Maximum width">
                    <UnitInput
                      value={values.image.mainMaxWidth}
                      aria-label="Main image width"
                      onChange={(v) => setImage('mainMaxWidth', v)}
                    />
                  </Field>
                  <Field label="Aspect ratio" htmlFor="main-ratio">
                    <Select
                      id="main-ratio"
                      value={values.image.mainRatio}
                      onChange={(e) =>
                        setImage('mainRatio', e.target.value as ProductImageSettings['mainRatio'])
                      }
                    >
                      {IMAGE_RATIOS.map((value) => (
                        <option key={value} value={value}>
                          {RATIO_LABELS[value] ?? value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Fit" htmlFor="main-fit">
                    <Select
                      id="main-fit"
                      value={values.image.mainFit}
                      onChange={(e) =>
                        setImage('mainFit', e.target.value as ProductImageSettings['mainFit'])
                      }
                    >
                      {FITS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Corner radius">
                    <UnitInput
                      value={values.image.mainRadius}
                      aria-label="Main image radius"
                      onChange={(v) => setImage('mainRadius', v)}
                    />
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Gallery"
                description="The thumbnails under the main image."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Columns" htmlFor="gallery-columns">
                    <Select
                      id="gallery-columns"
                      value={String(values.image.galleryColumns)}
                      onChange={(e) => setImage('galleryColumns', Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Thumbnail height">
                    <UnitInput
                      value={values.image.galleryHeight}
                      aria-label="Gallery height"
                      onChange={(v) => setImage('galleryHeight', v)}
                    />
                  </Field>
                  <Field label="Aspect ratio" htmlFor="gallery-ratio">
                    <Select
                      id="gallery-ratio"
                      value={values.image.galleryRatio}
                      onChange={(e) =>
                        setImage(
                          'galleryRatio',
                          e.target.value as ProductImageSettings['galleryRatio'],
                        )
                      }
                    >
                      {IMAGE_RATIOS.map((value) => (
                        <option key={value} value={value}>
                          {RATIO_LABELS[value] ?? value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Fit" htmlFor="gallery-fit">
                    <Select
                      id="gallery-fit"
                      value={values.image.galleryFit}
                      onChange={(e) =>
                        setImage('galleryFit', e.target.value as ProductImageSettings['galleryFit'])
                      }
                    >
                      {FITS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Corner radius">
                    <UnitInput
                      value={values.image.galleryRadius}
                      aria-label="Gallery radius"
                      onChange={(v) => setImage('galleryRadius', v)}
                    />
                  </Field>
                  <Field label="Gap between thumbnails">
                    <UnitInput
                      value={values.image.galleryGap}
                      aria-label="Gallery gap"
                      onChange={(v) => setImage('galleryGap', v)}
                    />
                  </Field>
                </div>
              </SettingsSection>
            </TabPanel>

            {/* --- Cards ------------------------------------------------- */}
            <TabPanel id="cards" active={tab}>
              <SettingsSection
                title="Card frame"
                description="How a product card is drawn, everywhere one appears."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorInput
                    id="product-card-bg"
                    label="Background"
                    value={values.card.background}
                    onChange={(v) => setCard('background', v)}
                  />
                  <Field label="Corner radius">
                    <UnitInput
                      value={values.card.radius}
                      aria-label="Card radius"
                      onChange={(v) => setCard('radius', v)}
                    />
                  </Field>
                  <Field label="Padding">
                    <UnitInput
                      value={values.card.padding}
                      aria-label="Card padding"
                      onChange={(v) => setCard('padding', v)}
                    />
                  </Field>
                  <Field label="Shadow" htmlFor="card-shadow">
                    <Select
                      id="card-shadow"
                      value={values.card.shadow}
                      onChange={(e) =>
                        setCard('shadow', e.target.value as ProductCardSettings['shadow'])
                      }
                    >
                      {SHADOWS.map((value) => (
                        <option key={value} value={value}>
                          {value === 'none' ? 'None' : value.toUpperCase()}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Switch
                    label="Show a border"
                    checked={values.card.borderEnabled}
                    onChange={(checked) => setCard('borderEnabled', checked)}
                  />
                  <Field label="Border width">
                    <UnitInput
                      value={values.card.borderWidth}
                      aria-label="Border width"
                      onChange={(v) => setCard('borderWidth', v)}
                    />
                  </Field>
                  <ColorInput
                    id="product-card-border"
                    label="Border colour"
                    value={values.card.borderColor}
                    onChange={(v) => setCard('borderColor', v)}
                  />
                  <Field label="Text alignment" htmlFor="card-align">
                    <Select
                      id="card-align"
                      value={values.card.align}
                      onChange={(e) =>
                        setCard('align', e.target.value as ProductCardSettings['align'])
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Centre</option>
                    </Select>
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Card type & colour"
                description="Blank inherits the website's own type scale and palette."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title size">
                    <UnitInput
                      value={values.card.titleSize}
                      aria-label="Card title size"
                      onChange={(v) => setCard('titleSize', v)}
                    />
                  </Field>
                  <Field label="Title weight" htmlFor="card-title-weight">
                    <Select
                      id="card-title-weight"
                      value={values.card.titleWeight}
                      onChange={(e) =>
                        setCard('titleWeight', e.target.value as ProductCardSettings['titleWeight'])
                      }
                    >
                      {['400', '500', '600', '700', '800'].map((weight) => (
                        <option key={weight} value={weight}>
                          {weight}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ColorInput
                    id="product-card-title-color"
                    label="Title colour"
                    value={values.card.titleColor}
                    onChange={(v) => setCard('titleColor', v)}
                  />
                  <ColorInput
                    id="product-card-description-color"
                    label="Description colour"
                    value={values.card.descriptionColor}
                    onChange={(v) => setCard('descriptionColor', v)}
                  />
                  <Field label="Price size">
                    <UnitInput
                      value={values.card.priceSize}
                      aria-label="Card price size"
                      onChange={(v) => setCard('priceSize', v)}
                    />
                  </Field>
                  <ColorInput
                    id="product-card-price-color"
                    label="Price colour"
                    value={values.card.priceColor}
                    onChange={(v) => setCard('priceColor', v)}
                  />
                  <ColorInput
                    id="product-card-feature-color"
                    label="Feature text colour"
                    value={values.card.featureColor}
                    onChange={(v) => setCard('featureColor', v)}
                  />
                  <ColorInput
                    id="product-card-icon-color"
                    label="Tick colour"
                    value={values.card.iconColor}
                    onChange={(v) => setCard('iconColor', v)}
                  />
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection title="Card grid" description="Spacing between cards in a grid.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Column gap">
                    <UnitInput
                      value={values.card.gridGap}
                      aria-label="Grid gap"
                      onChange={(v) => setCard('gridGap', v)}
                    />
                  </Field>
                  <Field label="Row gap">
                    <UnitInput
                      value={values.card.rowGap}
                      aria-label="Row gap"
                      onChange={(v) => setCard('rowGap', v)}
                    />
                  </Field>
                </div>
              </SettingsSection>
            </TabPanel>

            {/* --- Layout ------------------------------------------------ */}
            <TabPanel id="layout" active={tab}>
              <SettingsSection
                title="Page width"
                description="Blank inherits the website's own container."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Container width" htmlFor="container-width-preset">
                    <Select
                      id="container-width-preset"
                      value={customContainer ? 'custom' : values.layout.containerWidth}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setCustomContainer(true);
                          return;
                        }
                        setCustomContainer(false);
                        setLayout('containerWidth', e.target.value);
                      }}
                    >
                      {CONTAINER_WIDTH_PRESETS.map((preset) => (
                        <option key={preset.value || 'default'} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                      <option value="custom">Custom</option>
                    </Select>
                  </Field>
                  {customContainer ? (
                    <Field label="Custom width" hint="Any CSS length, such as 1200px or 90%.">
                      <UnitInput
                        value={values.layout.containerWidth}
                        aria-label="Custom container width"
                        onChange={(v) => setLayout('containerWidth', v)}
                      />
                    </Field>
                  ) : null}
                  <Field label="Space between sections">
                    <UnitInput
                      value={values.layout.sectionGap}
                      aria-label="Section gap"
                      onChange={(v) => setLayout('sectionGap', v)}
                    />
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Sidebar"
                description="The column the price box sits in, on every product page."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Switch
                    label="Show the sidebar"
                    hint="Off renders every product page as a single column."
                    checked={values.layout.sidebarEnabled}
                    onChange={(checked) => setLayout('sidebarEnabled', checked)}
                  />
                  <Field label="Position" htmlFor="sidebar-position">
                    <Select
                      id="sidebar-position"
                      value={values.layout.sidebarPosition}
                      onChange={(e) =>
                        setLayout(
                          'sidebarPosition',
                          e.target.value as ProductLayoutSettings['sidebarPosition'],
                        )
                      }
                    >
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </Select>
                  </Field>
                  <Field label="Width" hint="Any CSS length — the list is a shortcut.">
                    <UnitInput
                      value={values.layout.sidebarWidth}
                      aria-label="Sidebar width"
                      onChange={(v) => setLayout('sidebarWidth', v)}
                    />
                  </Field>
                  <Field label="Quick widths" htmlFor="sidebar-width-preset">
                    <Select
                      id="sidebar-width-preset"
                      value={
                        (SIDEBAR_WIDTHS as readonly string[]).includes(values.layout.sidebarWidth)
                          ? values.layout.sidebarWidth
                          : ''
                      }
                      onChange={(e) => e.target.value && setLayout('sidebarWidth', e.target.value)}
                    >
                      <option value="">Custom</option>
                      {SIDEBAR_WIDTHS.map((width) => (
                        <option key={width} value={width}>
                          {width}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Gap between the columns">
                    <UnitInput
                      value={values.layout.sidebarGap}
                      aria-label="Sidebar gap"
                      onChange={(v) => setLayout('sidebarGap', v)}
                    />
                  </Field>
                  <Switch
                    label="Stick while scrolling"
                    checked={values.layout.sidebarSticky}
                    onChange={(checked) => setLayout('sidebarSticky', checked)}
                  />
                  <Field label="Sticky offset" hint="How far below the header it settles.">
                    <UnitInput
                      value={values.layout.stickyOffset}
                      aria-label="Sticky offset"
                      onChange={(v) => setLayout('stickyOffset', v)}
                    />
                  </Field>
                  <Field label="On phones" htmlFor="mobile-sidebar">
                    <Select
                      id="mobile-sidebar"
                      value={values.layout.mobileSidebar}
                      onChange={(e) =>
                        setLayout(
                          'mobileSidebar',
                          e.target.value as ProductLayoutSettings['mobileSidebar'],
                        )
                      }
                    >
                      {MOBILE_SIDEBAR.map((value) => (
                        <option key={value} value={value}>
                          {MOBILE_SIDEBAR_LABELS[value] ?? value}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </SettingsSection>

              <SettingsDivider />

              <SettingsSection
                title="Colours"
                description="Product-page overrides. Leave a colour blank to inherit the website palette."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorInput
                    id="product-bg"
                    label="Background"
                    value={values.layout.backgroundColor}
                    onChange={(v) => setLayout('backgroundColor', v)}
                  />
                  <ColorInput
                    id="product-heading-color"
                    label="Headings"
                    value={values.layout.headingColor}
                    onChange={(v) => setLayout('headingColor', v)}
                  />
                  <ColorInput
                    id="product-text-color"
                    label="Body text"
                    value={values.layout.textColor}
                    onChange={(v) => setLayout('textColor', v)}
                  />
                  <ColorInput
                    id="product-link-color"
                    label="Links"
                    value={values.layout.linkColor}
                    onChange={(v) => setLayout('linkColor', v)}
                  />
                  <ColorInput
                    id="product-price-color"
                    label="Price"
                    value={values.layout.priceColor}
                    onChange={(v) => setLayout('priceColor', v)}
                  />
                </div>
              </SettingsSection>

              <SettingsDivider />

              {/*
                * "Other plans" is a section on each product's own Layout
                * screen, with its own heading, source, count and columns. It
                * used to have a second set of controls here that nothing read
                * — a catalogue-wide default would have been shadowed by every
                * product's stored row anyway, so it only ever looked broken.
                */}
              <SettingsSection
                title="Other plans"
                description="The rail of related products is a section on each product's page."
              >
                <p className="text-sm text-muted">
                  Its heading, which products it lists, how many and how many across are on the
                  product itself — <strong className="font-medium text-content">Products</strong> →
                  a product → <strong className="font-medium text-content">Layout</strong> →{' '}
                  <strong className="font-medium text-content">Other plans</strong>. Hiding it there
                  takes it off that product’s page.
                </p>
              </SettingsSection>
            </TabPanel>

            {/* --- Typography -------------------------------------------- */}
            <TabPanel id="typography" active={tab}>
              <SettingsSection
                title="Type scale"
                description="Overrides for product pages only. Blank inherits the website's fonts and sizes."
              >
                <div className="space-y-5">
                  {PRODUCT_TYPE_ROLES.map((role) => (
                    <div key={role} className="grid gap-4 sm:grid-cols-4">
                      <Field label={PRODUCT_TYPE_ROLE_LABELS[role]} hint="Size">
                        <UnitInput
                          value={values.typography[role].size}
                          aria-label={`${PRODUCT_TYPE_ROLE_LABELS[role]} size`}
                          onChange={(v) => setType(role, 'size', v)}
                        />
                      </Field>
                      <Field label="Weight" htmlFor={`type-${role}-weight`}>
                        <Select
                          id={`type-${role}-weight`}
                          value={values.typography[role].weight}
                          onChange={(e) => setType(role, 'weight', e.target.value)}
                        >
                          <option value="">Inherit</option>
                          {['300', '400', '500', '600', '700', '800', '900'].map((weight) => (
                            <option key={weight} value={weight}>
                              {weight}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Line height" htmlFor={`type-${role}-lh`}>
                        <Input
                          id={`type-${role}-lh`}
                          value={values.typography[role].lineHeight}
                          placeholder="1.4"
                          onChange={(e) => setType(role, 'lineHeight', e.target.value)}
                        />
                      </Field>
                      <Field label="Letter spacing" htmlFor={`type-${role}-ls`}>
                        <Input
                          id={`type-${role}-ls`}
                          value={values.typography[role].letterSpacing}
                          placeholder="-0.01em"
                          onChange={(e) => setType(role, 'letterSpacing', e.target.value)}
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              </SettingsSection>
            </TabPanel>
          </fieldset>
        </CardBody>
      </Card>

      {canEdit ? (
        <div className="flex items-center justify-end gap-3">
          <SaveStateIndicator state={state} />
          <Button onClick={save} disabled={!dirty}>
            {state === 'saving' ? 'Saving…' : 'Save design'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
