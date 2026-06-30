-- Grading support for marketplace single listings. A single is either GRADED (graded = true, with a
-- grading_company like PSA/BGS/CGC/SGC and a grade like "10" / "9.5") or RAW (graded = false, using
-- the existing `condition` column). Sealed listings use none of these.

ALTER TABLE mkt_listing
    ADD COLUMN IF NOT EXISTS graded BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS grading_company TEXT,
    ADD COLUMN IF NOT EXISTS grade TEXT;
