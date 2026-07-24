-- Pet VISITS: when another member pets one of YOUR pets (while visiting your farm), log it so you get a
-- "who petted your pets" welcome-back recap next time you open your farm — mirrors the raid-defense report.
-- One row per petting, until the owner has seen it in their recap.
CREATE TABLE IF NOT EXISTS mkt_pet_visit (
    id         BIGSERIAL PRIMARY KEY,
    owner_id   UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    petter_id  UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    pet_id     TEXT NOT NULL,
    xp         INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seen_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pet_visit_unseen ON mkt_pet_visit (owner_id) WHERE seen_at IS NULL;
