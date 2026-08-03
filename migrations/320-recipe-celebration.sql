-- Finding a recipe had no moment.
--
-- learnRecipe() returns the recipe it taught you so callers "can announce it" — and of the ~18 drop points,
-- most threw the return value away (boss kills, the forge, salvage, daily deals, pet bonds, raid wins, and
-- cooking itself all called it bare). The three that did keep it handed it back in an API response that no
-- client component ever read. So the book grew silently: you'd notice a new card in the Kitchen days later.
--
-- Wiring a modal into ten different screens is exactly what produced that mess, so the reveal is PENDING STATE
-- instead of a return value. learnRecipe leaves celebrated_at NULL; a watcher mounted site-wide picks it up on
-- the next tick wherever you happen to be, shows it, and acknowledges. Every drop point works without knowing
-- the watcher exists — including the ones that discard the result.
--
-- NULL means "owed a celebration". Every recipe already known is backfilled as celebrated, so nobody who has
-- been playing for weeks gets ambushed by a queue of modals for recipes they found long ago.
ALTER TABLE mkt_recipe_known ADD COLUMN IF NOT EXISTS celebrated_at TIMESTAMPTZ;

UPDATE mkt_recipe_known SET celebrated_at = COALESCE(learned_at, NOW()) WHERE celebrated_at IS NULL;

-- The watcher polls this on mount and on tab-focus, so it wants to be a cheap partial-index hit rather than a
-- scan of everything every member has ever learned.
CREATE INDEX IF NOT EXISTS mkt_recipe_known_uncelebrated
    ON mkt_recipe_known (buyer_id) WHERE celebrated_at IS NULL;
