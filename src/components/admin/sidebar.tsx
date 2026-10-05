'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { X, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import {
  visibleModules,
  isItemActive,
  type AdminNavItem,
  type AdminNavModule,
} from '@/lib/admin/nav';
import type { PermissionKey } from '@/lib/auth/permissions';
import { NavIcon } from './nav-icon';
import { cn } from '@/lib/utils/cn';

export type SidebarProps = {
  permissions: string[];
  isSuperAdmin: boolean;
  siteName: string;
  logoUrl: string | null;
  /** Preferred on the dark rail; falls back to the light logo. */
  logoDarkUrl?: string | null;
  /** Mobile drawer state. */
  open: boolean;
  onClose: () => void;
  /** Desktop icon-only state, owned by AdminShell so the topbar can offset. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/**
 * Admin navigation.
 *
 * Modules collapse and expand, the group owning the current route opens
 * automatically, and on desktop the whole rail can shrink to icons. Expanded
 * and collapsed state persist in localStorage so the admin's layout survives a
 * refresh.
 */
export function AdminSidebar({
  permissions,
  isSuperAdmin,
  siteName,
  logoUrl,
  logoDarkUrl,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const can = React.useCallback(
    (permission: PermissionKey) => isSuperAdmin || permissions.includes(permission),
    [isSuperAdmin, permissions],
  );

  const modules = React.useMemo(() => visibleModules(can, isSuperAdmin), [can, isSuperAdmin]);

  const activeModuleId = React.useMemo(() => {
    for (const group of modules) {
      if (group.href && isItemActive(group, pathname, search)) return group.id;
      if (group.items.some((item) => isItemActive(item, pathname, search))) return group.id;
      // Detail routes (/admin/pages/abc) keep their group open too.
      if (group.items.some((item) => pathname.startsWith(`${item.href.split('?')[0]}/`)))
        return group.id;
    }
    return null;
  }, [modules, pathname, search]);

  const [manuallyClosed, setManuallyClosed] = React.useState<string[]>([]);
  const [extraOpen, setExtraOpen] = React.useState<string[]>([]);

  // Restore the admin's own expand/collapse choices.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem('admin:nav');
      if (!raw) return;
      const saved = JSON.parse(raw) as { closed?: string[]; open?: string[] };
      if (Array.isArray(saved.closed)) setManuallyClosed(saved.closed);
      if (Array.isArray(saved.open)) setExtraOpen(saved.open);
    } catch {
      // A corrupt or unavailable store simply means default expansion.
    }
  }, []);

  const persist = React.useCallback((closed: string[], opened: string[]) => {
    try {
      window.localStorage.setItem('admin:nav', JSON.stringify({ closed, open: opened }));
    } catch {
      // Private mode — the nav still works, it just will not remember.
    }
  }, []);

  const asideRef = React.useRef<HTMLElement | null>(null);

  /**
   * Drawer behaviour on small screens: Escape closes it, the page behind stops
   * scrolling, and focus moves into the drawer and returns to the trigger on
   * close. None of this applies to the docked desktop sidebar, which is part of
   * the page rather than an overlay.
   */
  React.useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // Trap Tab inside the drawer while it covers the page.
      const focusable = asideRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    asideRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus?.();
    };
    // `onClose` is read through a ref rather than listed here. It arrives as an
    // inline arrow, so it changes identity on every render of the shell, and
    // with it in the dependencies this effect tore down and set up again on
    // each one — restoring focus to the trigger and then moving it to the
    // drawer's first link, while the drawer just sat there open. It belongs to
    // opening and closing, and now runs only for those.
  }, [open]);

  const isExpanded = (moduleId: string) =>
    moduleId === activeModuleId ? !manuallyClosed.includes(moduleId) : extraOpen.includes(moduleId);

  const toggleModule = (moduleId: string) => {
    if (moduleId === activeModuleId) {
      const next = manuallyClosed.includes(moduleId)
        ? manuallyClosed.filter((id) => id !== moduleId)
        : [...manuallyClosed, moduleId];
      setManuallyClosed(next);
      persist(next, extraOpen);
      return;
    }
    const next = extraOpen.includes(moduleId)
      ? extraOpen.filter((id) => id !== moduleId)
      : [...extraOpen, moduleId];
    setExtraOpen(next);
    persist(manuallyClosed, next);
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-backdrop bg-[rgb(var(--shadow-ink))]/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        ref={asideRef}
        id="admin-sidebar"
        className={cn(
          // A floating glass rail: inset 12px from the edges on desktop, an
          // off-canvas drawer on smaller screens.
          'glass-rail fixed inset-y-0 left-0 flex flex-col rounded-r-[var(--radius-shell)]',
          'lg:inset-y-3 lg:left-3 lg:rounded-[var(--radius-shell)]',
          'transition-[transform,width] duration-200 ease-out lg:translate-x-0',
          collapsed ? 'w-64 lg:w-[4.75rem]' : 'w-64',
          open ? 'translate-x-0' : '-translate-x-full',
          'z-drawer lg:z-sidebar',
        )}
        aria-label="Admin navigation"
        aria-modal={open ? true : undefined}
        role={open ? 'dialog' : undefined}
      >
        {/* Header row: the brand, then the collapse toggle beside it. */}
        <div
          className={cn(
            'flex h-16 shrink-0 items-center gap-2 px-4',
            collapsed && 'lg:flex-col lg:justify-center lg:gap-1.5 lg:px-2 lg:h-auto lg:py-3',
          )}
        >
          <Link
            href="/admin"
            className="admin-focus flex min-w-0 items-center gap-2.5 rounded-xl"
            aria-label={siteName}
            title={collapsed ? siteName : undefined}
          >
            {logoUrl && !collapsed ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={siteName} className="logo-light h-7 w-auto max-w-[9rem] object-contain" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoDarkUrl || logoUrl} alt="" aria-hidden="true" className="logo-dark h-7 w-auto max-w-[9rem] object-contain" />
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand text-sm font-bold text-white shadow-sm">
                  {siteName.charAt(0).toUpperCase()}
                </span>
                <span className={cn('truncate text-[0.9375rem] font-semibold tracking-tight text-admin-nav', collapsed && 'lg:hidden')}>
                  {siteName}
                </span>
              </>
            )}
          </Link>

          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            aria-controls="admin-sidebar"
            className={cn(
              'admin-focus ml-auto hidden h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-admin-nav/60',
              'transition-colors hover:bg-admin-nav/[0.06] hover:text-admin-nav lg:flex',
              collapsed && 'lg:ml-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="admin-focus ml-auto rounded-[10px] p-1.5 text-admin-nav/70 transition-colors hover:bg-admin-nav/[0.06] hover:text-admin-nav lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav
          className={cn(
            'admin-scroll flex-1 overflow-y-auto overflow-x-hidden pb-4 pt-1',
            collapsed ? 'px-3 lg:px-2.5' : 'px-3',
          )}
        >
          <ul className="space-y-0.5">
            {modules.map((group, index) => {
              const section = group.section;
              const startsSection = Boolean(section) && section !== modules[index - 1]?.section;
              // "Website" above a module called "Website" says nothing twice;
              // the collapsed rail still gets its divider.
              const repeatsLabel = Boolean(section) && group.label.toLowerCase().startsWith(section!.toLowerCase());
              return (
                <li key={group.id}>
                  {startsSection ? (
                    <>
                      <p
                        className={cn(
                          'px-3 pb-1.5 pt-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-admin-nav/45',
                          collapsed && 'lg:hidden',
                          repeatsLabel && 'hidden',
                        )}
                      >
                        {section}
                      </p>
                      {collapsed ? <hr className="mx-2 my-2 hidden border-admin-nav/10 lg:block" aria-hidden="true" /> : null}
                      {repeatsLabel && !collapsed ? <div className="h-3" aria-hidden="true" /> : null}
                    </>
                  ) : null}
                  {group.href ? (
                    <SidebarLink
                      href={group.href}
                      label={group.label}
                      icon={group.icon}
                      active={isItemActive(group, pathname, search)}
                      collapsed={collapsed}
                      onNavigate={onClose}
                    />
                  ) : (
                    <SidebarModule
                      group={group}
                      expanded={isExpanded(group.id)}
                      isActiveModule={group.id === activeModuleId}
                      collapsed={collapsed}
                      pathname={pathname}
                      search={search}
                      onToggle={() => toggleModule(group.id)}
                      onNavigate={onClose}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}

/**
 * Where a collapsed rail's tooltip or fly-out is painted.
 *
 * The nav scrolls, and a scroll container clips on both axes, so anything
 * positioned inside it is invisible. Painting it `fixed` and measuring the row
 * against the rail lets it escape the rail's clipping.
 */
function useFlyout() {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const place = React.useCallback(() => {
    const row = rowRef.current?.getBoundingClientRect();
    const rail = rowRef.current?.closest('aside')?.getBoundingClientRect();
    if (!row || !rail) return;
    setPosition({ top: row.top - rail.top, left: rail.right - rail.left });
  }, []);
  return { rowRef, position, place };
}

function SidebarModule({
  group,
  expanded,
  isActiveModule,
  collapsed,
  pathname,
  search,
  onToggle,
  onNavigate,
}: {
  group: AdminNavModule & { items: AdminNavItem[] };
  expanded: boolean;
  isActiveModule: boolean;
  collapsed: boolean;
  pathname: string;
  search: string;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const panelId = `nav-group-${group.id}`;
  const { rowRef, position, place } = useFlyout();

  // The collapsed rail has no room for a sub-list, so the group becomes one
  // icon that flies its children out on hover or focus.
  if (collapsed) {
    return (
      <div ref={rowRef} onMouseEnter={place} onFocus={place} className="group/group relative hidden lg:block">
        <Link
          href={group.items[0]!.href}
          onClick={onNavigate}
          aria-label={group.label}
          title={group.label}
          className={cn(
            'admin-focus relative flex h-10 w-full items-center justify-center rounded-xl transition-colors',
            isActiveModule
              ? 'bg-admin-nav/[0.07] text-admin-nav'
              : 'text-admin-nav/60 hover:bg-admin-nav/[0.05] hover:text-admin-nav',
          )}
        >
          {isActiveModule ? <ActiveBar /> : null}
          <NavIcon name={group.icon} className="h-[1.15rem] w-[1.15rem]" />
        </Link>

        <div
          style={position ? { top: position.top, left: position.left } : undefined}
          className={cn(
            'glass-menu pointer-events-none fixed z-tooltip ml-2 w-56 origin-left scale-95 p-1.5 opacity-0 transition duration-150 ease-out',
            position ? 'block' : 'hidden',
            'group-hover/group:pointer-events-auto group-hover/group:scale-100 group-hover/group:opacity-100',
            'group-focus-within/group:pointer-events-auto group-focus-within/group:scale-100 group-focus-within/group:opacity-100',
          )}
        >
          <p className="px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-admin-nav/50">
            {group.label}
          </p>
          <ul>
            {group.items.map((item) => {
              const active = isItemActive(item, pathname, search);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'admin-focus block truncate rounded-[10px] px-2.5 py-2 text-sm transition-colors',
                      active
                        ? 'bg-admin-nav/[0.07] font-medium text-admin-nav'
                        : 'text-admin-nav/70 hover:bg-admin-nav/[0.05] hover:text-admin-nav',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={cn(
          'admin-focus flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
          isActiveModule
            ? 'font-medium text-admin-nav'
            : 'text-admin-nav/75 hover:bg-admin-nav/[0.05] hover:text-admin-nav',
        )}
      >
        <NavIcon
          name={group.icon}
          className={cn(
            'h-[1.15rem] w-[1.15rem] shrink-0 transition-colors',
            isActiveModule ? 'text-admin-nav' : 'text-admin-nav/50',
          )}
        />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-admin-nav/45 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        // Animating grid-template-rows keeps the transition smooth without
        // measuring the panel's height.
        className={cn('grid transition-[grid-template-rows] duration-200 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <ul className="ml-[1.4rem] space-y-0.5 overflow-hidden border-l border-[color:var(--nav-guide)] pl-2.5">
          {group.items.map((item) => {
            const active = isItemActive(item, pathname, search);
            return (
              <li key={item.href} className={cn('relative', !expanded && 'invisible')}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  tabIndex={expanded ? undefined : -1}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'admin-focus relative block truncate rounded-[10px] px-2.5 py-1.5 text-[0.8125rem] transition-colors',
                    active
                      ? 'bg-admin-nav/[0.07] font-medium text-admin-nav'
                      : 'text-admin-nav/65 hover:bg-admin-nav/[0.05] hover:text-admin-nav',
                  )}
                >
                  {active ? <ActiveBar className="-left-[0.7rem]" /> : null}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/** The 3px accent bar that marks the active item, so it is not colour alone. */
function ActiveBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand', className)}
    />
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const { rowRef, position, place } = useFlyout();
  return (
    <div ref={rowRef} onMouseEnter={place} onFocus={place} className="group/link relative">
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        className={cn(
          'admin-focus relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
          active
            ? 'bg-admin-nav/[0.07] font-medium text-admin-nav'
            : 'text-admin-nav/75 hover:bg-admin-nav/[0.05] hover:text-admin-nav',
          collapsed && 'lg:h-10 lg:justify-center lg:px-0',
        )}
      >
        {active ? <ActiveBar /> : null}
        <NavIcon
          name={icon}
          className={cn('h-[1.15rem] w-[1.15rem] shrink-0 transition-colors', active ? 'text-admin-nav' : 'text-admin-nav/50')}
        />
        <span className={cn('truncate', collapsed && 'lg:hidden')}>{label}</span>
      </Link>
      {/* The collapsed rail's tooltip, painted outside the rail's clipping. */}
      {collapsed ? (
        <span
          role="tooltip"
          style={position ? { top: position.top + 4, left: position.left } : undefined}
          className={cn(
            'glass-menu pointer-events-none fixed z-tooltip ml-2 hidden whitespace-nowrap px-2.5 py-1.5 text-xs font-medium text-admin-nav opacity-0 transition-opacity duration-150',
            position && 'lg:block',
            'group-hover/link:opacity-100 group-focus-within/link:opacity-100',
          )}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
