-- THE STOCKADE ELECTION — the Den votes someone into the pillory.
--
-- Jinxx's idea, in her words: "a fun little bit to nominate someone for being in display in the town
-- stockade", with joke crimes "anything from 'Stood there menacingly' to 'Took my left shoe'". The stockade
-- itself already existed for caught cheaters; this makes it a weekly bit of theatre the whole town runs.
--
-- The cycle: polls are open for a DAY, the winner serves THREE DAYS, and when their sentence ends a new
-- election opens automatically. One nomination per member per election, one vote per member per election.
--
-- Two tables rather than one, because a nomination and a vote are different things: anyone may put a name up
-- (with a charge), and everyone else piles onto the names already up. Storing votes as rows rather than a
-- counter means we can show WHO voted for what, and a member can change their mind by voting again.
CREATE TABLE IF NOT EXISTS mkt_stockade_election (
    id          BIGSERIAL PRIMARY KEY,
    opens_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closes_at   TIMESTAMPTZ NOT NULL,
    -- Set when the votes are counted; NULL while the poll is live. The winner and their crime are frozen here
    -- so the result survives whatever happens to the nomination rows afterwards.
    settled_at  TIMESTAMPTZ,
    winner_id   UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    winner_crime TEXT,
    -- When the winner gets out. Reading THIS rather than recomputing from placed_at keeps the sentence length
    -- a property of the election that imposed it, so changing the term later cannot retroactively free anyone.
    serves_until TIMESTAMPTZ
);

-- One row per (election, nominee). The crime is chosen at nomination time and rides with the nominee.
CREATE TABLE IF NOT EXISTS mkt_stockade_nominee (
    election_id BIGINT NOT NULL REFERENCES mkt_stockade_election(id) ON DELETE CASCADE,
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    crime       TEXT NOT NULL,
    nominated_by UUID REFERENCES mkt_buyer(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (election_id, buyer_id)
);

-- One row per (election, voter) — the PK is what enforces one vote each, and an upsert lets you change it.
CREATE TABLE IF NOT EXISTS mkt_stockade_vote (
    election_id BIGINT NOT NULL REFERENCES mkt_stockade_election(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    nominee_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (election_id, voter_id)
);

CREATE INDEX IF NOT EXISTS mkt_stockade_vote_tally ON mkt_stockade_vote (election_id, nominee_id);
-- Finding the live election is the hottest read in the feature — every town page load asks for it.
CREATE INDEX IF NOT EXISTS mkt_stockade_election_live ON mkt_stockade_election (settled_at, closes_at);
