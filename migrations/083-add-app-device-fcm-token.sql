-- Store each device's FCM registration token so the server can send push notifications to it.
-- The token is refreshed on every heartbeat; nulled out when FCM reports it dead (see lib/push/send).
ALTER TABLE app_device
    ADD COLUMN IF NOT EXISTS fcm_token TEXT;
