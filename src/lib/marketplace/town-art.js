import "server-only";

import { db } from "@/lib/db";
import { generateImage, generateWideSceneImage } from "@/lib/marketplace/openai-image.js";

// AI art for the side-scrolling Wolf Den Town: one WIDE panoramic street background (repeated/mirrored so it
// scrolls forever) + transparent BUILDING sprites laid on top of it. Static/shared — generate once + store.

const STREET_STYLE =
    "painterly 2D side-scrolling video-game background, warm golden-hour dusk, cohesive fantasy action-RPG town, soft lantern glow, rich but not busy, no text, no watermark.";
const BUILDING_STYLE =
    "2D video-game building sprite, a single standalone front-facing building facade, painterly fantasy action-RPG style matching a warm-dusk cobblestone town, clean confident outlines, cohesive palette, sitting flat (no floating), transparent background, no ground plane, no sky, no people, no text, no logo, no watermark, no border.";

const ART_PROMPTS = {
    background:
        `A wide empty fantasy COBBLESTONE town street at warm golden dusk, worn cobblestones underfoot, a low stone curb, distant medieval town rooftops, chimneys and a couple of towers on the horizon, warm sky fading to dusky purple, a few hanging lanterns and string lights, cozy and inviting, NO people, NO large foreground buildings (leave the street open) — a clean side-scroller street the player walks along. ${STREET_STYLE}`,
    tavern: `A cozy fantasy TAVERN building with timber framing, warm glowing windows, a hanging wooden sign shaped like a foaming beer mug, a small awning. ${BUILDING_STYLE}`,
    boss: `An imposing stone BATTLE ARENA gatehouse — a coliseum-style entrance with crossed-swords banners, iron braziers with flame, heavy arched doors. ${BUILDING_STYLE}`,
    forge: `A blacksmith's FORGE building — stone and timber smithy with a glowing orange furnace inside, an anvil out front, a chimney with a wisp of smoke, a hanging hammer-and-anvil sign. ${BUILDING_STYLE}`,
    shop: `A GENERAL STORE / trading post — a wooden shopfront with a striped awning, barrels and crates of goods out front, a hanging sign with a coin/pouch. ${BUILDING_STYLE}`,
    docks: `A wooden HARBOR DOCK building with a small moored sailing ship beside it, coiled ropes, barrels and crates, a lantern on a post, nautical fantasy. ${BUILDING_STYLE}`,
    farm: `A rustic FARM gate and barn — a red-brown barn with a wooden fence, a wheat field and a few pumpkins behind the gate, a scarecrow. ${BUILDING_STYLE}`,
};

export const TOWN_ART_KEYS = Object.keys(ART_PROMPTS);

// Generate (or regenerate) one town art asset and store its URL.
export async function generateTownArt(key) {
    const prompt = ART_PROMPTS[key];
    if (!prompt) throw new Error("Unknown town art key");
    const url = key === "background"
        ? await generateWideSceneImage(prompt, { pathPrefix: "marketplace/town", panels: 3 })
        : await generateImage(prompt, { size: "1024x1024", pathPrefix: "marketplace/town", deHalo: true });
    await db.query(
        `INSERT INTO mkt_town_art (art_key, url, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (art_key) DO UPDATE SET url = $2, updated_at = NOW()`,
        [key, url]
    );
    return url;
}

// Status for the admin tool: which keys have art yet.
export async function townArtStatus() {
    const rows = await db.query(`SELECT art_key, url FROM mkt_town_art`).catch(() => []);
    const have = Object.fromEntries(rows.map((r) => [r.art_key, r.url]));
    return { keys: TOWN_ART_KEYS.map((k) => ({ key: k, url: have[k] || null })), done: TOWN_ART_KEYS.filter((k) => have[k]).length, total: TOWN_ART_KEYS.length };
}
