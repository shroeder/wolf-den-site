import "server-only";

import { getSetting, setSetting } from "@/lib/settings.js";
import { generateImage } from "@/lib/marketplace/openai-image.js";

// AI-generated loot-chest icons (one closed treasure chest per tier), stored as Blob URLs in settings so
// the equipment screen can show real game art instead of an emoji. Admin-triggered + regenerable (chest
// look is subjective), matching how boss art / sprites are produced.

const SETTING_KEY = "chest_art";

// Shared art direction — kept in the same universe as the hero sprites + boss art (cel-shaded RPG). The
// negative clauses matter: gpt-image-1 will happily draw a cardboard shipping box if you just say "chest".
const STYLE =
    "A fantasy RPG treasure chest with a CURVED DOMED lid, thick metal corner brackets, a big ornate front lock " +
    "plate with a keyhole, and reinforcing bands with rivets. Closed lid, three-quarter view from slightly above, " +
    "centered and filling the frame. 2D video-game loot-chest icon, bold stylized illustration, clean confident " +
    "outlines, cel-shaded vibrant colors, soft rim lighting, dramatic highlights, strong readable silhouette. " +
    "It is a treasure chest, NOT a cardboard box, NOT a cube, NOT a crate, NOT a suitcase, no packing tape, no flat " +
    "flaps. Transparent background, no ground, no shadow, no text, no logo, no watermark, no border.";

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
};

export const CHEST_ART_TIERS = ["wooden", "iron", "gold", "mythic"];

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

// Generate (or regenerate) one tier's chest icon and persist it. Returns the new URL.
export async function generateChestArt(tier) {
    const prompt = CHEST_ART_PROMPTS[tier];
    if (!prompt) throw new Error(`Unknown chest tier: ${tier}`);
    const url = await generateImage(prompt, { pathPrefix: "marketplace/chest", quality: "high" });
    const current = await getChestArt();
    current[tier] = url;
    await setSetting(SETTING_KEY, JSON.stringify(current));
    return url;
}
