import Link from "next/link";
import { notFound } from "next/navigation";

import TradeBuilder from "@/components/TradeBuilder";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getInventory } from "@/lib/marketplace/inventory.js";
import { getPublicProfileByAlias } from "@/lib/marketplace/profile.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Propose a trade | Wolf Den", robots: { index: false, follow: false } };

const strip = (inv) => (inv?.items || []).map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, icon: i.icon }));

export default async function NewTradePage({ searchParams }) {
    const { to } = await searchParams;
    const me = await getAuthenticatedBuyer().catch(() => null);
    if (!me) {
        return <div className="stack reveal"><section className="card"><p className="muted">Sign in to propose a trade.</p><Link href="/marketplace/login" className="button primary">Sign in</Link></section></div>;
    }
    const target = to ? await getPublicProfileByAlias(to).catch(() => null) : null;
    if (!target || target.id === me.id) notFound();

    const [myInv, theirInv] = await Promise.all([getInventory(me.id).catch(() => null), getInventory(target.id).catch(() => null)]);

    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🔄 Propose a trade</h1>
                <p className="muted" style={{ marginTop: 0 }}>with <Link href={`/marketplace/u/${target.alias}`} className="pill">{target.displayLabel}</Link> · <Link href="/marketplace/trade" className="pill">Your offers →</Link></p>
            </section>
            <TradeBuilder
                me={{ items: strip(myInv), gold: myInv?.gold || 0 }}
                them={{ id: target.id, label: target.displayLabel, alias: target.alias, items: strip(theirInv) }}
            />
        </div>
    );
}
