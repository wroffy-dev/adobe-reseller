import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowUpRight, Check, CircleAlert, ChevronRight, CircleCheck } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { getDashboardMetrics, getActionItems, getSetupChecks } from '@/lib/services/dashboard';
import { AdminPageHeader } from '@/components/admin/page-header';
import { StatCard } from '@/components/admin/stat-card';
import { QuickActions } from '@/components/admin/quick-actions';
import { TrendChart, PipelineStages, percentChange } from '@/components/admin/charts';
import { LeadStatusBadge } from '@/components/admin/status-badge';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/states';
import { formatRelative, formatPercent, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { PermissionKey } from '@/lib/auth/permissions';
import { resolveListCountry, ALL_COUNTRIES } from '@/lib/admin/country-filter';
import { CountryScopePicker } from '@/components/admin/country-scope-picker';

// Absolute so the public site's title template does not leak into the admin.
export const metadata: Metadata = { title: { absolute: 'Dashboard · Admin' } };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; country?: string }>;
}) {
  const user = await requirePermission('dashboard.view');
  const can = (permission: PermissionKey) => userCan(user, permission);

  const canSeeLeads = can('leads.view');

  const params = await searchParams;
  // Lead figures report one storefront by default — the one chosen in the top
  // bar — with "All countries" one click away.
  const country = await resolveListCountry(user, params.country);
  const countryId = country.countryId ?? undefined;

  const [metrics, actionItems, setupChecks, recentLeads, recentActivity, counts] =
    await Promise.all([
      getDashboardMetrics(30, countryId),
      canSeeLeads ? getActionItems(countryId) : Promise.resolve([]),
      can('settings.manage') ? getSetupChecks() : Promise.resolve([]),
      canSeeLeads
        ? prisma.lead.findMany({
            where: { deletedAt: null, ...(countryId ? { countryId } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              name: true,
              email: true,
              company: true,
              status: true,
              source: true,
              createdAt: true,
              product: { select: { name: true } },
              assignedTo: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      can('audit.view')
        ? prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 7,
            select: {
              id: true,
              action: true,
              entity: true,
              entityId: true,
              summary: true,
              createdAt: true,
              actorEmail: true,
              actor: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      Promise.all([
        prisma.page.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
        prisma.product.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
        prisma.customer.count({ where: { deletedAt: null } }),
        prisma.formSubmission.count(),
      ]),
    ]);

  const [pagesCount, productsCount, customersCount, submissionsCount] = counts;
  const needsAttention = actionItems.filter((item) => item.tone === 'attention' && item.count > 0);
  // Work first: items that need action, then anything else with a count. Items
  // at zero collapse into one quiet "all clear" line instead of six equal rows.
  const pendingItems = actionItems
    .filter((item) => item.count > 0)
    .sort((a, b) => Number(b.tone === 'attention') - Number(a.tone === 'attention'));
  const clearItems = actionItems.filter((item) => item.count === 0);
  const outstandingSetup = setupChecks.filter((check) => !check.configured);
  const configuredCount = setupChecks.length - outstandingSetup.length;

  // Links into lead lists keep the storefront the dashboard is showing.
  const withCountry = (path: string) =>
    country.multiCountry
      ? `${path}${path.includes('?') ? '&' : '?'}country=${encodeURIComponent(country.value)}`
      : path;
  // Card headers keep their link on the title's line, even on phones.
  const inlineHeader = 'flex-row items-center justify-between';

  return (
    // Overview screen: an ambient wash behind glass panels.
    <div className="dashboard">
      <div className="ambient" aria-hidden="true" />
      <AdminPageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description={
          country.multiCountry
            ? `What needs your attention today across ${country.countryId ? country.current.name : 'all countries'}.`
            : 'What needs your attention today, and how the website is performing.'
        }
        actions={
          country.multiCountry ? (
            <CountryScopePicker
              value={country.value}
              options={[
                { value: ALL_COUNTRIES, label: 'All countries' },
                ...country.countries.map((row) => ({ value: row.id, label: row.name })),
              ]}
            />
          ) : undefined
        }
      />

      {params.denied ? (
        <Alert tone="warning" className="mb-6" title="Access denied">
          Your role does not include <code className="font-mono">{params.denied}</code>. Ask a super
          admin to grant it.
        </Alert>
      ) : null}

      {/* --- KPIs ------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {canSeeLeads ? (
          <>
            <StatCard
              label="Total leads"
              value={metrics.totalLeads}
              hint={`${formatNumber(metrics.periodTotal)} in 30 days`}
              trend={percentChange(metrics.periodTotal, metrics.previousPeriodTotal)}
              sparkline={metrics.trend.map((point) => point.count)}
              href={withCountry('/admin/leads')}
              icon="inbox"
            />
            <StatCard
              label="New today"
              value={metrics.newToday}
              hint={`${formatNumber(metrics.newYesterday)} yesterday`}
              tone="brand"
              href={withCountry('/admin/leads?status=NEW')}
              icon="star"
            />
            <StatCard
              label="Open pipeline"
              value={metrics.openPipeline}
              hint={`${formatNumber(metrics.qualified)} qualified`}
              href="/admin/pipeline"
              icon="kanban"
            />
            <StatCard
              label="Win rate"
              value={formatPercent(metrics.conversionRate)}
              hint={`${formatNumber(metrics.won)} won · ${formatNumber(metrics.lost)} lost`}
              tone={metrics.conversionRate >= 25 ? 'success' : 'default'}
              icon="chart"
            />
          </>
        ) : (
          <>
            {can('pages.view') ? (
              <StatCard
                label="Published pages"
                value={pagesCount}
                href="/admin/pages"
                icon="layout"
              />
            ) : null}
            {can('products.view') ? (
              <StatCard
                label="Published products"
                value={productsCount}
                href="/admin/products"
                icon="package"
              />
            ) : null}
            {can('customers.view') ? (
              <StatCard
                label="Customers"
                value={customersCount}
                href="/admin/customers"
                icon="building"
              />
            ) : null}
            {can('forms.view') ? (
              <StatCard
                label="Form submissions"
                value={submissionsCount}
                href="/admin/forms/submissions"
                icon="clipboard"
              />
            ) : null}
          </>
        )}
      </div>

      {/* --- Needs attention + quick actions ---------------------------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {actionItems.length > 0 ? (
          <Card glass className="lg:col-span-2">
            <CardHeader
              title="Needs attention"
              description={
                needsAttention.length > 0
                  ? `${needsAttention.length} ${needsAttention.length === 1 ? 'item needs' : 'items need'} action`
                  : 'Nothing is waiting on you right now.'
              }
            />
            <CardBody className="space-y-3 pt-0">
              {pendingItems.length === 0 ? (
                <p className="flex items-center gap-2.5 rounded-lg border border-hairline px-3 py-3 text-sm text-content">
                  <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  You&rsquo;re all caught up.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {pendingItems.map((item) => {
                    const urgent = item.tone === 'attention';
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={cn(
                            'group flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                            urgent
                              ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300'
                              : 'glass-chip border-hairline hover:border-brand/40',
                          )}
                        >
                          {urgent ? (
                            <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                          ) : null}
                          <span
                            className={cn(
                              'font-heading text-lg font-bold tabular-nums',
                              urgent ? 'text-amber-700' : 'text-content',
                            )}
                          >
                            {formatNumber(item.count)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-content">
                            {item.label}
                            {urgent ? <span className="sr-only"> (needs action)</span> : null}
                          </span>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 text-muted transition-transform motion-safe:group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {clearItems.length > 0 ? (
                <p className="flex items-start gap-2 text-xs text-muted">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-content">All clear:</span>{' '}
                    {clearItems.map((item, i) => (
                      <span key={item.id}>
                        {i > 0 ? ' · ' : ''}
                        <Link href={item.href} className="hover:text-content hover:underline">
                          {item.label}
                        </Link>
                      </span>
                    ))}
                  </span>
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card glass className={cn(actionItems.length === 0 && 'lg:col-span-3')}>
          <CardHeader title="Quick actions" />
          <CardBody className="pt-0">
            <QuickActions can={can} />
          </CardBody>
        </Card>
      </div>

      {/* --- Trend + pipeline ------------------------------------------- */}
      {canSeeLeads ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card glass className="lg:col-span-2">
            <CardHeader
              className={inlineHeader}
              title="Leads, last 30 days"
              actions={
                <Link
                  href="/admin/reports"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  Reports
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
            <CardBody>
              <TrendChart data={metrics.trend} previousTotal={metrics.previousPeriodTotal} />
            </CardBody>
          </Card>

          <Card glass>
            <CardHeader
              className={inlineHeader}
              title="Pipeline"
              actions={
                <Link
                  href="/admin/pipeline"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  Board
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
            <CardBody>
              <PipelineStages
                stages={(
                  [
                    ['New', 'NEW'],
                    ['Contacted', 'CONTACTED'],
                    ['Qualified', 'QUALIFIED'],
                    ['Proposal', 'PROPOSAL'],
                    ['Negotiation', 'NEGOTIATION'],
                  ] as const
                ).map(([label, status]) => ({
                  label,
                  count: metrics.byStatus[status],
                  href: withCountry(`/admin/leads?status=${status}`),
                }))}
                won={metrics.byStatus.WON}
                lost={metrics.byStatus.LOST}
                wonHref={withCountry('/admin/leads?status=WON')}
                lostHref={withCountry('/admin/leads?status=LOST')}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* --- Recent leads + activity + setup ---------------------------- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {canSeeLeads ? (
          <Card glass className="lg:col-span-2">
            <CardHeader
              className={inlineHeader}
              title="Recent leads"
              actions={
                <Link
                  href={withCountry('/admin/leads')}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  View all
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              }
            />
            {recentLeads.length === 0 ? (
              <EmptyState
                title="No leads yet"
                description="Leads captured from your website forms will appear here."
                action={
                  can('leads.create') ? (
                    <Link href="/admin/leads/new" className="text-sm font-medium text-brand hover:underline">
                      Add a lead
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {recentLeads.map((lead) => (
                  <li key={lead.id}>
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/[0.03] focus-visible:bg-muted/[0.05] focus-visible:outline-none sm:px-5"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand"
                        aria-hidden="true"
                      >
                        {initials(lead.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-content">
                          {lead.name}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[lead.company, lead.product?.name, lead.source]
                            .filter(Boolean)
                            .join(' · ') || lead.email}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'hidden shrink-0 text-xs sm:block',
                          lead.assignedTo ? 'text-content' : 'italic text-muted',
                        )}
                      >
                        {lead.assignedTo?.name ?? 'Unassigned'}
                      </span>
                      <LeadStatusBadge status={lead.status} />
                      <span className="hidden w-20 shrink-0 text-right text-xs text-muted md:block">
                        {formatRelative(lead.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <div className={cn('space-y-5', !canSeeLeads && 'lg:col-span-3')}>
          {setupChecks.length > 0 ? (
            <Card glass>
              <CardHeader
                title="Setup"
                description={
                  outstandingSetup.length === 0
                    ? 'Everything essential is configured.'
                    : `${configuredCount} of ${setupChecks.length} done · ${outstandingSetup.length} to go`
                }
              />
              <CardBody className="pt-0">
                <div
                  className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted/15"
                  role="progressbar"
                  aria-label="Setup progress"
                  aria-valuemin={0}
                  aria-valuemax={setupChecks.length}
                  aria-valuenow={configuredCount}
                >
                  <div
                    className="h-full rounded-full bg-emerald-500 motion-safe:transition-[width] motion-safe:duration-500"
                    style={{ width: `${(configuredCount / Math.max(1, setupChecks.length)) * 100}%` }}
                  />
                </div>
                <ul className="space-y-1">
                  {[...setupChecks]
                    .sort((a, b) => Number(a.configured) - Number(b.configured))
                    .map((check) => (
                    <li key={check.id}>
                      <Link
                        href={check.href}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/[0.04]"
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                            check.configured
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-muted/15 text-muted',
                          )}
                        >
                          {check.configured ? (
                            <Check className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <CircleAlert className="h-3 w-3" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-content">{check.label}</span>
                          <span className="block truncate text-xs text-muted">
                            {check.description}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-xs font-medium',
                            check.configured ? 'text-emerald-600' : 'text-muted',
                          )}
                        >
                          {check.configured ? 'Configured' : 'Set up'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {recentActivity.length > 0 ? (
            <Card glass>
              <CardHeader
                className={inlineHeader}
                title="Recent activity"
                actions={
                  <Link
                    href="/admin/audit"
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Audit log
                  </Link>
                }
              />
              <CardBody className="pt-0">
                <ul className="space-y-3">
                  {recentActivity.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5 text-sm">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/40"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-content">{entry.summary}</span>
                        <span className="block text-xs text-muted">
                          {entry.actor?.name ?? entry.actorEmail ?? 'System'} ·{' '}
                          {formatRelative(entry.createdAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Two initials for the lead avatar: first and last word of the name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
