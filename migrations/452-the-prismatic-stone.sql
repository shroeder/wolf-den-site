-- ── THE PRISMATIC STONE ──────────────────────────────────────────────────────────────────────────────────────
-- The rarest drop in the game: it falls off ANY activity, and it raises one piece of gear you already own to
-- Ascendant, keeping its affixes, its forge enhancement, its affinity and its sockets.
--
-- All this table does is count a member's rolls for the day. The rate is deliberately per-member-per-day
-- rather than per-action: measured over 14 days of real play the top five members fire 47% of all eligible
-- actions, so a flat per-action chance would hand roughly half of every stone the Den ever finds to the same
-- five people, while the MEDIAN member logs 14 eligible actions a fortnight. Capping rolls takes the top five
-- from 47% of the rolls to 23% and never touches anybody playing normally. See prismatic.js for the numbers
-- and for what does not count as an activity.
--
-- `day` is the CHICAGO calendar date, written as a stored key. The comparison form of this — a timestamp
-- measured against (NOW() AT TIME ZONE 'America/Chicago')::date — is the one that quietly rolls the day over
-- at 7pm, and it has cost us a day boundary before.
CREATE TABLE IF NOT EXISTS mkt_prismatic_roll (
    buyer_id UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    day      DATE NOT NULL,
    rolls    INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (buyer_id, day)
);

-- The badge for the first piece anybody raises. admin_only = false: it is earned, not granted.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only)
VALUES ('forge_ascendant', 'Ascendant',
        'Spent a Prismatic Stone and raised a piece of gear to Ascendant.',
        '💎', '#ff7a3c', false)
ON CONFLICT (slug) DO NOTHING;
