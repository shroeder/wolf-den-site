-- Running out of trips was a dead end: "No trips left today. Back tomorrow." with a full purse and nothing to
-- press. Fishing already solved this — buy another cast, price doubling within the day, capped — so mining
-- gets the same deal rather than a second idea about the same problem.
--
-- Resets off trips_day, the same column the free allowance resets off, so "today" has exactly one definition.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS trips_bought INT NOT NULL DEFAULT 0;
