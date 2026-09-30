-- Cities (local SEO), city product pages, primary keywords and SEO Intelligence.
-- Additive only: new tables, and new columns with empty defaults. No existing
-- row, URL or value changes.

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "primaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "primaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProductCountry" ADD COLUMN     "primaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pageId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityProductPage" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityProductPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoAnalysis" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "cityId" TEXT,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "seoScore" INTEGER NOT NULL,
    "aeoScore" INTEGER NOT NULL,
    "geoScore" INTEGER NOT NULL,
    "localScore" INTEGER,
    "overallScore" INTEGER NOT NULL,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "findings" JSONB NOT NULL DEFAULT '[]',
    "signature" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "titleKey" TEXT,
    "descriptionKey" TEXT,
    "h1Key" TEXT,
    "contentHash" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_pageId_key" ON "City"("pageId");

-- CreateIndex
CREATE INDEX "City_countryId_isActive_sortOrder_idx" ON "City"("countryId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "City_countryId_slug_key" ON "City"("countryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CityProductPage_pageId_key" ON "CityProductPage"("pageId");

-- CreateIndex
CREATE INDEX "CityProductPage_productId_idx" ON "CityProductPage"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CityProductPage_cityId_productId_key" ON "CityProductPage"("cityId", "productId");

-- CreateIndex
CREATE INDEX "SeoAnalysis_countryId_overallScore_idx" ON "SeoAnalysis"("countryId", "overallScore");

-- CreateIndex
CREATE INDEX "SeoAnalysis_entityType_idx" ON "SeoAnalysis"("entityType");

-- CreateIndex
CREATE INDEX "SeoAnalysis_cityId_idx" ON "SeoAnalysis"("cityId");

-- CreateIndex
CREATE INDEX "SeoAnalysis_analyzedAt_idx" ON "SeoAnalysis"("analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeoAnalysis_entityType_entityId_countryId_key" ON "SeoAnalysis"("entityType", "entityId", "countryId");

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityProductPage" ADD CONSTRAINT "CityProductPage_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityProductPage" ADD CONSTRAINT "CityProductPage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityProductPage" ADD CONSTRAINT "CityProductPage_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permissions for the Cities screen, granted to the built-in Admin and
-- Content & Marketing roles (the roles that already build pages).
INSERT INTO "Permission" ("id", "key", "group", "label")
VALUES
  ('perm_cities_view', 'cities.view', 'cities', 'View cities'),
  ('perm_cities_manage', 'cities.manage', 'cities', 'Create and edit cities and their landing pages')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "UserRole" r
JOIN "Permission" p ON p."key" IN ('cities.view', 'cities.manage')
WHERE r."slug" IN ('admin', 'content-marketing')
ON CONFLICT DO NOTHING;
