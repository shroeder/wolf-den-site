import "server-only";

import { getSetting, setSetting } from "@/lib/settings.js";
import { generateImage } from "@/lib/marketplace/openai-image.js";

// AI-generated loot-chest icons (one closed treasure chest per tier), stored as Blob URLs in settings so
// the equipment screen can show real game art instead of an emoji. Admin-triggered + regenerable (chest
// look is subjective), matching how boss art / sprites are produced.

const SETTING_KEY = "chest_art";

// Shared art direction — kept in the same universe as the hero sprites + boss art (cel-shaded RPG).
const STYLE =
    "2D video-game item icon, bold stylized illustration, clean confident outlines, cel-shaded flat vibrant colors, " +
    "soft rim lighting, three-quarter view from slightly above, the chest closed and centered filling the frame, " +
    "polished RPG loot-chest art, strong readable silhouette, transparent background, no ground shadow, no text, " +
    "no logo, no watermark, no border.";

export const CHEST_ART_PROMPTS = {
    wooden:
        "A closed rustic wooden treasure loot chest bound with dark wrought-iron bands and a simple iron lock, " +
        "weathered oak planks, warm brown tones. " + STYLE,
    iron:
        "A closed sturdy treasure chest reinforced with riveted steel plates and heavy iron bands and a chunky " +
        "padlock, cool gunmetal and brushed-silver tones. " + STYLE,
    gold:
        "A closed ornate golden treasure chest with elaborate scrollwork filigree, gemstone inlays and a glowing " +
        "keyhole, radiant polished-gold tones with a soft warm glow. " + STYLE,
    mythic:
        "A closed magical crystalline treasure chest crackling with arcane energy, glowing emerald-teal runes " +
        "carved into obsidian, floating light motes and a mystical aura. " + STYLE,
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
    const url = await generateImage(prompt, { pathPrefix: "marketplace/chest" });
    const current = await getChestArt();
    current[tier] = url;
    await setSetting(SETTING_KEY, JSON.stringify(current));
    return url;
}
