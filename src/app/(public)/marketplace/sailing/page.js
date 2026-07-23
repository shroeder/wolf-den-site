import { cookies } from "next/headers";

import SailingClient from "@/components/SailingClient";
import SailingLanding from "@/components/SailingLanding";
import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { getSailingState } from "@/lib/marketplace/sailing.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Sailing — a free treasure-hunting adventure | The Wolf Den",
    description: "Captain your ship, dig for buried treasure, and raid rival vessels. Build a free character at The Wolf Den and level up for real store rewards.",
};

export default async function SailingPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    // Cold ad traffic lands here logged-out — show a hook + signup that returns them to sailing, not a 404.
    if (!buyer) return <SailingLanding />;

    const [state, me, petBase, petLevels] = await Promise.all([
        getSailingState(buyer.id),
        db.queryOne(
            `SELECT display_name, alias, avatar_url, avatar_config, avatar_cosmetics, avatar_sprite_url, avatar_sprite_flip, featured_collectible
               FROM mkt_buyer WHERE id = $1`,
            [buyer.id]
        ).catch(() => null),
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
    ]);

    // Render the sky the CLIENT last chose (stored in a cookie) so a refresh shows the right backdrop from the
    // first paint — no flash from the server's random pick to the client's real-world/time-of-day one.
    const skyCookie = (await cookies()).get("wolfden-sail-sky")?.value;
    if (skyCookie && /^\/images\/sailing\/sky-[a-z]+\.png$/.test(skyCookie)) state.sky = skyCookie;

    const hero = {
        spriteUrl: me?.avatar_sprite_url || null,
        spriteFlip: me?.avatar_sprite_url ? me?.avatar_sprite_flip === true : false,
        avatarUrl: avatarImageUrl(me?.avatar_config, me?.avatar_cosmetics) || me?.avatar_url || DEFAULT_AVATAR_URL,
    };
    const petId = me?.featured_collectible || null;
    const petArt = petId ? pickPetSpriteForLevel(petBase[petId], petLevels[petId], 1) : null;
    const pet = petArt?.url ? { url: petArt.url, flip: petArt.flip || false } : null;

    return <SailingClient initial={state} hero={hero} pet={pet} captain={me?.display_name || me?.alias || "Captain"} />;
}
