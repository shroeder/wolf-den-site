-- More unlockable badges (auto-earned; engine lives in src/lib/marketplace/badges.js):
--   • messages          — reward heavy communicators (friend DMs + store threads they sent).
--   • onboarding_complete — the Completionist: finished every one-time getting-started task.
--   • badge_count       — a meta badge for collecting a lot of badges.
-- (Friend-count badges already exist: well_connected @5, pack_leader @15.)

INSERT INTO mkt_badge (slug, label, description, icon, color, admin_only, auto_rule, auto_threshold, sort_order) VALUES
    ('chatterbox',    'Chatterbox',    'Sent 50 messages in the community',        '💬', '#4a90d9', FALSE, 'messages',           50,  102),
    ('town_crier',    'Town Crier',    'Sent 250 messages in the community',       '📣', '#e0743a', FALSE, 'messages',           250, 103),
    ('completionist', 'Completionist', 'Finished every onboarding step',           '🎓', '#c8a24a', FALSE, 'onboarding_complete', 1,   112),
    ('decorated',     'Decorated',     'Earned 10 badges',                         '🎖️', '#d4af37', FALSE, 'badge_count',        10,  130)
ON CONFLICT (slug) DO NOTHING;
