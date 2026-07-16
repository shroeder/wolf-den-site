-- The member's chosen PRIMARY badge — rendered as a "folder tab" sticking up above their card. One
-- slug (must be a badge they hold); NULL = show their top-ranked badge by default. The full earned
-- badge row still renders below regardless.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS featured_badge_slug TEXT;
