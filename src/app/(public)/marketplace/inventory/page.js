import ConsumablesClient from "@/components/ConsumablesClient";
import EquipmentClient from "@/components/EquipmentClient";
import ViewPing from "@/components/ViewPing";
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
        db.queryOne(`SELECT avatar_sprite_url, avatar_sprite_flip FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null),
        getSetting("equip_backdrop_url").catch(() => null),
    ]);

    return (
        <div className="stack reveal">
            <ViewPing event="view_inventory" />
            <EquipmentClient
                avatarUrl={profile?.avatarUrl}
                spriteUrl={spriteRow?.avatar_sprite_url || null}
                spriteFlip={spriteRow?.avatar_sprite_url ? spriteRow?.avatar_sprite_flip === true : false}
                displayLabel={profile?.displayLabel || "Hero"}
                level={profile?.level?.level || 1}
                backdropUrl={backdropUrl || null}
            />

            {/* Your consumables — potions, scrolls, pet treats & relics. Tap one to use it (self-serve). */}
            <ConsumablesClient />
        </div>
    );
}
