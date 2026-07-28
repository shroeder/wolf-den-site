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
        `A warm ORANGE DUSK SKY backdrop for a fantasy town — soft glowing clouds in warm ambers and oranges deepening to a dusky purple up top. Along the VERY BOTTOM edge only, a LOW, SMALL, FAINT, hazy silhouette of far-off medieval rooftops and a couple of tiny distant towers, kept small and washed-out so they clearly read as FAR AWAY behind everything. CRITICAL: absolutely NO bright white or cream horizon glow, NO glowing haze band, NO fog streak across the middle — just the sky and, low at the bottom, a faint tiny distant silhouette. Even repeating horizon meant to tile. NO foreground, NO people, NO street, NO large buildings. ${STREET_STYLE}`,
    cobble:
        `A seamless COBBLESTONE STREET ground texture seen at a slight downward angle — worn rounded grey-brown cobbles with mortar gaps, warm even dusk lighting, uniform across the WHOLE image with no focal point, NO objects, NO people, NO buildings, NO sky, NO horizon — just repeating cobblestones, designed to tile left-to-right. ${STREET_STYLE}`,
    // Farm RAISED BED planter — real art to replace the flat CSS plot. Drawn nearly FRONT-ON (flat 2D farm-game
    // view, NOT steep isometric) so it sits naturally in the side-on garden scene. Plants grow out of its soil.
    farm_bed:
        `A single empty RAISED GARDEN BED planter drawn nearly FRONT-ON at a SHALLOW downward tilt — a flat 2D side-scroller farm-game view, NOT a steep isometric angle: you mainly see the low wooden-plank front rail with rounded corner posts, and just above it the dark rich tilled soil surface (gentle furrow rows, a few pebbles) tilted enough to plant in. A wide, low, shallow bed. NO plants, NO crops — empty soil ready to plant. Painterly fantasy farm game-art, warm daylight, clean confident outlines and cel-shaded vibrant colors, a strong readable silhouette. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO grass, NO surrounding ground, NO scenery, NO drop shadow, NO glow behind it. Nothing but the raised bed. No text, no watermark, no border.`,
    // Pet passive-bonus STAT ICONS — small emblem sprites in the game's painterly cel-shaded style (style proof:
    // xp, gold, fortune; the rest follow once approved). CRITICAL: no white sticker rim / die-cut border / halo.
    stat_xp:
        `A single small game ICON of a glowing golden STAR-BURST / sparkle for experience & leveling up. Painterly fantasy cel-shaded style with soft dark-brown ink linework (NOT a white outline), bright radiant golds with a warm inner glow, strong readable silhouette, centered. The subject floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring around it, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the emblem itself. No text, no watermark, no border.`,
    stat_gold:
        `A single small game ICON of a plump drawstring COIN POUCH overflowing with shiny gold coins, for gold/wealth. Painterly fantasy cel-shaded style with soft dark-brown ink linework (NOT a white outline), warm golds and browns, strong readable silhouette, centered. The subject floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring around it, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the pouch itself. No text, no watermark, no border.`,
    stat_fortune:
        `A single small game ICON of a lucky FOUR-LEAF CLOVER with a subtle golden sparkle, for fortune/luck. Painterly fantasy cel-shaded style with soft dark-green ink linework (NOT a white outline), vivid greens, strong readable silhouette, centered. The subject floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring around it, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the clover itself. No text, no watermark, no border.`,
    stat_might:
        `A single small game ICON of a mighty upright STEEL SWORD, for raw might/damage. Painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), steel greys with a warm gold hilt, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the sword. No text, no watermark, no border.`,
    stat_critchance:
        `A single small game ICON of a round red-and-white TARGET / bullseye with an arrow struck in the center, for critical-hit chance. Painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), reds and creams, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the target. No text, no watermark, no border.`,
    stat_critpower:
        `A single small game ICON of a bursting orange IMPACT STAR / comic-style explosion burst, for critical-hit power. Painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), fiery oranges and yellows, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the burst. No text, no watermark, no border.`,
    stat_ferocity:
        `A single small game ICON of a fierce curling FLAME, for ferocity/damage. Painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), hot reds-oranges-yellows, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the flame. No text, no watermark, no border.`,
    stat_seedluck:
        `A single small game ICON of a plump brown SEED / acorn with a tiny green sprout and a small golden sparkle, for seed luck. Painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), warm browns and fresh greens, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the seed. No text, no watermark, no border.`,
    stat_growspeed:
        `A single small game ICON of a fresh green SPROUT shooting upward with a couple of little motion/speed streaks, for faster crop growth. Painterly fantasy cel-shaded style with soft dark-green ink linework (NOT a white outline), vivid greens, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the sprout. No text, no watermark, no border.`,
    stat_petbond:
        `A single small game ICON of a soft blue glowing PAW PRINT, for the pet bond. Painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), gentle blues, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the paw print. No text, no watermark, no border.`,
    stat_tickets:
        `A single small game ICON of a golden RAFFLE TICKET (a torn admission ticket with a perforated stub), for boss-raffle entries. Painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), warm golds and reds, strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO tile, NO card, NO scenery. Nothing but the ticket. No text, no watermark, no border.`,
    // Custom dice sprite — a pair of tavern dice spilling from a leather cup (replaces the 🎲 emoji at the
    // merchant gamble + the tavern dice table).
    dice:
        `A pair of ivory tavern DICE with crisp black pips, one mid-tumble, spilling out of a worn brown leather dice CUP tipped on its side. Painterly fantasy game-art, warm and inviting, clean confident outlines and cel-shaded vibrant colors, a strong readable silhouette, a hint of motion. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO table, NO surface, NO scenery, NO drop shadow, NO glow behind it. Nothing but the cup and dice. No text, no logo, no watermark, no border.`,
    // Opaque INTERIOR scene for the enterable tavern — cozy + rowdy.
    tavern_interior:
        `The cozy, rowdy INTERIOR of a fantasy medieval TAVERN, wide interior view: warm golden lantern light and a big crackling stone FIREPLACE on one side casting an orange glow, heavy timber beams, a long wooden BAR with a friendly barkeep behind it pouring ale, round tables with mugs of foaming ale and a few cheerful cloaked patrons drinking and laughing, a bard's corner, barrels and hanging lanterns, hearty and inviting atmosphere. Painterly 2D video-game background, rich warm cozy mood, no text, no watermark, no UI, no border. A game scene the player steps INTO.`,
    mid:
        `A MIDGROUND row of nearer medieval fantasy town buildings and rooftops along the BOTTOM of the frame — timber-and-stone houses, steep tiled roofs, chimneys, a couple of taller buildings, warm dusk backlight with a few glowing windows, moderate detail (nearer than a distant skyline but still a backdrop). The TOP two-thirds of the image is FULLY TRANSPARENT sky (alpha) with nothing in it. Designed to tile left-to-right, no ground, no street, no people, no text. ${STREET_STYLE}`,
    // "Grow the Plaza" DEPTH layers — each funded level stacks one more parallax band FURTHER back (behind the
    // midground), so the town visibly grows deeper as it's invested in. Transparent-topped, tiling silhouettes.
    depth1:
        `A distant skyline of medieval TOWN SPIRES, steeples and steep rooftops strung along the horizon, SMALL and hazy in warm dusk, gently backlit — a farther-off quarter of the same town, kept modest and low so it reads as sitting BEHIND the nearer rooftops. CRITICAL: absolutely NO bright white/cream glow band at the base, NO fog streak, NO haze band — a clean silhouette against transparency. The TOP ~74% of the image is FULLY TRANSPARENT (alpha) with nothing in it; only the low distant silhouette occupies the bottom. Designed to tile left-to-right, no ground, no street, no people, no text. ${STREET_STYLE}`,
    depth2:
        `A distant range of low rolling HILLS and soft blue-purple MOUNTAINS along the horizon, hazy atmospheric dusk silhouette with a few tiny far watchtowers nestled among them, very soft and desaturated as if seen far away. The TOP ~72% of the image is FULLY TRANSPARENT (alpha) with nothing in it; only the low hill silhouette occupies the bottom. Designed to tile left-to-right, no ground, no street, no people, no text. ${STREET_STYLE}`,
    depth3:
        `A far hazy skyline of grand CASTLE KEEPS and citadel towers with fluttering banners crowning distant hills, majestic and aspirational, deeply atmospheric warm-dusk haze softening them into the horizon. The TOP ~62% of the image is FULLY TRANSPARENT (alpha) with nothing in it; only the far castle silhouette occupies the lower portion. Designed to tile left-to-right, no ground, no street, no people, no text. ${STREET_STYLE}`,
    // The plaza CENTERPIECE — a grand arted town-square fountain (a real landmark, replacing the old emoji statue).
    centerpiece:
        `A grand ornate medieval town-square FOUNTAIN as a centerpiece: a round tiered basin of carved pale weathered stone with clear water arcing and spilling between the tiers, and standing proudly atop the center a carved statue of a HOWLING WOLF, warm golden dusk lantern glow catching the splashing water, a scatter of coins glinting in the basin. A single isolated 2D game-art object, the WHOLE fountain centered and fully visible, painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, a strong readable silhouette. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background scenery, NO sky, NO ground, NO cobblestones, NO haze, fog, or glow behind it. Nothing but the fountain. No people, no text, no logo, no watermark, no border.`,
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
    // Town NPC — a CHARACTER sprite (person, not a building) who stands by the Forge. Uses a character-style
    // prompt (the building style biased the model into drawing a smithy).
    smith: `A single 2D video-game CHARACTER sprite of a friendly burly BLACKSMITH: a bearded HUMAN MAN, full body head-to-boots, standing, wearing a leather apron and rolled sleeves, resting a large smithing hammer on one shoulder, three-quarter view facing slightly forward, warm and welcoming. This is a PERSON / character — NOT a building, NOT a house. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO building, NO forge, NO ground, NO sky, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
    // Town-event enemies — menacing but stylized creatures to attack during a raid.
    bandit: `A single 2D video-game CHARACTER sprite of a menacing fantasy BANDIT RAIDER: a rugged HUMAN outlaw in dark leather armor and a hood or bandana mask over the lower face, brandishing a curved sword or dagger, mid-crouch aggressive battle stance, full body head-to-boots, three-quarter view facing forward toward the viewer, villainous but cartoon-stylized (not gory). This is a PERSON / character — NOT a building. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO ground, NO sky, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
    goblin: `A single 2D video-game CHARACTER sprite of a menacing but cartoon-stylized GOBLIN RAIDER: a small wiry green-skinned goblin with big pointed ears, a wicked toothy grin and beady eyes, wearing scrappy leather scraps, brandishing a crude jagged dagger, aggressive crouched battle stance, full body head-to-toe, three-quarter view facing forward. This is a CREATURE / character — NOT a building. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO ground, NO sky, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
    golem: `A single 2D video-game CHARACTER sprite of a hulking TREASURE GOLEM: a massive lumbering creature built of rough stone and cracked earth, its body studded and overflowing with glinting GOLD COINS and colorful gemstones spilling from the seams, glowing amber eyes, heavy imposing standing pose with big fists, full body head-to-feet, three-quarter view facing forward, awe-inspiring (not gory). This is a CREATURE / character — NOT a building. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO ground, NO sky, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
    // Town NPCs (characters, NOT buildings) who stand in the plaza.
    crier: `A single 2D video-game CHARACTER sprite of a cheerful TOWN CRIER: a HUMAN MAN in a colorful medieval tabard and feathered cap, one hand raised ringing a big brass hand-bell, the other holding a rolled parchment scroll, mouth open mid-announcement, full body head-to-boots, three-quarter view facing forward, lively and welcoming. This is a PERSON / character — NOT a building. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO ground, NO sky, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
    merchant: `A single 2D video-game CHARACTER sprite of a friendly TRAVELING MERCHANT: a HUMAN peddler in a hooded traveling cloak and many-pocketed vest, an overstuffed backpack of wares and trinkets, holding up a small treasure chest or coin pouch with a sly welcoming grin, full body head-to-boots, three-quarter view facing forward. This is a PERSON / character — NOT a building, NOT a market stall. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO ground, NO sky, NO glow, NO stall. Nothing but the character. No text, no logo, no watermark, no border.`,
    questgiver: `A single 2D video-game CHARACTER sprite of a friendly QUEST-GIVER quartermaster: a grizzled seasoned HUMAN adventurer in a leather jerkin and short cloak, holding up a rolled bounty scroll in one hand and gesturing invitingly with the other, a satchel at the hip, full body head-to-boots, three-quarter view facing forward, warm and welcoming. This is a PERSON / character — NOT a building, NOT a notice board. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO ground, NO sky, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
};

// ── Crop GROWTH sprites: each crop gets 3 stages (sprout → growing → ripe) so plots look like the plant is
// actually growing OUT of the bed, not a pickable emoji. Stage 1 (sprout) is shared. Plants are rooted at the
// bottom and grow upward; NO soil/pot/bed (they sit on the arted bed), NO white sticker rim.
const _cropPlant = (stage, subject) =>
    `A single ${stage}, a 2D farm-game PLANT sprite viewed FRONT-ON, rooted at the very BOTTOM edge and growing UPWARD (${subject}). Painterly cel-shaded style with soft dark ink linework (NOT a white outline), vivid natural colors, strong readable silhouette. The plant floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO soil, NO dirt, NO pot, NO planter, NO bed, NO ground, NO white sticker outline, NO die-cut border, NO halo, NO drop shadow, NO scenery. Nothing but the plant itself. No text, no watermark, no border.`;
const CROP_RIPE = {
    wheat: "tall golden WHEAT stalks topped with heavy ripe grain heads",
    carrot: "bushy green CARROT tops with the bright orange carrot crown just showing at the base",
    potato: "a leafy green POTATO plant dotted with small white flowers",
    strawberry: "a low STRAWBERRY plant with green leaves and a few ripe red strawberries",
    corn: "a tall CORN stalk with broad green leaves and one ripe golden-yellow corn cob",
    grape: "a GRAPEVINE with green leaves and a full cluster of ripe purple grapes",
    pumpkin: "a sprawling PUMPKIN vine with big leaves and a plump ripe orange pumpkin",
    goldenapple: "a small leafy branch bearing a glowing GOLDEN APPLE among green leaves",
    starfruit: "an exotic plant bearing a glowing yellow STAR-SHAPED starfruit with faint sparkles",
};
const _cropPrompts = { crop_sprout: _cropPlant("small green SEEDLING SPROUT — two tiny leaves on a short pale stem, freshly emerged", "just the little sprout") };
for (const [id, ripe] of Object.entries(CROP_RIPE)) {
    _cropPrompts[`crop_${id}_grow`] = _cropPlant(`young ${id} plant partway grown — a leafy green stem with several leaves and NO ripe fruit yet`, "a healthy leafy young plant, taller than a sprout");
    _cropPrompts[`crop_${id}_ripe`] = _cropPlant(`mature ${id} plant heavy with its crop`, ripe);
}
Object.assign(ART_PROMPTS, _cropPrompts);

export const TOWN_ART_KEYS = Object.keys(ART_PROMPTS);

// Generate (or regenerate) one town art asset and store its URL.
export async function generateTownArt(key) {
    const prompt = ART_PROMPTS[key];
    if (!prompt) throw new Error("Unknown town art key");
    let url;
    if (key === "background") url = await generateWideSceneImage(prompt, { pathPrefix: "marketplace/town", panels: 3 });
    else if (key === "sky" || key === "cobble" || key === "tavern_interior") url = await generateSceneImage(prompt, { pathPrefix: "marketplace/town" }); // opaque scene layers
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
