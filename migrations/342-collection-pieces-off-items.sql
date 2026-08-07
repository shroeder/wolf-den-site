-- Collection pieces stop being items.
--
-- The eight non-combat sets (Corsair, Harvester, Forager, Wheelwarden, Delver, Rockbreaker, Blacksmith's
-- Regalia, Founder) were rows in mkt_user_item that ten separate call sites had to remember to filter out of
-- equip / sell / salvage / auction / trade / drop pools. One of the ten forgot and the Forge offered a
-- Forgeplate as scrap. A trophy is not gear, so it gets its own table and stops pretending.
--
-- Idempotent: the INSERT is ON CONFLICT DO NOTHING and the DELETE only removes ids that made it across, so
-- re-running is a no-op and a half-applied run resumes cleanly.

CREATE TABLE IF NOT EXISTS mkt_user_collection (
    buyer_id   uuid        NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    piece_id   text        NOT NULL,
    source     text,
    earned_at  timestamptz NOT NULL DEFAULT NOW(),
    PRIMARY KEY (buyer_id, piece_id)
);
CREATE INDEX IF NOT EXISTS mkt_user_collection_piece_idx ON mkt_user_collection (piece_id);

-- Move what people already own.
INSERT INTO mkt_user_collection (buyer_id, piece_id, source, earned_at)
SELECT ui.buyer_id, ui.item_id, 'migrated', NOW()
  FROM mkt_user_item ui
 WHERE ui.item_id IN (
    'heavens_trident',
    'orb_of_tides',
    'girded_plate',
    'merchants_cape',
    'fortune_signet',
    'harvesters_hat',
    'reapers_girdle',
    'sheafbound_cloak',
    'amber_grain_pendant',
    'foragers_basket',
    'clover_signet',
    'deep_seed_pouch',
    'foxglove_charm',
    'wg_helm',
    'wg_shield',
    'wg_ring',
    'wg_cloak',
    'wg_amulet',
    'wg_blade',
    'wg_chest',
    'wg_belt',
    'wg_boots',
    'wg_axe',
    'dv_lamp_helm',
    'dv_rope_belt',
    'dv_lodestone',
    'dv_shoring_pack',
    'rb_maul',
    'rb_gauntlet',
    'rb_assay_ring',
    'rb_hobnails',
    'regalia_visor',
    'regalia_plate',
    'regalia_girdle',
    'regalia_boots',
    'regalia_cloak',
    'fd_apron',
    'fd_tongs',
    'fd_bellows_charm',
    'fd_slagsifter'
 )
ON CONFLICT (buyer_id, piece_id) DO NOTHING;

-- ...and only then take them out of the item bag.
DELETE FROM mkt_user_item ui
 WHERE ui.item_id IN (
    'heavens_trident',
    'orb_of_tides',
    'girded_plate',
    'merchants_cape',
    'fortune_signet',
    'harvesters_hat',
    'reapers_girdle',
    'sheafbound_cloak',
    'amber_grain_pendant',
    'foragers_basket',
    'clover_signet',
    'deep_seed_pouch',
    'foxglove_charm',
    'wg_helm',
    'wg_shield',
    'wg_ring',
    'wg_cloak',
    'wg_amulet',
    'wg_blade',
    'wg_chest',
    'wg_belt',
    'wg_boots',
    'wg_axe',
    'dv_lamp_helm',
    'dv_rope_belt',
    'dv_lodestone',
    'dv_shoring_pack',
    'rb_maul',
    'rb_gauntlet',
    'rb_assay_ring',
    'rb_hobnails',
    'regalia_visor',
    'regalia_plate',
    'regalia_girdle',
    'regalia_boots',
    'regalia_cloak',
    'fd_apron',
    'fd_tongs',
    'fd_bellows_charm',
    'fd_slagsifter'
 )
   AND EXISTS (SELECT 1 FROM mkt_user_collection c WHERE c.buyer_id = ui.buyer_id AND c.piece_id = ui.item_id);
