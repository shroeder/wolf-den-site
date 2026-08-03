-- BUTTRESS — the descent's fourth upgrade track.
--
-- Shoring already buys SAFE DEPTH: how many steps you take before the roof risk starts counting at all. That
-- delays the danger but does nothing about how fast it arrives once it does, so past your safe depth every
-- level of Shoring is worth exactly nothing and the run still ends in the same handful of steps.
--
-- Buttress is the other half: it slows the CLIMB. The risk still starts where Shoring says it does, it just
-- rises more gently from there — so the two stack into "start later" plus "grow slower" instead of one lever
-- with a hard ceiling.
ALTER TABLE mkt_mining ADD COLUMN IF NOT EXISTS brace_level INT NOT NULL DEFAULT 0;
