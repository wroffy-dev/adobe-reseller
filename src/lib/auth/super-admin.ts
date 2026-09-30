import 'server-only';
import { redirect } from 'next/navigation';
import { AuthorizationError, getCurrentUser, requireUser, type SessionUser } from './guards';

/**
 * Guards for what only the platform owner may touch: the plan's limits, SMTP
 * delivery and the activity notifications.
 *
 * Deliberately a role check, not a permission: a permission can be handed to
 * any role from the Staff screen, and these settings must not be delegable —
 * they are what the plan sells.
 */

export const SUPER_ADMIN_ROLE = 'super-admin';

export function isSuperAdmin(user: Pick<SessionUser, 'role'> | null | undefined): boolean {
  return user?.role === SUPER_ADMIN_ROLE;
}

/** Page guard. Anyone else is sent back to the dashboard with a notice. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) redirect('/admin?denied=super-admin');
  return user;
}

/** Action guard. */
export async function authorizeSuperAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('authentication');
  if (!isSuperAdmin(user)) throw new AuthorizationError('super-admin');
  return user;
}
