import { LOGIN_PATH_SEGMENT } from '@/lib/auth/routes';

/**
 * Paths that belong to the people running the site, not to its visitors.
 *
 * Marketing tags must never load or fire on these: an administrator's session
 * would count as traffic, and a tag vendor would be handed the address of the
 * admin and the sign-in screen. Pure, so the server layouts and the client
 * route guard apply the same rule.
 */
const PRIVATE_PREFIXES = ['/admin', '/auth', `/${LOGIN_PATH_SEGMENT}`, '/preview', '/api'];

/** True for a private path itself and any path beneath it. */
export function isPrivatePath(pathname: string): boolean {
  const path = (pathname || '/').split(/[?#]/)[0] ?? '/';
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
