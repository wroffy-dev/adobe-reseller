'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, CircleX, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/states';
import { Spinner } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { Drawer } from '@/components/admin/urls/drawer';
import { PrimaryKeywordFields } from '@/components/admin/seo/primary-keyword-fields';
import { checkCityAddress, createCity } from '@/lib/actions/cities';
import { citySlug, DEFAULT_CITY_PHRASE, suggestCitySeo } from '@/lib/cities/defaults';

export type CityCountryOption = { id: string; name: string };

/**
 * The URL a slug will have in a market, shown as the admin types. The
 * template comes from the server and already honours the market prefix and
 * any page URL pattern ("/ae/__slug__").
 */
export function useCityAddress(countryId: string, slug: string, cityId?: string) {
  const [state, setState] = React.useState<{ path: string; available: boolean | null; message: string | null; checking: boolean }>({
    path: '',
    available: null,
    message: null,
    checking: false,
  });
  React.useEffect(() => {
    if (!countryId || !slug) {
      setState({ path: '', available: null, message: null, checking: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, checking: true }));
    const timer = setTimeout(async () => {
      const result = await checkCityAddress({ countryId, slug, cityId });
      if (!live) return;
      if (result.ok && result.data) setState({ ...result.data, checking: false });
      else setState({ path: '', available: false, message: result.ok ? null : result.error, checking: false });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [countryId, slug, cityId]);
  return state;
}

export function AddressPreview({
  origin,
  template,
  slug,
  state,
}: {
  origin: string;
  template: string | undefined;
  slug: string;
  state: ReturnType<typeof useCityAddress>;
}) {
  const path = state.path || (template ? template.replace('__slug__', slug || 'city') : '');
  return (
    <div className="rounded-lg border border-hairline bg-muted/[0.04] px-3 py-2 text-sm" aria-live="polite">
      <p className="text-xs text-muted">Public URL</p>
      <p className="break-all font-mono text-content">
        {origin}
        {path}
      </p>
      {state.checking ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <Spinner className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Checking the URL registry…
        </p>
      ) : state.available === true ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
          <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> Available
        </p>
      ) : state.available === false ? (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-red-700">
          <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {state.message ?? 'Not available.'}
        </p>
      ) : null}
    </div>
  );
}

export function CityCreateDrawer({
  countries,
  defaultCountryId,
  templates,
  origin,
  templatePages,
  canPublish,
}: {
  countries: CityCountryOption[];
  defaultCountryId: string;
  /** Page path template per country id. */
  templates: Record<string, string>;
  origin: string;
  templatePages: Array<{ id: string; title: string; countryId: string }>;
  canPublish: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [countryId, setCountryId] = React.useState(defaultCountryId);
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [region, setRegion] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [createPage, setCreatePage] = React.useState(true);
  const [status, setStatus] = React.useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [phrase, setPhrase] = React.useState(DEFAULT_CITY_PHRASE);
  const [templatePageId, setTemplatePageId] = React.useState('');
  const [seo, setSeo] = React.useState({ seoTitle: '', h1: '', seoDescription: '', keywords: ['', '', ''] });
  const [seoTouched, setSeoTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [error, setError] = React.useState<string | null>(null);

  const countryName = countries.find((c) => c.id === countryId)?.name ?? '';
  const address = useCityAddress(countryId, slug);

  // Suggestions follow the name, region and phrase until the admin edits them.
  React.useEffect(() => {
    if (seoTouched) return;
    if (!name.trim()) {
      setSeo({ seoTitle: '', h1: '', seoDescription: '', keywords: ['', '', ''] });
      return;
    }
    const s = suggestCitySeo({ city: name.trim(), region: region.trim() || null, country: countryName }, phrase);
    setSeo({ seoTitle: s.seoTitle, h1: s.h1, seoDescription: s.seoDescription, keywords: [0, 1, 2].map((i) => s.keywords[i] ?? '') });
  }, [name, region, phrase, countryName, seoTouched]);

  React.useEffect(() => {
    if (!slugTouched) setSlug(citySlug(name));
  }, [name, slugTouched]);

  const reset = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setRegion('');
    setSeoTouched(false);
    setTemplatePageId('');
    setErrors({});
    setError(null);
  };

  const editSeo = (patch: Partial<typeof seo>) => {
    setSeoTouched(true);
    setSeo((current) => ({ ...current, ...patch }));
  };

  const submit = async () => {
    setPending(true);
    setErrors({});
    setError(null);
    const result = await createCity({
      countryId,
      name,
      slug,
      region,
      isActive,
      sortOrder: 0,
      page: {
        createPage,
        status,
        phrase,
        templatePageId: templatePageId || null,
        seoTitle: seo.seoTitle,
        seoDescription: seo.seoDescription,
        h1: seo.h1,
        keywords: seo.keywords,
      },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setErrors(result.fieldErrors ?? {});
      return;
    }
    toast(result.message ?? 'City created.');
    setOpen(false);
    reset();
    if (result.data) router.push(`/admin/cities/${result.data.id}`);
    else router.refresh();
  };

  const pagesHere = templatePages.filter((p) => p.countryId === countryId);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add city
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Add city"
        description="A city gets a landing page built with the page builder. Everything generated here stays editable."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !name.trim() || !slug || address.available === false}>
              {pending ? 'Creating…' : createPage ? 'Create city and page' : 'Create city'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {countries.length > 1 ? (
            <Field label="Country" htmlFor="city-country" required error={errors.countryId}>
              <Select id="city-country" value={countryId} onChange={(e) => setCountryId(e.target.value)}>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City name" htmlFor="city-name" required error={errors.name}>
              <Input id="city-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Delhi" />
            </Field>
            <Field label="Region" htmlFor="city-region" hint="State, province or emirate. Optional." error={errors.region}>
              <Input id="city-region" value={region} maxLength={120} onChange={(e) => setRegion(e.target.value)} />
            </Field>
          </div>
          <Field label="URL slug" htmlFor="city-slug" required error={errors.slug} hint="Generated from the name; edit it if you need to.">
            <Input
              id="city-slug"
              value={slug}
              maxLength={120}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
              }}
            />
          </Field>
          <AddressPreview origin={origin} template={templates[countryId]} slug={slug} state={address} />
          <Switch checked={isActive} onChange={setIsActive} label="Active" hint="An archived city keeps its record but its pages are taken off the website." />

          <div className="space-y-4 rounded-lg border border-hairline p-4">
            <Switch checked={createPage} onChange={setCreatePage} label="Create the landing page" hint="An ordinary CMS page at the URL above." />
            {createPage ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Page status" htmlFor="city-status">
                    <Select id="city-status" value={status} onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}>
                      <option value="DRAFT">Draft — review before publishing</option>
                      {canPublish ? <option value="PUBLISHED">Published</option> : null}
                    </Select>
                  </Field>
                  <Field label="Start from" htmlFor="city-template" hint="Copied once; {{city}} is filled in.">
                    <Select id="city-template" value={templatePageId} onChange={(e) => setTemplatePageId(e.target.value)}>
                      <option value="">Starter layout</option>
                      {pagesHere.map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="What the page offers" htmlFor="city-phrase" hint="Used to suggest the title, H1 and keywords below.">
                  <Input id="city-phrase" value={phrase} maxLength={80} onChange={(e) => setPhrase(e.target.value)} />
                </Field>
                <Field label="SEO title" htmlFor="city-seo-title" hint={`${seo.seoTitle.length}/60 characters.`}>
                  <Input id="city-seo-title" value={seo.seoTitle} maxLength={200} onChange={(e) => editSeo({ seoTitle: e.target.value })} />
                </Field>
                <Field label="H1" htmlFor="city-h1" hint={templatePageId ? 'A template page keeps its own headings.' : 'The main heading of the page.'}>
                  <Input id="city-h1" value={seo.h1} maxLength={240} disabled={Boolean(templatePageId)} onChange={(e) => editSeo({ h1: e.target.value })} />
                </Field>
                <Field label="Meta description" htmlFor="city-desc" hint={`${seo.seoDescription.length} characters. Aim for 140–160.`}>
                  <Textarea id="city-desc" rows={3} maxLength={400} value={seo.seoDescription} onChange={(e) => editSeo({ seoDescription: e.target.value })} />
                </Field>
                <PrimaryKeywordFields idPrefix="city-kw" values={seo.keywords} onChange={(keywords) => editSeo({ keywords })} />
              </>
            ) : null}
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      </Drawer>
    </>
  );
}
