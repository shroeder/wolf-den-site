-- Cooking badge descriptions, brought in line with the raised thresholds.
--
-- The first set were milestones in name only — three of them were reachable in an afternoon. A badge should
-- mark that you've been playing a while, so the volume ones now sit at roughly a fortnight, three months, six
-- months and a capstone.
--
-- 'On the Pass' was also IMPOSSIBLE: it asked for a 10-chain when the cooking minigame is five steps long, so
-- the maximum chain anyone can reach is 5. It now asks for a flawless five.
UPDATE mkt_badge SET description = 'Cooked 100 dishes'                         WHERE slug = 'cook_apprentice';
UPDATE mkt_badge SET description = 'Cooked 500 dishes'                         WHERE slug = 'cook_chef';
UPDATE mkt_badge SET description = 'Cooked 1,000 dishes'                       WHERE slug = 'cook_thousand';
UPDATE mkt_badge SET description = 'Cooked 2,500 dishes'                       WHERE slug = 'cook_master';
UPDATE mkt_badge SET description = 'Learned 25 recipes'                        WHERE slug = 'cook_collector';
UPDATE mkt_badge SET description = 'Prepped 200 ingredients'                   WHERE slug = 'cook_prep';
UPDATE mkt_badge SET description = 'Held 500 ingredients at once'              WHERE slug = 'cook_forager';
UPDATE mkt_badge SET description = 'Chained all five steps of a cook'          WHERE slug = 'cook_chain';
