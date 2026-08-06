-- A ship battle is fought a round at a time now: you give an order, the server resolves one exchange, and the
-- fight waits for the next one. That means it has to survive between requests — a closed tab, a lock screen, a
-- reload mid-fight — so the whole thing lives here rather than in memory.
--
-- One battle at a time per member, which is also the anti-cheat: you cannot open a second fight to farm a
-- better opening, and the sortie is already spent when the state row appears.
ALTER TABLE mkt_sailing ADD COLUMN IF NOT EXISTS battle_state jsonb;
