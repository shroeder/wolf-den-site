import "server-only";

import { getSetting, setSetting } from "@/lib/settings.js";
import { housePrompt } from "@/lib/marketplace/art-style.js";
import { generateImage } from "@/lib/marketplace/openai-image.js";

// AI-generated loot-chest icons (one closed treasure chest per tier), stored as Blob URLs in settings so
// the equipment screen can show real game art instead of an emoji. Admin-triggered + regenerable (chest
// look is subjective), matching how boss art / sprites are produced.

const SETTING_KEY = "chest_art";

// Subject + the shared house style. The negative clauses about boxes matter regardless of style: gpt-image-1
// will happily draw a cardboard shipping box if you just say "chest".
const STYLE = housePrompt(
    "A fantasy RPG treasure chest with a CURVED DOMED lid, thick metal corner brackets, a big ornate front lock " +
    "plate with a keyhole, and reinforcing bands with rivets. Closed lid, three-quarter view from slightly above.",
    { extra: "It is a treasure chest, NOT a cardboard box, NOT a cube, NOT a crate, NOT a suitcase, no packing tape, no flat flaps." }
);

export const CHEST_ART_PROMPTS = {
    wooden:
        "A rugged wooden treasure chest of thick weathered oak planks bound with dark wrought-iron straps, warm " +
        "rich brown wood tones with a worn adventurer feel. " + STYLE,
    iron:
        "A sturdy dungeon treasure chest clad in riveted brushed-steel plates and heavy dark iron bands with a " +
        "chunky padlock, cool gunmetal and silver tones. " + STYLE,
    gold:
        "A lavish royal treasure chest of polished gold with elaborate engraved scrollwork filigree, jewel inlays, " +
        "and a glowing keyhole, radiant warm gold with a soft magical shine. " + STYLE,
    mythic:
        "A magical crystalline treasure chest of dark obsidian and glowing emerald-teal crystal, etched arcane runes " +
        "pulsing with energy, floating light motes and a mystical aura. " + STYLE,
    ascendant:
        "A transcendent treasure chest wreathed in molten orange-gold fire and embers, its dark metal cracked with " +
        "glowing lava veins, radiating intense heat and sparks, blazing beyond legendary. " + STYLE,
    eternal:
        "A godlike treasure chest radiating impossible prismatic rainbow light that shifts through hot pink, violet " +
        "and cyan, crackling with divine energy and shimmering aura, the pinnacle of all loot. " + STYLE,
    celestial:
        "A cosmic treasure chest seemingly carved from deep space, its surface a swirling nebula of stars and " +
        "galaxies in deep violet and indigo with glowing constellations and stardust. " + STYLE,
    primordial:
        "The ultimate primordial treasure chest of ancient white-gold metal blazing with blinding radiant light, " +
        "carved with glowing origin runes, an overwhelming divine aura — the source of all treasure. " + STYLE,
};

export const CHEST_ART_TIERS = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];

// The stored tier -> image URL map (or {} if none generated yet).
export async function getChestArt() {
    const raw = await getSetting(SETTING_KEY, null);
    if (!raw) return {};
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return {};
    }
}

// Auto-fill any tiers missing art (run from the art cron so chest icons appear without manual taps). Does
// a couple per call to stay under the function timeout; returns how many it generated + how many remain.
export async function generateMissingChestArt(limit = 2) {
    const have = await getChestArt().catch(() => ({}));
    const missing = CHEST_ART_TIERS.filter((t) => !have[t]).slice(0, Math.max(1, limit));
    let done = 0;
    for (const t of missing) {
        try { await generateChestArt(t); done += 1; } catch { /* skip; try again next run */ }
    }
    const nowHave = await getChestArt().catch(() => ({}));
    const remaining = CHEST_ART_TIERS.filter((t) => !nowHave[t]).length;
    return { generated: done, remaining };
}

// Generate (or regenerate) one tier's chest icon and persist it. Returns the new URL.
export async function generateChestArt(tier) {
    const prompt = CHEST_ART_PROMPTS[tier];
    if (!prompt) throw new Error(`Unknown chest tier: ${tier}`);
    // Chests render at 130-260px. "high" costs 4x "medium" and none of that detail survives the
    // downscale — see the quality note in art-style.js.
    const url = await generateImage(prompt, { pathPrefix: "marketplace/chest", quality: "medium" });
    const current = await getChestArt();
    current[tier] = url;
    await setSetting(SETTING_KEY, JSON.stringify(current));
    return url;
}
