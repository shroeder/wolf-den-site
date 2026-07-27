-- The Forge is public now, so its badges become VISIBLE goals in the collection / rewards surfaces (they were
-- SECRET during the owner-gated era). Still earned by forging (drop_only), just no longer hidden until owned.
UPDATE mkt_badge SET secret = FALSE
 WHERE slug IN ('forge_first','forge_smith','forge_master','forge_plus10','forge_pixel','forge_emberheart','forge_artisan','forge_grandmaster');
