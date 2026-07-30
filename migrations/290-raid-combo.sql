-- Combo chains on the boss raid's timing strike.
--
-- Consecutive good-or-better swings stack a damage multiplier; anything worse resets the chain. The count
-- lives on the hit row rather than in the client so it survives a refresh, and so a client can't hold a chain
-- open forever by simply never reporting the swings it fluffed.
ALTER TABLE mkt_town_event_hit
    ADD COLUMN IF NOT EXISTS combo INTEGER NOT NULL DEFAULT 0;
