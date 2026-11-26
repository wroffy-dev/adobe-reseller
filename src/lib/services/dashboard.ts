import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { LeadStatus } from '@prisma/client';

export type DashboardMetrics = {
  totalLeads: number;
  newToday: number;
  newThisMonth: number;
  /** Leads created yesterday (calendar day), for the "New today" comparison. */
  newYesterday: number;
  /** Leads created in the reporting window (`days`). */
  periodTotal: number;
  /** Leads created in the same-length window just before it. */
  previousPeriodTotal: number;
  qualified: number;
  won: number;
  lost: number;
  openPipeline: number;
  conversionRate: number;
  byStatus: Record<LeadStatus, number>;
  topProducts: Array<{ name: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
};

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Single round-trip batch of the dashboard aggregates.
 *
 * `countryId` scopes every figure to one storefront. Omitting it reports the
 * whole business, which is what a single-market installation always gets.
 */
export async function getDashboardMetrics(
  days = 30,
  countryId?: string,
): Promise<DashboardMetrics> {
  const notDeleted = countryId ? { deletedAt: null, countryId } : { deletedAt: null };
  const since = startOfDay(new Date(Date.now() - (days - 1) * 86_400_000));

  const previousSince = new Date(since.getTime() - days * 86_400_000);
  const yesterday = new Date(startOfDay().getTime() - 86_400_000);

  const [
    total,
    today,
    month,
    grouped,
    productGroups,
    sourceGroups,
    recentLeads,
    previousPeriodTotal,
    newYesterday,
  ] = await Promise.all([
      prisma.lead.count({ where: notDeleted }),
      prisma.lead.count({
        where: { ...notDeleted, createdAt: { gte: startOfDay() } },
      }),
      prisma.lead.count({
        where: { ...notDeleted, createdAt: { gte: startOfMonth() } },
      }),
      prisma.lead.groupBy({
        by: ['status'],
        where: notDeleted,
        _count: { _all: true },
      }),
      prisma.lead.groupBy({
        by: ['productId'],
        where: { ...notDeleted, productId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { productId: 'desc' } },
        take: 5,
      }),
      prisma.lead.groupBy({
        by: ['utmSource'],
        where: notDeleted,
        _count: { _all: true },
        orderBy: { _count: { utmSource: 'desc' } },
        take: 6,
      }),
      prisma.lead.findMany({
        where: { ...notDeleted, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.lead.count({
        where: { ...notDeleted, createdAt: { gte: previousSince, lt: since } },
      }),
      prisma.lead.count({
        where: { ...notDeleted, createdAt: { gte: yesterday, lt: startOfDay() } },
      }),
    ]);

  const byStatus = {
    NEW: 0,
    CONTACTED: 0,
    QUALIFIED: 0,
    PROPOSAL: 0,
    NEGOTIATION: 0,
    WON: 0,
    LOST: 0,
    SPAM: 0,
  } as Record<LeadStatus, number>;
  for (const row of grouped) byStatus[row.status] = row._count._all;

  const productIds = productGroups
    .map((g) => g.productId)
    .filter((id): id is string => Boolean(id));
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      })
    : [];
  const productNames = new Map(products.map((p) => [p.id, p.name]));

  // Fill missing days so the sparkline has a continuous x-axis.
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const key = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    counts.set(key, 0);
  }
  for (const lead of recentLeads) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const decided = byStatus.WON + byStatus.LOST;
  const openPipeline =
    byStatus.NEW +
    byStatus.CONTACTED +
    byStatus.QUALIFIED +
    byStatus.PROPOSAL +
    byStatus.NEGOTIATION;

  return {
    totalLeads: total,
    newToday: today,
    newThisMonth: month,
    newYesterday,
    periodTotal: recentLeads.length,
    previousPeriodTotal,
    qualified: byStatus.QUALIFIED,
    won: byStatus.WON,
    lost: byStatus.LOST,
    openPipeline,
    conversionRate: decided > 0 ? (byStatus.WON / decided) * 100 : 0,
    byStatus,
    topProducts: productGroups.map((g) => ({
      name: productNames.get(g.productId ?? '') ?? 'Unknown',
      count: g._count._all,
    })),
    topSources: sourceGroups.map((g) => ({
      source: g.utmSource || 'Direct / none',
      count: g._count._all,
    })),
    trend: Array.from(counts.entries()).map(([date, count]) => ({
      date,
      count,
    })),
  };
}

// ---------------------------------------------------------------------------
// Control-centre data
// ---------------------------------------------------------------------------

export type ActionItem = {
  id: string;
  label: string;
  count: number;
  href: string;
  /** `attention` is used only where the count genuinely needs someone to act. */
  tone: 'attention' | 'neutral';
};

/**
 * The operational queue for the dashboard's "Needs attention" panel.
 *
 * Every entry is a real count from a real table with a link that applies the
 * matching filter — no invented health scores.
 */
export async function getActionItems(countryId?: string): Promise<ActionItem[]> {
  const notDeleted = { deletedAt: null };
  // Scoped to one market when asked, so the "needs attention" list matches the
  // storefront the admin is looking at rather than the whole business.
  const scoped = countryId ? { deletedAt: null, countryId } : notDeleted;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [unassigned, followUpsDue, draftPages, draftProducts, newLeads, unreadSubmissions] =
    await Promise.all([
      prisma.lead.count({
        where: {
          ...scoped,
          assignedToId: null,
          status: { notIn: ['WON', 'LOST', 'SPAM'] },
        },
      }),
      prisma.lead.count({
        where: {
          ...scoped,
          followUpAt: { lte: endOfToday },
          status: { notIn: ['WON', 'LOST', 'SPAM'] },
        },
      }),
      prisma.page.count({ where: { ...scoped, status: 'DRAFT' } }),
      prisma.productCountry.count({
        where: {
          deletedAt: null,
          status: 'DRAFT',
          product: { deletedAt: null },
          ...(countryId ? { countryId } : {}),
        },
      }),
      prisma.lead.count({ where: { ...scoped, status: 'NEW' } }),
      prisma.formSubmission.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
          ...(countryId ? { countryId } : {}),
        },
      }),
    ]);

  return [
    {
      id: 'unassigned',
      label: 'Unassigned leads',
      count: unassigned,
      href: '/admin/leads?assignedTo=unassigned',
      tone: unassigned > 0 ? 'attention' : 'neutral',
    },
    {
      id: 'follow-ups',
      label: 'Follow-ups due',
      count: followUpsDue,
      href: '/admin/leads?followUp=due',
      tone: followUpsDue > 0 ? 'attention' : 'neutral',
    },
    {
      id: 'new-leads',
      label: 'New leads to review',
      count: newLeads,
      href: '/admin/leads?status=NEW',
      tone: newLeads > 0 ? 'attention' : 'neutral',
    },
    {
      id: 'submissions',
      label: 'Submissions this week',
      count: unreadSubmissions,
      href: '/admin/forms/submissions',
      tone: 'neutral',
    },
    {
      id: 'draft-pages',
      label: 'Draft pages',
      count: draftPages,
      href: '/admin/pages?status=DRAFT',
      tone: 'neutral',
    },
    {
      id: 'draft-products',
      label: 'Draft products',
      count: draftProducts,
      href: '/admin/products?status=DRAFT',
      tone: 'neutral',
    },
  ];
}

export type SetupCheck = {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  href: string;
};

/**
 * Configuration checks for the dashboard's setup panel.
 *
 * Deliberately limited to things that genuinely stop the site working properly
 * when missing. Optional settings are not reported as problems.
 */
export async function getSetupChecks(): Promise<SetupCheck[]> {
  const [site, seo, tracking, email, forms] = await Promise.all([
    prisma.websiteSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.seoSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.trackingSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.emailSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.form.count({ where: { deletedAt: null, isActive: true } }),
  ]);

  return [
    {
      id: 'branding',
      label: 'Website branding',
      description: 'Site name, logo and contact details',
      configured: Boolean(site?.siteName && site.logoUrl && site.contactEmail),
      href: '/admin/settings',
    },
    {
      id: 'seo',
      label: 'SEO defaults',
      description: 'Default title and description for search results',
      configured: Boolean(seo?.defaultTitle && seo.defaultDescription),
      href: '/admin/seo',
    },
    {
      id: 'tracking',
      label: 'Tracking',
      description: 'Analytics so you can see where leads come from',
      // Configured means a tag is present AND switched on — an ID that is saved
      // but disabled is not tracking anything.
      configured: Boolean(
        (tracking?.ga4Enabled && tracking.ga4Id) ||
        (tracking?.gtmEnabled && tracking.gtmId) ||
        (tracking?.metaPixelEnabled && tracking.metaPixelId),
      ),
      href: '/admin/marketing',
    },
    {
      id: 'email',
      label: 'Email delivery',
      description: 'Needed to send lead notifications',
      configured: Boolean(email?.isEnabled && email.host && email.fromEmail),
      href: '/admin/settings/email',
    },
    {
      id: 'forms',
      label: 'Lead capture form',
      description: 'At least one active form on the website',
      configured: forms > 0,
      href: '/admin/forms',
    },
  ];
}
