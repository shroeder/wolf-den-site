-- Badges were being handed out for showing up.
--
-- "First Swing — cracked your first seam open" fired on the very first seam anyone ever broke, which is not an
-- achievement, it is a tutorial step. A badge should take days to earn, not one tap, so the whole mining set is
-- re-cut around counters that need real time at the rock.
--
-- mine_first is retired outright rather than re-scoped: there is no version of "you did the thing once" that
-- belongs on a shelf next to Clean Sweep. It is deleted from anyone who already has it, since it was only ever
-- awarded for a single swing.
DELETE FROM mkt_user_badge WHERE badge_slug = 'mine_first';
DELETE FROM mkt_badge      WHERE slug      = 'mine_first';

-- The rest are re-described to match their new, much longer requirements (the thresholds themselves live in
-- mining.js next to the counters that drive them).
UPDATE mkt_badge SET label = 'Seasoned Hand',  description = 'Cracked 50 seams open.'                         WHERE slug = 'mine_masterwork';
UPDATE mkt_badge SET label = 'Deep Delver',    description = 'Reached depth 12 in a single descent.'          WHERE slug = 'mine_deep';
UPDATE mkt_badge SET label = 'Nerve of Iron',  description = 'Stopped and dug at depth 10 or deeper — haul intact.' WHERE slug = 'mine_nerve';
UPDATE mkt_badge SET label = 'Emberheart',     description = 'Cracked 10 Emberheart Geodes, the richest rock in the mine.' WHERE slug = 'mine_emberheart';
UPDATE mkt_badge SET label = 'Forge-Fed',      description = 'Smelted 1,000 ore into forge parts.'            WHERE slug = 'mine_forgefed';

-- A true long-haul one, to anchor the top of the set.
INSERT INTO mkt_badge (slug, label, description, icon, color, sort_order) VALUES
    ('mine_masterhand', 'Master of the Rock', 'Broke 25 seams with a MASTERWORK run.', '🏆', '#ffd75e', 246)
ON CONFLICT (slug) DO NOTHING;

-- Counters the new thresholds need. nodes_mined already exists; these are the ones that did not.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS masterwork_runs INT NOT NULL DEFAULT 0;
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS emberheart_cracked INT NOT NULL DEFAULT 0;
