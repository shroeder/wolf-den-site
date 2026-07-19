import Link from "next/link";

import ConsumablesClient from "@/components/ConsumablesClient";
import EquipmentClient from "@/components/EquipmentClient";
import GearTradesInbox from "@/components/GearTradesInbox";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { getSetting } from "@/lib/settings.js";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Your Gear | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function InventoryPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card"><MarketplaceProfileClient /></section>
            </div>
        );
    }

    const [profile, spriteRow, backdropUrl] = await Promise.all([
        getProfile(buyer.id).catch(() => null),
        db.queryOne(`SELECT avatar_sprite_url FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null),
        getSetting("equip_backdrop_url").catch(() => null),
    ]);

    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>⚔️ Your Gear</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    Equip items to buff your boss fight. Some gear also carries in-store perks. <Link href="/marketplace/boss" className="pill">⚔️ Boss</Link>
                </p>
            </section>

            <GearTradesInbox />

            <EquipmentClient
                avatarUrl={profile?.avatarUrl}
                spriteUrl={spriteRow?.avatar_sprite_url || null}
                displayLabel={profile?.displayLabel || "Hero"}
                level={profile?.level?.level || 1}
                backdropUrl={backdropUrl || null}
            />

            <ConsumablesClient />
        </div>
    );
}
