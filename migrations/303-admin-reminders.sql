-- Owner reminders — the recurring "go do the thing" nudges that don't belong to any one feature.
--
-- Sales tax on the 7th, rent on the 25th, payroll every Monday. These are all things that cost real money if
-- they're missed, and none of them live in a system that could have prompted for them.
--
-- Two kinds of schedule, because the real ones split cleanly in two:
--   monthly  — on `day_of_month` (clamped to the last day in short months, so "the 31st" still fires in Feb)
--   weekly   — on `day_of_week` (0=Sun … 1=Mon)
-- Both fire at `at_hour` STORE-LOCAL, which is the only sane reference for a shop owner's day.
CREATE TABLE IF NOT EXISTS admin_reminder (
    id           BIGSERIAL PRIMARY KEY,
    title        TEXT NOT NULL,
    body         TEXT,
    kind         TEXT NOT NULL DEFAULT 'monthly',   -- 'monthly' | 'weekly'
    day_of_month INTEGER,                            -- 1-31, monthly only
    day_of_week  INTEGER,                            -- 0-6 (Sun=0), weekly only
    at_hour      INTEGER NOT NULL DEFAULT 14,        -- store-local hour, 0-23
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_fired_on DATE,                              -- the store-local DATE we last pushed, so it fires once
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The three that prompted this, seeded so the feature is useful the moment it deploys rather than empty.
-- 2pm store-local, which is when there's actually time to deal with any of it.
INSERT INTO admin_reminder (title, body, kind, day_of_month, day_of_week, at_hour)
SELECT * FROM (VALUES
    ('Pay sales tax',   'File and pay the month''s sales tax.',                 'monthly', 7,    NULL, 14),
    ('Pay rent',        'Rent is due — send it today.',                          'monthly', 25,   NULL, 14),
    ('Run payroll',     'Eric''s week finished Sunday — trigger payroll.',       'weekly',  NULL, 1,    14)
) AS v(title, body, kind, day_of_month, day_of_week, at_hour)
WHERE NOT EXISTS (SELECT 1 FROM admin_reminder);
