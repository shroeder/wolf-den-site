-- Mining takes the Kitchen's shape: you see the reward LADDER before you start, and how well you play decides
-- which rung you land on. Until now timing only decided how FAST a seam cracked — the haul was the same
-- whether you hit every marker dead centre or mashed the button, so the bar had nothing riding on it.
--
-- grade_sum accumulates each swing's grade multiplier (0.5 glancing … 5.0 perfect). Divided by the swing count
-- at crack time it gives an average that maps onto a rung. Stored per (node, miner) so two people working the
-- same seam are judged on their own swings.
ALTER TABLE mkt_ore_node_hit ADD COLUMN IF NOT EXISTS grade_sum REAL NOT NULL DEFAULT 0;
