-- The Primary and Secondary button designs.
--
-- Every column is blank by default, and blank means "keep the look the role's
-- style and the theme give it", so this migration changes nothing on its own.

ALTER TABLE "WebsiteSettings"
  ADD COLUMN "buttonBorderWidth" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonPrimaryBg" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonPrimaryText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonPrimaryBorder" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonPrimaryHoverBg" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonPrimaryHoverText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonPrimaryHoverBorder" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonSecondaryBg" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonSecondaryText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonSecondaryBorder" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonSecondaryHoverBg" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonSecondaryHoverText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonSecondaryHoverBorder" TEXT NOT NULL DEFAULT '';
