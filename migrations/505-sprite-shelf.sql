-- ── THE SPRITE SHELF: A HERO YOU KEEP, NOT A HERO YOU LOSE ─────────────────────────────────────────────────
-- Luke: "I think I don't like undo, but I do like the idea of favoriting a sprite. Right now the lock is
-- basically a favorite, but it's limited in that it can only favorite one, and it's lost upon unlocking...
-- a way for people to store previous sprites that they liked that they can switch their appearance to at
-- any time... I love the idea of saving money if they've already found a sprite that they like."
--
-- ⚠️ WE HAVE BEEN THROWING AWAY ART WE PAID FOR. generateBuyerSprite did
-- `UPDATE mkt_buyer SET avatar_sprite_url = $2` -- a straight overwrite. The image itself was never deleted
-- (blob URLs are immutable, every one ever drawn is still sitting there) but the only pointer to it was
-- replaced, so the previous hero became unreachable the moment a new one landed. That is the entire reason
-- avatar_sprite_locked exists: it is not a preference, it is nine members holding the door shut against an
-- overwrite they cannot undo.
--
-- So: one row per sprite, nothing overwritten, and the lock stops being load-bearing.
CREATE TABLE IF NOT EXISTS mkt_buyer_sprite (
    id          BIGSERIAL PRIMARY KEY,
    buyer_id    UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    -- The prompt it was drawn from. Kept per ROW rather than only on mkt_buyer because that string is how
    -- the job decides a redraw is needed, and a shelf of sprites each drawn from a different loadout needs
    -- to remember which was which -- otherwise "your hero is out of date" cannot be answered per sprite.
    prompt      TEXT,
    -- Starred by the member. The nine existing locks become this, below.
    favourite   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The shelf is always read for one member, newest first. Favourites are read the same way.
CREATE INDEX IF NOT EXISTS mkt_buyer_sprite_buyer_idx ON mkt_buyer_sprite (buyer_id, created_at DESC);

-- ⚠️ ONE ROW PER URL PER MEMBER. The backfill below and the first few draws after it can both see the same
-- live sprite, and a shelf showing the same picture twice reads as a bug in the shelf.
CREATE UNIQUE INDEX IF NOT EXISTS mkt_buyer_sprite_uniq ON mkt_buyer_sprite (buyer_id, url);

-- ── BACKFILL: EVERY HERO ANYONE IS CURRENTLY WEARING ───────────────────────────────────────────────────────
-- Only the one on mkt_buyer can be recovered. Earlier sprites are gone as far as the database is concerned
-- -- the blobs exist but nothing recorded their addresses, which is the loss this table exists to stop
-- happening again. 115 members have a sprite today.
INSERT INTO mkt_buyer_sprite (buyer_id, url, prompt, favourite, created_at)
SELECT id, avatar_sprite_url, avatar_sprite_prompt,
       -- ⚠️ A LOCK BECOMES A FAVOURITE, which is what it always was. Luke: "any sprites that are locked
       -- would be favorited now." Nobody has to be told their lock was taken away; it simply becomes the
       -- first star on their shelf and keeps doing the same job better.
       COALESCE(avatar_sprite_locked, FALSE),
       COALESCE(avatar_sprite_at, NOW())
  FROM mkt_buyer
 WHERE avatar_sprite_url IS NOT NULL
ON CONFLICT (buyer_id, url) DO NOTHING;

-- ⚠️ avatar_sprite_locked IS NOT DROPPED IN THIS MIGRATION, ON PURPOSE. The column still gates
-- pendingSpriteIds, and a deploy where the table exists but the code has not shipped yet must keep
-- behaving exactly as it does now. It is dead weight after this, not a trap -- see the note in
-- avatar-sprite.js on why generation is opt-in from here.
