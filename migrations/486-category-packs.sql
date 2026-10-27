-- ── CATEGORY PACKS: THE SHELF AS A POOL ─────────────────────────────────────────────────────────────────────
-- docs/category-packs.md. A pack can now be drawn from a CATEGORY of the shop's own singles — "Pokémon
-- Singles", "Magic Singles" — instead of only from the sealed bags in the tub. Two things have to persist for
-- that: which pool an open came from, and what each pool costs today.

-- ── WHICH POOL AN OPEN CAME FROM ────────────────────────────────────────────────────────────────────────────
-- Everything downstream of an open — the reveal, the vault, the sell-back, the trade ledger, the telemetry —
-- already keys off this row and does not care where the card came from. One column is the whole data model
-- change on the open side.
--
-- ⚠️ DEFAULT 'bags' AND BACKFILLED, so every existing open keeps a true answer rather than a null that each
-- reader has to decide how to interpret. The bags are a pool like any other now; they are simply the one that
-- was here first.
ALTER TABLE mkt_pack_open
    ADD COLUMN IF NOT EXISTS pool TEXT NOT NULL DEFAULT 'bags';

-- Telemetry splits by pool (a Pokémon pack's margin is not a bag's), and the pull queue filters to the pools
-- that raise physical work. Both are small scans today and will not stay small.
CREATE INDEX IF NOT EXISTS idx_mkt_pack_open_pool
    ON mkt_pack_open (pool, created_at DESC);

-- ── WHAT EACH POOL COSTS TODAY ──────────────────────────────────────────────────────────────────────────────
-- Price is DERIVED from the live pool — ceil(EV / $5) * $5 — but it may not be derived at open time. A price
-- recomputed on the way into a purchase is a price that can move between the screen quoting it and the member
-- tapping it, which is the exact bug `priceTrusted` exists to prevent. So it is computed on a schedule,
-- written here, and read from here by everything else.
--
-- ⚠️ `held_until` IS THE POINT OF THIS TABLE, NOT `price_cents`. Pokémon's EV sits fifteen cents under the $15
-- boundary, so an ordinary week's buying reprices that pack to $20 — a third, with nothing announcing it. The
-- recompute may lower a price whenever it likes, but it may not RAISE one before this timestamp. Without that
-- the shelf's natural churn is a price that visibly flickers across a $5 line.
CREATE TABLE IF NOT EXISTS mkt_pack_pool_state (
    pool            TEXT PRIMARY KEY,
    price_cents     INT  NOT NULL,
    ev_cents        INT  NOT NULL,
    -- The pool as it was when the price was set, so a price can always be explained after the fact.
    units           INT  NOT NULL DEFAULT 0,
    lines           INT  NOT NULL DEFAULT 0,
    median_cents    INT  NOT NULL DEFAULT 0,
    min_cents       INT  NOT NULL DEFAULT 0,
    max_cents       INT  NOT NULL DEFAULT 0,
    -- The share of pool value carried by its single biggest line, in basis points. A pool over 15% is CLOSED:
    -- one card is paying for the pack, and the first member to pull it leaves a worse pool behind at the same
    -- price. See §3 — this is what keeps Yu-Gi-Oh shut until the shelf fixes itself.
    top_share_bp    INT  NOT NULL DEFAULT 0,
    open            BOOLEAN NOT NULL DEFAULT FALSE,
    closed_reason   TEXT,
    held_until      TIMESTAMPTZ,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AND A SHELF CARD IS A POOL ROW LIKE ANY OTHER ───────────────────────────────────────────────────────────
-- `mystery_bag_cards.channel` already exists ('bagged' | 'shelf') and the open path already branches on it in
-- the two places it matters. What it lacks is a way to say WHICH shelf pool a row came from, which the pull
-- task and the telemetry both need once there is more than one.
ALTER TABLE mystery_bag_cards
    ADD COLUMN IF NOT EXISTS pool TEXT;

-- ⚠️ A SHELF ROW IS CREATED AT CLAIM TIME, NOT MATERIALISED IN ADVANCE — see §5 of the design. So the same
-- Square variation can appear here many times over its life (we buy four copies of a card, four members pull
-- one each) and this index must NOT be unique. It exists so "has this variation been pulled before" is cheap,
-- which the cost resolver asks on every shelf open.
CREATE INDEX IF NOT EXISTS idx_mystery_bag_cards_pool_variation
    ON mystery_bag_cards (pool, square_variation_id)
    WHERE pool IS NOT NULL;
