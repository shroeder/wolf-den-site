-- ── THE LEDGER'S NAME ────────────────────────────────────────────────────────────────────────────────────
-- Luke: "Its gold only. No token or chips please even down to the wording."
--
-- mkt_chip_event is the casino's LIVE ledger and has recorded gold since the floor went coin-in-coin-out;
-- mkt_token_event is the dead one, still read by the owner's report for history. Both are named after
-- currencies that no longer exist, and a ledger named after the wrong currency is how the floor came to pay
-- a purse nobody could spend.
--
-- ⚠️ THE OLD NAMES SURVIVE AS VIEWS, AND THAT IS THE WHOLE POINT OF DOING IT THIS WAY. A migration runs at
-- deploy time, which means there is a window — seconds, but real — where instances still running the OLD
-- code are querying the OLD name. A bare RENAME would make every one of those queries throw, and the ones
-- that throw are casino spins: a member mid-pull would get a 500 and, because moveCoin's ledger write is
-- best-effort, the quieter ones would simply lose their row. A single-table view is auto-updatable in
-- Postgres, so the old name keeps both reading AND inserting until the last old instance is gone.
--
-- The views can be dropped in a later migration once nothing has referenced them for a release.
--
-- Guarded on to_regclass so a re-run is a no-op rather than an error — migrations are spent once and a
-- half-applied rename is the worst of both names.
DO $$
BEGIN
    IF to_regclass('public.mkt_chip_event') IS NOT NULL
       AND to_regclass('public.mkt_casino_ledger') IS NULL THEN
        ALTER TABLE mkt_chip_event RENAME TO mkt_casino_ledger;
        CREATE VIEW mkt_chip_event AS SELECT * FROM mkt_casino_ledger;
    END IF;

    IF to_regclass('public.mkt_token_event') IS NOT NULL
       AND to_regclass('public.mkt_casino_ledger_legacy') IS NULL THEN
        ALTER TABLE mkt_token_event RENAME TO mkt_casino_ledger_legacy;
        CREATE VIEW mkt_token_event AS SELECT * FROM mkt_casino_ledger_legacy;
    END IF;

    -- The Counter's receipts. Same reasoning, same safety: the once-only guard reads this table on every
    -- purchase, so the old name has to keep working until the last old instance is gone.
    IF to_regclass('public.mkt_chip_purchase') IS NOT NULL
       AND to_regclass('public.mkt_counter_purchase') IS NULL THEN
        ALTER TABLE mkt_chip_purchase RENAME TO mkt_counter_purchase;
        CREATE VIEW mkt_chip_purchase AS SELECT * FROM mkt_counter_purchase;
    END IF;
END $$;
