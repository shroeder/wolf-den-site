-- REPELLING A RAID PAYS DOUBLOONS.
--
-- Defending has paid `gold: 0` since the raider stopped losing a purse — the row exists only so the defender
-- gets told it happened and the badges tick. So the one thing in ship battles you do not choose to do paid
-- nothing at all, while every other part of the loop mints doubloons.
--
-- Doubloons are the right currency for it too: they are the ONLY thing the gun deck takes, and being raided
-- is the one way to earn them without spending a daily raid of your own.
ALTER TABLE mkt_raid_defense ADD COLUMN IF NOT EXISTS doubloons integer NOT NULL DEFAULT 0;
