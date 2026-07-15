-- A curated "Developer" badge, so the person who builds the site/app gets an official mark — and it
-- gates the exclusive Dev profile border (see src/lib/marketplace/borders.js). Admin-assigned like the
-- other roles.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, sort_order) VALUES
    ('developer', 'Developer', 'Builds The Wolf Den site & app', '💻', '#22c55e', TRUE, 7)
ON CONFLICT (slug) DO NOTHING;
