-- ── POSES: THE FIRST COSMETIC THAT CHANGES THE ART INSTEAD OF SITTING NEXT TO IT ────────────────────────────
-- Luke: "maybe we add options that are purchasable with store credit... We could start with poses... 20
-- poses, 10 unlockable and 10 purchase only... Poses would be manageable from the equipment screen and
-- equipable."
--
-- Borders, frames and backgrounds are drawn AROUND a member. A pose is drawn INTO them: it changes the art
-- prompt, so equipping one redraws the hero. That is the whole reason this is one column and not a table —
-- a member wears exactly one pose, the same shape as equipped_border / equipped_frame / equipped_background
-- already on this row, and a second table would be a join for a single string.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS equipped_pose TEXT;

-- ⚠️ NULL MEANS "THE STARTER POSE", NOT "BROKEN". Every member predates this column, and backfilling 'ready'
-- across the table would mark all of them as having changed — which is what avatar_sprite_prompt compares
-- against, so it would queue a redraw of every hero on the next cron tick for no visual difference.
-- poseSay() resolves null and unknown ids to the default, so the column stays empty until somebody chooses.
--
-- ⚠️ WHAT A MEMBER OWNS LIVES IN mkt_cosmetic_unlock, NOT HERE. That table already holds pets by
-- (buyer_id, category, ref) with its own uniqueness, and pet-drops.js's grantPet is the pattern: one place
-- a cosmetic is handed over. Poses use category 'pose'. A second ownership table would be a second set of
-- rules about what "owned" means.
--
-- The starter pose is owned by nobody and equippable by everybody — see isFreePose — so it never needs a
-- row, and a member who has bought nothing still has something to wear.

CREATE INDEX IF NOT EXISTS mkt_cosmetic_unlock_pose_idx
    ON mkt_cosmetic_unlock (buyer_id)
    WHERE category = 'pose';
