'use client';

import * as React from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { Menu, MenuItem, MenuLabel } from '@/components/ui/menu';

/**
 * The admin's Light / Dark / System theme.
 *
 * The preference lives in localStorage (`admin:theme`, default "system"); the
 * applied state is `data-admin-theme` on <html>, set before the first paint by
 * ADMIN_THEME_SCRIPT so nothing flashes. Every dark rule is written
 * `:root[data-admin-theme="dark"] .admin-ui …`, so the public website never
 * changes whatever this attribute says.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'admin:theme';

/** Inlined in the admin layout, ahead of the shell. Keep it tiny and safe. */
export const ADMIN_THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-admin-theme',d?'dark':'light');}catch(e){}})();`;

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(preference: ThemePreference) {
  const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
  document.documentElement.setAttribute('data-admin-theme', dark ? 'dark' : 'light');
}

function read(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

type ThemeContextValue = {
  /** Null until mounted, so server and client markup agree. */
  preference: ThemePreference | null;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = React.createContext<ThemeContextValue>({ preference: null, setPreference: () => {} });

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setState] = React.useState<ThemePreference | null>(null);

  React.useEffect(() => {
    setState(read());
  }, []);

  // While the preference is "System", follow the operating system live.
  React.useEffect(() => {
    if (preference === null) return;
    apply(preference);
    if (preference !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = React.useCallback((next: ThemePreference) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice simply will not persist.
    }
    setState(next);
  }, []);

  const value = React.useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAdminTheme() {
  return React.useContext(ThemeContext);
}

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/** Menu items for choosing the theme, with a check on the current one. */
export function ThemeMenuItems() {
  const { preference, setPreference } = useAdminTheme();
  return (
    <>
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <MenuItem key={value} icon={<Icon className="h-4 w-4" />} onClick={() => setPreference(value)}>
          <span className="flex items-center justify-between gap-2">
            {label} theme
            {preference === value ? <Check className="h-4 w-4 text-brand" aria-label="(selected)" /> : null}
          </span>
        </MenuItem>
      ))}
    </>
  );
}

/** The 36px theme button in the top bar. */
export function ThemeToggle() {
  const { preference } = useAdminTheme();
  const current = THEME_OPTIONS.find((o) => o.value === preference);
  // A neutral icon until mounted avoids a hydration mismatch.
  const Icon = current?.Icon ?? Monitor;
  return (
    <Menu
      align="right"
      width="w-48"
      label="Theme"
      triggerClassName="admin-focus"
      trigger={
        <span
          title={current ? `Theme: ${current.label}` : 'Theme'}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-admin-nav/70 transition-colors hover:bg-admin-nav/[0.06] hover:text-admin-nav"
        >
          <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
        </span>
      }
    >
      <MenuLabel>Appearance</MenuLabel>
      <ThemeMenuItems />
    </Menu>
  );
}
