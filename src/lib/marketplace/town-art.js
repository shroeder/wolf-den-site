import "server-only";

import { db } from "@/lib/db";
import { generateImage, generateWideSceneImage, generateSceneImage } from "@/lib/marketplace/openai-image.js";
import { housePrompt } from "@/lib/marketplace/art-style.js";

// AI art for the side-scrolling Wolf Den Town: one WIDE panoramic street background (repeated/mirrored so it
// scrolls forever) + transparent BUILDING sprites laid on top of it. Static/shared — generate once + store.

const STREET_STYLE =
    "painterly 2D side-scrolling video-game background, warm golden-hour dusk, cohesive fantasy action-RPG town, soft lantern glow, rich but not busy, no text, no watermark.";
// Shared framing for the raised-bed sprites so every tier keeps the SAME wide/low/shallow front-on shape (plants
// are anchored to it, so the silhouette must stay consistent) — only the material changes per tier.
const BED_BASE =
    "A single empty RAISED GARDEN BED planter drawn nearly FRONT-ON at a SHALLOW downward tilt — a flat 2D side-scroller farm-game view, NOT a steep isometric angle: you mainly see the low front rail with rounded corner posts and, just above it, the dark rich tilled SOIL surface (gentle furrow rows) tilted enough to plant in. A WIDE, LOW, SHALLOW bed, the same size and shape as a basic wooden planter. NO plants, NO crops, NO sprouts — just empty soil ready to plant.";
const BED_TAIL =
    "Painterly fantasy farm game-art, clean confident outlines and cel-shaded vibrant colors, a strong readable silhouette. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO grass, NO surrounding ground, NO scenery, NO drop shadow behind it. Nothing but the raised bed. No text, no watermark, no border.";
const CRITTER_STYLE =
    "a single cute mascot CHARACTER sprite, full body, three-quarter view facing forward, painterly fantasy cel-shaded style with soft dark ink linework (NOT a white outline), warm vibrant colors, a strong readable silhouette, centered. Floats ALONE on a FULLY TRANSPARENT background (alpha) — absolutely NO white sticker outline, NO die-cut border, NO rim, NO halo, NO glow ring, NO drop shadow, NO ground, NO scenery, NO tile. Nothing but the critter. No text, no watermark, no border.";
const BUILDING_STYLE =
    "a single isolated 2D game-art building, the WHOLE building centered and fully visible, painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background scenery, NO sky, NO ground, NO cobblestones, NO haze, fog, or ambient glow behind the building. Nothing but the building itself. No people, no text, no logo, no watermark, no border.";

const ART_PROMPTS = {
    // ── Layered/parallax approach (reliable): a GENERIC tiling far sky + a seamless cobble ground texture; all
    // the uniqueness lives in the separate building sprites laid on top. Only these two are ever "tiled", and
    // they're the two things that tile flawlessly (a generic sky mirrors invisibly; a texture repeats cleanly).
    sky:
        `A bright cheerful DAYTIME BLUE SKY backdrop for a fantasy town — soft fluffy white cumulus clouds of NATURALLY VARIED sizes and organic irregular shapes, scattered ORGANICALLY across the sky (some loosely clustered, some lone wisps, plenty of open clear blue between them), a natural-looking sky — absolutely NOT a uniform grid, NOT evenly-spaced, NOT a repeating pattern. Along the VERY BOTTOM edge only, a LOW, SMALL, FAINT, pale-blue silhouette of far-off medieval rooftops, small and washed-out (far away). CRITICAL: absolutely NO orange, NO tan, NO dust-storm haze, NO cream/beige haze band, NO fog streak — just a friendly natural BLUE sky with soft white clouds. Designed to tile horizontally with no hard seam at the left/right edges. Painterly 2D video-game background, clean and inviting, no text, no watermark, no border.`,
    cobble:
        `A seamless COBBLESTONE STREET ground texture seen at a slight downward angle — worn rounded grey-brown cobbles with mortar gaps, warm even dusk lighting, uniform across the WHOLE image with no focal point, NO objects, NO people, NO buildings, NO sky, NO horizon — just repeating cobblestones, designed to tile left-to-right. ${STREET_STYLE}`,
    // Farm RAISED BED planter — real art to replace the flat CSS plot. Drawn nearly FRONT-ON (flat 2D farm-game
    // view, NOT steep isometric) so it sits naturally in the side-on garden scene. Plants grow out of its soil.
    farm_bed:
        `A single empty RAISED GARDEN BED planter drawn nearly FRONT-ON at a SHALLOW downward tilt — a flat 2D side-scroller farm-game view, NOT a steep isometric angle: you mainly see the low wooden-plank front rail with rounded corner posts, and just above it the dark rich tilled soil surface (gentle furrow rows, a few pebbles) tilted enough to plant in. A wide, low, shallow bed. NO plants, NO crops — empty soil ready to plant. Painterly fantasy farm game-art, warm daylight, clean confident outlines and cel-shaded vibrant colors, a strong readable silhouette. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO grass, NO surrounding ground, NO scenery, NO drop shadow, NO glow behind it. Nothing but the raised bed. No text, no watermark, no border.`,
    // Upgraded bed sprites — the plot's specialization tier (every 5 levels). SAME wide/low/shallow front-on
    // shape + empty tilled soil as farm_bed (so plants still align); only the MATERIAL ranks up.
    farm_bed_t1: `${BED_BASE} The planter is a STURDY REINFORCED WOODEN bed — dark iron corner brackets, bolts and an iron band around the front rail, a slightly richer stained wood. ${BED_TAIL}`,
    farm_bed_t2: `${BED_BASE} The planter is built of carved GREY STONE blocks with mortared seams and solid stone corner posts (a masonry raised bed), the wood trim replaced by cool stone. ${BED_TAIL}`,
    farm_bed_t3: `${BED_BASE} The planter is an ORNATE GILDED bed — polished dark wood with lustrous GOLD trim and filigree inlay along the front rail and small gold corner finials, luxurious and prized. ${BED_TAIL}`,
    farm_bed_t4: `${BED_BASE} The planter is an ENCHANTED CRYSTAL-AND-WOOD bed — pale wood set with glowing cyan crystal corner shards and faint softly-glowing magic runes etched along the front rail, the soil faintly luminous. ${BED_TAIL}`,
    farm_bed_t5: `${BED_BASE} The planter is a magnificent PRISMATIC CRYSTAL bed — iridescent violet-and-rainbow crystal edges and corner spires with a gentle inner glow and a few tiny floating sparkles, the richest enchanted planter. ${BED_TAIL}`,
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
    // Opaque WIDE interior room for the walkable tavern — an EMPTY room (characters are placed on top as NPCs).
    tavern_interior:
        `A WIDE panoramic cozy fantasy medieval TAVERN INTERIOR, a long room seen straight-on side-scroller style: on the LEFT a long wooden BAR counter with kegs, taps, bottles and hanging mugs (but NOBODY behind it); in the CENTER a big crackling stone FIREPLACE casting warm orange glow, with a few empty round wooden tables and stools; on the RIGHT a cozy corner with a small gambling table and stools; heavy timber ceiling beams, hanging iron lanterns, barrels, a warm plank floor running the whole width. IMPORTANT: NO people, NO characters, NO patrons anywhere — an EMPTY inviting room so game characters can stand in it. Rich warm cozy firelit mood. Painterly 2D video-game background, no text, no watermark, no UI, no border.`,
    // Tavern NPC CHARACTERS (people, placed in the walkable room).
    barkeep: `A single 2D video-game CHARACTER sprite of a friendly TAVERN BARKEEP: a stout jolly bearded HUMAN man in a leather apron over a rolled-sleeve shirt, a bar towel over one shoulder, holding up a frothing mug of ale with a welcoming grin, full body head-to-boots, three-quarter view facing forward. This is a PERSON / character — NOT a building, NOT a bar. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO bar, NO scenery, NO ground, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
    gambler: `A single 2D video-game CHARACTER sprite of a sly TAVERN GAMBLER SEATED on a stool: a lean roguish HUMAN man in a hooded cloak and vest with a smirk, leaning forward with a pair of DICE in one raised hand as if mid-toss, SITTING on a wooden stool (show him seated, knees bent), three-quarter view facing forward. This is a PERSON / character — NOT a building, NOT a table. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO table, NO scenery, NO ground, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
    // The CARD SHARP at the back table — the tavern door into the card run. He is drawn WITH his little table,
    // unlike every other NPC here, because the ask was a man SITTING AT a table and a seated figure cut out
    // alone reads as a man crouching on a plank floor.
    //
    // ⚠️ HE IS THE SAME ANIMAL AS THE ONE IN THE CARD GAME'S OWN FRONT ROOM. He was drawn here first, as a
    // hooded human, and the game's back table (table-sharp.png, gen-card-chrome.mjs) later drew him as a
    // raccoon — so the character you meet in the tavern and the character you sit down opposite were two
    // different people wearing the same job. The raccoon won because everything else in that game is an
    // animal. THE TWO PROMPTS DESCRIBE ONE MAN: flat cap, waistcoat over a collarless shirt, rolled sleeves,
    // gold ring in one ear, crooked grin. Change one and change the other, or he splits in half again.
    cardsharp: `A single 2D video-game CHARACTER sprite of a shady TAVERN CARD SHARP SEATED at a small round card TABLE: a lean anthropomorphic RACCOON with a masked face and a crooked knowing grin, wearing a tilted flat cap, a battered waistcoat over a collarless shirt with the sleeves rolled, and a gold ring in one ear, holding a fanned hand of PLAYING CARDS in one paw and resting his other paw on a small stacked DECK on the table, a couple of loose cards and coins scattered on the tabletop, SITTING on a stool behind a small round wooden table (show him seated with the little table in front of him, knees hidden behind it), three-quarter view facing forward. This is a RACCOON AT A SMALL TABLE — NOT a building, NOT a room, NOT a whole tavern. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO floor, NO scenery, NO ground, NO glow, NO white sticker rim, NO halo, NO drop shadow. Nothing but the raccoon and his little table. No text, no logo, no watermark, no border.`,
    mid:
        `A MIDGROUND row of nearer medieval fantasy town buildings and rooftops along the BOTTOM of the frame — timber-and-stone houses with warm brown timber and terracotta tiled roofs, chimneys, a couple of taller buildings, lit by soft NATURAL DAYTIME light. CRITICAL: NO dusk, NO orange/warm backlight, NO glowing sky, and absolutely NO haze, fog, cream/tan band or atmospheric glow behind or around the buildings. The TOP two-thirds of the image is FULLY TRANSPARENT (alpha) with NOTHING in it — no baked sky, no clouds, no haze — just clean building rooftops cut out against transparency along the bottom. Designed to tile left-to-right, no ground, no street, no people, no text. Painterly 2D game art, clean cel-shaded, no text, no watermark, no border.`,
    // "Grow the Plaza" DEPTH layers — each funded level stacks one more parallax band FURTHER back (behind the
    // midground), so the town visibly grows deeper as it's invested in. Transparent-topped, tiling silhouettes.
    depth1:
        `A distant skyline of medieval TOWN SPIRES, steeples and steep rooftops strung along the horizon, SMALL and hazy in soft DAYTIME light (cool pale blue-grey atmospheric haze, NOT dusk/orange) — a farther-off quarter of the same town, kept modest and low so it reads as sitting BEHIND the nearer rooftops under a blue sky. CRITICAL: absolutely NO bright white/cream glow band at the base, NO fog streak, NO haze band — a clean pale silhouette against transparency. The TOP ~74% of the image is FULLY TRANSPARENT (alpha) with nothing in it; only the low distant silhouette occupies the bottom. Designed to tile left-to-right, no ground, no street, no people, no text.`,
    depth2:
        `A distant range of low rolling HILLS and soft blue-grey MOUNTAINS along the horizon, with a few tiny far watchtowers nestled among them, in soft DAYTIME light (cool pale blue-grey atmospheric haze, NOT dusk/orange), very soft and desaturated as if seen far away, sitting BEHIND a farther town skyline under a blue sky. CRITICAL: absolutely NO orange, NO tan, NO warm/cream glow band, NO dusk — a clean cool pale silhouette against transparency. The TOP ~72% of the image is FULLY TRANSPARENT (alpha) with nothing in it; only the low hill silhouette occupies the bottom. Designed to tile left-to-right, no ground, no street, no people, no text. Painterly 2D game background, no text, no watermark, no border.`,
    depth3:
        `A far skyline of grand CASTLE KEEPS and citadel towers with fluttering banners crowning distant hills, majestic and aspirational, in soft DAYTIME light (cool pale blue-grey atmospheric haze, NOT dusk/orange) softening them into the horizon under a blue sky. CRITICAL: absolutely NO orange, NO tan, NO warm/cream glow band, NO dusk — a clean cool pale silhouette against transparency. The TOP ~62% of the image is FULLY TRANSPARENT (alpha) with nothing in it; only the far castle silhouette occupies the lower portion. Designed to tile left-to-right, no ground, no street, no people, no text. Painterly 2D game background, no text, no watermark, no border.`,
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
    // The Auction House plaza building (the Auctioneer stands beside it). A grand trading post.
    auction: `A grand AUCTION HOUSE / trading-post building — a handsome timber-and-stone hall with a wide covered porch, a hanging sign shaped like a wooden GAVEL, banners and pennants, stacked crates and a treasure chest by the door, a small raised auction podium out front, warm and bustling. ${BUILDING_STYLE}`,
    // Trading Post project icon — a market-stall sprite (replaces the 🧳 emoji on the Town Development card).
    trading_post: `A bustling TRADING POST market stall — a wooden merchant stall with a striped canvas awning, a counter stacked with crates, barrels, rolled rugs, sacks of goods, treasure chests and hanging lanterns, a small hanging sign shaped like a coin. ${BUILDING_STYLE}`,
    // Town Development project icons (sprites replacing the emoji on each upgrade card). Each is a small isolated
    // building/emblem sprite. `vault` + `festival` double as the plaza BUILDING art once those unlocks are funded.
    prosperity: `A grand civic TOWN HALL of prosperity — a stately classical hall with tall columns, a golden domed roof, a hanging crest banner, a coin-and-laurel emblem over the doors, warm and inviting. ${BUILDING_STYLE}`,
    townscape: `A cluster of medieval fantasy TOWN BUILDINGS forming a small growing skyline — several timber-and-stone houses and one taller tower packed close together at varying heights, reading as a thriving town quarter. ${BUILDING_STYLE}`,
    garrison: `A fortified stone GARRISON gatehouse — battlemented walls with a watchtower, a crossed-swords banner, an iron portcullis, a couple of spears and a shield racked by the heavy door. ${BUILDING_STYLE}`,
    vault: `A sturdy stone treasury VAULT building — a strong bank with a heavy round iron vault door, stacks of gold coins and a small treasure chest by the entrance, a coin crest on the pediment, iron-barred windows. ${BUILDING_STYLE}`,
    festival: `A colorful FESTIVAL STAGE — a raised wooden performance stage with hanging paper lanterns and rows of triangular pennant-flag bunting in bright colors, and a plain decorative curved wooden top beam (NO sign, NO banner with writing). CRITICAL: absolutely NO letters, NO words, NO text, NO writing anywhere on it. Festive and grand. ${BUILDING_STYLE}`,
    mine: `A MINE ENTRANCE built into a rocky hillside — a timber-framed adit mouth with sturdy wooden support beams and a cross-brace, a mine-cart on rails coming out of the dark opening, a pickaxe and a lantern leaning by the entrance, a small heap of ore chunks to one side. ${BUILDING_STYLE}`,
    // The two newest doors. Without a row in mkt_town_art the client falls back to a purple card with an OS
    // emoji on it, which sits in the middle of a painted street looking exactly like the placeholder it is.
    delves: `A DUNGEON ENTRANCE at the edge of town — a heavy arched stone doorway set into a mossy rock face, an iron portcullis raised halfway, worn steps leading down into darkness, a lit torch bracketed on either side of the arch, a broken skull and a coil of rope by the threshold. ${BUILDING_STYLE}`,
    arena: `A small stone fighting ARENA — a round colosseum-style building with tiered arches, a sand-floored ring visible through the open entrance gate, two crossed swords mounted as a crest above the gate, colorful pennant flags along the top wall, a weapon rack beside the door. ${BUILDING_STYLE}`,
    // THE MARKET. Deliberately not the Auction House (a formal hall with a gavel) and not the General Store (a
    // shopfront with a coin sign): this is where members sell each other what they GREW and CAUGHT, so it is an
    // open-fronted produce market — the goods are the whole silhouette, and the goods are food.
    market: `A bustling open-air FARMERS MARKET hall — a low open-fronted timber market building with a wide striped canvas awning in green and cream stretched over the front, and beneath it long wooden counters piled high with fresh produce: baskets of orange carrots and red apples, sacks of golden grain, bunches of leafy greens, a crate of silvery FISH on crushed ice, wheels of cheese and hanging strings of onions and garlic. Wooden crates and barrels stacked at the sides, small hanging brass scales, a couple of woven baskets on the ground, warm and abundant and inviting. ${BUILDING_STYLE}`,
    // THE CASINO. It was still falling through to the purple placeholder card with an OS slot-machine
    // emoji on it -- in the middle of a painted street, which is exactly what the note on delves/arena above
    // warns about. Luke: "generate the town sprite."
    //
    // Deliberately a BUILDING and not a cabinet: the floor inside is full of cabinets, and a door that looks
    // like the thing behind it tells you nothing about where you are standing. What says casino from across a
    // street is the frontage -- lights, a canopy, a way in.
    casino: `A grand fantasy CASINO frontage -- a handsome stone-and-timber gambling hall with a wide arched
        entrance under a scalloped crimson canopy, warm golden light spilling out of the doorway, a row of
        round glowing bulbs framing the arch, a hanging sign shaped like a golden WOLF-HEAD COIN (no letters),
        two small potted bay trees flanking the steps and a red carpet runner down them, tall narrow windows
        glowing amber. Rich, inviting, a little grand. CRITICAL: absolutely NO letters, NO words, NO text
        anywhere on it. ${BUILDING_STYLE}`.replace(/s+/g, " "),
    // Tavern action icons — a frothy pint + a clinking "round" toast (replace the 🍺/🍻 emoji on the barkeep).
    tavern_pint: `A single frothy wooden TANKARD brimming with golden ale under a thick foamy head, a couple of bubbles rising, warm and inviting. Painterly fantasy game-art, clean confident outlines and cel-shaded vibrant colors, a strong readable silhouette, centered. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha) — absolutely NO table, NO surface, NO scenery, NO drop shadow, NO white sticker rim, NO halo. Nothing but the tankard. No text, no logo, no watermark, no border.`,
    tavern_round: `TWO wooden beer TANKARDS clinking together in a cheerful toast, golden ale and foam splashing between them. Painterly fantasy game-art, clean confident outlines and cel-shaded vibrant colors, a strong readable silhouette, centered. ISOLATED as a clean cutout on a FULLY TRANSPARENT background (alpha) — absolutely NO table, NO surface, NO scenery, NO drop shadow, NO white sticker rim, NO halo. Nothing but the two tankards. No text, no logo, no watermark, no border.`,
    // Farm-encounter CRITTERS — cute, FRIENDLY gift-bringing garden critters (the encounter is pure upside, so
    // they read as adorable and welcoming, NOT menacing). Small mascot sprites, transparent, no white rim.
    enc_rat: `A single adorable friendly cartoon FIELD MOUSE mascot, sitting up on its hind legs holding a tiny golden seed in its little paws with a cheerful smile, big sparkly eyes, round and cute. ${CRITTER_STYLE}`,
    enc_crow: `A single plump friendly cartoon CROW mascot (glossy blue-black feathers), standing cheerfully with a small green sprout held in its beak, big friendly eyes, round and cute (NOT scary). ${CRITTER_STYLE}`,
    enc_raccoon: `A single adorable friendly cartoon RACCOON mascot with its classic mask and ringed tail, sitting up holding a little treasure chest or shiny coin with a mischievous happy grin, big sparkly eyes, round and cute. ${CRITTER_STYLE}`,
    enc_boar: `A single jolly friendly cartoon little TRUFFLE PIGLET / baby boar mascot, chubby and pink-brown with tiny tusks, holding a leafy truffle with a happy grin, big cute eyes, round and adorable (NOT menacing). ${CRITTER_STYLE}`,
    enc_scarecrow: `A single cheerful friendly cartoon SCARECROW mascot — a smiling straw scarecrow in a patched hat and shirt, arms open in a welcoming wave, hugging a small orange pumpkin, warm and jolly (NOT creepy). ${CRITTER_STYLE}`,
    // Rarer critters — escalating majesty/magic (still cute + friendly, gift-bringers).
    enc_fox: `A single adorable friendly cartoon FOX mascot with a big fluffy tail and a sly happy grin, sitting up holding a little velvet coin pouch spilling a gold coin, warm orange fur, big sparkly eyes. ${CRITTER_STYLE}`,
    enc_owl: `A single adorable friendly cartoon OWL mascot, plump and round with huge wise eyes and tiny round spectacles, holding a small glowing gemstone in its wing, soft brown-and-cream feathers. ${CRITTER_STYLE}`,
    enc_stag: `A single majestic yet cute cartoon young STAG / fawn mascot with softly GLOWING GOLDEN ANTLERS, a gentle smile, holding up a shimmering golden leaf, warm tan fur with a faint golden aura. ${CRITTER_STYLE}`,
    enc_dragon: `A single adorable friendly baby GARDEN DRAGONLING mascot — a chubby little emerald-green dragon with tiny wings and big cute eyes, cradling a glittering treasure GEM, playful and warm (NOT scary). ${CRITTER_STYLE}`,
    enc_unicorn: `A single magical adorable UNICORN FOAL mascot with a flowing pastel-rainbow mane and tail and a softly GLOWING spiral horn, holding up a sparkling golden STAR, radiant and enchanting. ${CRITTER_STYLE}`,
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
    auctioneer: `A single 2D video-game CHARACTER sprite of a lively AUCTIONEER: a dapper HUMAN MAN in a fine vest and cravat, one hand raised holding up a wooden GAVEL mid-swing, the other gesturing to his wares, a coin pouch at his belt, an enthusiastic salesman's grin, full body head-to-boots, three-quarter view facing forward. This is a PERSON / character — NOT a building, NOT a podium. Painterly fantasy action-RPG style with clean confident outlines and cel-shaded vibrant colors, strong readable silhouette. Isolated as a clean cutout on a FULLY TRANSPARENT background (alpha channel) — absolutely NO background, NO scenery, NO ground, NO sky, NO glow. Nothing but the character. No text, no logo, no watermark, no border.`,
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

// ── ALL HALLOWS' IN THE PLAZA ────────────────────────────────────────────────────────────────────────────────
// A seasonal dressing for the town, drawn through housePrompt() from art-style.js rather than the town's older
// BUILDING_STYLE prose — these are die-cut objects composited into a scene, which is exactly what DIE_CUT is
// for, and art-style.js is the one place the house look is supposed to come from.
//
// Two families, and they want opposite things:
//   FAR   the moon, the witches, the bats, the dead tree. Read at 20-90px against a night sky and get tinted
//         near-black in CSS, so all that survives is the SILHOUETTE. Asked for as bold, simple shapes.
//   NEAR  pumpkins, lanterns, candles, the ghost. Sit among the buildings at 40-120px with their own light, so
//         they carry warm interior glow that has to hold up close.
//
// ⚠️ THE WITCHES ARE DRAWN FACING LEFT, ON PURPOSE. They fly right-to-left across the sky, and a sprite drawn
// facing the other way has to be flipped in CSS — which is fine until somebody adds a second animation and
// flips it back. Drawn in the direction they travel, there is nothing to remember.
const HW_FAR_EXTRA =
    "Viewed SMALL against a night sky and read mostly as a SILHOUETTE: one bold simple unmistakable shape, " +
    "strong clean outer contour, minimal interior detail, no fine filigree that would turn to mush. " +
    "Cool moonlit palette — deep indigo, violet-black, with a thin cold rim light along the upper edge.";
const HW_NEAR_EXTRA =
    "It is a LIGHT SOURCE in a dark street: a warm amber-orange glow burns from inside it and spills onto its " +
    "own nearest surfaces, with deep cool violet-blue shadow everywhere the glow does not reach. Strong warm/cool " +
    "contrast. The glow lives INSIDE the object — no halo, aura or light bloom drawn outside its silhouette.";

Object.assign(ART_PROMPTS, {
    hw_moon: housePrompt(
        "A huge FULL MOON, perfectly round, a pale bone-white disc with soft grey maria and shallow craters " +
        "across its face and a faint cold blue-white edge",
        { extra: "Just the round disc of the moon and nothing else — no clouds, no sky, no stars, no face, no " +
            "rays or beams, no ring or halo around it. Flat-on, filling the frame as a clean circle." }
    ),
    hw_witch_a: housePrompt(
        "A WITCH flying on a BROOMSTICK, seen from the side and travelling to the LEFT — a lean figure in a " +
        "tattered pointed hat and a long ragged cloak streaming out behind her, hunched forward over the broom",
        { extra: HW_FAR_EXTRA }
    ),
    hw_witch_b: housePrompt(
        "A WITCH flying on a BROOMSTICK, seen from the side and travelling to the LEFT — sitting upright and " +
        "side-saddle with one arm raised high, a wide floppy pointed hat and a billowing cloak, a small cat " +
        "riding on the tail of the broom behind her",
        { extra: HW_FAR_EXTRA }
    ),
    hw_bats: housePrompt(
        "A small FLOCK OF FIVE BATS in flight, wings spread at different angles, loosely scattered as a group " +
        "and all travelling the same way to the LEFT",
        { extra: HW_FAR_EXTRA }
    ),
    hw_tree: housePrompt(
        "A BARE DEAD TREE — a gnarled leafless trunk with crooked clawing branches twisting upward and outward, " +
        "no leaves at all, roots gripping a small mound of earth",
        { extra: HW_FAR_EXTRA }
    ),
    hw_pumpkin: housePrompt(
        "A carved JACK-O'-LANTERN pumpkin sitting on the ground — a fat ribbed orange pumpkin with a crooked " +
        "curled stem, a jagged triangular-eyed grinning face cut into the front, lit from within by a candle",
        { extra: HW_NEAR_EXTRA }
    ),
    hw_lantern: housePrompt(
        "An old wrought-IRON HANGING LANTERN with a domed cap and a ring at the top to hang it by, four panes " +
        "of warped amber glass, a fat lit candle burning inside it",
        { extra: HW_NEAR_EXTRA + " Drawn hanging, with the ring at the very top of the shape." }
    ),
    // ⚠️ A LANTERN NEEDS SOMETHING TO HANG FROM. hw_lantern is drawn hanging, by its ring, and the street had
    // nothing to hang it on -- so every one of them sat on bare cobbles like a lamp somebody put down and
    // walked away from. Luke, looking at the plaza: "lanterns should be in places that nake sense. Add lamp
    // posts." This is the fixture: tall enough to read from across the street, and the only thing in the
    // dressing that is deliberately EVENLY spaced, because that is what street lighting is.
    hw_lamppost: housePrompt(
        "A tall ORNATE CAST-IRON STREET LAMP POST standing upright on a stepped square base, a slender fluted " +
        "column rising to a short scrolled bracket, and hanging from it a four-sided glass lantern head with a " +
        "peaked cap and a finial, the warm amber flame inside clearly lit and glowing through the glass. " +
        "Black weathered iron with a few autumn leaves caught at the foot of the base",
        { extra: HW_NEAR_EXTRA + " Drawn standing upright and STRICTLY VERTICAL, the full post from the base " +
            "on the ground to the finial at the very top, the base flat at the bottom edge of the shape. " +
            "TALL AND NARROW: the post is roughly four times taller than it is wide. ⚠️ THE WHOLE POST FITS " +
            "INSIDE THE FRAME WITH CLEAR EMPTY MARGIN BELOW THE BASE — the first draw had the base cut off " +
            "by the bottom edge. Leave room under it; nothing touches any edge of the image." }
    ),
    hw_candles: housePrompt(
        "A CLUSTER OF FIVE MELTED CANDLES of different heights standing together on a small stone slab, thick " +
        "wax drips running down their sides and pooling at the base, every wick lit",
        { extra: HW_NEAR_EXTRA }
    ),
    hw_ghost: housePrompt(
        "A small friendly cartoon GHOST — a rounded translucent pale spirit with a wispy trailing tail instead " +
        "of legs, two simple dark eyes and a little open mouth, arms drifting out to the sides",
        { extra: "Pale luminous blue-white and slightly translucent, glowing softly from within. Simple, " +
            "rounded and charming rather than scary. No halo or light bloom drawn outside its silhouette." }
    ),
});

// ── MORE THINGS TO GROUP ─────────────────────────────────────────────────────────────────────────────────────
// Luke: "there should be a lot more Halloween decorations. And they should be kind of like grouped naturally
// and not look like a pattern."
//
// A cluster only reads as a cluster if the things in it are DIFFERENT. Four pumpkins in a row is a pattern no
// matter how the spacing is jittered; a scarecrow with a hay bale and three pumpkins at its feet is a scene.
// These are the pieces the groups are built out of — big anchors that start a cluster, small fillers that
// gather around one.
Object.assign(ART_PROMPTS, {
    hw_scarecrow: housePrompt(
        "A ragged SCARECROW on a wooden cross-post — a stuffed burlap-sack head with stitched eyes and a " +
        "crooked grin, a battered wide-brimmed hat, a patched checked shirt stuffed with straw, straw poking " +
        "from the cuffs",
        { extra: HW_NEAR_EXTRA }
    ),
    hw_haybale: housePrompt(
        "A round bale of STRAW with two dry cornstalk bundles leaning against it and a small orange gourd " +
        "resting on top",
        { extra: HW_NEAR_EXTRA }
    ),
    hw_cauldron: housePrompt(
        "A fat black iron CAULDRON on three legs over a low fire, filled with a bubbling luminous green brew " +
        "that glows and casts light up the inside of the pot, a wooden stirring paddle leaning in it",
        { extra: "It is a LIGHT SOURCE in a dark street: a sickly green glow burns out of the pot and up onto " +
            "its own rim, with deep cool shadow everywhere else, and a warm orange fire glow underneath. The " +
            "glow lives INSIDE the pot — no halo or bloom drawn outside its silhouette." }
    ),
    hw_gravestone: housePrompt(
        "A weathered stone GRAVESTONE leaning crookedly out of a small mound of earth, a rounded top, cracked " +
        "and mossy, a few dry weeds at its base. The stone is BLANK — no carving, no inscription, no marks",
        { extra: HW_NEAR_EXTRA }
    ),
    hw_skeleton: housePrompt(
        "A cartoon SKELETON sitting slumped on the ground with its legs stretched out and its back against " +
        "nothing, arms loose at its sides, skull tipped to one side as if dozing",
        { extra: HW_NEAR_EXTRA + " Friendly and comic rather than gruesome — clean rounded bones." }
    ),
    hw_pumpkin_stack: housePrompt(
        "THREE carved pumpkins STACKED one on top of another into a little tower, largest at the bottom and " +
        "smallest on top, each with a different cut face, all lit from within",
        { extra: HW_NEAR_EXTRA }
    ),
    hw_crow: housePrompt(
        "A single black CROW perched and facing to the LEFT, wings folded, head slightly hunched into its " +
        "shoulders, one eye catching a spark of light",
        { extra: HW_NEAR_EXTRA }
    ),
});

// ── THE STREET ITSELF, IN AUTUMN ─────────────────────────────────────────────────────────────────────────────
// A fall floor to lay under the whole town, and one big decorated tree standing in it.
//
// ⚠️ THE FLOOR IS PAINTED AT DUSK, NOT AT NIGHT, AND THAT IS DELIBERATE. Every other ground band — the mid
// rooftops, the foreground wall — is lit for dusk in the artwork and taken down to night by the filters in
// TownClient. Painting this one dark would put it out of step with its own neighbours and it would then get
// darkened AGAIN on top, which is the mistake the dressed buildings taught. It matches its siblings and lets
// the same filter do the same job to it.
Object.assign(ART_PROMPTS, {
    // ⚠️ A TILING TEXTURE MUST HAVE NO FOCAL POINT AND NO BIG SHAPES. The first floor buried the cobbles under
    // a solid carpet of leaves — dense enough that the repeat, and the mirror the street tiles it with, both
    // read immediately as a pattern. Leaves are the ACCENT here; the stone is the floor. Sparse, small, and
    // evenly spread is what disappears when it repeats.
    // ⚠️ TWO SWINGS BEFORE THIS ONE, AND BOTH WERE THE SAME MISTAKE AT OPPOSITE ENDS. First a solid carpet of
    // leaves: the cobbles vanished and the mirror-repeat was obvious. Then a sparse dusting on pale sandy
    // stone: it read as a bare grey road with no autumn in it, LIGHTER than the undergrowth above it, which a
    // night street must never be. What a tiling floor wants is medium coverage of SMALL pieces on DARK stone —
    // enough leaf to say autumn, no shape big enough to become a landmark when it repeats.
    // ⚠️ AND A FOURTH SWING, BECAUSE IT CAME BACK AS BRICKWORK. Luke: "floor looks bad." The last one drew
    // flat rectangular blocks in one uniform red-brown, which is a brick wall lying down, not a street: no
    // stone-to-stone colour change, no rounded edges, no sense that anything is lit. The fix is not more
    // leaves -- it is making the STONES read. Rounded and irregular, each one a slightly different tone, and
    // a damp sheen so the lamplight has something to catch, which is what makes a night street look wet and
    // alive rather than like a sheet of cardboard.
    hw_cobble:
        `A seamless COBBLESTONE STREET ground texture seen at a slight downward angle. ROUNDED, IRREGULAR, ` +
        `MANY-SIDED cobbles of clearly VARYING SIZE, each stone a slightly different tone — some cooler grey, ` +
        `some warmer brown, a few nearly black — set in dark recessed mortar so every stone reads separately. ` +
        `NOT rectangular bricks, NOT a regular grid, NOT one flat colour. The stones are faintly DAMP, with a ` +
        `soft sheen along their top edges as if catching lamplight, and worn smooth in the middle of the road. ` +
        `Overall DEEP WARM GREY-BROWN — rich and shadowed, NOT pale, NOT sandy, NOT bleached. ` +
        `Fallen autumn leaves in russet, burnt orange and brown lie loose across it, covering roughly a QUARTER ` +
        `of the surface — enough to read as autumn, with the STONEWORK still the thing you see first. ` +
        `Individual small leaves and loose pairs only — NO drifts, NO piles, NO clump larger than three leaves. ` +
        `⚠️ ABSOLUTELY UNIFORM ACROSS THE WHOLE IMAGE: no focal point, no dense patch, no bare patch, no large ` +
        `shape — the density and the colour must be the SAME at the left edge, the middle and the right edge, ` +
        `because this tiles and mirrors and any distinctive feature becomes a visible repeat. ` +
        `The whole thing sits in DEEP EVENING SHADOW — a dark ground, not a lit one. ` +
        `NO objects, NO people, NO buildings, NO sky, NO horizon, NO trees, NO branches. ` +
        `Designed to tile left-to-right. ${STREET_STYLE}`,
    hw_tree_fall: housePrompt(
        "A large AUTUMN TREE in full fall colour — a thick gnarled trunk and spreading branches carrying a " +
        "dense canopy of orange, russet, amber and deep red leaves, DECORATED FOR HALLOWEEN: several small lit " +
        "lanterns hanging from the lower branches on short cords, a string of little black and orange " +
        "triangular flags draped between two branches, a couple of carved glowing jack-o'-lanterns sitting " +
        "among the roots, and a scatter of fallen leaves around its base",
        { extra: "The WHOLE tree including the top of the canopy and the base of the trunk must be inside the " +
            "frame. It is evening: the hanging lanterns and the carved pumpkins glow warm amber from within " +
            "and light the leaves nearest them, while the rest of the canopy sits in cooler shadow. The glow " +
            "lives inside the lanterns — no halo or light bloom drawn outside the tree's silhouette." }
    ),
});

// ── THE WOODS BEHIND THE TOWN ────────────────────────────────────────────────────────────────────────────────
// Luke: "the color is seems right for all the buildings and for the background with the stars but those are
// like darkish blue and then this the other colors like don't don't really line up with the lighting... maybe
// what we go for is like more of a woods feel... more of like a dark creepy forest kind of vibe instead of the
// the town kind of vibe."
//
// Two problems in one. The town's parallax bands are painted for DAYTIME and taken to night by a filter, and a
// filter can darken a picture but it cannot relight one — so the rooftops and the stone wall came out as blue
// versions of a sunny afternoon while the moon, the sky and the dressed buildings were lit from the start. The
// answer is the same as it was for the buildings: paint these FOR night and leave the filter off them.
//
// And the subject changes with it. Rooftops and a cobbled retaining wall say "market square"; what the moon,
// the witches and the bone-dry trees have been asking for all along is woods.
//
// ⚠️ EVERY ONE OF THESE IS A TRANSPARENT-TOPPED TILING BAND, exactly like the layer it replaces. Get that
// wrong and it stops being a parallax band and becomes a picture with a hard edge scrolling across the sky.
// ⚠️ TWO THINGS HERE ARE PAID FOR IN REROLLS, AND BOTH READ AS HARMLESS.
//
// "Under a full moon" made every one of these DRAW a moon. They are parallax bands that tile across the whole
// street, so that moon then repeated every few hundred pixels as a row of pale discs marching across the sky
// behind the real one. Describe the LIGHT, never the light source — the moon is a separate sprite and there
// is exactly one of it.
//
// And saying "the top two-thirds is fully transparent" without also demanding full WIDTH got a small vignette
// of trees in the middle of an otherwise empty frame: the model honoured the transparency and left the ends
// empty too. A band has to be told it runs edge to edge, or it is not a band.
const FOREST_NIGHT =
    "Lit only by cold blue-white moonlight coming from OFF-FRAME: it rims the upper edges and everything else " +
    "falls into deep blue-violet shadow, with NO warm daylight anywhere. " +
    "⚠️ DO NOT DRAW THE MOON, a sun, stars, sky, clouds or any light source — this layer is composited over a " +
    "sky that already has them, and anything drawn here is repeated across the whole width. " +
    "⚠️ THE BAND RUNS UNBROKEN FROM THE EXTREME LEFT EDGE TO THE EXTREME RIGHT EDGE, filling the FULL WIDTH of " +
    "the frame evenly with no gap, no empty ends, no vignette and no single focal subject — it is a continuous " +
    "strip, not a picture of one thing. " +
    "Painterly 2D side-scrolling video-game art, cel-shaded with clean confident edges, atmospheric and a " +
    "little eerie but not gory. Designed to TILE LEFT-TO-RIGHT with no hard seam at either edge. " +
    "No ground plane, no path, no people, no buildings, no text, no watermark, no border.";

Object.assign(ART_PROMPTS, {
    hw_depth1: `A FAR, LOW, SMALL silhouette of a distant forest ridge strung along the horizon — the tops of ` +
        `countless pine and bare deciduous trees, tiny and hazy, reading as woods miles away. Kept LOW and modest ` +
        `so it sits behind everything nearer. The TOP ~74% of the image is FULLY TRANSPARENT (alpha) with ` +
        `nothing in it; only the low distant treeline occupies the bottom. ${FOREST_NIGHT}`,
    hw_depth3: `A far ridge of tall dark PINE and bare CROOKED trees crowning distant hills, their spires and ` +
        `claw-like branches breaking the skyline, softened by cold night haze into a deep blue-violet ` +
        `silhouette. The TOP ~62% of the image is FULLY TRANSPARENT (alpha) with nothing in it; only the far ` +
        `treeline occupies the lower portion. ${FOREST_NIGHT}`,
    // ⚠️ NO HERO TREE. The first pass grew one big reddish canopy in the middle of the band, and a band tiles
    // AND mirrors — so that one tree marched across the whole street back-to-back with its own reflection,
    // which is the most obvious repeat in the scene. A treeline reads as a treeline when no single trunk is
    // the subject; it is a WALL of forest, not a portrait of a tree.
    hw_mid: `A MIDGROUND WALL OF DENSE AUTUMN FOREST filling the BOTTOM of the frame — MANY crowded trunks of ` +
        `SIMILAR size and height standing shoulder to shoulder, their canopies overlapping into one continuous ` +
        `ragged treeline, some still carrying muted russet and brown leaves, many bare and crooked, with ` +
        `impenetrable blackness between the trunks. ` +
        `⚠️ NO SINGLE DOMINANT TREE, no hero tree, no one canopy larger or brighter than its neighbours, no ` +
        `centred subject, no gap and no clearing — the density, height and colour must be EVEN from the left ` +
        `edge to the right edge, because this tiles and mirrors and any standout shape becomes a visible ` +
        `repeat. Think of an unbroken hedge of woodland seen from outside it. ` +
        `The TOP two-thirds of the image is FULLY TRANSPARENT (alpha) with NOTHING in it — no baked sky, no ` +
        `haze — just the treeline cut against transparency along the bottom. ${FOREST_NIGHT}`,
    // ⚠️ THIS EXISTS TO DESTROY A STRAIGHT LINE. .tw-cobble is a band, so the street starts on a ruled
    // horizontal edge — cold blue undergrowth above it, warm brown road below, and a gradient across the seam
    // only softens the contrast; the EDGE is still there because an edge is a shape, not a tone. Luke, twice:
    // "We need a layer to abstract the sharp line of thr walking path" / "a layer to help hidd rhe shear line
    // of the floor." What hides a line is an irregular silhouette standing on it, so this is a strip of verge
    // whose whole job is a ragged top: weeds, dead grass, leaf drift, the stuff that always grows exactly
    // where a path stops being a path.
    hw_verge: `A narrow horizontal strip of AUTUMN VERGE — the scrubby edge where a stone road meets woodland. ` +
        `Tufts of dry tan grass of UNEVEN heights, low brambles, a few dead ferns and thistles, and drifts of ` +
        `curled russet and brown fallen leaves banked up among them. ` +
        `⚠️ THE TOP EDGE MUST BE RAGGED AND IRREGULAR — grass blades and stems of clearly DIFFERENT heights ` +
        `breaking upward at different points, never a level hedge-line and never a straight top. ` +
        `The BOTTOM edge is where it meets the road: dense leaf litter, flat and solid, running the full width. ` +
        `The TOP ~55% of the image is FULLY TRANSPARENT (alpha) with nothing in it at all. ` +
        `Seamless left-to-right: it tiles, so the left and right edges must continue into each other and there ` +
        `must be NO landmark, no single tall plant, nothing distinctive enough to be spotted repeating. ` +
        `NO fence, NO posts, NO logs, NO mushrooms, NO animals, NO sky, NO ground beyond the strip. ${FOREST_NIGHT}`,
    hw_fg: `A LOW foreground band of FOREST UNDERGROWTH running straight across the BOTTOM of the frame — a ` +
        `fallen mossy log, tangled brambles and dead ferns, drifts of dry curled leaves, a few pale toadstools, ` +
        `clumps of long dead grass, and a broken crooked wooden fence rail half-swallowed by it all. Nearer and ` +
        `larger-detailed than everything behind it. The TOP ~65% of the image is FULLY TRANSPARENT (alpha) with ` +
        `nothing in it — ONLY the undergrowth occupies the bottom. ${FOREST_NIGHT}`,
});

// ── AND THE BUILDINGS, DRESSED ───────────────────────────────────────────────────────────────────────────────
// Luke: "Let's make a Halloween version of each of the buildings."
//
// ⚠️ DERIVED FROM THE EXISTING PROMPT, NOT REWRITTEN. Each dressed twin is the building's OWN description with
// a decorating clause spliced in ahead of the shared style block — so the Forge is unmistakably still the
// Forge, same shape, same materials, same silhouette on the street, wearing pumpkins. Re-describing thirteen
// buildings by hand would have produced thirteen subtly different buildings, and the swap would read as the
// town being replaced rather than decorated.
//
// The accent rotates so they do not all get the identical treatment, which is the same "it looks like a
// pattern" failure the decorations themselves had.
const HW_ACCENTS = [
    "carved glowing jack-o'-lanterns clustered on the step and a thick cobweb strung across one upper corner",
    "a row of small orange paper lanterns strung along the eaves and two pumpkins flanking the door",
    "dense grey cobwebs in the eaves and window corners, with a fat spider, and a pumpkin on the sill",
    "black and orange triangular bunting strung across the front and a wreath of dry twigs on the door",
    "a scattering of dry orange and brown leaves banked against its base, bare twisted branches leaning by the " +
        "door, and a single candle burning in an upper window",
    "cobwebs across the sign, a crow perched on the roof ridge, and stacked pumpkins beside the entrance",
];
const HW_BUILDING_IDS = ["tavern", "boss", "forge", "auction", "shop", "docks", "farm", "vault", "festival", "mine", "delves", "arena", "market"];
const _hwBuildings = {};
HW_BUILDING_IDS.forEach((id, i) => {
    const base = ART_PROMPTS[id];
    // A building whose prompt stopped using the shared style block would silently produce an UNDRESSED twin
    // that looks identical to the plain one — worth skipping loudly-ish rather than shipping a no-op asset.
    if (!base || !base.includes(BUILDING_STYLE)) return;
    const dress =
        `⚠️ THE BUILDING IS DECORATED FOR HALLOWEEN, and it is the same building: do not change its shape, ` +
        `size, materials or purpose, only what has been hung on it. Specifically, it has ${HW_ACCENTS[i % HW_ACCENTS.length]}. ` +
        `It is NIGHT, so any window that is lit glows warm amber against cool blue-violet shadow. ` +
        `Festive and inviting rather than derelict or frightening — this is a town that decorated, not a ruin. ` +
        `⚠️ ANY DOORWAY, ARCHWAY, TUNNEL MOUTH OR OPEN ENTRANCE IS FILLED WITH SOLID BLACK DARKNESS. The only ` +
        `transparent part of this image is the area OUTSIDE the building's silhouette — you must not be able ` +
        `to see through the door. An archway left empty comes back as a white hole with the sky behind it.`;
    _hwBuildings[`hw_bld_${id}`] = base.replace(BUILDING_STYLE, `${dress} ${BUILDING_STYLE}`);
});
Object.assign(ART_PROMPTS, _hwBuildings);

export const TOWN_ART_KEYS = Object.keys(ART_PROMPTS);

// A door is an opening; a gap in a bramble is not. See the note at the generateImage call below.
const isBuildingKey = (key) => HW_BUILDING_IDS.includes(key) || key.startsWith("hw_bld_");

// The seasonal set, named once so the generator script and the Town both mean the same things.
export const HALLOWEEN_PROP_KEYS = [
    "hw_moon", "hw_witch_a", "hw_witch_b", "hw_bats", "hw_tree",
    "hw_pumpkin", "hw_lantern", "hw_candles", "hw_ghost",
    "hw_scarecrow", "hw_haybale", "hw_cauldron", "hw_gravestone", "hw_skeleton", "hw_pumpkin_stack", "hw_crow",
    "hw_cobble", "hw_tree_fall", "hw_lamppost", "hw_verge",
    "hw_depth1", "hw_depth3", "hw_mid", "hw_fg",
];
export const HALLOWEEN_BUILDING_KEYS = Object.keys(_hwBuildings);
export const HALLOWEEN_ART_KEYS = [...HALLOWEEN_PROP_KEYS, ...HALLOWEEN_BUILDING_KEYS];

// Generate (or regenerate) one town art asset and store its URL.
export async function generateTownArt(key) {
    const prompt = ART_PROMPTS[key];
    if (!prompt) throw new Error("Unknown town art key");
    let url;
    if (key === "background") url = await generateWideSceneImage(prompt, { pathPrefix: "marketplace/town", panels: 3 });
    else if (key === "tavern_interior") url = await generateWideSceneImage(prompt, { pathPrefix: "marketplace/town", panels: 2 }); // WIDE scrollable tavern room
    // ⚠️ THE FALL FLOOR IS A SCENE, NOT A SPRITE. Sent down the sprite path it would come back with a
    // transparent background and tile as a row of floating leaves over the void — the ground bands are opaque
    // full-bleed textures and hw_cobble is one of them.
    else if (key === "sky" || key === "cobble" || key === "hw_cobble") url = await generateSceneImage(prompt, { pathPrefix: "marketplace/town", meta: { origin: "admin", subject: key, label: `Town scene — ${key}` } }); // opaque scene layers
    // fillHoles: a building's doorway is not background. Left open, the sprite has a hole in it and the street
    // behind shows through the door -- see fill-holes.js. Deep blue-black, because every opening in this town
    // is either unlit or lit from far inside, and both read darker than the wall around them.
    //
    // ⚠️ BUILDINGS ONLY, AND THAT MATTERS. A sealed transparent region in a BUILDING is always an opening and
    // always wrong. In a thicket it is a GAP -- the space between two brambles that you are supposed to see
    // the night through -- and filling those would stud every undergrowth band with dark blobs. Applied to
    // everything, this would have quietly ruined hw_fg and hw_verge the next time either was drawn.
    else url = await generateImage(prompt, { size: "1024x1024", pathPrefix: "marketplace/town", deHalo: true, fillHoles: isBuildingKey(key) ? "#0d1020" : null, meta: { origin: "admin", subject: key, label: `Town art — ${key}` } }); // transparent building sprite
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
