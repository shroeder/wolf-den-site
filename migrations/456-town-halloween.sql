-- ── THE HALLOWEEN FLAG MOVES ONTO THE ACCOUNT ────────────────────────────────────────────────────────────────
-- It was a localStorage key, on the reasoning that a purely cosmetic toggle nobody else can see does not earn a
-- column. That was wrong for how it is actually used: Luke asked to have it switched on for his ACCOUNT, which
-- localStorage cannot answer. A browser-local flag does not follow him from the phone to the desktop, does not
-- survive clearing site data, and cannot be read or set by anything on this side.
--
-- Who may turn it on is still decided in code (canPreview("halloween")), not here. This column only remembers
-- whether somebody who is allowed to has done so — so revoking the preview turns the lights back on for a
-- member whose row still says true, rather than needing the row rewritten.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS town_halloween BOOLEAN NOT NULL DEFAULT FALSE;
