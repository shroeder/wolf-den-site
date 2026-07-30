-- Per-member read marker for the shared global/plaza chat, so the social bubble can show that the room has
-- new messages. Deliberately separate from `last_seen_at` (site presence) — being on the site doesn't mean
-- you've read the chat.
--
-- NULL means "never opened the chat", which is treated as "everything since they joined is unread" but capped
-- by the display so a brand-new member isn't greeted with a giant number.
ALTER TABLE mkt_buyer ADD COLUMN IF NOT EXISTS global_chat_seen_at TIMESTAMPTZ;
