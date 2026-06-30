-- Card/print language for marketplace listings. A Japanese Charizard is a different item and value
-- than the English one, so vendors set the language per listing (applies to singles AND sealed).
-- Defaults to English (the overwhelming majority + matches the English-centric tcgcsv catalog).

ALTER TABLE mkt_listing
    ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'English';
