-- ── WHAT A MACHINE REMEMBERS ABOUT YOU ───────────────────────────────────────────────────────────────────────
-- Four of the six slot bonuses carry state between pulls, so a pull is no longer a pure function of the reels:
--   tray        Den Fortune's coin tray, filling on every dead pull
--   streak      Moonrise's run of dead pulls, which is the multiplier on your next win
--   free_pulls  pulls already paid for by Pack Call or Moonrise, and the multiplier they carry
--   pending     the win currently sitting on the table for Double or Nothing
--
-- EVERYTHING IS IN STAKE UNITS, never gold. A tray filled at 25 a pull and tipped out at 2,500 would be a
-- machine that pays out fifty times what it took, and it would look like a bug in the paytable rather than
-- what it is.
--
-- Idempotent, because a migration that gets dry-run against production has to survive being run twice — see
-- 393, which did not, and killed a build.
CREATE TABLE IF NOT EXISTS mkt_casino_meter (
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    machine     TEXT NOT NULL,
    tray        NUMERIC NOT NULL DEFAULT 0,
    streak      INTEGER NOT NULL DEFAULT 0,
    free_pulls  INTEGER NOT NULL DEFAULT 0,
    free_mult   NUMERIC NOT NULL DEFAULT 1,
    pending     INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, machine)
);
