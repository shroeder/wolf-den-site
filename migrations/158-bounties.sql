-- Bounty Board: community members post bounties (help learning a game, pickup games, card hunts, trades,
-- etc.) and attach their OWN gold, which is reserved (escrowed) out of their balance until the bounty is
-- completed (paid to the helper(s)), cancelled, or expires (refunded). Honor system — fulfilled in the real
-- world. Solo bounties have one helper; group bounties split the reward among the selected helpers.
CREATE TABLE IF NOT EXISTS mkt_bounty (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,                       -- learn_game / pickup_game / find_card / trade / ... / other
    title        TEXT NOT NULL,
    description  TEXT,
    images       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array of uploaded image URLs
    reward_gold  INT NOT NULL,                        -- gold reserved from the creator at post time
    mode         TEXT NOT NULL DEFAULT 'single',      -- 'single' (one helper) | 'group' (split among helpers)
    status       TEXT NOT NULL DEFAULT 'open',        -- open / completed / cancelled / expired
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,                -- created_at + 14 days
    resolved_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bounty_open ON mkt_bounty (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_bounty_creator ON mkt_bounty (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounty_type ON mkt_bounty (type, status);

-- Everyone who has "taken on" a bounty. On completion the creator marks which of them actually helped
-- (is_winner) and each winner's share is recorded in payout.
CREATE TABLE IF NOT EXISTS mkt_bounty_claim (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bounty_id  UUID NOT NULL REFERENCES mkt_bounty(id) ON DELETE CASCADE,
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_winner  BOOLEAN NOT NULL DEFAULT FALSE,
    payout     INT NOT NULL DEFAULT 0,
    UNIQUE (bounty_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_bounty_claim_bounty ON mkt_bounty_claim (bounty_id);
CREATE INDEX IF NOT EXISTS idx_bounty_claim_buyer ON mkt_bounty_claim (buyer_id);

-- Auto-earned bounty badges (granted by syncEarnedBadges once the member crosses the threshold — see
-- getMemberMetrics/progressForRule rules 'bounties_posted' and 'bounties_won').
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order)
VALUES
    ('bounty_poster', 'Bounty Poster', 'Posted your first bounty on the board', '📋', '#7fe0ff', FALSE, 'bounties_posted', 1, 60),
    ('bounty_hunter', 'Bounty Hunter', 'Fulfilled your first bounty for the community', '🎯', '#ffd75e', FALSE, 'bounties_won', 1, 61),
    ('bounty_pro',    'Bounty Pro',    'Fulfilled 5 community bounties', '🏹', '#ff9a3c', FALSE, 'bounties_won', 5, 62),
    ('bounty_legend', 'Bounty Legend', 'Fulfilled 15 community bounties', '🏆', '#ff5cc8', FALSE, 'bounties_won', 15, 63)
ON CONFLICT (slug) DO NOTHING;
