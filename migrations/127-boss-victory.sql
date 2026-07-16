-- Boss KILL endgame: bosses no longer expire on a timer — they only end when HP hits 0. On the kill we
-- draw a ticket-weighted raffle winner and track when the owner hands the prize over.
ALTER TABLE boss_event
  ADD COLUMN IF NOT EXISTS winner_buyer_id UUID,
  ADD COLUMN IF NOT EXISTS winner_tickets INTEGER,
  ADD COLUMN IF NOT EXISTS winner_drawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prize_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prize_claimed_by UUID;

-- Boss-fight milestone badges (auto-earned via getMemberMetrics: bosses_fought / bosses_won).
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('boss_veteran',  'Raid Veteran',  'Fought in a boss raid',        '🛡️', '#c0553a', FALSE, 'bosses_fought', 1,  143),
    ('boss_warlord',  'Raid Warlord',  'Fought in 5 boss raids',       '🏰', '#a23a2f', FALSE, 'bosses_fought', 5,  144),
    ('boss_legend',   'Raid Legend',   'Fought in 15 boss raids',      '⚜️', '#8a2f27', FALSE, 'bosses_fought', 15, 145),
    ('boss_champion', 'Raid Champion', 'Won a boss-fight raffle prize', '👑', '#ffcf40', FALSE, 'bosses_won',    1,  146)
ON CONFLICT (slug) DO NOTHING;
