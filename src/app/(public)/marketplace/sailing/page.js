import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import SailingClient from "@/components/SailingClient";
import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { getSailingState } from "@/lib/marketplace/sailing.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sailing | The Wolf Den" };

export default async function SailingPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) notFound(); // sign-in required (the nav/hub links only appear inside the authed game)

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
