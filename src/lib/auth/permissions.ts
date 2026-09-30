/**
 * Canonical permission catalogue.
 * Permissions are stored in the database and attached to roles, but this file is
 * the single source of truth used for seeding and for compile-time safety.
 */

export const PERMISSIONS = {
  'dashboard.view': { group: 'dashboard', label: 'View dashboard' },

  'pages.view': { group: 'pages', label: 'View pages' },
  'pages.create': { group: 'pages', label: 'Create pages' },
  'pages.edit': { group: 'pages', label: 'Edit pages' },
  'pages.delete': { group: 'pages', label: 'Delete pages' },
  'pages.publish': { group: 'pages', label: 'Publish pages' },

  'products.view': { group: 'products', label: 'View products' },
  'products.create': { group: 'products', label: 'Create products' },
  'products.edit': { group: 'products', label: 'Edit products' },
  'products.delete': { group: 'products', label: 'Delete products' },

  'leads.view': { group: 'leads', label: 'View leads' },
  'leads.create': { group: 'leads', label: 'Create leads' },
  'leads.edit': { group: 'leads', label: 'Edit leads' },
  'leads.delete': { group: 'leads', label: 'Delete leads' },
  'leads.export': { group: 'leads', label: 'Export leads' },
  'leads.assign': { group: 'leads', label: 'Assign leads' },
  /*
   * The address itself, not the fact that one was recorded. Separate from
   * leads.view so the people who work leads all day are not handed personal
   * data they have no use for, which is the whole of "restrict IP access to
   * authorised staff".
   */
  'leads.viewIp': { group: 'leads', label: 'View lead IP addresses' },
  /* Recording a withdrawal, and editing the consent notices themselves. */
  'leads.manageConsent': { group: 'leads', label: 'Manage consent records and notices' },

  'customers.view': { group: 'customers', label: 'View customers' },
  'customers.create': { group: 'customers', label: 'Create customers' },
  'customers.edit': { group: 'customers', label: 'Edit customers' },
  'customers.delete': { group: 'customers', label: 'Delete customers' },

  'blog.view': { group: 'blog', label: 'View blog posts' },
  'blog.create': { group: 'blog', label: 'Create blog posts' },
  'blog.edit': { group: 'blog', label: 'Edit blog posts' },
  'blog.delete': { group: 'blog', label: 'Delete blog posts' },
  'blog.publish': { group: 'blog', label: 'Publish blog posts' },
  'blog.categories': { group: 'blog', label: 'Manage blog categories' },
  'blog.tags': { group: 'blog', label: 'Manage blog tags' },
  'blog.design': { group: 'blog', label: 'Manage blog design settings' },
  'blog.sidebar': { group: 'blog', label: 'Manage the blog sidebar' },
  'blog.sections': { group: 'blog', label: 'Manage blog page sections' },

  'forms.view': { group: 'forms', label: 'View forms' },
  'forms.create': { group: 'forms', label: 'Create forms' },
  'forms.edit': { group: 'forms', label: 'Edit forms' },
  'forms.delete': { group: 'forms', label: 'Delete forms' },

  'emails.view': { group: 'emails', label: 'View custom emails' },
  'emails.manage': { group: 'emails', label: 'Create, edit and send custom emails' },

  'backup.view': { group: 'backup', label: 'View backups' },
  'backup.create': { group: 'backup', label: 'Create backups' },
  'backup.download': { group: 'backup', label: 'Download backups' },
  'backup.restore': { group: 'backup', label: 'Restore from a backup' },
  'backup.delete': { group: 'backup', label: 'Delete backups' },
  'backup.settings': { group: 'backup', label: 'Configure backup schedule and storage' },

  'user.mfa.reset': { group: 'security', label: "Reset another user's authenticator" },

  'media.view': { group: 'media', label: 'View media' },
  'media.upload': { group: 'media', label: 'Upload media' },
  'media.edit': { group: 'media', label: 'Edit media metadata' },
  'media.delete': { group: 'media', label: 'Delete media' },

  'seo.manage': { group: 'seo', label: 'Manage SEO and redirects' },
  'marketing.manage': { group: 'marketing', label: 'Manage marketing and tracking' },
  'navigation.manage': { group: 'navigation', label: 'Manage navigation menus' },
  'settings.manage': { group: 'settings', label: 'Manage website settings' },
  'staff.manage': { group: 'staff', label: 'Manage staff and roles' },
  'audit.view': { group: 'audit', label: 'View audit log' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pages: 'Pages',
  products: 'Products',
  leads: 'Leads',
  customers: 'Customers',
  blog: 'Blog',
  forms: 'Forms',
  emails: 'Custom emails',
  media: 'Media',
  seo: 'SEO',
  marketing: 'Marketing',
  navigation: 'Navigation',
  settings: 'Settings',
  staff: 'Staff',
  audit: 'Audit log',
  backup: 'Backup & restore',
  security: 'Account security',
};

/** System roles seeded on first run. rank: lower == more privileged. */
export const SYSTEM_ROLES: Array<{
  slug: string;
  name: string;
  description: string;
  rank: number;
  permissions: PermissionKey[] | 'all';
}> = [
  {
    slug: 'super-admin',
    name: 'Super Admin',
    description: 'Unrestricted access to every part of the platform.',
    rank: 0,
    permissions: 'all',
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Full administrative access except destructive staff/role changes.',
    rank: 10,
    // Restore replaces the entire database and delete destroys the rollback
    // point, so neither is granted by default — a super admin must hand them
    // out deliberately from Roles & Permissions. Admins can still take and
    // download backups, which is the part they need day to day.
    // Resetting someone's authenticator is held back for the same reason: it
    // strips a user's second factor, so it belongs with the most trusted role
    // until it is handed out on purpose.
    permissions: ALL_PERMISSIONS.filter(
      (p) =>
        !(
          ['staff.manage', 'backup.restore', 'backup.delete', 'user.mfa.reset'] as string[]
        ).includes(p),
    ),
  },
  {
    slug: 'sales',
    name: 'Sales',
    description: 'Works leads and customers. Read-only on marketing content.',
    rank: 30,
    permissions: [
      'dashboard.view',
      'leads.view',
      'leads.create',
      'leads.edit',
      'leads.export',
      'leads.assign',
      'customers.view',
      'customers.create',
      'customers.edit',
      'products.view',
      'forms.view',
      'pages.view',
      'blog.view',
      'media.view',
    ],
  },
  {
    slug: 'content-marketing',
    name: 'Content & Marketing',
    description: 'Owns the website, blog, media, SEO and marketing configuration.',
    rank: 30,
    permissions: [
      'dashboard.view',
      'pages.view',
      'pages.create',
      'pages.edit',
      'pages.delete',
      'pages.publish',
      'blog.view',
      'blog.create',
      'blog.edit',
      'blog.delete',
      'blog.publish',
      'blog.categories',
      'blog.tags',
      'blog.design',
      'blog.sidebar',
      'blog.sections',
      'products.view',
      'products.create',
      'products.edit',
      'forms.view',
      'forms.create',
      'forms.edit',
      'media.view',
      'media.upload',
      'media.edit',
      'media.delete',
      'seo.manage',
      'marketing.manage',
      'navigation.manage',
      'leads.view',
    ],
  },
];

export function permissionsForRole(slug: string): PermissionKey[] {
  const role = SYSTEM_ROLES.find((r) => r.slug === slug);
  if (!role) return [];
  return role.permissions === 'all' ? ALL_PERMISSIONS : role.permissions;
}
