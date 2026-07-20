import Link from "next/link";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getSetsOverview } from "@/lib/marketplace/sets.js";
import { getEquippedIds } from "@/lib/marketplace/inventory.js";
import { WEAKNESSES } from "@/lib/marketplace/boss-weakness.js";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gear Sets · The Wolf Den" };

const RARITY = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ff9a3c", mythic: "#ff5a7a", ascendant: "#5ad0ff", eternal: "#ffd75e" };
const statText = (stats) => Object.entries(stats).map(([k, v]) => `+${v} ${k.replace(/_/g, " ")}`).join(" · ");

export default async function SetsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    let equipped = [];
    let owned = [];
    if (buyer) {
        const bySlot = await getEquippedIds(buyer.id).catch(() => ({}));
        equipped = Object.values(bySlot);
        const rows = await db.query(`SELECT item_id FROM mkt_user_item WHERE buyer_id = $1`, [buyer.id]).catch(() => []);
        owned = rows.map((r) => r.item_id);
    }
    const sets = getSetsOverview(equipped, owned);

    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🧩 Gear Sets</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    Collect matching pieces for stacking bonuses, a full-set capstone, and a weakness affinity that shines on the right weekly boss. <Link href="/marketplace/inventory" className="pill">⚔️ Your gear</Link>
                </p>
            </section>

            {sets.map((s) => {
                const w = s.weakness ? WEAKNESSES[s.weakness] : null;
                return (
                    <section key={s.id} className={`card set-card${s.equipped >= s.total ? " set-complete" : ""}`}>
                        <div className="set-card-head">
                            <h2 style={{ margin: 0 }}>{s.name}</h2>
                            <span className="set-count">{s.equipped}/{s.total} equipped · {s.owned}/{s.total} owned</span>
                        </div>
                        {w ? <div className="set-affinity">{w.emoji} Synergizes when the boss is <strong>{w.label}</strong> (+25% while active)</div> : null}
                        <div className="set-pieces">
                            {s.pieces.map((p) => (
                                <span key={p.id} className={`set-piece${p.equipped ? " is-equipped" : p.owned ? " is-owned" : " is-missing"}`} style={{ borderColor: RARITY[p.rarity] || "#3a3f47" }}>
                                    {p.equipped ? "✅" : p.owned ? "•" : "🔒"} {p.name}
                                </span>
                            ))}
                        </div>
                        <div className="set-tiers">
                            {s.tiers.map((t) => (
                                <div key={t.need} className={`set-tier${t.active ? " active" : ""}`}>
                                    <strong>{t.need}-piece:</strong> {statText(t.stats)}
                                </div>
                            ))}
                            {s.capstone ? (
                                <div className={`set-tier set-capstone${s.capstone.active ? " active" : ""}`}>
                                    <strong>★ Full set:</strong> {s.capstone.desc.replace(/^Full set: /, "")}
                                </div>
                            ) : null}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
