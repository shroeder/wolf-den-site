-- ONE LEDGER FOR "HOW MANY TIMES TODAY".
--
-- A dozen of the 120 ascension powers are rationed per day — one chest a day pays twice, one dish a day cooks
-- itself, one voyage a day returns instantly, one item a day sells at shelf price. Each of those needs to know
-- how many times it has fired today, and not one of them had anywhere to record it.
--
-- The alternative was a dated column per power on mkt_buyer, which is twelve migrations, twelve column names
-- to remember, and a thirteenth power meaning a thirteenth migration. The pattern is identical in every case —
-- (member, power, day) -> a count — so it is one table.
--
-- The day is stored as a DATE in STORE time, resolved by the caller. Never build a JS Date from this column to
-- compare it: a Postgres DATE read through JS is a day behind on Vercel, which has already broken the daily
-- check-in and nearly broke the fishing bank in this same build.
CREATE TABLE IF NOT EXISTS mkt_power_use (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    power_key  TEXT NOT NULL,
    day        DATE NOT NULL,
    used       INT  NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, power_key, day)
);

-- Reads are always "this member, this power, today", so the primary key already covers them. This index is for
-- the sweep that clears old rows.
CREATE INDEX IF NOT EXISTS idx_mkt_power_use_day ON mkt_power_use (day);
