-- Self-update channel for the wolf den Android app (com.wolfdenledger). The publish script uploads a
-- built APK to Vercel Blob and inserts a row here; the app polls GET /api/app/version on launch,
-- compares version_code, and offers to install the newer build. One row per published build (history).

CREATE TABLE IF NOT EXISTS app_release (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code INTEGER NOT NULL,         -- monotonically increasing; the app compares against BuildConfig.VERSION_CODE
    version_name TEXT NOT NULL,
    apk_url TEXT NOT NULL,                 -- Vercel Blob URL (unguessable)
    notes TEXT,
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_release_version ON app_release (version_code DESC);
