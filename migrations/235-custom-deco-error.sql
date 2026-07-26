-- Capture WHY a creation failed to draw (OpenAI refusals / policy blocks / outages). Before this, a refused
-- prompt (e.g. "Pikachu") was refunded and dropped to 'abandoned' with the reason silently discarded, so neither
-- the member nor the owner could tell a policy refusal from a normal abandon. We now record the raw error and
-- use a distinct 'failed' status for a first-draw failure. (status is a free TEXT column — no CHECK to alter.)
ALTER TABLE mkt_custom_deco ADD COLUMN IF NOT EXISTS last_error TEXT;
