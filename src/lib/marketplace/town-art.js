import "server-only";

import { db } from "@/lib/db";
import { generateImage, generateWideSceneImage, generateSceneImage } from "@/lib/marketplace/openai-image.js";

// AI art for the side-scrolling Wolf Den Town: one WIDE panoramic street background (repeated/mirrored so it
// scrolls forever) + transparent BUILDING sprites laid on top of it. Static/shared — generate once + store.

const STREET_STYLE =
    "painterly 2D side-scrolling video-game background, warm golden-hour dusk, cohesive fantasy action-RPG town, soft lantern glow, rich but not busy, no text, no watermark.";
const BUILDING_STYLE =
    "a single isolated 2D game-art building, the WHOLE building centered and fully visible, painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background scenery, NO sky, NO ground, NO cobblestones, NO haze, fog, or ambient glow behind the building. Nothing but the building itself. No people, no text, no logo, no watermark, no border.";

const ART_PROMPTS = {
    // ── Layered/parallax approach (reliable): a GENERIC tiling far sky + a seamless cobble ground texture; all
    // the uniqueness lives in the separate building sprites laid on top. Only these two are ever "tiled", and
    // they're the two things that tile flawlessly (a generic sky mirrors invisibly; a texture repeats cleanly).
    sky:
        `A fantasy town SKYLINE far-background at warm golden dusk — a soft glowing sky fading from warm amber near the horizon up to dusky purple, a LOW distant silhouette of generic medieval rooftops and chimneys with a couple of faint vague towers along the horizon, soft atmospheric haze. NO distinct landmark, NO foreground, NO people, NO street or ground — only sky and a faint distant town silhouette, an even repeating horizon meant to tile. ${STREET_STYLE}`,
    cobble:
        `A seamless COBBLESTONE STREET ground texture seen at a slight downward angle — worn rounded grey-brown cobbles with mortar gaps, warm even dusk lighting, uniform across the WHOLE image with no focal point, NO objects, NO people, NO buildings, NO sky, NO horizon — just repeating cobblestones, designed to tile left-to-right. ${STREET_STYLE}`,
    mid:
        `A MIDGROUND row of nearer medieval fantasy town buildings and rooftops along the BOTTOM of the frame — timber-and-stone houses, steep tiled roofs, chimneys, a couple of taller buildings, warm dusk backlight with a few glowing windows, moderate detail (nearer than a distant skyline but still a backdrop). The TOP two-thirds of the image is FULLY TRANSPARENT sky (alpha) with nothing in it. Designed to tile left-to-right, no ground, no street, no people, no text. ${STREET_STYLE}`,
    fg:
        `A LOW foreground border running straight across the BOTTOM of the frame — a weathered medieval stone retaining wall / cobbled curb roughly waist-high, topped here and there with a short wooden rail, tufts of grass and moss, a couple of wooden barrels and a crate, and a short lamp-post with a warm glowing lantern. Nearer and larger-detailed than the background — this is the near edge of the town square where the street meets the buildings behind it. The TOP ~65% of the image is FULLY TRANSPARENT (alpha) with nothing in it — ONLY the low wall and its props occupy the bottom. Designed to tile left-to-right, no full buildings, no sky, no people, no text. ${STREET_STYLE}`,
    // Legacy single wide background (kept only as a fallback if the layers aren't generated).
    background:
        `A wide empty fantasy COBBLESTONE town street at warm golden dusk, worn cobblestones underfoot, a low stone curb, distant medieval town rooftops, chimneys and a couple of towers on the horizon, warm sky fading to dusky purple, a few hanging lanterns and string lights, cozy and inviting, NO people, NO large foreground buildings (leave the street open) — a clean side-scroller street the player walks along. ${STREET_STYLE}`,
    tavern: `A cozy fantasy TAVERN — a timber-framed inn with warm-lit windows, a hanging wooden sign shaped like a foaming beer mug, a small awning over the door. ${BUILDING_STYLE}`,
    boss: `An imposing stone BATTLE ARENA gatehouse — a coliseum-style entrance with crossed-swords banners, two iron braziers with flame, heavy arched wooden doors. ${BUILDING_STYLE}`,
    forge: `A blacksmith's FORGE — a stone-and-timber smithy with a glowing orange furnace opening, an anvil beside the door, a chimney with a small wisp of smoke, a hanging hammer-and-anvil sign. ${BUILDING_STYLE}`,
    shop: `A GENERAL STORE trading post — a wooden shopfront with a striped awning, a couple of barrels and crates of goods by the door, a hanging sign with a coin pouch. ${BUILDING_STYLE}`,
    docks: `A wooden HARBOR DOCKHOUSE with a small moored sailing ship beside it, coiled ropes, barrels and crates, a lantern on a post. ${BUILDING_STYLE}`,
    farm: `A rustic FARM barn — a red-brown barn with a hayloft, a wooden fence gate, a couple of pumpkins and a wheat sheaf by the door, a little scarecrow. ${BUILDING_STYLE}`,
    // Town NPC — a character sprite (same isolated-cutout treatment as the buildings) who stands by the Forge.
    smith: `A friendly burly BLACKSMITH — a bearded human smith in a leather apron and rolled sleeves, standing and resting a large hammer on one shoulder, full body, three-quarter view facing slightly forward, warm and welcoming. ${BUILDING_STYLE}`,
};

export const TOWN_ART_KEYS = Object.keys(ART_PROMPTS);

// Generate (or regenerate) one town art asset and store its URL.
export async function generateTownArt(key) {
    const prompt = ART_PROMPTS[key];
    if (!prompt) throw new Error("Unknown town art key");
    let url;
    if (key === "background") url = await generateWideSceneImage(prompt, { pathPrefix: "marketplace/town", panels: 3 });
    else if (key === "sky" || key === "cobble") url = await generateSceneImage(prompt, { pathPrefix: "marketplace/town" }); // opaque scene layers
    else url = await generateImage(prompt, { size: "1024x1024", pathPrefix: "marketplace/town", deHalo: true }); // transparent building sprite
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
