-- AI-generated art per consumable (potions/scrolls/treats/relics), like mkt_item_sprite for gear. Generated
-- once directly via OpenAI; rendered in place of the emoji wherever consumables show, with the emoji fallback.
CREATE TABLE IF NOT EXISTS mkt_consumable_sprite (
    consumable_id TEXT PRIMARY KEY,
    url           TEXT NOT NULL,
    prompt        TEXT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
