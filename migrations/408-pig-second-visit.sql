-- ── THE TRUFFLE HOG'S SECOND VISIT HAS NEVER ONCE FIRED ──────────────────────────────────────────────────────
-- 54 members have claimed a Loot Pig. Zero have ever claimed a second one, despite several owning a pet whose
-- whole ability is "the pig comes back".
--
-- The reason is a missing link rather than a bad roll. `pigAvailable` — the only thing that puts the pig on
-- the farm — was computed from `pig_day` alone, so the moment you claimed him he was gone for the day. The
-- second-visit roll lived on the CLAIM path, which the client could then never reach: you cannot claim a pig
-- that is not on screen. The perk was decided in a branch nothing could call.
--
-- Fixing it needs the decision to happen at the FIRST claim and to survive until the client next asks what is
-- on the farm. That is what this column is: "the hog turned him around today". `pig_second_day` stays as it
-- was — the spend guard, so the second visit can be paid at most once however many times the request is sent.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS pig_again_day date;

COMMENT ON COLUMN mkt_buyer.pig_again_day IS
    'Store-local day on which a truffle_hog pet turned the Loot Pig around for a second visit. Set when the FIRST pig is claimed; read by pigAvailable so the pig can actually appear again. Spending it is guarded by pig_second_day.';
