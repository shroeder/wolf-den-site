-- A "secret" badge tier: hidden from the badge board / locked list until a member actually holds it, so
-- its existence is a surprise. Combined with admin_only, it's a hand-picked, hidden recognition.
ALTER TABLE mkt_badge ADD COLUMN IF NOT EXISTS secret BOOLEAN NOT NULL DEFAULT FALSE;

-- The Secret badge: manually granted by The Wolf Den, invisible to everyone who hasn't earned it.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, secret, sort_order)
VALUES ('secret', 'Secret', 'Hand-picked by The Wolf Den. If you know, you know.', '🤫', '#a855f7', TRUE, TRUE, 3)
ON CONFLICT (slug) DO UPDATE SET secret = TRUE, admin_only = TRUE;
