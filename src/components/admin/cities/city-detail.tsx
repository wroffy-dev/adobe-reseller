'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, LayoutTemplate, Link2Off, Plus } from 'lucide-react';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { ScoreTile, ScoreValue } from '@/components/admin/seo-intelligence/score-badge';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, EmptyState } from '@/components/ui/states';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import {
  createCityLandingPage,
  generateCityProductPages,
  unlinkCityProductPage,
  updateCity,
} from '@/lib/actions/cities';
import { DEFAULT_CITY_PHRASE } from '@/lib/cities/defaults';
import { AddressPreview, useCityAddress } from './city-create-drawer';

type Scores = { seo: number; aeo: number; geo: number; local: number | null; overall: number } | null;

export type CityDetailView = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  isActive: boolean;
  sortOrder: number;
  country: { id: string; name: string };
  page: { id: string; title: string; status: string; path: string } | null;
  pageScores: Scores;
  productPages: Array<{
    id: string;
    product: { id: string; name: string };
    page: { id: string; title: string; status: string; path: string; deleted: boolean };
    scores: Scores;
  }>;
  availableProducts: Array<{ id: string; name: string; marketStatus: string }>;
};

export function CityDetail({
  city,
  origin,
  template,
  canManage,
  canPublish,
}: {
  city: CityDetailView;
  origin: string;
  template: string | undefined;
  canManage: boolean;
  canPublish: boolean;
}) {
  const [tab, setTab] = React.useState('page');
  return (
    <>
      <AdminTabs
        tabs={[
          { id: 'page', label: 'Landing page' },
          { id: 'products', label: 'Product landing pages', badge: city.productPages.length },
          { id: 'details', label: 'City details' },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />
      <TabPanel id="page" active={tab}>
        <LandingPagePanel city={city} canManage={canManage} canPublish={canPublish} />
      </TabPanel>
      <TabPanel id="products" active={tab}>
        <ProductPagesPanel city={city} canManage={canManage} canPublish={canPublish} />
      </TabPanel>
      <TabPanel id="details" active={tab}>
        <CityDetailsForm city={city} origin={origin} template={template} canManage={canManage} />
      </TabPanel>
    </>
  );
}

function CityDetailsForm({
  city,
  origin,
  template,
  canManage,
}: {
  city: CityDetailView;
  origin: string;
  template: string | undefined;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState({ name: city.name, slug: city.slug, region: city.region ?? '', sortOrder: String(city.sortOrder) });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const address = useCityAddress(city.country.id, values.slug, city.id);
  const moving = values.slug !== city.slug;

  const save = async () => {
    setPending(true);
    setErrors({});
    const result = await updateCity(city.id, { ...values, isActive: city.isActive });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City name" htmlFor="cd-name" required error={errors.name}>
            <Input id="cd-name" value={values.name} disabled={!canManage} onChange={(e) => setValues({ ...values, name: e.target.value })} />
          </Field>
          <Field label="Region" htmlFor="cd-region" hint="Optional." error={errors.region}>
            <Input id="cd-region" value={values.region} disabled={!canManage} onChange={(e) => setValues({ ...values, region: e.target.value })} />
          </Field>
          <Field label="URL slug" htmlFor="cd-slug" required error={errors.slug}>
            <Input
              id="cd-slug"
              value={values.slug}
              disabled={!canManage}
              onChange={(e) => setValues({ ...values, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
            />
          </Field>
          <Field label="Sort order" htmlFor="cd-sort" error={errors.sortOrder}>
            <Input id="cd-sort" type="number" min={0} value={values.sortOrder} disabled={!canManage} onChange={(e) => setValues({ ...values, sortOrder: e.target.value })} />
          </Field>
        </div>
        <AddressPreview origin={origin} template={template} slug={values.slug} state={address} />
        {moving ? (
          <Alert tone="warning" title="This moves published addresses">
            The landing page and every page under /{city.slug}/ move to /{values.slug || '…'}/. Each published address gets a
            permanent (308) redirect to its new one, recorded in the Slug &amp; URL Manager history, so links and search
            results keep working.
          </Alert>
        ) : null}
        {canManage ? (
          <div className="flex justify-end">
            <Button onClick={save} disabled={pending || address.available === false}>
              {pending ? 'Saving…' : 'Save city'}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function LandingPagePanel({ city, canManage, canPublish }: { city: CityDetailView; canManage: boolean; canPublish: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [phrase, setPhrase] = React.useState(DEFAULT_CITY_PHRASE);
  const [status, setStatus] = React.useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [pending, setPending] = React.useState(false);

  if (!city.page) {
    return (
      <Card>
        <EmptyState
          icon={<LayoutTemplate className="h-5 w-5" />}
          title="This city has no landing page"
          description="Create one with a starter layout and suggested SEO. It becomes an ordinary page you edit in the page builder."
          action={
            canManage ? (
              <div className="flex w-full max-w-md flex-col gap-3 text-left sm:flex-row sm:items-end">
                <Field label="What the page offers" htmlFor="lp-phrase" className="flex-1">
                  <Input id="lp-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
                </Field>
                <Field label="Status" htmlFor="lp-status">
                  <Select id="lp-status" value={status} onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}>
                    <option value="DRAFT">Draft</option>
                    {canPublish ? <option value="PUBLISHED">Published</option> : null}
                  </Select>
                </Field>
                <Button
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    const result = await createCityLandingPage(city.id, { phrase, status });
                    setPending(false);
                    toast(result.ok ? (result.message ?? 'Created.') : result.error, result.ok ? 'success' : 'error');
                    if (result.ok) router.refresh();
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Create page
                </Button>
              </div>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-content">
              {city.page.title} <ContentStatusBadge status={city.page.status} />
            </p>
            <code className="mt-1 inline-block break-all rounded bg-muted/10 px-1.5 py-0.5 font-mono text-xs text-muted">{city.page.path}</code>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href={`/admin/pages/${city.page.id}`} className={buttonClasses('primary', 'md')}>
              <LayoutTemplate className="h-4 w-4" aria-hidden="true" /> Edit in page builder
            </Link>
            {city.page.status === 'PUBLISHED' ? (
              <a href={city.page.path} target="_blank" rel="noopener noreferrer" className={buttonClasses('outline', 'md')}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> View
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </div>
        {city.pageScores ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <ScoreTile label="Overall" score={city.pageScores.overall} />
            <ScoreTile label="SEO" score={city.pageScores.seo} />
            <ScoreTile label="AEO" score={city.pageScores.aeo} />
            <ScoreTile label="GEO" score={city.pageScores.geo} />
            <ScoreTile label="Local" score={city.pageScores.local} />
          </div>
        ) : (
          <p className="text-sm text-muted">Scores appear once the page has been analysed — open it in the page builder or run SEO Intelligence.</p>
        )}
        <p className="text-xs leading-relaxed text-muted">
          The page is edited like any other page: sections, SEO, keywords, publishing. Changes here never affect another city’s page.
        </p>
      </CardBody>
    </Card>
  );
}

function ProductPagesPanel({ city, canManage, canPublish }: { city: CityDetailView; canManage: boolean; canPublish: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const linked = new Set(city.productPages.map((p) => p.product.id));
  const candidates = city.availableProducts.filter((p) => !linked.has(p.id));
  const [selected, setSelected] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [pending, setPending] = React.useState(false);
  const [skipped, setSkipped] = React.useState<string[]>([]);
  const [unlink, setUnlink] = React.useState<CityDetailView['productPages'][number] | null>(null);

  const generate = async () => {
    setPending(true);
    setSkipped([]);
    const result = await generateCityProductPages({ cityId: city.id, productIds: selected, status });
    setPending(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Created.');
    setSkipped(result.data?.skipped ?? []);
    setSelected([]);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        {city.productPages.length === 0 ? (
          <EmptyState
            title="No product landing pages yet"
            description={`Pages such as ${city.page?.path ?? `/${city.slug}`}/adobe-acrobat-pro, for the products ${city.country.name} sells. Prices on them come live from the product.`}
          />
        ) : (
          <TableWrap>
            <Table>
              <caption className="sr-only">Product landing pages for {city.name}</caption>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Public URL</Th>
                  <Th>Status</Th>
                  <Th align="center">SEO</Th>
                  <Th align="center">AEO</Th>
                  <Th align="center">GEO</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {city.productPages.map((row) => (
                  <Tr key={row.id}>
                    <Td className="min-w-[10rem] font-medium text-content">{row.product.name}</Td>
                    <Td>
                      <code className="break-all rounded bg-muted/10 px-1.5 py-0.5 font-mono text-xs text-muted">{row.page.path}</code>
                    </Td>
                    <Td>{row.page.deleted ? <Badge tone="danger">In Recycle Bin</Badge> : <ContentStatusBadge status={row.page.status} />}</Td>
                    <Td align="center">{row.scores ? <ScoreValue score={row.scores.seo} /> : '—'}</Td>
                    <Td align="center">{row.scores ? <ScoreValue score={row.scores.aeo} /> : '—'}</Td>
                    <Td align="center">{row.scores ? <ScoreValue score={row.scores.geo} /> : '—'}</Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        {!row.page.deleted ? (
                          <Link href={`/admin/pages/${row.page.id}`} className={buttonClasses('ghost', 'sm')}>
                            Edit
                          </Link>
                        ) : null}
                        {row.page.status === 'PUBLISHED' && !row.page.deleted ? (
                          <a href={row.page.path} target="_blank" rel="noopener noreferrer" className={buttonClasses('ghost', 'sm')} aria-label={`View ${row.product.name} page (opens in a new tab)`}>
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        ) : null}
                        {canManage ? (
                          <Button size="sm" variant="ghost" onClick={() => setUnlink(row)} aria-label={`Unlink ${row.product.name}`}>
                            <Link2Off className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {canManage ? (
        <Card>
          <CardBody className="space-y-3">
            <div>
              <h2 className="font-heading text-sm font-semibold text-content">Create product landing pages</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                Each page starts from the product and the city as they are now, then is yours to edit — later changes to the
                product never overwrite it. Only products sold in {city.country.name} are listed.
              </p>
            </div>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted">Every product sold in {city.country.name} already has a page for {city.name}.</p>
            ) : (
              <fieldset>
                <legend className="sr-only">Products</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {candidates.map((product) => (
                    <label key={product.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-hairline text-brand focus:ring-brand/30"
                        checked={selected.includes(product.id)}
                        onChange={(e) =>
                          setSelected((current) => (e.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id)))
                        }
                      />
                      <span className="min-w-0 truncate text-content">{product.name}</span>
                      {product.marketStatus !== 'PUBLISHED' ? <Badge tone="neutral" className="ml-auto shrink-0">{product.marketStatus.toLowerCase()}</Badge> : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
              <Field label="Status" htmlFor="cpp-status">
                <Select id="cpp-status" value={status} onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}>
                  <option value="DRAFT">Draft</option>
                  {canPublish ? <option value="PUBLISHED">Published</option> : null}
                </Select>
              </Field>
              <Button onClick={generate} disabled={pending || selected.length === 0}>
                {pending ? 'Creating…' : `Create ${selected.length || ''} page${selected.length === 1 ? '' : 's'}`}
              </Button>
            </div>
            {skipped.length ? (
              <Alert tone="warning" title="Some products were skipped">
                <ul className="list-disc pl-5">
                  {skipped.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={Boolean(unlink)}
        onClose={() => setUnlink(null)}
        confirmLabel="Unlink"
        tone="primary"
        title={`Unlink the ${unlink?.product.name ?? ''} page?`}
        message="It stops being listed under this city. The page itself, its address and its content are kept in Pages."
        pending={pending}
        onConfirm={async () => {
          if (!unlink) return;
          setPending(true);
          const result = await unlinkCityProductPage(unlink.id);
          setPending(false);
          setUnlink(null);
          toast(result.ok ? (result.message ?? 'Unlinked.') : result.error, result.ok ? 'success' : 'error');
          if (result.ok) router.refresh();
        }}
      />
    </div>
  );
}
