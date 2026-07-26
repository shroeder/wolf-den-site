-- The Forge — badges + daily quests (owner-gated: earned only inside the owner-only forge, and the badges are
-- SECRET so they never surface on a public profile).

-- Secret forge badges (granted on the spot from crafting actions). Emoji for now; die-cut sprites can be
-- generated via the badge-sprite admin flow afterward.
INSERT INTO mkt_badge (slug, label, description, icon, color, secret, drop_only, sort_order) VALUES
    ('forge_first',      'First Spark',    'Salvaged your first piece of gear at the Forge.',             '🔥', '#ff9a3c', true, true, 900),
    ('forge_smith',      'Apprentice Smith','Enhanced gear 10 times.',                                     '⚒️', '#c7d0d8', true, true, 901),
    ('forge_master',     'Master Smith',   'Enhanced gear 50 times.',                                     '🛠️', '#ffd75e', true, true, 902),
    ('forge_plus10',     'Tempered Ten',   'Forged a single item all the way to +10.',                    '✨', '#b98cff', true, true, 903),
    ('forge_pixel',      'Dead Center',    'Landed a PIXEL-PERFECT hammer strike.',                       '🎯', '#8fe3ff', true, true, 904),
    ('forge_emberheart', 'Emberheart',     'Combined parts all the way up to an Emberheart Shard (tier 5).','💠', '#ffb020', true, true, 905)
ON CONFLICT (slug) DO NOTHING;

-- Daily forge quests: per-member per-day progress + which quest keys were claimed.
CREATE TABLE IF NOT EXISTS mkt_forge_daily (
    buyer_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    day        DATE NOT NULL,
    salvages   INT  NOT NULL DEFAULT 0,
    enhances   INT  NOT NULL DEFAULT 0,
    combines   INT  NOT NULL DEFAULT 0,
    best_grade INT  NOT NULL DEFAULT 0, -- best mini-game grade rank landed today (1 good … 4 pixel)
    claimed    JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (buyer_id, day)
);
