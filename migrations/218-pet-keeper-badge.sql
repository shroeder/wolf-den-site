-- The "petted 100 times" tier — mig216 tried to use slug pet_devoted, which already exists (a pet-leveling
-- badge), so ON CONFLICT skipped it. Add it under a fresh slug.
INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('pet_keeper', 'Devoted Keeper', 'Petted a pet 100 times', '💞', '#ff4f8b', FALSE, 'pets_petted', 100, 234)
ON CONFLICT (slug) DO NOTHING;
