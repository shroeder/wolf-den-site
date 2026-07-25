-- Break-even tracker: recurring overhead line items + a single-row config for labor burden / employee link.
-- Costs are compared (in the app) against the same gross profit the business reports show, so the owner can
-- see, over time, whether the day/week/month cleared its overhead + labor.

CREATE TABLE IF NOT EXISTS wolfden_overhead (
    id           BIGSERIAL PRIMARY KEY,
    label        TEXT    NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    cadence      TEXT    NOT NULL DEFAULT 'monthly',  -- daily | weekly | monthly | yearly
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Singleton config row (id = 1).
CREATE TABLE IF NOT EXISTS wolfden_breakeven_config (
    id                      INTEGER PRIMARY KEY DEFAULT 1,
    labor_burden_pct        NUMERIC NOT NULL DEFAULT 15,    -- employer taxes + workers comp + paid leave, on top of wage
    default_wage_cents      INTEGER NOT NULL DEFAULT 1200,  -- fallback hourly wage when Square wage-setting is unavailable
    employee_team_member_id TEXT,                            -- Square team member whose clocked hours drive labor cost (Eric)
    employee_name           TEXT,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT wolfden_breakeven_config_singleton CHECK (id = 1)
);
INSERT INTO wolfden_breakeven_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Seed the two known recurring costs (editable in the app). Only seed once, on an empty table.
INSERT INTO wolfden_overhead (label, amount_cents, cadence, sort_order)
SELECT * FROM (VALUES ('Rent', 75000, 'monthly', 0), ('Insurance', 13000, 'monthly', 1)) AS seed(label, amount_cents, cadence, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM wolfden_overhead);
