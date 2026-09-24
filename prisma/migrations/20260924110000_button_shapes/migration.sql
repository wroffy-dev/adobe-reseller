-- A shape for the Primary and the Secondary button of their own.
--
-- Blank follows the shared button radius, so this changes nothing on its own.

ALTER TABLE "WebsiteSettings"
  ADD COLUMN "buttonPrimaryRadius" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buttonSecondaryRadius" TEXT NOT NULL DEFAULT '';
