-- The farm's sprite-brightness slider bottomed out at 0.3, which is not "moody" — it is a silhouette. One
-- member had hers there, and every visitor to that farm saw her pets as black cut-outs against a bright
-- daylight scene. The floor is 0.6 now (still clearly dimmer, still readable), so lift anyone parked below it.
UPDATE mkt_buyer SET sprite_brightness = 0.6 WHERE sprite_brightness IS NOT NULL AND sprite_brightness < 0.6;
