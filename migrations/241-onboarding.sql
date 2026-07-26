-- "Getting started" onboarding tasks — which one-time setup tasks a member has claimed (each grants gold once).
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS onboarding_done JSONB NOT NULL DEFAULT '[]'::jsonb;
