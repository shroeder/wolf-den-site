import ConsumablesClient from "@/components/ConsumablesClient";
import { gatePage } from "@/lib/marketplace/gate-page.js";
import EquipmentClient from "@/components/EquipmentClient";
import ViewPing from "@/components/ViewPing";
import MarketplaceProfileClient from "@/components/MarketplaceProfileClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getProfile } from "@/lib/marketplace/profile.js";
import { groveOpen } from "@/lib/marketplace/owner.js";
import { groveToolCase } from "@/lib/marketplace/grove-tools.js";
import { spriteShelf } from "@/lib/marketplace/avatar-sprite.js";
import { shared, TTL } from "@/lib/marketplace/shared-cache.js";
import { getSetting } from "@/lib/settings.js";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Your Gear | Wolf Den Marketplace",
    robots: { index: false, follow: false },
};

export default async function InventoryPage() {
    // The town gate's route half — see gate-page.js. One line, and it is the half that gets forgotten.
    await gatePage("inventory");
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card"><MarketplaceProfileClient /></section>
            </div>
        );
    }

    // ⚠️ THE SHELF IS SERVER-RENDERED, NOT FETCHED ON MOUNT. This is the busiest screen on the site and the
    // shelf carries the "your hero is out of date" line, which has to be on the page at load or it is not a
    // nudge, it is a thing you find by looking for it. Fetching it client-side would also be a fourth
    // request on a page that already makes three — the family-A waste CLAUDE.md opens with. It rides the
    // same Promise.all, so it costs latency only if it is the slowest of the four.
    // ⚠️ THE CRAFTING-GEAR TAB IS LOADED ONLY FOR THE PEOPLE WHO CAN HAVE ANY. Eric: "Anyone who has the
    // ability to get crafting gear in the game from the grove needs to have their equipment screen extended."
    // groveOpen is the same allow-list the Grove's own door checks and it is a pure Set lookup — no query —
    // so the other 212 members pay nothing for a tab they would have no rows behind. It rides the existing
    // Promise.all rather than being awaited after it, so it costs latency only if it is the slowest of five.
    const canCraft = groveOpen(buyer.id);
    const [profile, spriteRow, backdropUrl, heroShelf, toolCase] = await Promise.all([
        getProfile(buyer.id).catch(() => null),
        db.queryOne(`SELECT avatar_sprite_url, avatar_sprite_flip FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null),
        // The busiest path on the site reading a backdrop URL that changes when somebody uploads one.
        // TTL.ART is what this cache is for; the admin route drops the key when it writes a new one.
        shared("art:equipBackdrop", TTL.ART, () => getSetting("equip_backdrop_url").catch(() => null)),
        spriteShelf(buyer.id).catch(() => null),
        canCraft ? groveToolCase(buyer.id).catch(() => null) : Promise.resolve(null),
    ]);

    return (
        <div className="stack reveal">
            <ViewPing event="view_inventory" />
            {/* Consumables FIRST. They sat below the whole equipment screen — a long scroll on a phone — so
                members were sitting on potions, treats and relics without knowing it. An item you own and never
                use is worse than one you don't have: it cost something to hand out and it does nothing. */}
            <ConsumablesClient />

            <EquipmentClient
                avatarUrl={profile?.avatarUrl}
                spriteUrl={spriteRow?.avatar_sprite_url || null}
                spriteFlip={spriteRow?.avatar_sprite_url ? spriteRow?.avatar_sprite_flip === true : false}
                displayLabel={profile?.displayLabel || "Hero"}
                level={profile?.level?.level || 1}
                backdropUrl={backdropUrl || null}
                heroShelf={heroShelf}
                toolCase={toolCase}
            />
        </div>
    );
}
