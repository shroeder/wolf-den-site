-- Wolf's Gambit dice game: the active hand (bet + your 3 dice + whether you've used your reroll) is parked on
-- the member's tavern row so the game is server-authoritative (the client can't fake a winning hand).
ALTER TABLE mkt_tavern ADD COLUMN IF NOT EXISTS dice_state JSONB;
