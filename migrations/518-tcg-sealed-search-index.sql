-- ── THE SEALED CATALOG SEARCH READS ONLY SEALED ROWS ─────────────────────────────────────────────────────────
-- Luke, 2026-11-25: looking up a product in the admin app's restock screen was "super slow". That search
-- (/api/marketplace/catalog-search?type=sealed, lib/marketplace/search.js searchCatalog) matches words
-- anywhere in a name or set name, which no text index can serve, so every keystroke seq-scanned all 377k
-- tcg_cards (~16k pages read, mostly singles) to find matches among the ~29k sealed rows.
--
-- A partial index with exactly the SEALED_SQL predicate, covering every column the query reads, lets the
-- planner answer it from the index alone: a scan of the sealed rows only, about a thirteenth of the table.
CREATE INDEX IF NOT EXISTS idx_tcg_cards_sealed_search ON tcg_cards (set_id)
    INCLUDE (id, game, name, number, rarity, image_url, market_price)
    WHERE (number IS NULL OR number = '');
