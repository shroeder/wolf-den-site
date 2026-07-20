-- Daily Spin: a free spin every day + a spin-token economy (tokens earned from quests, boss kills, streaks,
-- or bought with gold). Level unlocks better wheels. spins_since_rare drives a pity guarantee.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS spin_tokens INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS free_spin_day DATE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS spin_count INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS spins_since_rare INT NOT NULL DEFAULT 0;

INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, drop_only, sort_order)
VALUES
    ('wheel_regular', 'Regular', 'Spun the wheel 50 times',   '🎡', '#8fd8ff', FALSE, 'spin_count', 50,  FALSE, 75),
    ('wheel_devotee', 'Wheel Devotee', 'Spun the wheel 250 times', '🎰', '#b76bff', FALSE, 'spin_count', 250, FALSE, 76),
    ('jackpot',       'Jackpot!', 'Hit the wheel jackpot',    '💎', '#ffd75e', FALSE, NULL, NULL, TRUE, 77)
ON CONFLICT (slug) DO NOTHING;
