import InspectableGear from "@/components/InspectableGear";
import { EQUIP_SLOTS, STAT_META, itemById, describeStats } from "@/lib/marketplace/items.js";
import { signatureFor } from "@/lib/marketplace/signatures.js";
import { itemElement, ELEMENTS } from "@/lib/marketplace/boss-weakness.js";

// Read-only view of a member's equipped loadout + owned items + combat-stat total, for their public
// profile. Prepares each item's inspect data (stats/signature/element/flavor) server-side and hands it to
// the client <InspectableGear> so visitors can tap any piece to inspect it (and trade for un-equipped ones).
function prep(id, equipped) {
    const d = itemById(id);
    if (!d) return null;
    const sig = signatureFor(id);
    const el = itemElement(id);
    return {
        id, name: d.name, rarity: d.rarity, slot: d.slot, icon: d.icon,
        statsText: describeStats(d.stats),
        signature: sig ? { label: sig.label, desc: sig.desc } : null,
        element: el && ELEMENTS[el] ? { label: ELEMENTS[el].label, emoji: ELEMENTS[el].emoji, color: ELEMENTS[el].color } : null,
        flavor: d.flavor || null,
        equipped: Boolean(equipped),
    };
}

export default function PublicGear({ inventory, displayLabel = "This member", canTrade = false, targetAlias = null }) {
    const equipped = inventory?.equipped || {};
    const equippedIds = EQUIP_SLOTS.map((s) => equipped[s.slot]).filter(Boolean);
    const items = inventory?.items || [];
    if (!equippedIds.length && !items.length) return null;

    const equippedData = equippedIds.map((id) => prep(id, true)).filter(Boolean);
    const inventoryData = items.filter((i) => !i.equipped).map((i) => prep(i.id, false)).filter(Boolean);
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
            <InspectableGear equipped={equippedData} inventory={inventoryData} canTrade={canTrade} targetAlias={targetAlias} />
        </section>
    );
}
