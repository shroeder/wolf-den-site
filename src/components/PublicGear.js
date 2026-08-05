import InspectableGear from "@/components/InspectableGear";
import { EQUIP_SLOTS, STAT_META, itemById, describeStats } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { itemElement, ELEMENTS } from "@/lib/marketplace/boss-weakness.js";
import { setForItem } from "@/lib/marketplace/sets.js";

// Read-only view of a member's equipped loadout + owned items + combat-stat total, for their public
// profile. Prepares each item's inspect data (stats/signature/element/flavor) server-side and hands it to
// the client <InspectableGear> so visitors can tap any piece to inspect it (and trade for un-equipped ones).
// `owned` is every item id this member has, so a piece can say how far along its set they actually are —
// which is the whole question you ask when you look at somebody else's loadout.
function prep(id, equipped, owned) {
    const d = itemById(id);
    if (!d) return null;
    const sig = signatureFor(id);
    const el = itemElement(id);
    const set = setForItem(id);
    return {
        id, name: d.name, rarity: d.rarity, slot: d.slot, icon: d.icon,
        statsText: describeStats(d.stats),
        signature: sig ? { label: sig.label, desc: sig.desc } : null,
        element: el && ELEMENTS[el] ? { label: ELEMENTS[el].label, emoji: ELEMENTS[el].emoji, color: ELEMENTS[el].color } : null,
        flavor: d.flavor || null,
        equipped: Boolean(equipped),
        reqLevel: d.reqLevel || null,
        // The real-world half. A charged piece is redeemable at the counter, and that was nowhere on this
        // sheet — the single most interesting fact about an item was the one thing you could not see.
        perk: d.charged && d.chargeRewardLabel
            ? { label: d.chargeRewardLabel, charges: d.charges || null, cooldownDays: d.cooldownDays || null }
            : null,
        set: set ? {
            id: set.id,
            name: set.name,
            total: set.items.length,
            have: set.items.filter((x) => owned.has(x)).length,
            pieces: set.items.map((x) => ({ id: x, name: itemById(x)?.name || x, has: owned.has(x) })),
            bonuses: (set.bonuses || []).map((b) => ({ need: b.need, text: describeStats(b.stats) })),
            capstone: set.capstone?.desc || null,
        } : null,
    };
}

export default function PublicGear({ inventory, displayLabel = "This member", canTrade = false, targetAlias = null }) {
    const equipped = inventory?.equipped || {};
    const equippedIds = EQUIP_SLOTS.map((s) => equipped[s.slot]).filter(Boolean);
    const items = inventory?.items || [];
    if (!equippedIds.length && !items.length) return null;

    const owned = new Set([...equippedIds, ...items.map((i) => i.id)]);
    const equippedData = equippedIds.map((id) => prep(id, true, owned)).filter(Boolean);
    const inventoryData = items.filter((i) => !i.equipped).map((i) => prep(i.id, false, owned)).filter(Boolean);

    // Every set this member has any progress in, best first — the summary you actually want when sizing
    // somebody up, rather than having to tap twelve pieces to work it out.
    const setProgress = [];
    for (const it of [...equippedData, ...inventoryData]) {
        if (!it.set || setProgress.some((x) => x.id === it.set.id)) continue;
        setProgress.push({ id: it.set.id, name: it.set.name, have: it.set.have, total: it.set.total });
    }
    setProgress.sort((a, b) => b.have / b.total - a.have / a.total || a.name.localeCompare(b.name));
    const stats = inventory?.stats || {};
    const statEntries = Object.entries(stats).filter(([, v]) => v);

    return (
        <section className="card">
            <h2 style={{ marginTop: 0 }}>⚔️ Gear</h2>
            {statEntries.length ? (
                <div className="equip-stat-grid" style={{ marginBottom: 10 }}>
                    {statEntries.map(([k, v]) => (
                        <span key={k} className="equip-stat"><strong>+{v}{STAT_META[k]?.suffix || ""}</strong> {STAT_META[k]?.label || k}</span>
                    ))}
                </div>
            ) : null}
            {setProgress.length ? (
                <div className="pg-sets">
                    <span className="pg-sets-head">Sets</span>
                    {setProgress.map((s2) => (
                        <span key={s2.id} className={`pg-set${s2.have >= s2.total ? " is-full" : ""}`}>
                            {s2.name} <b>{s2.have}/{s2.total}</b>
                        </span>
                    ))}
                </div>
            ) : null}
            <InspectableGear equipped={equippedData} inventory={inventoryData} canTrade={canTrade} targetAlias={targetAlias} />
        </section>
    );
}
