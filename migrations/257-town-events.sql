-- Town live events (e.g. a bandit raid): a shared enemy the whole plaza attacks together, rewards by
-- participation. Admin-triggered; alerts everyone via web + app push.
CREATE TABLE IF NOT EXISTS mkt_town_event (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',   -- active | defeated | expired
    hp_max      INTEGER NOT NULL,
    hp          INTEGER NOT NULL,
    reward_gold INTEGER NOT NULL DEFAULT 0,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at     TIMESTAMPTZ NOT NULL,
    defeated_at TIMESTAMPTZ,
    meta        JSONB
);
CREATE INDEX IF NOT EXISTS idx_mkt_town_event_status ON mkt_town_event (status, ends_at);

CREATE TABLE IF NOT EXISTS mkt_town_event_hit (
    event_id    BIGINT NOT NULL,
    buyer_id    UUID NOT NULL,
    damage      INTEGER NOT NULL DEFAULT 0,
    hits        INTEGER NOT NULL DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    rewarded    BOOLEAN NOT NULL DEFAULT FALSE,
    reward_gold INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, buyer_id)
);
