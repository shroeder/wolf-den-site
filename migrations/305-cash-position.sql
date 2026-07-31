-- Figures for the "what can I actually spend" screen that no system in here owns.
--
-- The bank balance lives at the bank and the tax set-aside lives in Luke's head; both are five-second lookups
-- and neither has a trustworthy source in this database. Guessing them from the ledger would produce a
-- confident wrong number on a screen whose entire job is telling him how much he can safely spend, so they are
-- typed in and stamped with WHEN, and the screen says how stale they are.
--
-- One row per key, overwritten in place — there is no history worth keeping for a figure you re-read each time.
CREATE TABLE IF NOT EXISTS cash_position_input (
    key         TEXT PRIMARY KEY,          -- 'bank_balance' | 'tax_set_aside'
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    noted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    noted_by    TEXT
);
