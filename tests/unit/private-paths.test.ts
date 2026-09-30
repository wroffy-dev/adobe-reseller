import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isPrivatePath } from '@/lib/analytics/private-paths';
import { LOGIN_PATH } from '@/lib/auth/routes';

/** Marketing tags load on the public site only. */

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('isPrivatePath', () => {
  it('covers the admin, auth, sign-in, preview and API paths and everything under them', () => {
    for (const p of ['/admin', '/admin/leads', '/auth/verify-2fa', LOGIN_PATH, '/preview/x', '/api', '/api/health']) {
      expect(isPrivatePath(p), p).toBe(true);
    }
  });

  it('leaves the public site alone, including look-alike prefixes', () => {
    for (const p of ['/', '/ae/', '/blog/foo', '/products/bar', '/administration', '/authors', '/previews']) {
      expect(isPrivatePath(p), p).toBe(false);
    }
  });
});

describe('where the tags render', () => {
  it('only in the public layout, not the root layout', () => {
    const rootLayout = read('src/app/layout.tsx');
    expect(rootLayout).not.toContain('HeadTracking');
    expect(rootLayout).not.toContain('BodyTracking');
    expect(rootLayout).not.toContain('ConsentBanner');
    expect(rootLayout).toContain('<TrackingRouteGuard');
    const publicLayout = read('src/app/(public)/layout.tsx');
    expect(publicLayout).toContain('<HeadTracking');
    expect(publicLayout).toContain('placement="BODY_START"');
    expect(publicLayout).toContain('placement="BODY_END"');
    expect(publicLayout).toContain('<ConsentBanner');
  });
});
