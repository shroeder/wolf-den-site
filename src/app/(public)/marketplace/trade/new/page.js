import Link from "next/link";
import { notFound } from "next/navigation";

import TradeBuilder from "@/components/TradeBuilder";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { getInventory } from "@/lib/marketplace/inventory.js";
import { itemById } from "@/lib/marketplace/items.js";
import { petsState } from "@/lib/marketplace/pets.js";
import { getPublicProfileByAlias } from "@/lib/marketplace/profile.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Propose a trade | Wolf Den", robots: { index: false, follow: false } };

// Carry the item's boss STATS (+ charged-perk / sea-affinity flags) so the trade cards can show what a piece
// actually does — you shouldn't have to guess what you're giving away.
const strip = (inv) => (inv?.items || []).map((i) => {
    const d = itemById(i.id);
    return { id: i.id, name: i.name, rarity: i.rarity, icon: i.icon, slot: d?.slot || null, stats: d?.stats || null, charged: Boolean(d?.charged), chargeLabel: d?.chargeRewardLabel || null, sea: Boolean(d?.sea), equipped: Boolean(i.equipped) };
});
const petStrip = (ids) => ids.map((id) => collectibleById(id)).filter(Boolean).map((d) => ({ id: d.id, name: d.name, rarity: d.rarity }));

export default async function NewTradePage({ searchParams }) {
    const { to, want, wantPet } = await searchParams;
    const me = await getAuthenticatedBuyer().catch(() => null);
    if (!me) {
        return <div className="stack reveal"><section className="card"><p className="muted">Sign in to propose a trade.</p><Link href="/marketplace/login" className="button primary">Sign in</Link></section></div>;
    }
    const target = to ? await getPublicProfileByAlias(to).catch(() => null) : null;
    if (!target || target.id === me.id) notFound();

    const [myInv, theirInv, myPets, theirPets] = await Promise.all([
        getInventory(me.id).catch(() => null),
        getInventory(target.id).catch(() => null),
        petsState(me.id).catch(() => ({ earnedTradeableIds: [], ownedIds: [] })),
        petsState(target.id).catch(() => ({ earnedTradeableIds: [], ownedIds: [] })),
    ]);
    // My tradeable pets; their tradeable pets that I DON'T already own (no point requesting a dupe).
    const myOwned = new Set(myPets.ownedIds || []);
    const myTradePets = petStrip(myPets.earnedTradeableIds || []);
    const theirTradePets = petStrip((theirPets.earnedTradeableIds || []).filter((id) => !myOwned.has(id)));

    return (
        <div className="stack reveal">
            <section className="card" style={{ background: "radial-gradient(120% 150% at 0% 0%, rgba(93,124,255,0.20), transparent 62%)", borderColor: "rgba(93,124,255,0.45)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 46, height: 46, borderRadius: 12, background: "rgba(255,215,94,0.14)", border: "1px solid rgba(255,215,94,0.4)" }} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ffd75e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Propose a trade</h1>
                        <p className="muted" style={{ margin: "3px 0 0", fontSize: "0.95rem" }}>with <Link href={`/marketplace/u/${target.alias}`} style={{ color: "#ffd75e", fontWeight: 800, textDecoration: "none" }}>{target.displayLabel}</Link></p>
                    </div>
                    <Link href="/marketplace/trade" className="pill" style={{ flexShrink: 0 }}>Your offers →</Link>
                </div>
            </section>
            <TradeBuilder
                me={{ items: strip(myInv), pets: myTradePets, gold: myInv?.gold || 0 }}
                them={{ id: target.id, label: target.displayLabel, alias: target.alias, items: strip(theirInv), pets: theirTradePets }}
                preselectWant={want || null}
                preselectWantPet={wantPet || null}
            />
        </div>
    );
}
