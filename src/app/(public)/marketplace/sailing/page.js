import { cookies } from "next/headers";

import SailingClient from "@/components/SailingClient";
import SailingLanding from "@/components/SailingLanding";
import { db } from "@/lib/db";
import { avatarImageUrl } from "@/lib/marketplace/avatar-cosmetics.js";
import { DEFAULT_AVATAR_URL } from "@/lib/marketplace/avatar-options.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { canPreview } from "@/lib/marketplace/owner.js";
import { getPetSpriteData, getPetSpriteLevelData, pickPetSpriteForLevel } from "@/lib/marketplace/pet-sprite.js";
import { collectibleById } from "@/lib/marketplace/collectibles.js";
import { petLevelForXp } from "@/lib/marketplace/pet-level.js";
import { getSailingState } from "@/lib/marketplace/sailing.js";
import { devFixture } from "@/lib/dev-fixture.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Sailing — a free treasure-hunting adventure | The Wolf Den",
    description: "Captain your ship, dig for buried treasure, and raid rival vessels. Build a free character at The Wolf Den and level up for real store rewards.",
};

export default async function SailingPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    // Cold ad traffic lands here logged-out — show a hook + signup that returns them to sailing, not a 404.
    if (!buyer) return <SailingLanding />;

    // A canned state instead of the database, in dev only, when the rig asks for one — see dev-fixture.js.
    // It is a no-op in production before it reads anything, and it is how every state of this screen gets
    // looked at without writing that state onto somebody's real account first.
    const fixture = devFixture("sailing", (await cookies()).get("wolfden-fixture")?.value);

    const [state, me, petBase, petLevels] = await Promise.all([
        fixture ? Promise.resolve(fixture) : getSailingState(buyer.id),
        db.queryOne(
            // town_halloween rides along on the query that was already being made rather than earning a
            // second round trip — see CLAUDE.md on narrowing calls. One extra column is free; one extra
            // queryOne is a TLS handshake on the Active CPU meter, which is the bill.
            `SELECT display_name, alias, avatar_url, avatar_config, avatar_cosmetics, avatar_sprite_url, avatar_sprite_flip, featured_collectible, town_halloween
               FROM mkt_buyer WHERE id = $1`,
            [buyer.id]
        ).catch(() => null),
        getPetSpriteData().catch(() => ({})),
        getPetSpriteLevelData().catch(() => ({})),
    ]);

    // ── ONE FLAG DRESSES THE WHOLE GAME ──────────────────────────────────────────────────────────────────
    // The same `town_halloween` column and the same `canPreview("halloween")` gate the plaza uses. Luke asked
    // for sailing to follow the town's flag, not to carry a second switch of its own — two toggles would mean
    // a half-decorated game and a bug report about the one you forgot.
    //
    // A fixture may also raise it, so the dressed-up sea can be looked at locally without writing the flag
    // onto a real account first — devFixture is a hard no-op in production, so this cannot be forged live.
    const halloween = Boolean(fixture?.halloween)
        || (canPreview("halloween", buyer.id) && Boolean(me?.town_halloween));

    // Render the sky the CLIENT last chose (stored in a cookie) so a refresh shows the right backdrop from the
    // first paint — no flash from the server's random pick to the client's real-world/time-of-day one.
    const skyCookie = (await cookies()).get("wolfden-sail-sky")?.value;
    if (skyCookie && /^\/images\/sailing\/sky-[a-z]+\.png$/.test(skyCookie)) state.sky = skyCookie;
    // ⚠️ AFTER the cookie, so the haunted sky wins. A stored sky is a preference about weather; the flag is a
    // deliberate choice to dress the game up, and a cached sunset must not quietly undo it on the next load.
    if (halloween) state.sky = "/images/sailing/sky-haunted.png";

    const hero = {
        spriteUrl: me?.avatar_sprite_url || null,
        spriteFlip: me?.avatar_sprite_url ? me?.avatar_sprite_flip === true : false,
        avatarUrl: avatarImageUrl(me?.avatar_config, me?.avatar_cosmetics) || me?.avatar_url || DEFAULT_AVATAR_URL,
    };
    // Show the sprite for the pet's CURRENT level, like the farm and the boss scene do. This was pinned to 1,
    // so a fully evolved pet still rode the boat in its Lv1 form -- for the captain AND, further down, for every
    // other member on the horizon.
    const petId = me?.featured_collectible || null;
    const petXpRow = petId
        ? await db.queryOne(`SELECT xp, look_level FROM mkt_pet_level WHERE buyer_id = $1 AND pet_id = $2`, [buyer.id, petId]).catch(() => null)
        : null;
    const petLvl = petId ? petLevelForXp(petXpRow?.xp || 0, collectibleById(petId)?.rarity) : 1;
    // The last surface. Your pet stands on your own deck, so it wears its enshrined form here too — the
    // alternative is one screen in the game where a transfigured animal quietly reverts.
    const { stoneMapFor } = await import("@/lib/marketplace/pet-ascension.js");
    const myStones = petId ? await stoneMapFor(buyer.id).catch(() => ({})) : {};
    // The chosen look comes off the row already fetched above — a member who pinned this pet to an earlier
    // rung sees that pet on their own deck too, or the one screen they look at most would contradict the rest.
    const petArt = petId ? pickPetSpriteForLevel(petBase[petId], petLevels[petId], petLvl, myStones[petId] || null, petXpRow?.look_level || null) : null;
    const pet = petArt?.url ? { url: petArt.url, flip: petArt.flip || false } : null;

    return <SailingClient initial={state} hero={hero} pet={pet} captain={me?.display_name || me?.alias || "Captain"} halloween={halloween} />;
}
