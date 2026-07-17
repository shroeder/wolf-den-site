-- Which games a member plays (for targeting things like the Friday Night Magic sign-up CTA) and whether
-- they've dismissed that CTA. game_interests NULL = never answered (show the onboarding "what do you play?"
-- prompt); an empty array = answered but picked nothing.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS game_interests TEXT[];
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS fnm_cta_dismissed_at TIMESTAMPTZ;
