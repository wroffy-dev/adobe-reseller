-- Plan limits, custom emails and activity notifications.
-- Additive only: two new tables and two new permissions granted to the
-- built-in Admin role (Super Admin already has every permission).

CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "maxCustomEmails" INTEGER,
    "activityEmailsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "activityEmailRecipients" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomEmail" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomEmail_createdAt_idx" ON "CustomEmail"("createdAt");

INSERT INTO "Permission" ("id", "key", "group", "label")
VALUES
  ('perm_emails_view', 'emails.view', 'emails', 'View custom emails'),
  ('perm_emails_manage', 'emails.manage', 'emails', 'Create, edit and send custom emails')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "UserRole" r
JOIN "Permission" p ON p."key" IN ('emails.view', 'emails.manage')
WHERE r."slug" = 'admin'
ON CONFLICT DO NOTHING;
