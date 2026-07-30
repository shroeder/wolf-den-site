-- The Trophy Catch badge still promised a rule that no longer exists.
--
-- It read "Landed a fish within 2% of the largest its species can grow", which was true when every species had
-- a hard maximum weight. There is no maximum any more: `lb` is the TYPICAL range and roughly one cast in forty
-- comes up heavier than it. A badge that describes a ceiling, on a board whose entire point is that records
-- get beaten, tells players the opposite of what the feature is for.
--
-- The badge's earning rule changed with it (fishing.js: best > species.lb[1]), so this is the description
-- catching up to the code rather than a behaviour change.
UPDATE mkt_badge
   SET description = 'Landed a fish heavier than its kind is ever supposed to get.'
 WHERE slug = 'fish_trophy';
