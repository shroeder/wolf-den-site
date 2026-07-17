import { EQUIP_SLOTS, STAT_META, itemById, itemIcon } from "@/lib/marketplace/items.js";

// Read-only view of a member's equipped loadout + owned items + combat-stat total, for their public
// profile (so others can see their gear and, later, propose trades). Presentational.
function ItemChip({ id, equipped = false }) {
    const def = itemById(id);
    if (!def) return null;
    const Icon = itemIcon(def.icon);
    return (
        <span className={`equip-card rar-${def.rarity}${equipped ? " is-equipped" : ""}`} title={def.name}>
            <span className="equip-card-glyph"><Icon aria-hidden="true" /></span>
            <span className="equip-card-name">{def.name}</span>
        </span>
    );
}

export default function PublicGear({ inventory, displayLabel = "This member" }) {
    const equipped = inventory?.equipped || {};
    const equippedIds = EQUIP_SLOTS.map((s) => equipped[s.slot]).filter(Boolean);
    const items = inventory?.items || [];
    const stats = inventory?.stats || {};
    const statEntries = Object.entries(stats).filter(([, v]) => v);
    if (!equippedIds.length && !items.length) return null;

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
            {equippedIds.length ? (
                <>
                    <p className="muted" style={{ margin: "0 0 6px" }}>Equipped</p>
                    <div className="equip-bag-grid">{equippedIds.map((id) => <ItemChip key={id} id={id} equipped />)}</div>
                </>
            ) : null}
            {items.length ? (
                <>
                    <p className="muted" style={{ margin: "12px 0 6px" }}>Inventory ({items.length})</p>
                    <div className="equip-bag-grid">{items.map((i) => <ItemChip key={i.id} id={i.id} equipped={i.equipped} />)}</div>
                </>
            ) : null}
        </section>
    );
}
