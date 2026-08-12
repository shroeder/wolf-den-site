-- ── WHY DID I LOSE THAT ONE ─────────────────────────────────────────────────────────────────────────────────
-- A finished bout kept its result and threw away its evidence. `mkt_arena_bout` records who fought, who won,
-- how many rounds and what it paid — and the bout_json holding the actual fight is wiped from mkt_arena the
-- moment the recap is dismissed. So the only answerable question about a loss was "did it happen", and every
-- balance question after that was inference.
--
-- That cost real time today. A Warden lost twice in five and seven rounds, and diagnosing it meant deriving
-- both fighters' stats from a screenshot and modelling the matchup by hand, because nothing had been kept.
-- The answer turned out to be four defensive nerfs compounding — which the numbers below would have shown
-- outright: mitigation applied, damage taken per round, shield actually spent.
--
-- ONE JSONB COLUMN, not a table. This is diagnostic exhaust, always read by bout, never joined or aggregated
-- across rows in a hot path — and a column costs no migration the next time we want another field in it.
--
-- Deliberately NOT the full blow-by-blow log. That is tens of kilobytes a bout and its value decays within
-- minutes; what stays useful for weeks is the SHAPE of the fight — what each side brought, what each side
-- did with it, and where the health actually went. See boutTelemetry() in arena.js for what goes in.
ALTER TABLE mkt_arena_bout ADD COLUMN IF NOT EXISTS telemetry JSONB;

-- Bouts are read newest-first when investigating, and by member when investigating a person.
CREATE INDEX IF NOT EXISTS mkt_arena_bout_created_idx ON mkt_arena_bout (created_at DESC);
