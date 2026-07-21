-- CHEER — during a boss fight you can cheer the hero currently on stage (3×/day). The cheer deals a little
-- bonus damage credited to THAT hero, and earns the cheerer XP + coin. Tiered badges track cheers GIVEN and
-- cheers RECEIVED. Some gear rolls bonus procs on a cheer (extra gold/XP, pet XP, a first-of-day self-strike,
-- and — rarest — a treasure-chest fragment).

-- Lifetime per-user counters (mirror the mystery_bags_bought pattern) — they drive the badge thresholds.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS cheers_given    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS cheers_received INTEGER NOT NULL DEFAULT 0;

-- Ledger of every cheer — enforces the 3/day cap and the "first cheer of the day" procs.
CREATE TABLE IF NOT EXISTS mkt_cheer (
    id          BIGSERIAL PRIMARY KEY,
    giver_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    boss_id     UUID REFERENCES boss_event(id) ON DELETE SET NULL,
    day         DATE NOT NULL,
    damage      INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mkt_cheer_giver_day ON mkt_cheer (giver_id, day);
CREATE INDEX IF NOT EXISTS idx_mkt_cheer_receiver  ON mkt_cheer (receiver_id);

-- Six earnable badges: cheers GIVEN (hype man) and cheers RECEIVED (crowd favorite), each at 100 / 500 / 1000.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, sort_order) VALUES
 ('cheer_given_100',  'Hype Squad',     'Cheered your fellow fighters 100 times.',   '📣', '#ff8c5a', FALSE, FALSE, 'cheers_given',    100,  640),
 ('cheer_given_500',  'Cheer Captain',  'Cheered your fellow fighters 500 times.',   '📣', '#ff6f3c', FALSE, FALSE, 'cheers_given',    500,  641),
 ('cheer_given_1000', 'Ringleader',     'Cheered your fellow fighters 1,000 times.', '📣', '#ff4d2e', FALSE, FALSE, 'cheers_given',    1000, 642),
 ('cheer_recv_100',   'Crowd Favorite', 'Got cheered by the pack 100 times.',        '🎉', '#ffd75e', FALSE, FALSE, 'cheers_received', 100,  643),
 ('cheer_recv_500',   'Fan Favorite',   'Got cheered by the pack 500 times.',        '🌟', '#ffcf4a', FALSE, FALSE, 'cheers_received', 500,  644),
 ('cheer_recv_1000',  'Local Legend',   'Got cheered by the pack 1,000 times.',      '👑', '#ffbf33', FALSE, FALSE, 'cheers_received', 1000, 645)
ON CONFLICT (slug) DO NOTHING;
