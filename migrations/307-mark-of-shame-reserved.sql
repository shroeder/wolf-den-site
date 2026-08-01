-- The Mark of Shame is RESERVED. It goes to whoever the owner puts in the stockade and to nobody else.
--
-- It was flagged drop_only, and drop_only was the entire gate on the chest loot pool — so the badge that is
-- supposed to mean "the owner marked you" was being rolled out of a treasure chest. One had already landed on
-- a random opener before this was caught.
--
-- admin_only stays TRUE, which is what actually reserves it. Dropping drop_only just takes it out of the pool.
UPDATE mkt_badge SET drop_only = FALSE WHERE slug = 'mark_of_shame';

-- Nothing else should be rolled either: the chest drop is gone entirely (see chests/route.js). These four are
-- left flagged because a boss kill still awards one to the top dealer, and their descriptions are "you found
-- this" rather than "you did this", which is the line that keeps a badge honest.
