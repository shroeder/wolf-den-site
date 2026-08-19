import { notFound } from "next/navigation";

import ItemLab from "@/components/ItemLab";
import { db } from "@/lib/db";
import { getInventory, getEquippedIds } from "@/lib/marketplace/inventory.js";
import { getSetsOverview } from "@/lib/marketplace/sets.js";
import { getOwnedPieceIds } from "@/lib/marketplace/collection-owned.js";
import { getCompendium } from "@/lib/marketplace/compendium.js";
import { getJewellerState } from "@/lib/marketplace/jeweller.js";
import { petsState } from "@/lib/marketplace/pets.js";
import { itemSpriteMap } from "@/lib/marketplace/item-sprites.js";
import { EQUIP_SLOTS, itemById, describeStats, mergeStats } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { setForItem } from "@/lib/marketplace/sets.js";

// ── DEV ONLY: THE REST OF THE ITEM SURFACES ──────────────────────────────────────────────────────────────────
// display-lab covers the six that take plain props. These six are the ones that only exist behind a signed-in
// fetch — the inspect sheet you get when you tap a piece, the compendium, the jeweller, the two set panels and
// the pets screen — so the payload is built HERE, server-side, by the same functions the real routes call, and
// handed down to a client shim that answers the component's own fetch with it.
//
// Real data for a real member, not a fixture, because the question being asked is whether the thing a member
// actually owns reads correctly.
export const dynamic = "force-dynamic";
export const metadata = { title: "Item Lab", robots: { index: false, follow: false } };

export default async function ItemLabPage({ searchParams }) {
    if (process.env.NODE_ENV !== "development") notFound();
    const q = await searchParams;
    const who = q?.who || "The Wolf Den";
    const buyer = await db.queryOne(`SELECT id, display_name FROM mkt_buyer WHERE display_name = $1`, [who]);
    if (!buyer) notFound();

    const [inventory, bySlot, rows, pieces] = await Promise.all([
        getInventory(buyer.id).catch(() => ({ items: [], equipped: {}, stats: {} })),
        getEquippedIds(buyer.id).catch(() => ({})),
        db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyer.id]).catch(() => []),
        getOwnedPieceIds(buyer.id).catch(() => []),
    ]);
    const sets = getSetsOverview(Object.values(bySlot), [...rows.map((r) => r.item_id), ...pieces]);
    const [compendium, jeweller, pets] = await Promise.all([
        getCompendium(buyer.id).catch((e) => ({ error: String(e) })),
        getJewellerState(buyer.id).catch((e) => ({ error: String(e) })),
        petsState(buyer.id).catch((e) => ({ error: String(e) })),
    ]);

    // The inspect sheet's rows are prepared by whichever server page mounts InspectableGear; this is that same
    // preparation, so the sheet gets exactly the fields it gets in the app. It lives here rather than in the
    // client because sets.js and signatures.js are server-only.
    const items = inventory?.items || [];
    const owned = new Set(items.map((i) => i.id));
    const prep = (row) => {
        const d = itemById(row.id);
        if (!d) return null;
        const sig = signatureFor(row.id);
        const set = setForItem(row.id);
        return {
            id: row.id, name: d.name, rarity: d.rarity, slot: d.slot, icon: d.icon,
            statsText: describeStats(mergeStats(d.stats, row.forgeBonus || {})),
            forgeStats: row.forgeBonus ? describeStats(row.forgeBonus, { bonus: true }) : null,
            enhanceLevel: row.enhanceLevel || 0,
            signature: sig ? { label: sig.label, desc: sig.desc } : null,
            element: null, elements: row.elements || null, gem: row.gem || null, socket: Boolean(row.socket),
            flavor: d.flavor || null, equipped: Boolean(row.equipped), reqLevel: d.reqLevel || null, perk: null,
            set: set ? { id: set.id, name: set.name, total: set.items.length,
                have: set.items.filter((x) => owned.has(x)).length,
                pieces: set.items.map((x) => ({ id: x, name: itemById(x)?.name || x, has: owned.has(x) })),
                bonuses: (set.bonuses || []).map((b) => ({ need: b.need, text: describeStats(b.stats, { bonus: true }) })),
                capstone: set.capstone?.desc || null } : null,
        };
    };
    // A weapon and a shield first — they carry the fields that were missing.
    const rank = (r) => { const st = itemById(r.id)?.stats || {}; return st.base_damage ? 0 : st.block_chance ? 1 : st.armor ? 2 : 3; };
    const equippedIds = EQUIP_SLOTS.map((s) => inventory?.equipped?.[s.slot]).filter(Boolean);
    const equippedRows = equippedIds.map((id) => prep(items.find((i) => i.id === id) || { id, equipped: true }))
        .filter(Boolean).sort((a, z) => rank(a) - rank(z));
    const bagRows = items.filter((i) => !i.equipped).map(prep).filter(Boolean)
        .sort((a, z) => rank(a) - rank(z)).slice(0, 8);

    return (
        <ItemLab
            who={buyer.display_name}
            equipped={equippedRows}
            bag={bagRows}
            sets={sets}
            compendium={{ ...compendium, sprites: itemSpriteMap() }}
            jeweller={jeweller}
            // `newPets` opens a celebration modal per pet, which stands in front of the thing being
            // looked at. Stripped, because this lab is here to read the passive lines underneath.
            pets={{ ...pets, newPets: [] }}
        />
    );
}
