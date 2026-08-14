-- ── PICK UP WHERE YOU LEFT OFF ───────────────────────────────────────────────────────────────────────────────
-- A Creation token is bought with real money and buys ONE draft: an image plus three redraws to steer it. The
-- draft row already survived a close — status stays 'drafting' and getCustomState hands it back — but the part
-- the member was actually holding did not: the tweak they were part-way through typing.
--
-- Kaishiern, 2026-08-13, having spent his only token: "I was in the middle of tweaking the creation, typing out
-- how I wanted to change it, and it closed and finalized the creation. I had it redrawn only once and I was in
-- the middle of the second of three tweaks."
--
-- pending_note is that half-written instruction, saved as it is typed, so closing the tab costs nothing.
ALTER TABLE mkt_custom_deco ADD COLUMN IF NOT EXISTS pending_note TEXT;

-- (No "last seen" column: `updated_at` already records the last real progress on a draft, which is what the
-- "waiting since" line wants to say. A second timestamp that only typing moved would be a worse answer to the
-- same question.)

-- Resuming asks one question — "is there a live draft for this member" — on every farm load. It was a full scan
-- filtered by status; there are few enough rows for that not to hurt yet, and an index costs nothing to add now.
CREATE INDEX IF NOT EXISTS idx_custom_deco_drafting ON mkt_custom_deco (buyer_id, id DESC) WHERE status = 'drafting';
