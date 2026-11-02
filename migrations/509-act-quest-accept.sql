-- ── TAKING A QUEST IS NOW A THING THAT HAPPENS ──────────────────────────────────────────────────────────────
-- Luke: "I was hoping for like dialogue where they tell you about the problem they're having and then the
-- solution, and then you get the quest and there's like a big thing in the middle saying like quest received."
--
-- There was no moment to put that plate on. A rung was simply OPEN, and its progress was counted over the
-- member's whole history — so for anybody who had played at all, half the ladder was already finished before
-- they were ever told about it. "Bring up fifteen ore" greeted a veteran as a solved puzzle with a Claim
-- button on it, which is the opposite of being asked for help.
--
-- So a rung is ACCEPTED now, and progress counts from that moment forward.
--
-- ⚠️ THIS IS THE ONE THING THAT HAD TO BE STORED, and it is worth being clear about why, because 493's note
-- is emphatic that progress never is. Progress still isn't: it is still COUNT(*) over mkt_activity_event and
-- there is still no counter anywhere to drift. What this stores is the lower bound of that count — a single
-- timestamp per rung, written once, never updated. The count remains derived; it is simply derived over a
-- window instead of over all time.
--
-- ⚠️ AND IT MAKES THE QUEST A REAL ERRAND. "Smelt five bars" now means five bars AFTER he asked you to, which
-- is what the sentence says and what a player assumes. The old reading — five bars ever, including the ones
-- you poured last March — is the kind of accidental completion that teaches people their actions do not
-- matter.
CREATE TABLE IF NOT EXISTS mkt_act_accept (
    buyer_id    uuid        NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    quest_key   text        NOT NULL,
    act_n       smallint    NOT NULL,
    accepted_at timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, quest_key)
);

-- The board reads "every rung this member has accepted in this act" on every open, which is this index.
CREATE INDEX IF NOT EXISTS mkt_act_accept_buyer_act ON mkt_act_accept (buyer_id, act_n);

COMMENT ON TABLE mkt_act_accept IS
    'When a member took an act rung. Progress is still counted from mkt_activity_event, now windowed to rows after accepted_at.';
