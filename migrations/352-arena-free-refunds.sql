-- THREE FREE POINT REFUNDS A DAY, and a tenth of the price after that.
--
-- Respeccing was priced as a penalty: 150 gold plus 60 a point to pull ONE rank back, so a level-20 build
-- cost 1,350 to adjust by a single point and 3,200 to empty. A skill tree you cannot afford to be wrong about
-- is a tree nobody experiments with — you look up a build instead of playing with one, which is the opposite
-- of the reason the tree exists.
--
-- The counter is per store-local day and lives on the row rather than in a ledger: it is a rolling allowance,
-- not a history worth keeping. `free_respec_day` is the day the count belongs to, so a stale day reads as
-- "none used yet" without anything having to reset it at midnight.
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS free_respec_day DATE;
ALTER TABLE mkt_arena ADD COLUMN IF NOT EXISTS free_respecs    INT NOT NULL DEFAULT 0;
