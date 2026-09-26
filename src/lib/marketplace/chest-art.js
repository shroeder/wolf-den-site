import "server-only";

import { getSetting, setSetting } from "@/lib/settings.js";
import { generateImage } from "@/lib/marketplace/openai-image.js";
import { CHEST_ART_PROMPTS, CHEST_ART_TIERS } from "@/lib/marketplace/chest-art-prompts.js";

// AI-generated loot-chest icons (one closed treasure chest per tier), stored as Blob URLs in settings so
// the equipment screen can show real game art instead of an emoji. Admin-triggered + regenerable (chest
// look is subjective), matching how boss art / sprites are produced.

const SETTING_KEY = "chest_art";

// The prompts and the tier list live in chest-art-prompts.js — a file with no "@/" imports, so the
// generator script can read the same prose the cron does instead of keeping a second copy that drifts.
export { CHEST_ART_PROMPTS, CHEST_ART_TIERS };

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
    const url = await generateImage(prompt, { pathPrefix: "marketplace/chest", quality: "low", meta: { origin: "cron", label: "Chest art" } });
    const current = await getChestArt();
    current[tier] = url;
    await setSetting(SETTING_KEY, JSON.stringify(current));
    return url;
}
