-- Bug: app_device.id was UUID, but the app's stable device id is `and-<ANDROID_ID>` (a string), so
-- every insert from a device with a real ANDROID_ID silently failed the UUID cast — the heartbeat
-- kill-switch only ever worked for devices that fell back to a random UUID. Widen to TEXT so the real
-- `and-<...>` ids register (needed for the kill-switch AND the new secret-hydration allowlist).

ALTER TABLE app_device ALTER COLUMN id TYPE TEXT;
