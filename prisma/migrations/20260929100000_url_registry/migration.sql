-- URL registry (Slug & URL Manager).
--
-- Non-destructive: only new tables, new nullable columns and new indexes. No
-- existing row is changed except to fill the new columns below, and no public
-- address changes — the registry resolver stays off (UrlSettings.resolverEnabled)
-- until the backfill has run and an administrator activates it.

-- CreateEnum
CREATE TYPE "RedirectOrigin" AS ENUM ('MANUAL', 'AUTO', 'HEALTH', 'IMPORT');

-- CreateEnum
CREATE TYPE "UrlContentType" AS ENUM ('PRODUCT', 'PAGE', 'BLOG_POST', 'BLOG_CATEGORY', 'BLOG_TAG', 'CATEGORY_PAGE', 'BRAND_PAGE');

-- CreateEnum
CREATE TYPE "UrlRouteMode" AS ENUM ('PATTERN', 'CUSTOM');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "taxonomyId" TEXT,
ADD COLUMN     "taxonomyKind" TEXT;

-- AlterTable
ALTER TABLE "Redirect" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "lastHitAt" TIMESTAMP(3),
ADD COLUMN     "origin" "RedirectOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "targetLabel" TEXT,
ADD COLUMN     "targetRouteId" TEXT;

-- CreateTable
CREATE TABLE "UrlRoute" (
    "id" TEXT NOT NULL,
    "contentType" "UrlContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "contentSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "contentStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "isHomepage" BOOLEAN NOT NULL DEFAULT false,
    "path" TEXT NOT NULL,
    "pathKey" TEXT NOT NULL,
    "mode" "UrlRouteMode" NOT NULL DEFAULT 'PATTERN',
    "customPath" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "conflictPath" TEXT,
    "conflictReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrlRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlPattern" (
    "id" TEXT NOT NULL,
    "contentType" "UrlContentType" NOT NULL,
    "countryId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrlPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlChange" (
    "id" TEXT NOT NULL,
    "batchId" TEXT,
    "routeId" TEXT,
    "contentType" "UrlContentType",
    "contentId" TEXT,
    "countryId" TEXT,
    "contentLabel" TEXT NOT NULL,
    "oldPath" TEXT,
    "newPath" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrlChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotFoundLog" (
    "id" TEXT NOT NULL,
    "pathKey" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "referrerHost" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "NotFoundLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "resolverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "backfilledAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "lastCollisions" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrlSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UrlRoute_pathKey_key" ON "UrlRoute"("pathKey");

-- CreateIndex
CREATE INDEX "UrlRoute_contentType_contentSlug_idx" ON "UrlRoute"("contentType", "contentSlug");

-- CreateIndex
CREATE INDEX "UrlRoute_countryId_idx" ON "UrlRoute"("countryId");

-- CreateIndex
CREATE INDEX "UrlRoute_conflictPath_idx" ON "UrlRoute"("conflictPath");

-- CreateIndex
CREATE INDEX "UrlRoute_contentType_countryId_idx" ON "UrlRoute"("contentType", "countryId");

-- CreateIndex
CREATE UNIQUE INDEX "UrlRoute_contentType_contentId_countryId_key" ON "UrlRoute"("contentType", "contentId", "countryId");

-- CreateIndex
CREATE UNIQUE INDEX "UrlPattern_contentType_scopeKey_key" ON "UrlPattern"("contentType", "scopeKey");

-- CreateIndex
CREATE INDEX "UrlChange_contentType_contentId_idx" ON "UrlChange"("contentType", "contentId");

-- CreateIndex
CREATE INDEX "UrlChange_routeId_idx" ON "UrlChange"("routeId");

-- CreateIndex
CREATE INDEX "UrlChange_batchId_idx" ON "UrlChange"("batchId");

-- CreateIndex
CREATE INDEX "UrlChange_createdAt_idx" ON "UrlChange"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotFoundLog_pathKey_key" ON "NotFoundLog"("pathKey");

-- CreateIndex
CREATE INDEX "NotFoundLog_resolvedAt_lastSeenAt_idx" ON "NotFoundLog"("resolvedAt", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Page_countryId_taxonomyKind_taxonomyId_key" ON "Page"("countryId", "taxonomyKind", "taxonomyId");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_sourceKey_key" ON "Redirect"("sourceKey");

-- CreateIndex
CREATE INDEX "Redirect_targetRouteId_idx" ON "Redirect"("targetRouteId");

-- CreateIndex
CREATE INDEX "Redirect_origin_idx" ON "Redirect"("origin");

-- AddForeignKey
ALTER TABLE "Redirect" ADD CONSTRAINT "Redirect_targetRouteId_fkey" FOREIGN KEY ("targetRouteId") REFERENCES "UrlRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrlRoute" ADD CONSTRAINT "UrlRoute_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UrlPattern" ADD CONSTRAINT "UrlPattern_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill (idempotent: each statement only fills what is still empty)
-- ---------------------------------------------------------------------------

-- The normalised key of every existing redirect source: leading slash, no
-- trailing slash, lower case. When two legacy rules normalise to the same key
-- the oldest keeps it and the rest stay NULL — URL Health lists them as
-- collisions instead of this migration choosing silently.
WITH normalised AS (
  SELECT "id",
         lower(regexp_replace('/' || btrim("source", '/'), '/+', '/', 'g')) AS key,
         row_number() OVER (
           PARTITION BY lower(regexp_replace('/' || btrim("source", '/'), '/+', '/', 'g'))
           ORDER BY "createdAt", "id"
         ) AS rank
  FROM "Redirect"
  WHERE "sourceKey" IS NULL
)
UPDATE "Redirect" r
SET "sourceKey" = n.key
FROM normalised n
WHERE r."id" = n."id"
  AND n.rank = 1
  AND NOT EXISTS (SELECT 1 FROM "Redirect" x WHERE x."sourceKey" = n.key);

-- Generated category and brand landing pages, tied to their taxonomy by id so
-- a later rename of either side never loses the connection.
UPDATE "Page" p
SET "taxonomyKind" = 'category', "taxonomyId" = c."id"
FROM "ProductCategory" c
WHERE p."taxonomyId" IS NULL
  AND p."slug" = 'categories/' || c."slug"
  AND NOT EXISTS (
    SELECT 1 FROM "Page" q
    WHERE q."countryId" = p."countryId" AND q."taxonomyKind" = 'category' AND q."taxonomyId" = c."id"
  );

UPDATE "Page" p
SET "taxonomyKind" = 'brand', "taxonomyId" = b."id"
FROM "Brand" b
WHERE p."taxonomyId" IS NULL
  AND p."slug" = 'brands/' || b."slug"
  AND NOT EXISTS (
    SELECT 1 FROM "Page" q
    WHERE q."countryId" = p."countryId" AND q."taxonomyKind" = 'brand' AND q."taxonomyId" = b."id"
  );

INSERT INTO "UrlSettings" ("id", "resolverEnabled", "lastCollisions", "updatedAt")
VALUES ('singleton', false, '[]', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
