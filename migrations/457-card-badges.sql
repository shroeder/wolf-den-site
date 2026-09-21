-- ── BADGES FOR THE CARD GAME ──────────────────────────────────────────────────────────────────────────────
-- Luke: "We should add badges around the card game. Reaching certain rungs. Achieving certain strength,
-- burning x cards. Doing x damage in a single strike etc"
--
-- Every other feature in the game pays out in badges and this one paid nothing: the four existing badges with
-- "card" in the name are about trading TCG singles in the shop, not about the deck-builder at all.
--
-- ⚠️ TWO OF THE FOUR NEEDED THE ENGINE TO START COUNTING. Strength and a single strike are properties of a
-- MOMENT inside a turn -- Strength can be spent back down by a Siphon, and a hit is gone the instant the foe's
-- bar redraws -- so neither survives into the end-of-turn state the server stores. applyMoves collects both
-- now and the run route keeps the high-water mark here.
ALTER TABLE mkt_cards_progress
    ADD COLUMN IF NOT EXISTS best_strength INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS best_hit INT NOT NULL DEFAULT 0;

-- ⚠️ THRESHOLDS MEASURED, NOT INVENTED. Read off the 29 players and 282 finished runs on 2026-09-21:
--
--   · best_stop is per-ACT and every single player is on 16, so it cannot carry a badge. Real depth is
--     (act-1)*16+stop, where 52 is the final boss. 7 players are at 52, 4 at 48, 4 at 16.
--   · ASCENSION is the ladder that actually still has room in it: 146 runs at asc 0, thinning to 14 at asc 10
--     -- and asc 10 has been attempted fourteen times and won ZERO times. That is a trophy nobody holds.
--   · burns: median 0, max 83. Ten is already a deliberate habit; eighty is near the ceiling.
INSERT INTO mkt_badge (slug, label, description, icon, color, auto_rule, auto_threshold, sort_order, secret)
VALUES
    -- The climb, for players who have not finished it yet.
    ('cards_act1',      'Out of the Woods',  'Clear the first act of the card game.',                      'GiCardPlay',      '#8fb7e8', 'cards_depth',    16, 720, FALSE),
    ('cards_act3',      'Deep Run',          'Reach the fourth act of the card game.',                     'GiCardRandom',    '#a98fe8', 'cards_depth',    48, 721, FALSE),
    ('cards_win',       'Deck Complete',     'Win a run.',                                                 'GiCardAceSpades', '#ffd27a', 'cards_wins',      1, 722, FALSE),
    ('cards_win_10',    'Repeat Offender',   'Win ten runs.',                                              'GiCardExchange',  '#ffc35a', 'cards_wins',     10, 723, FALSE),
    ('cards_win_25',    'House Favourite',   'Win twenty-five runs.',                                      'GiCardBurn',      '#ff9f45', 'cards_wins',     25, 724, FALSE),
    -- Ascension: the rungs with room left in them.
    ('cards_asc_1',     'Raising the Stakes','Win a run on ascension 1 or higher.',                         'GiUpgrade',       '#9fe8b7', 'cards_asc_won',   1, 725, FALSE),
    ('cards_asc_5',     'Glutton for It',    'Win a run on ascension 5 or higher.',                         'GiStairsGoal',    '#7ad6a0', 'cards_asc_won',   5, 726, FALSE),
    ('cards_asc_10',    'Nothing Left',      'Win a run on ascension 10. Nobody has.',                      'GiLaurelCrown',   '#ffe08a', 'cards_asc_won',  10, 727, FALSE),
    -- Burning, which median play never does at all.
    ('cards_burn_10',   'Trimmed',           'Burn ten cards out of your deck.',                           'GiBurningEmbers', '#ff9b6a', 'cards_burns',    10, 728, FALSE),
    ('cards_burn_40',   'Ruthless Editor',   'Burn forty cards out of your deck.',                         'GiFlamer',        '#ff7a45', 'cards_burns',    40, 729, FALSE),
    ('cards_burn_80',   'Ashes Only',        'Burn eighty cards out of your deck.',                        'GiPyromaniac',    '#ff5c2e', 'cards_burns',    80, 730, FALSE),
    -- Strength held in a single fight.
    ('cards_str_10',    'Warmed Up',         'Hold 10 Strength in a single fight.',                        'GiBiceps',        '#e8b77a', 'cards_strength', 10, 731, FALSE),
    ('cards_str_25',    'Unreasonable',      'Hold 25 Strength in a single fight.',                        'GiMuscleUp',      '#e89a45', 'cards_strength', 25, 732, FALSE),
    ('cards_str_50',    'Absurd',            'Hold 50 Strength in a single fight.',                        'GiStrong',        '#ff7f2e', 'cards_strength', 50, 733, FALSE),
    -- One hit.
    ('cards_hit_50',    'Solid Connection',  'Deal 50 damage with a single card.',                         'GiPunchBlast',    '#ffd27a', 'cards_hit',      50, 734, FALSE),
    ('cards_hit_150',   'Overkill',          'Deal 150 damage with a single card.',                        'GiExplosiveMeeting', '#ffb347', 'cards_hit',   150, 735, FALSE),
    ('cards_hit_300',   'Deleted',           'Deal 300 damage with a single card.',                        'GiMightyForce',   '#ff6a2e', 'cards_hit',     300, 736, FALSE)
ON CONFLICT (slug) DO NOTHING;
