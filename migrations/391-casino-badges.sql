-- ── BADGES FOR THE FLOOR ─────────────────────────────────────────────────────────────────────────────────────
-- Eight badges for the casino, granted by the same auto_rule machinery as everything else (see
-- 164-pet-level-badges.sql), so they need no grant call of their own — the next badge sync picks them up.
--
-- Every rule behind these counts rows in mkt_coin_event, which the floor was already writing before any of
-- this existed. That is deliberate: a casino with its OWN counters is a casino whose counters can disagree
-- with its money, and the ledger is the thing that cannot be wrong without the gold being wrong too.
--
-- Four are SECRET. The three rare ones are the moments worth stumbling into — a badge board that lists
-- "hit three wolves" as a checkbox turns the rarest thing on the floor into a chore with known odds, and
-- the one-in-2,611 keno ticket stops being a story the moment it becomes a task. The fifth-pet badge is
-- secret for the same reason: nobody should be told there is a set to complete at 1-in-5,556 a pull.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, auto_rule, auto_threshold, sort_order)
VALUES
    -- The two anybody gets by playing. These exist so the floor says SOMETHING the first time you sit down.
    ('casino_first_pull', 'First Pull',    'Played a machine in the Casino',                     '◈', '#ffd75e', FALSE, FALSE, 'casino_plays',   1,     820),
    ('casino_regular',    'Floor Regular', 'Played 250 times in the Casino',                     '◈', '#ffb84d', FALSE, FALSE, 'casino_plays',   250,   821),
    -- Gold across the floor, not gold WON: the badge is for sitting down, and pricing it on winnings would
    -- hand it out for luck rather than for turning up.
    ('casino_high_roller','High Roller',   'Staked 250,000 gold across the Casino floor',        '◆', '#ff9f43', FALSE, FALSE, 'casino_wagered', 250000, 822),
    ('casino_whale',      'The Whale',     'Staked 2,000,000 gold across the Casino floor',      '◆', '#ff7a3d', FALSE, FALSE, 'casino_wagered', 2000000, 823),
    -- The three moments. Roughly 1 in 1,700 pulls, 1 in 20 spins on the wheel's long shot, and 1 in 2,611
    -- tickets — earned by being there when it happened, which is the only way any of them can be earned.
    ('casino_three_wolves','Three Wolves',  'Landed three wolves on the slot',                   '▲', '#ffe9b8', FALSE, TRUE,  'casino_jackpot', 1,     824),
    ('casino_called_it',  'Called It',     'Named a single pocket on the wheel — and it landed', '●', '#a982ff', FALSE, TRUE,  'casino_pocket',  1,     825),
    ('casino_perfect',    'Perfect Ticket','Five of five on a Keno ticket',                      '❖', '#8bf0b4', FALSE, TRUE,  'casino_perfect', 1,     826),
    -- All five pets. The hardest thing on this floor by a wide margin and the only badge here that cannot be
    -- reached by playing a lot — the rarest of the five is one drop in 5,556 plays.
    ('casino_the_five',   'The Five',      'Collected every one of the Casino''s exclusive pets','✦', '#ffd75e', FALSE, TRUE,  'casino_pets',    5,     827)
ON CONFLICT (slug) DO NOTHING;
