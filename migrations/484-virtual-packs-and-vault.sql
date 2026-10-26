-- ── OPENING A MYSTERY PACK ONLINE, AND THE VAULT THE CARD LANDS IN ──────────────────────────────────────────
-- Design doc: docs/virtual-packs-and-the-card-vault.md. Shipped owner-only behind vaultOpenFor (§16).
--
-- The pool these draw from is the EXISTING mystery_bag_cards — the real sealed bags on the shelf, shared with
-- the register. Nothing here forks it. What is added is the money (which deliberately does NOT go through
-- Square — §7), the vault, and the staff task that gets the physical card out of the tub.

-- ── 1. THE POOL ROW LEARNS THREE THINGS ─────────────────────────────────────────────────────────────────────
ALTER TABLE mystery_bag_cards
    -- 'bagged' = a real sealed bag, which is everything today and all of V1.
    -- 'shelf'  = a loose single, for the later "every card in our possession" model (§1.4). The column exists
    --            NOW so that migration is a data change rather than a rewrite — nothing may hard-code
    --            "a pack is a bag".
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'bagged',
    -- The reveal shows condition and the table never had a column for it. Parsed out of card_name where it is
    -- already present as a suffix (55 of 79 active rows carry NM/LP/...), else left null and simply not shown.
    ADD COLUMN IF NOT EXISTS condition TEXT,
    -- ⚠️ WHAT WE ACTUALLY PAID FOR THIS CARD, CAPTURED AT BAGGING — §7.3, and the reason is the whole point:
    -- by the time a bag sells, the source single may be deleted from Square and its FIFO layer already spent.
    -- Bagging is the only moment the answer is certain. The bag's own `wolfden_unit_cost` (65% of market) is a
    -- VALUATION nobody paid; the house rule puts that estimate LAST, behind what we recorded paying.
    ADD COLUMN IF NOT EXISTS cost_cents INT,
    -- Which of those this row actually got, so a margin figure carries its own confidence. Measured on
    -- 2026-10-26: only 37% of the active pool has a known cost, so this is not decoration.
    ADD COLUMN IF NOT EXISTS cost_basis TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mystery_bag_cards_channel_check') THEN
        ALTER TABLE mystery_bag_cards
            ADD CONSTRAINT mystery_bag_cards_channel_check CHECK (channel IN ('bagged', 'shelf'));
    END IF;
END $$;

-- The open picks a random ACTIVE row; this is the index that question reads.
CREATE INDEX IF NOT EXISTS idx_mystery_cards_open_pool
    ON mystery_bag_cards (created_at)
    WHERE status = 'active';

-- ── 2. ONE ROW PER PACK OPENED ONLINE ───────────────────────────────────────────────────────────────────────
-- The authoritative record of a pull, and the ONLY place this sale's money is written down: there is no Square
-- order for an open (§7). Every money figure is STAMPED here at open time rather than re-derived later, so a
-- retuned tier table or a repriced card can never rewrite what happened.
CREATE TABLE IF NOT EXISTS mkt_pack_open (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id          UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    mystery_card_id   UUID NOT NULL REFERENCES mystery_bag_cards(id) ON DELETE RESTRICT,

    price_cents       INT  NOT NULL,                    -- what the member paid, in credit
    card_value_cents  INT  NOT NULL,                    -- the card's market value at open
    tier              TEXT NOT NULL,                    -- stamped at open so history never re-tiers

    -- ⚠️ SALES TAX IS IMPLICIT IN price_cents, NOT ADDED TO IT (§7.4). The member pays exactly the sticker;
    -- tax is backed out: tax = price - price/(1+rate). revenue_cents + tax_cents = price_cents, always.
    revenue_cents     INT  NOT NULL,
    tax_cents         INT  NOT NULL DEFAULT 0,

    -- Copied from the pool row at open (§7.3). The open ATTRIBUTES a cost; it must never RELIEVE one — the
    -- single's FIFO layer was already consumed when the bag was made (§7.3a).
    cogs_cents        INT,
    cogs_basis        TEXT,

    outcome           TEXT NOT NULL DEFAULT 'pending',  -- pending | vaulted | sold_back | refunded
    idempotency_key   TEXT UNIQUE NOT NULL,

    -- ⚠️ An owner/guest test open while the feature is gated (§16.4). A preview here is NOT a sandbox: it
    -- consumed a real bag and real credit. So it is EXCLUDED from engagement telemetry (one owner with a test
    -- panel outweighs the whole membership) but INCLUDED in the books. Stamped at open, never re-derived from
    -- an id afterwards — the allow-list changes, the history must not.
    preview           BOOLEAN NOT NULL DEFAULT FALSE,

    revealed_at       TIMESTAMPTZ,                      -- when the client actually saw the card
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pack_open_buyer   ON mkt_pack_open (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pack_open_created ON mkt_pack_open (created_at DESC);
-- The telemetry reads "real opens" far more often than it reads all of them.
CREATE INDEX IF NOT EXISTS idx_pack_open_real    ON mkt_pack_open (created_at DESC) WHERE preview = FALSE;
-- A member may only have one un-chosen open at a time; a stuck one is RESUMED, never charged twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pack_open_one_pending
    ON mkt_pack_open (buyer_id) WHERE outcome = 'pending';

-- ── 3. THE STAFF TASK: GET THE CARD OUT OF THE TUB ──────────────────────────────────────────────────────────
-- Raised only for channel='bagged' rows. There is deliberately NO deadline (§1.3) — what replaces one is that
-- an ORDER for the card promotes its task to the top of the queue, because an order is the signal somebody is
-- about to turn up for a card still sealed in a bag.
CREATE TABLE IF NOT EXISTS mkt_pack_pull_task (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_open_id    UUID NOT NULL REFERENCES mkt_pack_open(id) ON DELETE CASCADE,
    mystery_card_id UUID NOT NULL REFERENCES mystery_bag_cards(id) ON DELETE RESTRICT,
    bag_sku         TEXT NOT NULL,                      -- what is printed on the bag in the tub
    kind            TEXT NOT NULL DEFAULT 'pull',       -- pull | refile (a prepared order was cancelled, §6)
    status          TEXT NOT NULL DEFAULT 'open',       -- open | done | not_found
    promoted        BOOLEAN NOT NULL DEFAULT FALSE,     -- an order is waiting on this one
    note            TEXT,
    done_at         TIMESTAMPTZ,
    done_by         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promoted first, then oldest. This is the queue order staff actually see.
CREATE INDEX IF NOT EXISTS idx_pull_task_open
    ON mkt_pack_pull_task (promoted DESC, created_at)
    WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_pull_task_open_id ON mkt_pack_pull_task (pack_open_id);

-- ── 4. THE VAULT ────────────────────────────────────────────────────────────────────────────────────────────
-- One row per card a member holds. `current_value_cents` is what a sell-back pays (100% of current market,
-- §5); `pulled_value_cents` is kept alongside it so the vault can say "pulled at $38, worth $42 now".
CREATE TABLE IF NOT EXISTS mkt_vault_card (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id            UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    pack_open_id        UUID REFERENCES mkt_pack_open(id) ON DELETE SET NULL,
    mystery_card_id     UUID REFERENCES mystery_bag_cards(id) ON DELETE SET NULL,
    square_variation_id TEXT,

    card_name           TEXT NOT NULL,
    set_name            TEXT,
    card_number         TEXT,
    condition           TEXT,
    image_url           TEXT,
    tier                TEXT NOT NULL,

    pulled_value_cents  INT NOT NULL,
    current_value_cents INT NOT NULL,

    status              TEXT NOT NULL DEFAULT 'held',   -- held | on_order | shipped | picked_up | sold_back
    order_id            UUID REFERENCES shop_orders(id) ON DELETE SET NULL,

    -- ⚠️ CARDS CANNOT LEAVE THE BUILDING UNTIL THE CREDIT THAT BOUGHT THEM HAS SETTLED (§12). Keyed off the
    -- member's most recent credit PURCHASE, not off this open — keying it off the open would punish a member
    -- spending credit they topped up months ago, which is most of them. NULL = releasable immediately.
    releasable_at       TIMESTAMPTZ,

    sold_back_at        TIMESTAMPTZ,
    sold_back_cents     INT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_buyer ON mkt_vault_card (buyer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_order ON mkt_vault_card (order_id) WHERE order_id IS NOT NULL;
-- "Is this card spoken for?" — the question asked at the counter (§8.2, Vault Holds).
CREATE INDEX IF NOT EXISTS idx_vault_held_variation
    ON mkt_vault_card (square_variation_id)
    WHERE status = 'held';

-- ── 5. THE HISTORY TAB, WHICH IS THE TRANSPARENCY PROMISE MADE QUERYABLE ────────────────────────────────────
-- Append-only. Every credit movement that belongs to the vault appears here with the thing that caused it, so
-- a member can always answer "where did that money go" without anyone reading a log.
CREATE TABLE IF NOT EXISTS mkt_vault_event (
    id                 BIGSERIAL PRIMARY KEY,
    buyer_id           UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    vault_card_id      UUID REFERENCES mkt_vault_card(id) ON DELETE SET NULL,
    pack_open_id       UUID REFERENCES mkt_pack_open(id) ON DELETE SET NULL,
    action             TEXT NOT NULL,   -- opened | vaulted | sold_back | ordered | cancelled | shipped
                                        -- | picked_up | refunded
    credit_delta_cents INT NOT NULL DEFAULT 0,
    meta               JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_event_buyer ON mkt_vault_event (buyer_id, created_at DESC);
