-- Farm LIKES: a positive-only "rate another member's farm" system with three ascending tiers
-- (1 = Like 👍, 2 = Love ❤️, 3 = Admire ⭐). One persistent rating per (rater → owner) pair; you may revise it
-- anytime. Both parties earn XP the first time you rate them. You get ONE new-rating charge per day; revising an
-- existing rating is free (no charge). owner_seen_at drives the "N people rated your farm" welcome-back recap.
CREATE TABLE IF NOT EXISTS mkt_farm_rating (
    rater_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    owner_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    tier          SMALLINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    owner_seen_at TIMESTAMPTZ,
    PRIMARY KEY (rater_id, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_farm_rating_owner ON mkt_farm_rating (owner_id);
CREATE INDEX IF NOT EXISTS idx_farm_rating_unseen ON mkt_farm_rating (owner_id) WHERE owner_seen_at IS NULL;

-- Daily new-rating charge (1/day). Day-reset lazily, store-local (America/Chicago), same pattern as pettings.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_rate_day DATE;
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS farm_rate_used INT NOT NULL DEFAULT 0;
