-- ── A LAUNCH CARD IS NEWS FOR A WEEK, THEN IT IS FURNITURE ────────────────────────────────────────────────────
-- The announcement system had one rule for who is spared a card: members who joined AFTER it went out, who have
-- never known the old state. It had no rule at all for members who were simply AWAY.
--
-- So the backlog stacks. Four launches have gone out and 34 members are currently carrying two or more unseen
-- cards between them -- a member who has not opened the game since July gets the Kitchen, dismisses it, gets
-- Ship Battles on the next load, dismisses it, gets the Arena, dismisses it, gets pet levels. Four modals in
-- front of somebody whose only crime was going on holiday, every one of them about a thing that has been part
-- of the furniture for weeks by the time they read it. The ONE AT A TIME rule was supposed to prevent exactly
-- this and instead spread it across four page loads.
--
-- The missing idea is that an announcement is NEWS, and news has a shelf life. After a week the Kitchen is not
-- "open" in any sense worth a modal -- it is just where cooking happens, and someone coming back to the Den
-- discovers it the way they discover everything else, by walking past the door.
--
-- `expires_at` is nullable and every existing row keeps it NULL on purpose: the reader treats a NULL as
-- "starts_at plus seven days", so the rule applies to the four rows already out there without a backfill, and
-- to every future launch without anyone having to remember to set it. Setting it explicitly is for the launch
-- that deserves a different window -- something seasonal that should stop the day the event does, or a thing
-- big enough to be worth a fortnight.
ALTER TABLE mkt_announcement ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMENT ON COLUMN mkt_announcement.expires_at IS
    'When this card stops being shown to anyone, seen or not. NULL means the default window: starts_at + 7 days. Set it only for a launch that needs a different shelf life.';
