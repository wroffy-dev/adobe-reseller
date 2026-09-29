/**
 * Registers every current URL in the URL registry, without changing any.
 *
 *   npm run urls:backfill              # register, report collisions
 *   npm run urls:backfill -- --activate  # …and switch the resolver on when clean
 *
 * Idempotent: safe to run again after a restore, an import or a deploy. The
 * same action is available in Admin → SEO → Slug & URL Manager.
 */
import { runBackfill, setResolverEnabled } from '../src/lib/urls/backfill';
import { prisma } from '../src/lib/db/prisma';

async function main() {
  const activate = process.argv.includes('--activate');
  const report = await runBackfill(null);
  console.log(
    `Registered ${report.registered}, updated ${report.updated}, unchanged ${report.unchanged}, removed ${report.removed}.`,
  );
  if (report.collisions.length) {
    console.log(`\n${report.collisions.length} collision(s) to review:`);
    for (const c of report.collisions) console.log(` - [${c.kind}] ${c.path} — ${c.label}: ${c.reason}`);
  }
  if (activate) {
    if (report.collisions.some((c) => c.kind === 'content')) {
      console.log('\nNot activating: resolve the content collisions first (or activate from the admin after review).');
      process.exitCode = 2;
    } else {
      await setResolverEnabled(true);
      console.log('\nRegistry resolver activated.');
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
