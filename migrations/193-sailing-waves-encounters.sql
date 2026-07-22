-- Sailing: greet passing sailors + random marine encounters.

-- Waves — greet a passing member (WAVES_PER_DAY/day) for a little XP/coins + a small travel-time cut.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS wave_day date;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS wave_count int NOT NULL DEFAULT 0;

-- Marine encounters — at a voyage's halfway mark a (Fortune-scaled) chance to meet a foe. Resolved LAZILY the
-- next time the member checks in (no push, no travel pause), then shown as a one-off recap modal until they
-- acknowledge it. encounter_at = when it triggers (null = none this voyage); encounter_result = the rolled
-- outcome (null until resolved, and cleared again on acknowledge / next embark).
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounter_at timestamptz;
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS encounter_result jsonb;
