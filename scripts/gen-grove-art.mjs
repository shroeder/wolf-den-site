// ── THE GROVE'S ART ──────────────────────────────────────────────────────────────────────────────────────────
// Map one of the node map: twelve zone backdrops, the four creatures the catalogue could not reuse, and the
// crystal rare spawn.
//
// ⚠️ NINE OF THE TWELVE ENEMIES ARE NOT HERE, ON PURPOSE. rootrat, grub, thornling, badger, gourdling,
// barrowhound, warren-mother, voidmoth and ashwraith already exist in public/images/delves and fit a forest
// exactly. Luke: "use whatever sprites we can to fit the theme. But generate new ones where we need to." Art
// already paid for is art already paid for — see check-existing-sprites-first.
//
// ⚠️ THE BACKDROPS ARE SIDE-ON, NOT RECEDING. Every other backdrop generator in this repo asks for "deep
// perspective receding into darkness", which is right for a room you stand in and wrong for a PLATFORMER. A
// vanishing point is only correct from one camera position, and this camera trolleys left and right across a
// zone that is also vertical. A flat, layered, side-scrolling plate is the only thing that holds up while the
// view moves. See scrolling-room-needs-flat-backdrop.
//
//   node scripts/gen-grove-art.mjs            # price it and stop
//   node scripts/gen-grove-art.mjs --apply    # draw it
//   node scripts/gen-grove-art.mjs --apply --only bg-thicket,crystal_stag
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { quality, priceRun } from "./lib/gen-guard.mjs";
// Pure data, no @ alias and no imports of its own, so plain node can read it.
import { GROVE_MAPS, TOOL_ROLES } from "../src/lib/marketplace/grove-maps.js";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const Q = quality();
// ── ⚠️ gpt-image-1 DRAWS, 2.5 REPAIRS. DO NOT SWAP THE DRAWING MODEL. ───────────────────────────────────────
// A long session on 2026-10-21 tested 1.5, 2 and both 2.5 variants against the live art, eleven generations
// deep, and the conclusion is narrow and firm: the newer models draw at a much higher detail density —
// hundreds of individually outlined marks where gpt-image-1 lays down large smooth grouped forms. Luke, on
// the first one: "it's all high detail and noisy, its not the right style."
//
// That density is STRUCTURAL and nothing reaches it:
//   · ten prompt iterations ("a few large shapes", "never individual strands", "broad flat sheaves",
//     "around fifty large straw shapes") were ignored every single time
//   · a median filter at r=2/3/5 moves the edge metric and not the appearance
//   · colour quantisation down to THIRTEEN colours changes nothing, because every mark carries its own
//     dark outline and outlines survive quantisation
//
// So the house style IS gpt-image-1. It costs more (4.2c against 1.3c) and it ignores the frame
// instruction about a quarter of the time, and both of those are worth paying. The clipping is handled
// below instead of by changing the model.
// ⚠️ 2026-10-23: gpt-image-1 IS GONE FROM THE GENERATIONS ENDPOINT. /v1/models still lists it, and
// /v1/images/generations answers 400 "The model 'gpt-image-1' does not exist." Verified directly, three
// times, with a one-cent grey-dot probe. The house style's model has been retired under us.
//
// The default stays gpt-image-1 ON PURPOSE even though it now fails: this constant is where the rule
// lives, and silently repointing it at whichever model happens to work is precisely the swap the note
// below forbids. A run that needs a different model must say so out loud with --model, so the choice
// appears in the shell history of whoever made it.
const MODEL = (() => {
    const i = process.argv.indexOf("--model");
    return i > 0 ? process.argv[i + 1] : "gpt-image-1";
})();

// ⚠️ THE REPAIR MODEL IS A DIFFERENT QUESTION. 2.5's headline feature is "precise editing and subject
// preservation", and it is genuinely good at it: handed a finished sprite and asked to change one thing, it
// returns the same drawing with the crown restored. That is the one job it does better than gpt-image-1,
// which given the same task produced a flaming pumpkin head.
const REPAIR_MODEL = "gpt-image-2.5-sunburst";

const STYLE = "Painterly cel-shaded 2D video-game art, bold clean dark outlines, chunky readable silhouette, high contrast, vibrant colors, soft inner shading, fantasy action-RPG style.";
const CUTOUT = "ISOLATED as a clean die-cut sprite on a FULLY TRANSPARENT background (alpha channel) — absolutely NO backdrop, NO scenery, NO ground, NO cast shadow, NO glow halo, NO white sticker rim. Nothing but the subject. No text, no words, no letters, no logo, no watermark, no border.";

const FOE = `A single fantasy forest CREATURE, full body, three-quarter view facing the viewer, menacing but readable at small size. ${STYLE} ${CUTOUT}`;

// The BOSS brief. Deliberately a different prompt from FOE rather than "a big <creature>": asking for a
// bigger rootrat returns a rootrat. Each of these is kin to what wanders its zone and is its own animal.
// ⚠️ "FILLING THE FRAME" COST FIVE OF THESE THEIR EXTREMITIES. The first run asked for imposing and got
// it, and the contact sheet showed the Lanternwing with both wingtips sliced off at the edges, the Barrow
// Warden with its grave-chain cut, and the Stakelord with the top of his log and banner gone. A sprite is
// die-cut onto a plate, so an edge-touching draw is an amputated creature with nothing to blame it on. Say
// LARGE WITHIN THE FRAME and demand the margin explicitly, the same way the decoration prompt already does.
const BOSS = `A single colossal fantasy forest BOSS CREATURE, full body, three-quarter view facing the viewer, imposing and detailed, clearly far larger and grander than an ordinary monster. Drawn LARGE but ENTIRELY INSIDE the frame with roughly 8% empty space on all four sides: NO part of the subject may touch or run off any edge - not antlers, horns, wings, tails, chains, banners, weapons or outstretched limbs. Fit the WHOLE creature in view, smaller rather than cropped. ${STYLE} ${CUTOUT}`;

// The platformer plate. Flat and layered rather than perspectival, and deliberately empty — the hero, the pet
// and fifteen to thirty enemies are drawn on top of this, so anything living in the plate would read as a
// creature you cannot hit.
const PLATE = `A wide SIDE-ON 2D platformer background plate for a forest game level. FLAT LAYERED composition with distinct foreground, midground and far background bands — NO vanishing point, NO deep perspective, NO receding corridor, as the camera scrolls sideways across it. Completely EMPTY of characters and creatures. Clear horizontal ground line along the bottom with room to walk. ${STYLE} No characters, no creatures, no people, no text, no words, no logo, no watermark, no UI, no border.`;

// The BOSS CHEST brief. Four of them, one per depth band, and they must read as the SAME object getting
// grander rather than as four unrelated containers -- the player is meant to see a Reliquary and know
// instantly it outranks the Cache they have three of. So: one silhouette, escalating materials, each one
// built out of the band it drops in. Closed, because the open one is the moment and the shelf shows the
// one you have not had yet.
//
// ⚠️ SAME MARGIN CLAUSE AS THE BOSSES. A chest is a wide object with a lid, and an edge-touching draw
// loses the lid -- which is the half that says "chest". See sprite-amputation-vs-clipping.
const CHEST = `A single closed fantasy TREASURE CHEST, three-quarter view, sturdy and ornate, clearly a container of valuable things. Drawn LARGE but ENTIRELY INSIDE the frame with roughly 10% empty space on all four sides: no part of the lid, lock, hinges, straps or decoration may touch or run off any edge. ${STYLE} ${CUTOUT}`;

// key → [prompt, kind]
const ART = {
    // ── THE PANEL CHROME ────────────────────────────────────────────────────────────────────────────
    // Luke: "hate the lack of color and lack of sprite paneling and trim ... Sprites in title etc are
    // needed for each respective area."
    //
    // ⚠️ THE HEADER PLATE IS NOT HERE BECAUSE IT ALREADY EXISTS. slab-plank is a lashed plank board with
    // painted rope end-caps, already pinned to 1024x320 and already sliced by the stylesheet -- it is
    // exactly a name-board and it is drawn in the same hand as everything else. Art already paid for is
    // art already paid for. See check-existing-sprites-first.
    //
    // ⚠️ AND THE BOARD IS DELIBERATELY QUIET. A panel backing sits under five hundred words of counts and
    // part names on a phone; a vigorous wood grain behind that is a legibility bug wearing a costume. It
    // is asked for flat, worn and low-contrast on purpose, and the stylesheet darkens it further.
    "ui-board": [`A seamless dark worn WOODEN BOARD surface for a game menu panel, viewed flat face-on. Aged planks fitted edge to edge, muted desaturated brown-grey, soft even lighting, very LOW CONTRAST and visually quiet with no strong highlights. Completely EMPTY: no objects, no props, no creatures, no nails, no carving, no text. A plain background material. ${STYLE} No text, no words, no logo, no watermark, no border, no frame.`, "plate"],
    "ui-corner": [`A single ornate dark IRON CORNER BRACKET for a wooden chest or menu frame, shaped as a right angle with two arms of equal length meeting at a square corner, decorated with round rivets and a small leaf scroll, viewed flat face-on. The corner of the bracket sits at the TOP-LEFT. ${STYLE} ${CUTOUT}`, "item"],

    // ── TITLE SPRITES, ONE PER AREA ─────────────────────────────────────────────────────────────────
    // The bag panel already had four headings and all four were the same word in the same green. These are
    // the three with no sprite anywhere in the folder yet; Backpack, Workbench, Map and Emblems reuse the
    // dock's own ui-*.webp, and the chest shelf wears the chest it holds.
    // The Class room's door. ⚠️ NOT A TABLET AND NOT A CREST: ui-tablet directly below is already a flat
    // carved stone, and a crest would say "which class" when the row is about SPENDING POINTS. A branching
    // bough with tokens hung at the forks is a skill TREE, which is the thing behind the door.
    "ui-class": [`A short forked BOUGH of pale carved wood standing upright like a small tree, three bare branches splitting from one trunk, a round carved bone token hanging on a leather thong from each fork, the lowest token glowing faintly amber. Warm bone-white and pale wood against dark leather. ${STYLE} ${CUTOUT}`, "item"],
    "ui-tablet": [`A weathered grey STONE TABLET standing upright, its face covered in small carved pictograms of leaves, antlers and roots arranged in neat rows, one corner chipped away, faint green moss in the carved grooves. Cool stone greys with green moss. ${STYLE} ${CUTOUT}`, "item"],
    "ui-vault": [`A sturdy fantasy STRONGBOX chest-safe for storing supplies, closed, heavy dark timber banded in cold iron with a large keyhole plate, three-quarter view, standing on short feet. Cool grey-blue iron and dark wood. ${STYLE} ${CUTOUT}`, "item"],
    "ui-belt": [`A worn brown leather ADVENTURER'S BELT with two small pouches and a bundled cloth bandage tucked under it, laid out in a loose curve, three-quarter view. Warm leather browns, brass buckle, a sprig of green herb in one pouch. ${STYLE} ${CUTOUT}`, "item"],
    "ui-tools": [`A bundle of simple fantasy hand TOOLS crossed together -- a wooden-handled pickaxe, a smith's hammer and a fishing rod -- arranged in a neat fan, three-quarter view. Worn wood handles, steel heads, a coil of line. ${STYLE} ${CUTOUT}`, "item"],

    // ── THE FOUR BOSS CHESTS ────────────────────────────────────────────────────────────────────────
    "chest-mossbound": [`${CHEST} A small rough chest of damp green wood, bound in living moss and pale roots that have grown over the lid, a simple iron clasp furred with verdigris. Mossy greens and wet brown.`, "item"],
    "chest-barrowed": [`${CHEST} A grave-casket of dark bog oak banded in black iron, a bone-handled clasp, carved barrow-marks on the lid, a scatter of dry earth caught in the carving. Deep browns, cold iron, bone white.`, "item"],
    "chest-warrenspun": [`${CHEST} A coffer wrapped in layered pale spider-silk over bleached wood, the silk drawn tight like binding, a tooth-shaped catch, faint luminous dust in the weave. Cool blue-greys and silver-white.`, "item"],
    "chest-heartwrought": [`${CHEST} A grand reliquary carved from a single piece of glowing heartwood, veins of warm ember light running through the grain, gold-riveted corners and a crystal set into the lid. Rich amber, molten gold, violet crystal glow.`, "item"],

    // ── TWELVE ZONE BACKDROPS ───────────────────────────────────────────────────────────────────────
    "bg-thicket": [`${PLATE} ZONE: the bright outer edge of a forest. Slim birch and hazel, sun breaking through in warm shafts, long grass, a worn dirt path along the bottom. Fresh greens and gold. The safest-looking place in the wood.`, "plate"],
    "bg-hollow": [`${PLATE} ZONE: a damp mossy hollow. Everything carpeted in thick green moss, fallen logs furred with it, standing water in shallow pools, mushrooms in clusters. Cool wet greens, low soft light.`, "plate"],
    "bg-fernway": [`${PLATE} ZONE: a path through head-high ferns. Enormous fronds crowding in from both sides, dappled light, the trail barely visible underfoot. Lush layered greens, humid haze.`, "plate"],
    "bg-oldstand": [`${PLATE} ZONE: a stand of enormous ancient oaks. Massive trunks like pillars, huge gnarled surface roots forming natural steps and ledges, deep leaf litter, shafts of amber light far above. Heavy browns and deep green.`, "plate"],
    "bg-bramble": [`${PLATE} ZONE: a wall of thorned bramble deliberately planted. Dense interlocking thorn canes, dark red berries, narrow gaps hacked through, a crude wooden ladder against one. Dark greens, blood-red fruit, overcast light.`, "plate"],
    "bg-stubble": [`${PLATE} ZONE: a harvested field at the forest's edge at dusk. Cut stalks to the horizon, bound stooks standing in rows, a crooked fence, the treeline black behind. Dry golds and long violet shadows.`, "plate"],
    "bg-barrows": [`${PLATE} ZONE: grassy burial mounds in deliberate rows. Low turfed barrows with dark stone-lintel openings, leaning standing stones, ground mist. Muted greens and cold grey stone, overcast.`, "plate"],
    "bg-warren": [`${PLATE} ZONE: an underground warren of packed earth. Tunnel mouths at several heights connected by root ledges, hanging pale roots, cobwebs in the corners, faint green glow from clustered fungus. Deep browns and sickly green light.`, "plate"],
    "bg-mothlight": [`${PLATE} ZONE: a night clearing lit from the air. Pale luminous moths drifting in their hundreds as living lanterns, silver birches, dewed grass glittering, a deep blue night sky above. Cold blues and glowing pale gold.`, "plate"],
    "bg-rotwood": [`${PLATE} ZONE: a forest that burned long ago and never cooled. Black charred trunks still faintly smouldering orange at the cracks, grey ash drifted into dunes, thin smoke, no leaves anywhere. Charcoal, ember orange, dead grey.`, "plate"],
    "bg-palisade": [`${PLATE} ZONE: a crude goblin palisade in the deep wood. Sharpened log stakes driven in facing outward, rope bridges and plank platforms at several heights, tattered banners, cook-fires. Dark timber, rope, firelight.`, "plate"],
    "bg-heartwood": [`${PLATE} ZONE: the heart of the forest. ONE colossal ancient tree filling the frame, bark like cliff faces, immense roots forming broad terraces, soft golden light from inside a hollow in the trunk. Awe-inspiring, warm, very old. Deep gold and rich brown.`, "plate"],

    // ── THE FOUR CREATURES NOTHING EXISTING COVERED ─────────────────────────────────────────────────
    husk: [`${FOE} A STRAW WALKER: a shambling figure of bound field-stubble and twine with a sackcloth head, stitched button eyes, straw spilling from every seam, arms hanging long and loose. Dry golds and dirty cream.`, "foe"],
    goblin: [`${FOE} A PALISADE GOBLIN: a wiry green-skinned forest goblin in scavenged bark-and-rope armour, holding a crude spear made from a sharpened stake, teeth bared, crouched and ready to spring. Mossy green, rope brown, rust.`, "foe"],
    elderling: [`${FOE} An ELDERLING: a tall slow treefolk guardian of living heartwood, bark skin seamed with faint gold sap-light, a crown of antler-like branches, moss at the shoulders, long heavy arms. Ancient and grave, not hostile-looking. Deep brown bark and warm gold.`, "foe"],
    crystal_stag: [`${FOE} THE CRYSTAL STAG: a magnificent rare stag whose antlers and parts of its flank have grown into translucent faceted crystal, light refracting through them in pale violet and cyan, hooves trailing faint motes. Regal, luminous, unmistakably a once-in-a-session sight. Crystal violet, pale cyan, deep forest brown.`, "foe"],
};


// ── THE TWELVE BOSSES ───────────────────────────────────────────────────────────────────────────
// ⚠️ ONE PER ZONE AND NONE OF THEM REUSED. Every zone's boss used to be the same creature that already
// wandered it, so "the boss" was a rootrat you had killed two hundred times with more health. Each of these
// is kin to its zone and its own body.
ART["boss-glutmaw"] = [`${BOSS} GLUTMAW, THE BURROW KING: unmistakably a GIANT RAT and nothing else - long naked scaly tail, round rat ears, whiskers, a pointed rodent snout with a pair of huge chisel incisors. Grown to the size of a bear and monstrously bloated, matted brown fur packed with soil and chewed roots, a knot of taproots grown into the fur of its scalp. NOT a bear, NOT a boar, NOT a sabretooth. Dirt brown, pale root, yellow teeth.`, "foe"];
ART["boss-mossmother"] = [`${BOSS} THE MOSSMOTHER: a vast pale grub queen, translucent segmented body swollen with pale eggs visible inside, a thick carpet of living green moss grown over her back, small blind eyes, mandibles ringed with fine hairs. Sickly cream, wet moss green.`, "foe"];
ART["boss-thistlecrown"] = [`${BOSS} THISTLECROWN: a towering briar giant of woven thornvine in a roughly humanoid shape, no face but a crown of enormous purple thistle blooms where a head would be, long whipping thorn-cane arms. Dark bramble green, thorn black, vivid purple blooms.`, "foe"];
ART["boss-grandfather_bristle"] = [`${BOSS} GRANDFATHER BRISTLE: an ancient dire badger the size of a cart, silver-grey striped head scarred across one blind eye, a mantle of enormous black quills down its spine, huge digging claws caked in earth. Silver, charcoal, old-blood brown.`, "foe"];
ART["boss-rattlerind"] = [`${BOSS} RATTLERIND: a hulking creature grown from a swollen autumn SQUASH, its thick ribbed orange rind split open along a natural seam into a wide uneven maw with dried seeds rattling in the cavity, thick twisting vine limbs, a cap of withered leaves and curling tendrils. ABSOLUTELY NOT A HALLOWEEN JACK-O-LANTERN: no carved face, no triangular cut eyes, no candle glow, no grinning carved mouth, nothing carved at all - the opening is a natural split in the rind. Deep squash orange, dried vine brown, dark hollows.`, "foe"];
ART["boss-harvestman"] = [`${BOSS} THE HARVESTMAN: a towering straw-bound figure on long stilted legs, a burlap sack head with stitched black eye-crosses, a broad scythe of rusted iron held in bound-straw hands, crows perched on its shoulders. Dirty gold straw, rust, dusk violet.`, "foe"];
ART["boss-barrow_warden"] = [`${BOSS} THE BARROW WARDEN: a huge spectral hound of the burial mounds, body of grey mist over visible bone, eye sockets lit cold blue, a heavy iron grave-chain trailing from its neck. Grave grey, bone white, cold blue light.`, "foe"];
ART["boss-great_weaver"] = [`${BOSS} THE GREAT WEAVER: an enormous pale cave spider, long translucent legs, abdomen marbled with faint luminous veins, eight small dark eyes in a cluster, strands of silk trailing from her spinnerets. Chalk white, pale sickly green glow, deep shadow.`, "foe"];
ART["boss-lanternwing"] = [`${BOSS} THE LANTERNWING: a colossal luminous moth, wings spread wide and patterned with glowing eye-spots like paper lanterns, thick furred thorax, feathered antennae, drifting motes of light coming off the wings. Pale gold glow, soft dove grey, deep night blue.`, "foe"];
ART["boss-everburning"] = [`${BOSS} THE EVERBURNING: a towering wraith of charred wood and living ember, a hollow trunk body cracked open to reveal an orange furnace inside, branch arms tipped with embers, no face but a glowing fissure. Charcoal black, ember orange, ash grey.`, "foe"];
ART["boss-stakelord"] = [`${BOSS} GORRAK THE STAKELORD: a massive brutish goblin warchief in heavy scavenged plate lashed with rope, a single huge sharpened log hefted over one shoulder as a weapon, tusked underbite, tattered banner on his back. Mossy green skin, rusted iron, rope and firelight.`, "foe"];
ART["boss-heartwood_elder"] = [`${BOSS} THE HEARTWOOD ELDER: an immense ancient treefolk, trunk-like body seamed with rivers of glowing gold sap, a vast crown of antler branches, moss and small ferns growing on its shoulders, deep-set eyes of warm light. Grave and immensely old rather than monstrous. Rich bark brown, glowing gold, deep forest green.`, "foe"];

// ── THE REGION MAP ─────────────────────────────────────────────────────────────────────────────
// Luke, on the map screen: "The fuck is that backdrop. Its supposed to look like a map with points
// of interest." The trail was drawn straight onto whatever the page had behind it, which is the
// member’s equipped cosmetic backdrop - a red curtain. A map needs its own ground.
//
// ⚠️ TERRAIN ONLY. NO PATH, NO MARKERS, NO LABELS. The route and the twelve points of interest are
// drawn in the DOM on top of this, at coordinates the code controls; a path baked into the art would
// never line up with them, and any lettering would be AI gibberish at a glance.
// ── THE REGION MAP ────────────────────────────────────────────────────────────
// Luke, on the map screen: "The fuck is that backdrop. Its supposed to look like a map with points
// of interest." The trail was being drawn straight onto whatever the page had behind it, which is the
// member's equipped cosmetic backdrop — a red curtain. A map needs its own ground.
//
// ⚠️ TERRAIN ONLY. NO PATH, NO MARKERS, NO LABELS. The route and the twelve points of interest are
// drawn in the DOM on top of this at coordinates the code controls; a path baked into the art could
// never line up with them, and any lettering would be gibberish on inspection.
ART["region-map"] = [`A hand-drawn FANTASY CARTOGRAPHY MAP of a forest region, vertical portrait orientation, viewed from directly overhead. Aged parchment in warm browns and muted greens, soft ink linework, subtle paper grain, gentle darkening toward the edges. The terrain changes down the length of the map: open birch woodland at one end, a boggy mossy hollow, deep fern thickets, a stand of enormous ancient oaks, a thorn bramble wall, a harvested stubble field, a row of grassy burial mounds, a warren of burrow mouths, a bright clearing, a burnt black forest of charred stumps, a crude stake palisade, and one colossal tree at the far end. Drawn like an old illustrated adventure map. COMPLETELY EMPTY OF ANY PATH, TRAIL, ROAD, DOTTED LINE, ROUTE, MARKER, PIN, FLAG, X, COMPASS ROSE, BORDER FRAME OR LETTERING OF ANY KIND. No text, no words, no letters, no numbers, no labels, no legend, no title, no watermark. Terrain and trees only.`, "map"];


// ── THE LOOSE-ITEM BRIEF ────────────────────────────────────────────────────────────────────────
// What a kill throws on the floor. These are drawn to a harder constraint than anything else in this file:
// a drop is about three units tall against a hero of seven, so roughly 3% of the frame's height on a
// phone. At that size a painting loses to a SILHOUETTE every time.
//
// ⚠️ SO THE OBJECT MUST FILL ITS OWN FRAME, EDGE TO EDGE. Every other prompt here begs for empty margin
// because a creature that touches the edge comes back amputated — see the BOSS note above. An item is the
// opposite problem: the margin is dead pixels, and 20% of air on each side turns a 3-unit drop into a
// 2-unit one that reads as a smudge. The script TRIMS the alpha afterwards, so a tight draw and a loose
// draw both end up flush; asking for tight just means more of the 1024px actually carries detail.
//
// ⚠️ A DARK OBJECT MUST STILL BE A LIGHT ONE. The first six came back and three were unreadable at the
// size they are actually drawn: the thorn and the rivet were dark shapes on a dark forest, and the moss
// clump grew a trunk and read as a small tree. This is gen-guard's warning about dark forms collapsing
// into one black mass, except here it collapses into the BACKGROUND. So the brief now asks for a high
// overall value and a rim-light by name, and grove-item-sheet.mjs exists to show it at 30px before
// another thirty are paid for.
//
// ⚠️ AND NO CAST SHADOW, EVER. These get a drop-shadow glow in CSS, and the sprite alpha floor
// (sprite-alpha-floor-drop-shadow-box) means a "transparent" pixel comes back at alpha 1-2 — a baked
// shadow plus that fringe is how a sprite ends up wearing a visible box in-game.
const ITEM = `A single fantasy RPG INVENTORY OBJECT, one object only, shown straight on at a slight three-quarter tilt, FILLING THE FRAME from edge to edge with no empty margin, chunky unmistakable silhouette that still reads at thumbnail size, strong single light from the upper left. LIT TO BE SEEN AGAINST A DARK FOREST: keep the object bright and richly saturated overall, with a crisp light rim running along its upper-left edge and bright specular highlights picking out its form. Even a black or brown object must carry a clearly LIGHT-TONED face - nothing may read as a dark silhouette or a dull smudge. Bold simple shapes only; fine detail that vanishes at thumbnail size is wasted. ${STYLE} ${CUTOUT} NO cast shadow, NO ground shadow, NO contact shadow, NO plinth, NO pedestal, NO base, NO inventory slot, NO frame, NO card, NO hand holding it, NO second object. NO outline, rim, stroke, halo or glowing edge of ANY colour traced around the object's silhouette - not white, not gold, not black.`;

// ── THE SIXTEEN PARTS ───────────────────────────────────────────────────────────────────────────
// Drawn from the blurb in grove-catalog.js, because the blurb is the only place the thing has ever been
// described — "Chewed through and spat out. Still springy." is a brief, and it is better than one I would
// write from the id. The tier's own colour is named so the floor still sorts by depth at a glance, the
// way the CSS stones it replaces did.
const PARTS = {
    gnawed_root: "A short length of pale tree ROOT gnawed clean through at both ends, bark stripped away in strips, the splintered ends frayed and still springy, deep tooth-marks pressed along its length, bent in a slight curve. Pale sapwood cream, bark tan, dark earth in the crevices.",
    damp_moss: "A ragged TORN-OFF MAT of soaking wet MOSS lying loose, wider than it is tall, a shaggy carpet of bright emerald fronds on top with a ragged crumbling underside of dark wet soil and a few torn pale rootlets trailing from it, beads of water catching the light across the pile. Bright wet green, almost luminous where the light hits. NOT a bush, NOT a shrub, NOT a tree, NO trunk, NO stem, NO branches, NO pot - a flat torn-up piece of ground cover and nothing else.",
    grub_fat: "A glistening lump of rendered GRUB FAT, a soft translucent waxy blob of pale cream tallow slumped under its own weight, a wet sheen across the top, the surface faintly marbled. Buttery off-white, warm amber in the thin edges.",
    thorn_barb: "A single enormous curved THORN pulled out of the wood, thick and heavy at the base and sweeping to a needle point. PALE AND BRIGHT, not dark: polished bone-ivory along most of its length with a hot crimson flush soaking up from the torn woody base, a hard white specular glint along the whole outer curve and a wet red bead at the very tip. Ivory white, bright crimson, warm shadow. The body of it must read as a LIGHT object.",
    bristle_hide: "A folded scrap of coarse BRISTLE HIDE, a thick pelt doubled over once so the PALE RAW SUEDE underside shows as a broad bright cream band across the lower half, with stiff silver-tipped guard hairs standing up along the top fold and catching a hard white highlight on every tip. Warm tan leather, bright cream suede, frosted silver bristle tips. The object must read as a LIGHT, pale thing with dark accents - not a dark pelt.",
    split_antler: "A short shed ANTLER fork of two tines, bone-cream and weathered, a long dark crack running the length of the beam, the burr at the base rough and knobbled. Old bone cream, grey weathering, brown in the crack.",
    gourd_rind: "A curved shard of dried GOURD RIND, like a piece of a broken bowl, thick ribbed shell burnt-orange on the outside and pale dry pith on the inside face, a hard rolled edge where it cracked. Deep squash orange, cream pith.",
    bound_straw: "A short bundle of cut field STRAW bound tightly around the middle with rough twine, the stalks splayed out at both ends, hollow and dry, a few broken stems sticking out at angles. Dry gold, pale bleached cream, hemp brown twine.",
    barrow_tooth: "A single long yellowed FANG, tapering to a worn point, the broad root end exposed and porous where it was set in nothing any more, hairline age cracks along the enamel. Old ivory yellow, brown stain at the root, grey in the cracks.",
    warren_silk: "A loose gathered hank of SPIDER SILK, a skein of fine pale thread wound into a soft figure-of-eight, individual strands escaping and catching the light, faintly iridescent. Pale lilac grey, cool white highlights, violet sheen.",
    rotwood_knot: "A gnarled hardwood KNOT prised out of a dead tree, a dense whorled lump of grain spiralling in on itself, the surface silvered and checked with splits, far harder-looking than the wood around it ever was. Dark walnut brown, silvered grey, black splits.",
    mothlight_dust: "A small conical heap of glowing MOTH DUST, a pinch of luminous powder, a dozen loose motes lifting off the top and hanging in the air just above it, the heap lit softly from within. Pale glowing cyan, cool white core, faint gold at the edge.",
    ash_ember: "A fist-sized chunk of charred wood EMBER, crusted all over in grey ash, broken open along one side where a deep crack burns furnace orange from inside, one thin wisp of smoke lifting off it. Charcoal black, ash grey, molten orange in the crack.",
    goblin_rivet: "A crude heavy IRON RIVET hammered flat by someone in a hurry, a short thick shank under a badly misshapen beaten head, hammer dents all over it. BRIGHT STRUCK METAL, not a dull dark nail: most of the surface is freshly beaten steel catching hard white highlights, with hot orange rust blooming only in the dents and around the rim. Bright silver steel, vivid orange rust, warm grey shadow.",
    elder_heartwood: "A split billet of ELDER HEARTWOOD, a short wedge cut from the middle of something very old, standing on end. The end grain shows dense concentric growth rings, and warm gold sap glows from WITHIN one or two of those rings and from the split down its face - the light comes from INSIDE the wood only. Deep red-brown timber, pale sapwood at the outer rings, dark rough bark on the back face. The glow must stay inside the grain; the outer silhouette of the billet is plain unlit wood.",
    crystal_shard: "A raw hexagonal CRYSTAL SHARD, uncut and natural with broad clean facets and a chisel-point tip, light refracting through it into pale violet and cyan bands, a faint inner glow, three tiny chips of the same crystal floating just off its surface. Violet white, pale cyan, bright specular edges. Not a jeweller's cut gemstone, no setting, no metal.",
};

// ── THE THIRTEEN EMBLEMS ────────────────────────────────────────────────────────────────────────
// ⚠️ ONE OBJECT CLASS, THIRTEEN DISTINCT FACES. An emblem has to say "emblem" before it says which one —
// it is the rare thing in a pile of six drops, and the player's eye needs to find it without reading.
// So every one of these is the same KIND of thing, a carved token on a thong, and they differ by motif,
// material and colour rather than by shape.
//
// ⚠️ A MOTIF IN RELIEF, NEVER A LITTLE PICTURE OF THE ANIMAL. Asking for "a token with a rat on it"
// returns a rat standing on a coin. Said as carved relief it comes back as a sign, which is what an
// emblem is.
const EMBLEMS = {
    em_rootrat: "A TOKEN of dark umber wood strung on a leather thong, SQUARE with clipped corners rather than round, two crossed gnawed roots carved deep into its face in sharp relief with a pair of chisel teeth-marks bitten out of one edge of the token itself. Dark walnut brown, pale raw sapwood bright in the carved cuts, black thong. NOT a spiral, NOT a coil, NOT a ring - two straight crossed roots.",
    em_grub: "A pale waxy TOKEN strung on a leather thong, a fat curled grub coiled nose to tail carved into its face in soft relief, the material translucent like tallow. Milky cream, faint pink translucence, dark thong.",
    em_thornling: "A dark lacquered wooden TOKEN strung on a leather thong, three curved thorns arranged in a radiating spiral carved into its face in sharp relief. Bramble black, blood-red in the recesses, dry green thong.",
    em_badger: "A hammered pewter TOKEN strung on a leather thong, a striped badger mask with a blind eye carved into its face in bold relief, the metal dented and scuffed from use. Silver grey, charcoal stripes, bright scuffs.",
    em_gourdling: "A polished gourd-shell TOKEN strung on a twine cord, a split squash with seeds spilling from the seam carved into its face in relief, the shell warm and faintly waxed. Deep squash orange, cream seeds, dry vine cord.",
    em_husk: "A woven straw TOKEN bound on a twine cord, a sackcloth head with two stitched crosses for eyes worked into its face, the straw plaited flat and tight. Dirty gold straw, dark stitching, hemp cord.",
    em_ashwraith: "A charred black TOKEN strung on a blackened wire, a hollow cracked trunk with a burning fissure down it carved into its face in relief, ember orange light burning in the carved lines themselves. Charcoal black, molten orange, grey ash dust.",
    em_barrowhound: "A grave-grey stone TOKEN strung on a rusted iron chain, a running hound in profile carved into its face in worn relief, cold blue light caught in the hollows of the carving. Slate grey, bone white, cold blue glow, rusted iron.",
    em_warren: "A silk-wrapped TOKEN hung on a pale thread, a broad spider seen from above with its legs folded in carved into its face in fine relief, a gauze of fine silk half covering it. Chalk white, pale lilac, sickly green glow.",
    em_voidmoth: "A luminous pale TOKEN strung on a silver thread, a moth with wings spread and a glowing eye-spot on each one carved into its face in relief, the whole token lit faintly from inside, a few motes drifting off it. Glowing pale gold, dove grey, deep night blue, silver thread.",
    em_goblin: "A crude iron TOKEN lashed to a rope cord, a row of sharpened log stakes driven in a line punched into its face, the plate cut by hand with uneven edges and rivets at two corners. Rusted iron, rope brown, firelight orange.",
    em_elder: "A heartwood TOKEN strung on a woven grass cord, a crown of antler-like branches over a deep root carved into its face in relief, warm gold sap glowing along every carved line, a little moss grown into one edge. Rich red-brown wood, glowing gold sap, forest green moss.",
    em_crystal: "A TOKEN of raw faceted crystal hung on a fine silver chain, a stag's head with crystalline antlers carved into its translucent face in relief, light refracting through the whole token into violet and cyan, visibly the rarest object of its kind. Violet white, pale cyan, bright silver chain.",
};

// ── THE FOUR FOODS ──────────────────────────────────────────────────────────────────────────────
// ⚠️ NOTHING WITH A LABEL ON IT. A corked bottle comes back with misspelled words printed across the
// glass every time — the consumable generator paid for that lesson already. These are a leaf packet, a
// gourd, a horn and a phial: four different silhouettes, none of them a labelled apothecary bottle.
const FOODS = {
    food_poultice: "A MOSS POULTICE: a broad green leaf folded into a packet around a lump of chewed green moss and pale fat, bound shut with a single wrap of grass stem, the filling bulging out at one open corner. Deep leaf green, moss green, cream filling.",
    food_flask: "A GOURD FLASK: a small dried gourd with a narrow neck used as a bottle, plugged with a whittled wooden stopper, a leather carry-cord knotted round the neck, the rind mottled and waxed. Warm ochre, brown mottling, pale wood stopper.",
    food_tonic: "A MOTHLIGHT TONIC: a stubby curved HORN cup sealed with wax, filled with a faintly luminous pale liquid that glows through the thin walls of the horn, a few motes of light drifting off the top. Cream horn, glowing pale cyan, dark wax seal.",
    food_draught: "A HEARTWOOD DRAUGHT: a tiny thick-walled PHIAL carved from red heartwood with a stopper of the same wood, barely more than a mouthful of glowing gold sap inside, warm light leaking from the seam. Deep red-brown wood, glowing gold, almost nothing of it.",
};

// ── THE ZONE DOORS ──────────────────────────────────────────────────────────────────────────────
// One at each end of every zone: left goes back a node, right goes on to the next. They stand ON the
// ground at the far edges of a 300-to-700 unit world, so you reach them by walking rather than by
// finding a button — which is the whole reason they are world objects and not HUD.
//
// ⚠️ TALLER THAN THEY ARE WIDE, AND LIT FROM INSIDE. These are drawn at about 11 units against a 7-unit
// hero, so unlike the loot they do not need to survive 30 pixels — they need to read as a DOOR from
// across a zone, which is a silhouette job: an arch, standing upright, with its own light. The ITEM brief
// below asks for a frame-filling object, which is right here too.
const DOORS = {
    "portal-open": "A standing stone ARCHWAY grown through with living wood, tall and narrow, its opening filled with a swirling sheet of soft turquoise light that throws a glow onto the stones around it. Moss and small ferns growing in the joints, a few motes of light drifting up out of the surface. Ancient, welcoming, clearly a WAY THROUGH. Weathered grey stone, deep forest green, luminous turquoise.",
    "portal-locked": "A standing stone ARCHWAY grown through with living wood, tall and narrow, exactly the same shape as a working gate but DEAD: the opening sealed with a slab of rough grey stone, heavy iron chains drawn across it and fixed with a thick padlock, no light of any kind coming through. Dry and lifeless, cold grey, rusted iron, dead brown wood. No glow, no magic, no turquoise.",
    "portal-skull": "A single bleached animal SKULL, front-on, hollow eye sockets, a few teeth missing, hairline cracks across the crown. Clean and graphic, the sort of mark that counts something. Bone white, warm grey shadow, deep black in the sockets.",
};
for (const [id, subject] of Object.entries(DOORS)) ART[id] = [`${ITEM} ${subject}`, "item"];

// ── THE DOCK ────────────────────────────────────────────────────────────────────────────────────
// Luke: "The backpack and other stuff should be sprite buttons floating on top of content at the bottom
// right of the screen." So the four places the Grove can take you are OBJECTS, not labels in a tab row.
//
// ⚠️ THEY HAVE TO BE TELLABLE APART AS SILHOUETTES, which is a harder job than the loot had. Loot is
// read once, leisurely, lying on the ground; these are hit with a thumb, at about 46px, while something
// is walking at you. So: four different outlines on purpose — a slung bag, a flat bench seen from above,
// a hanging medallion, a rolled scroll — rather than four things on four plaques. Nothing square.
//
// ⚠️ AND NO LETTERING. A map with place names and a bench with a maker's mark both come back covered in
// misspelled words, and at 46px a word is a smudge that looks like damage.
const DOCK = {
    "ui-map": "A rolled paper MAP tied with a leather cord, partly unrolled so one curled edge shows a hand-inked coastline and a few tiny hills, warm aged parchment catching the light. Nothing written on it: no words, no letters, no labels, no compass rose, no X - only terrain lines. Warm cream parchment, umber ink, tan cord.",
    "ui-bag": "A sturdy forager's BACKPACK of worn brown leather seen from the front, the flap buckled down with two brass buckles, a bedroll strapped across the top and a small pouch on one side, straps hanging loose. Scuffed and well-used. Warm saddle brown, brass, cream canvas.",
    "ui-bench": "A heavy wooden WORKBENCH seen from the front at a slight angle, one thick plank top on stout legs, with a small anvil, a hammer lying on its side and a hand-plane resting on it, wood shavings at the base. Dark oak, blackened iron, pale shavings.",
    // ⚠️ QUESTS HAD NO ICON AND WAS WEARING A WALL. The menu row pointed at ui-board.webp, which is
    // the seamless plank TEXTURE above — a background material, "Completely EMPTY: no objects, no props".
    // Pointed at a 46px icon slot it renders as a flat brown rectangle, which is what Luke saw. The
    // texture is doing its real job as a panel background in grove-css; this is the icon that should
    // always have existed.
    //
    // ⚠️ NOT A SCROLL. ui-map is already a rolled parchment tied with a cord, and two rolled
    // parchments at 46px are one icon drawn twice. A notice board on a post is what every game has
    // taught people quests look like, and it shares nothing with the map but its paper.
    "ui-quests": "A small weathered wooden NOTICE BOARD on a short post, two curling parchment notices pinned to it with dark iron nails, one hanging slightly crooked as if read and left. Nothing written on them: no words, no letters, no symbols, no drawings - only blank cream parchment. Weathered grey-brown planks, cream parchment, dark iron nails.",
    "ui-emblems": "A single ornate MEDALLION hanging from a short leather thong, a thick gold disc with a raised scalloped rim and a smooth polished centre catching a bright highlight, one small green gem set at the top of the rim. Rich warm gold, deep shadow in the relief, green gem. No markings or letters on the face.",
};
for (const [id, subject] of Object.entries(DOCK)) ART[id] = [`${ITEM} ${subject}`, "item"];

// ── THE MERIT: THE CURRENCY'S FACE ──────────────────────────────────────────────────────────────
// Luke: "Use sprites for merit and all things in the grove." Then, asked what a merit looks like:
// "Its a currency, figure it out."
//
// It had no face at all — "512 merits" was a word beside a number, which is the same thing the arena's
// laurels were before gen-armoury-art.mjs drew them, and the note there is right: the currencies people
// talk about are the ones with a face.
//
// ⚠️ IT MUST NOT BE GOLD'S COIN AND IT MUST NOT BE THE ARENA'S WREATH. The Den already has a round gold
// coin and a laurel ring, and a third round gold thing is a currency nobody can tell apart in a row of
// numbers. A merit is won off a BOSS and spent on BOSS ARMOUR, so it is struck from the thing you killed:
// bronze gone green with age, an antler mark raised on its face, one corner chipped. Cold green-bronze
// reads instantly against gold's warm yellow at 16px, which is the only size that matters.
ART["ui-merit"] = [`${ITEM} A single struck BRONZE MERIT TOKEN, a thick round coin of dark bronze gone `
    + `green-black with age, a heavy raised rim, and on its face a bold raised ANTLER mark — two simple `
    + `curved forest antlers — standing proud of the surface and catching the light. One small chip out of `
    + `the rim. Cold verdigris green-bronze with warm copper highlights on the raised antler. No lettering, `
    + `no numerals, no runes, no inscription of any kind on the face.`, "item"];

// ── THE BOSS ARMOUR: FIVE SETS OF THREE ─────────────────────────────────────────────────────────
// Fifteen pieces and not one of them had an art field, so the Armoury listed its whole ladder as text while
// every tool in the game has 156 sprites. Each set is named for the place its boss rules, so each is built
// out of that place's materials rather than being the same helmet five times in different metals — the same
// reasoning the tool ladder uses, where tier VII is a rod made of a different forest, not a better rod.
const ARMOUR_LOOK = {
    common: ["Rootbound", "living pale tree ROOTS and dark bark bound with twine, green moss in the crevices",
        "mossy green, pale root-wood, twine brown"],
    uncommon: ["Barrowplate", "slabs of grey grave-STONE and tarnished iron banding, carved with the barrows' blunt lines",
        "cold grey stone, tarnished iron, faint lichen"],
    rare: ["Warrenweave", "layered SPIDER-SILK and chitin plating, pale woven silk stretched over dark segmented shell",
        "bone-white silk, blue-black chitin, deep shadow"],
    epic: ["Rotwood", "CHARRED black timber still glowing with embers in its cracks, ash-grey grain, iron rivets",
        "burnt black, ember orange, ash grey"],
    legendary: ["Heartwrought", "golden HEARTWOOD grain shot through with amber sap that glows from within, gold-leaf edging",
        "deep amber, honey gold, warm glowing sap"],
};
const ARMOUR_SHAPE = {
    head: ["CROWN-HELM", "an open circlet-helm rising into points, worn on the head"],
    body: ["MANTLE", "a shoulder-and-chest piece with a hanging cloak-like drape, no head, no arms, no legs"],
    feet: ["TREADS", "a matched pair of heavy boots standing side by side"],
};
for (const [setId, [setName, material, palette]] of Object.entries(ARMOUR_LOOK)) {
    for (const [slot, [shape, desc]] of Object.entries(ARMOUR_SHAPE)) {
        ART[`armour-${setId}_${slot}`] = [`${ITEM} A single piece of fantasy BOSS ARMOUR: the ${setName} `
            + `${shape} — ${desc} — made of ${material}. Empty armour with nobody wearing it. ${palette}. `
            + `No character, no body, no face, no head inside the helm, no mannequin, no stand.`, "item"];
    }
}

// ── THE MAP ITSELF ──────────────────────────────────────────────────────────────────────────────
// Luke: "The map should be nodes on a paper map. The paper map should have color, as if a skilled scribe
// actually drew the map, with families point of interest nodes on it ... A forest should look like a
// grouping of trees on the map. A cave should look like a cave."
//
// ⚠️ THE PLATE IS TERRAIN ONLY — NO PATH, NO MARKERS, NO LETTERING. This rule already cost one map: the
// route and the twelve places are drawn in the DOM at coordinates the code controls, so anything baked
// into the painting could never line up with them, and any lettering comes back as gibberish under
// inspection. The plate's whole job is to be somewhere the nodes can sit.
//
// ⚠️ AND IT IS IN COLOUR. The first one was sepia parchment, which threw away the one thing each of the
// twelve places actually owns. Luke, on that version: "The fuck is that backdrop." Washed ink and
// watercolour, not a monochrome antique.
// ⚠️ MOSTLY EMPTY PARCHMENT. The first plate was a dense landscape painting edge to edge, and the
// twelve symbols are the content of this screen - a full canopy under them is noise competing with the
// only thing the player is reading. A real scribe leaves most of the paper alone and lets the marks
// carry it.
const MAP_PLATE = `A hand-drawn FANTASY CARTOGRAPHY MAP of one forest region, wide landscape orientation. MOSTLY EMPTY AGED PARCHMENT: warm cream paper with soft grain, faint foxing and gently darkened edges, with large areas of completely blank paper. Sparse and restrained, the work of a careful scribe who leaves most of the page alone.

Only LIGHT, SPARSE terrain marks in fine brown ink with thin watercolour wash: one blue-green river winding across it, a scattering of small hatched hill shapes, a handful of tiny individual tree marks in loose groups, a few patches of pale green and ochre wash, some stippled scree near the right. Nothing dense. No solid canopy, no filled forest, no full-colour landscape painting - the paper must show through almost everywhere.

⚠️ CRITICAL: at least two thirds of the image must be plain empty parchment with nothing drawn on it, and a broad clear band of bare paper must wind from the left edge to the right edge - twelve drawn symbols and a route are placed on top of this later and need somewhere to sit.

COMPLETELY EMPTY OF: any path, trail, road, dotted line, route, footprints, marker, pin, flag, X, circle, numbered point, compass rose, scale bar, border frame, cartouche, or LETTERING OF ANY KIND. No text, no words, no letters, no numbers, no labels, no legend, no title, no watermark. Terrain, water and trees only.`;
ART["map-plate"] = [MAP_PLATE, "plate"];

// ── THE TWELVE PLACES, AS MAP SYMBOLS ───────────────────────────────────────────────────────────
// ⚠️ MAP SYMBOLS, NOT SPRITES. The zone backdrops already exist and are paintings you walk INTO; these
// are the same places seen from above and outside, drawn in the plate's own hand so they look like part
// of the map rather than stickers on it. Same ink, same wash, same oblique angle.
//
// ⚠️ AND EACH ONE HAS TO BE ITS OWN THING AT ABOUT 60 PIXELS. Luke: "A forest should look like a grouping
// of trees on the map. A cave should look like a cave." Twelve green blobs would be twelve nowheres.
const MAPNODE = `A single MAP SYMBOL for an illustrated fantasy map, drawn from a high oblique angle in fine brown ink with soft watercolour wash, the way a skilled scribe draws a place on a chart. Confident linework, light stippled shading, a small amount of real colour. Compact and self-contained, filling the frame, reading clearly as its own kind of place at thumbnail size. ISOLATED on a FULLY TRANSPARENT background - no parchment, no paper, no ground patch, no circle, no frame, no border, no shadow. No text, no letters, no numbers, no labels of any kind.`;

const MAP_NODES = {
    // Map 8. ⚠️ biomeNode() falls back to "thicket" for an unmapped biome, which would have put a stand of
    // birch trees on the chart for a map with no trees in it -- and a fallback is not an error.
    cogwork: "A STOPPED GEAR the size of a building: one enormous upright brass cog-wheel sunk into the ground at a slight angle, about a third of its teeth showing above the surface, each tooth taller than a man, with a smaller iron gear meshed into it and a length of heavy chain draped across the rim. Warm brass and dark oiled iron. Motionless.",
    thicket: "The edge of a wood: a loose GROUP OF SLIM BIRCH AND HAZEL TREES, seven or eight of them, pale trunks and light green canopies, with a few tufts of long grass between them. Open and airy - the friendly edge of a forest.",
    hollow: "A damp mossy HOLLOW: a shallow green dell ringed with mossed-over fallen logs, a small still pool of blue-green water at the bottom, clusters of little mushrooms on the rim.",
    fernway: "A stand of ENORMOUS FERNS: six or seven big arching fern fronds crowded together, deep lush green, with a narrow gap of bare ground showing between them.",
    oldstand: "THREE COLOSSAL ANCIENT OAKS standing together, far thicker than ordinary trees, with heavy gnarled surface roots spreading out around their bases and broad dark canopies.",
    bramble: "A THORN WALL: a dense tangled hedge of interlocking bramble canes drawn as a low thicket barrier, dark green with sharp thorns and small dark red berries.",
    stubble: "A HARVESTED FIELD: rows of cut golden stubble with four or five bound sheaves of straw standing in it, and a short crooked length of wooden fence along one side.",
    barrows: "BURIAL MOUNDS: three smooth grassy turf mounds in a row, the nearest with a dark stone-lintel doorway set into its side, and two leaning standing stones beside them.",
    warren: "A CAVE-POCKED HILLSIDE: a rocky grey bluff with three dark round BURROW MOUTHS opening into it at different heights, loose scree and a few pale roots hanging over the openings. Unmistakably caves in a hill.",
    mothlight: "A NIGHT CLEARING: a small ring of slender silver birches with a dozen pale glowing moths drifting above and between them, the grass beneath washed cool blue, everything else lit soft gold.",
    rotwood: "BURNT FOREST: five or six blackened broken tree stumps and snapped trunks with no leaves at all, grey ash drifted around their bases and one thin wisp of smoke still rising.",
    palisade: "A CRUDE STAKE PALISADE: a curved fence of sharpened log stakes driven into the ground facing outward, with a rough plank watch-platform behind it and two small tattered banners on poles.",
    heartwood: "ONE ENORMOUS ANCIENT TREE alone, far larger than any other tree on the map, with a massive buttressed trunk, immense spreading roots, a vast golden-green canopy and a soft warm glow from a hollow in its base.",
};
for (const [id, subject] of Object.entries(MAP_NODES)) ART[`node-${id}`] = [`${MAPNODE} ${subject}`, "item"];

// ── THE LEDGES, AND WHAT GROWS ON THEM ──────────────────────────────────────────────────────────
// Luke: "Lets make the platforms more detailed. And add sprite decorations like vines hanging from
// platforms where biome permits, the platforms are just way too plain."
//
// They were a CSS bar: a three-stop gradient with a green band on top. That is the right tool for a
// prototype and the wrong one next to a painted backdrop — the one object the player actually stands on
// was the only thing in the zone that was not painted.
//
// ── ⚠️ A LEDGE IS 13 TO 29 UNITS WIDE, SO ONE SPRITE CANNOT JUST BE STRETCHED ACROSS IT ──────────
// That is a 2.2x spread, and a stretched sprite puts the ends at two different aspect ratios — a round
// cap on a short ledge and an ellipse on a long one, in the same zone, in the same frame. So the slab is
// drawn as a THREE-SLICE: CSS border-image keeps the two ends at their painted size and stretches only
// the middle. Which is a constraint on the PROMPT, not just on the stylesheet: the middle has to be a
// plain horizontal band with nothing in it, or whatever is in there smears as the ledge gets longer.
const SLAB = `A SINGLE PLATFORM LEDGE for a 2D side-scrolling game, drawn STRAIGHT FROM THE SIDE at eye level — flat orthographic side elevation, NO perspective, NO three-quarter view, NO top surface visible, NO ground below it. ONE long horizontal slab running the FULL WIDTH of the frame, touching both the extreme left and the extreme right edge, with its two ends finished and rounded off. About five times as wide as it is tall, sitting in the vertical middle of the frame with empty transparent space above and below.

⚠️ THE MIDDLE OF THE SLAB MUST BE PLAIN AND UNIFORM. The central two thirds is nothing but even horizontal strata of the same material running straight across — no object, no feature, no knot, no break, no change of colour along its length, and a perfectly straight unbroken top edge and bottom edge. Only the left and right thirds may carry character. The middle gets stretched, so anything drawn in it smears.

${STYLE} ${CUTOUT}`;

// ⚠️ DRAWN HANGING FROM THE TOP EDGE, because that is where the code nails it. Each of these is pinned to
// the underside of a ledge at a seeded x and allowed to swing a few degrees from that point; art that is
// centred in its frame, or that tapers at the top, detaches visibly from the thing it is supposed to be
// growing out of.
//
// ⚠️ AND THE FIRST RUN OF ALL THIRTEEN CAME BACK CROPPED, WHICH IS THE LESSON THE BOSS PROMPT ABOVE
// ALREADY PAID FOR. "Nothing in the bottom third of the frame" was read as a composition note and ignored:
// every vine, every beard of moss and every fern filled its square edge to edge and ran off three sides, so
// what arrived was a zoomed-in DETAIL of a leaf rather than a whole object. A sprite that is cut off at the
// bottom does not hang, it stops — there is no tip, no taper, nothing for the eye to finish.
//
// Two fixes, and they only work together. Say the margin as a hard rule with a number and name the edges it
// applies to, exactly as BOSS does. And ASK IN THE OBJECT'S OWN SHAPE: a hanging thing is tall, so it is
// drawn on a tall canvas, and a clump is wide, so it is drawn on a wide one. A square frame around a 1:3
// object is an invitation to crop, because filling the frame and keeping the proportions cannot both happen.
const HANG = `A single small decorative natural object HANGING DOWN, drawn STRAIGHT FROM THE SIDE for a 2D side-scrolling forest game, flat side elevation with NO perspective. It GROWS OUT OF THE TOP EDGE of the frame and hangs straight down from there under its own weight: the top of the object is WIDE and cut flat, flush with the top edge of the image, and it narrows and frays as it falls to a clear visible TIP.

⚠️ FRAMING, AND IT IS A HARD RULE: the TOP edge is the ONLY edge the object may touch. It must keep at least 15% completely empty space down the LEFT side, 15% down the RIGHT side and 15% across the BOTTOM — the lower tip of the object must be clearly visible with empty space beneath it. NO part of it may touch or run off the left, right or bottom edge. Draw the WHOLE object, smaller rather than cropped. Do NOT zoom in on a detail of it.

${STYLE} ${CUTOUT}`;

// The same job the other way up: something RESTING on the ledge's top surface.
const SIT = `A single small decorative natural clump RESTING ON FLAT GROUND, drawn STRAIGHT FROM THE SIDE for a 2D side-scrolling forest game, flat side elevation with NO perspective and NO ground, soil, rock or surface drawn under it. Its base is FLAT and sits flush along the BOTTOM EDGE of the frame; it grows upward and spreads outward from there. Low and wide.

⚠️ FRAMING, AND IT IS A HARD RULE: the BOTTOM edge is the ONLY edge the object may touch. It must keep at least 15% completely empty space down the LEFT side, 15% down the RIGHT side and 20% across the TOP — every leaf, blade and tip must be clearly inside the frame with empty space above it. NO part of it may touch or run off the left, right or top edge. Draw the WHOLE clump, smaller rather than cropped. Do NOT zoom in on a detail of it.

${STYLE} ${CUTOUT}`;

const SLABS = {
    wood: "A mossy forest ledge of packed dark earth and old timber: a thick cushion of deep olive moss along the top edge, a band of root-threaded brown soil under it, and a seam of weathered grey-brown wood grain along the bottom. The two ends break off into exposed torn soil with a few pale severed rootlets poking out.",
    moss: "A sodden hollow ledge, drowned in moss: a deep shaggy pad of wet emerald moss covering the whole top half and rolling over both ends, dark waterlogged peat beneath it, beads of water along the lower edge. The ends are soft and rounded where the moss swallows them.",
    bramble: "A bramble-grown ledge: a dense mat of dark interlocking thorn canes over a bar of dry grey deadwood, small hard crimson berries caught in the tangle, short black thorns standing up along the top. The ends are a knot of snapped canes.",
    field: "A field-edge ledge of dry packed earth capped with cut stubble: a fringe of short dry golden straw along the top, pale cracked clay soil beneath, a line of flint pebbles through the middle. The ends crumble into loose dry soil.",
    // ⚠️ THE WARREN IS NOT THE BARROWS, AND SHARING A SLAB SAID IT WAS. Both were "stone", which put a
    // pale cold limestone shelf into a tunnel of packed brown earth — the one place in the map where the
    // ledge went back to reading as a bar laid over the painting rather than a thing cut out of it. A
    // biome may share a slab only where the two places are genuinely the same material.
    earth: "A burrow ledge of packed dark earth: a bar of dense root-threaded brown soil, its top edge trodden smooth and dusted paler, pale severed rootlets and small stones embedded through the face, a crumbling darker underside. The ends break off into torn soil with roots trailing out of them.",
    // ── MAP 8. THE FIRST NEW SLAB SINCE MAP ONE ──────────────────────────────────────────────────────
    // The hangs and sits for `clockwork` borrow (rope_coil, cobweb, and an empty sit list on the `char`
    // precedent, because nothing grows in a dry machine). Only the FLOOR can borrow nothing: a machine
    // deck is not planks and not limestone, and the note on `stone` below is the scar from pretending two
    // materials were one.
    //
    // ⚠️ NO RUST AND NO RUIN. The Clockwork Deep is STOPPED, not abandoned -- something in the middle
    // distance is still turning. A corroded deck would say the opposite of the map's one idea.
    cogwork: "A machined deck plate of brass and iron: a flat milled brass tread-plate along the top, its surface scored with fine parallel machining lines and a row of flush countersunk rivets, a band of dark oiled iron beneath it, and a lower seam of blackened grease-darkened metal. Warm brass yellows over cold grey iron, oil-black in the recesses. The two ends are cleanly sheared flat with the plate's layers visible in section. Not rusted, not ruined -- maintained, and recently.",
    stone: "A barrow ledge of old grey stone: a single weathered limestone slab, its top edge worn smooth and dusted with thin dry turf, hairline cracks and lichen blotches of pale green and rust across the face, a chipped lower edge. The ends are rough broken stone.",
    char: "A burnt ledge of charred timber: a blackened beam, its top crusted in grey ash, deep carbon fissures across the face glowing the faintest dull ember orange from inside, the grain burnt to charcoal. The ends are broken and jagged where the wood snapped in the fire.",
    plank: "A crude goblin platform of lashed planks: three rough sawn boards nailed side by side with bent iron nails, grey weathered timber, a wrap of tarred rope binding at each end and one short length of rope tail. The ends are sawn square and splintered.",
};

const HANGS = {
    vine_leafy: "A LEAFY VINE: a single ropy green creeper hanging down in a loose curve, broad heart-shaped leaves alternating down its length, a curling tendril at the tip. Fresh forest green, warm yellow-green where the light catches.",
    vine_flower: "A FLOWERING VINE: a slender trailing creeper hanging down, small round leaves along it and three or four clusters of pale cream-and-pink blossom, one tendril curling off to the side. Soft green, cream, blush pink.",
    moss_beard: "A BEARD OF HANGING MOSS: a thick curtain of fine pale-green lichen strands hanging straight down in a ragged soft mass, thinning into loose threads at the bottom. Dusty sage green, silver-grey highlights.",
    thorn_cane: "A HANGING THORN CANE: one long woody bramble cane trailing down, bare and dark with hard black thorns at intervals, two small dark red berries near the tip, a few dried leaves still clinging. Bramble black-green, dried brown, deep crimson.",
    root_pale: "HANGING ROOTS: a fall of pale blind tree roots, a dozen thin ivory tendrils of different lengths hanging straight down and tangling into each other, dusted with dry earth. Bone cream, pale tan, shadowed grey.",
    cobweb: "A HANGING COBWEB: a ragged sheet of old spider silk drooping in a shallow swag, torn open in places, heavy with pale dust, a couple of loose threads trailing below it. Chalk white, cool grey, faint lilac.",
    straw_fringe: "A FRINGE OF STRAW: a loose hanging bundle of dry cut field-straw stalks of uneven length, a single twist of twine holding them near the top, a few stems broken and bent. Dry gold, bleached cream, hemp brown.",
    char_twig: "BURNT TWIGS: a small bunch of blackened leafless twigs hanging down, brittle and sharply angular, crusted with grey ash, one tip still glowing a faint dull ember. Charcoal black, ash grey, dull ember orange.",
    rope_coil: "A HANGING ROPE: a length of thick tarred hemp rope hanging straight down with a loose loop in it and a frayed whipped end, one crude iron ring threaded on near the top. Rope brown, tar black, rusted iron.",
    glow_strand: "GLOWING STRANDS: a hanging curtain of fine luminous filaments, each tipped with a tiny bead of soft cyan light, drifting slightly apart from one another, a few motes coming off them. Pale glowing cyan, cool white cores, deep blue shadow.",
};

const SITS = {
    fern_tuft: "A TUFT OF FERNS: a low spreading clump of five or six arching fern fronds growing from one base, splaying out to both sides. Deep lush green, pale new growth at the curled tips.",
    mushroom_cluster: "A CLUSTER OF MUSHROOMS: a tight group of seven small forest toadstools of different heights growing from one patch, domed caps, pale gills visible under the nearest. Warm tan caps, cream stems, a touch of dull red on the largest.",
    grass_tuft: "A TUFT OF LONG GRASS: a spray of tall thin grass blades growing from one base and arching outward on both sides, a few blades bent over, two slender seed heads standing above the rest. Olive green, dry gold at the tips.",
};

for (const [id, subject] of Object.entries(SLABS)) ART[`slab-${id}`] = [`${SLAB} THE MATERIAL: ${subject}`, "slab"];
for (const [id, subject] of Object.entries(HANGS)) ART[`hang-${id}`] = [`${HANG} THE OBJECT: ${subject}`, "hang"];
for (const [id, subject] of Object.entries(SITS)) ART[`sit-${id}`] = [`${SIT} THE OBJECT: ${subject}`, "sit"];

// ── THE TWELVE TOOLS ────────────────────────────────────────────────────────────────────────────
// Luke: "if no sprites exist make them." None did — not even for the original six, which have been
// rendering as react-icons glyphs since the day the ladder shipped.
//
// ⚠️ EVERY TOOL IS BUILT OUT OF ITS OWN RECIPE. A fishing rod is a fishing rod in any game; THIS one is
// eight gnawed roots, four handfuls of damp moss and three of grub fat, and if the picture does not say
// so then the recipe underneath it is just a cost. So each subject below names the materials the tier I
// recipe actually asks for, in the proportions it asks for them.
//
// ⚠️ AND THEY ARE TIER I, WHICH IS THE CRUDE END OF A TWELVE-RUNG LADDER. Lashed, knapped, bound, found.
// Tier XII will be the same object made properly; drawing tier I as a masterwork leaves nowhere to go.
const TOOLS = {
    rod: "A crude FISHING ROD made from forest scraps: a long springy pale root stripped of bark as the shaft, slightly crooked, bound at the grip with wraps of damp green moss and twine, a bone hook swinging on a short line at the tip. Pale wood, moss green, bone white.",
    pick: "A crude PICKAXE: a single split stag antler lashed crosswise as the head, its broken tine forming a sharp point, bound with strips of brown bristly hide to a short knotted wooden haft wrapped in thorn-studded cord. Bone cream, dark brown hide, grey-brown wood.",
    shovel: "A crude SPADE: a broad flat blade made from a curved yellowed tooth-like plate of bone, bound with woven straw rope to a stubby antler-and-wood handle. Bone yellow, straw gold, weathered grey wood.",
    hammer: "A crude SMITH'S HAMMER: a heavy knotted burl of dark rotted wood as the head, studded with crude iron rivets, scorched black along one face with glowing orange embers still in the cracks, on a short thick haft. Charcoal black, ember orange, rust red rivets.",
    hoe: "A crude HOE: a wide flat blade of hardened orange gourd rind edged with long black thorns, bound with strips of brown hide to a long straight wooden handle. Burnt orange, thorn black, brown hide.",
    sextant: "An ornate SEXTANT made of forest materials: a curved arc frame of pale polished wood wound with silvery spider silk, tiny brass fittings, a faintly glowing violet crystal shard set as the lens, luminous pale dust caught in the silk. Pale wood, silver silk, glowing violet.",
    knife: "A crude KNIFE: a knapped grey flint blade with visible chipped facets, lashed with cord to a short pale bone handle wrapped in dark green moss. Flint grey, bone cream, moss green.",
    collar: "A braided animal COLLAR: a thick cord of silvery woven spider silk plaited with strips of brown hide, closed with a small carved bone toggle, a single pale charm hanging from it. Silver silk, warm brown hide, bone white.",
    lantern: "A handheld LANTERN made from a hollowed dried gourd: a round orange-brown gourd shell pierced with small openings glowing warm gold from within, a braided straw handle arching over the top, pale luminous dust escaping through the holes. Gourd orange, straw gold, warm glow.",
    loupe: "A jeweller's LOUPE: a thick disc of clear violet crystal ground flat and smooth, held in a carved pale antler-bone ring frame with a short handle, faint light refracting through the lens. Violet crystal, bone cream, soft prismatic sparkle.",
    banner: "A small war STANDARD: a tall straight pole of bound straw and dark wood, a triangular pennant of stiff brown hide stitched at the edges and hung from a crossbar, long black thorns bristling along the pole. Brown hide, straw gold, thorn black.",
    horn: "A HUNTING HORN: a long curved tapering tusk-like horn of yellowed bone, banded with dark knotted wood rings and a plaited carry-strap, a few glowing orange ember flecks inlaid near the mouthpiece. Bone yellow, dark wood, ember orange.",
};
for (const [id, subject] of Object.entries(TOOLS)) ART[`tool-${id}`] = [`${ITEM} ${subject}`, "item"];

// ── A SPRITE FOR EVERY RUNG ─────────────────────────────────────────────────────────────────────
// Luke: "you didnt show me each sprite for each level of each tool." One picture per slot was the
// original call — the ladder changes the number beside it, not the object — and it is wrong for the
// reason the recipes are built the way they are: tier VII is not a better rod, it is a rod made out of
// a DIFFERENT PLACE. A rod of comet thread and void rod has nothing in common with one of root and moss
// except what it is for.
//
// So each rung is drawn from its own map's three materials, which is exactly what its recipe asks for,
// and the craft gets finer as the ladder climbs: tier II is still lashed and found, tier XII is made by
// somebody who has done this eleven times before.
//
// ⚠️ TIER I IS NOT REDRAWN. The twelve originals are map one's rung and they are already approved; they
// are copied to the -t1 names by the companion step rather than redrawn, which saves the money and keeps
// the picture everybody has already seen.
const TOOL_NOUN = {
    rod: "FISHING ROD", pick: "PICKAXE", shovel: "SPADE", hammer: "SMITH'S HAMMER",
    hoe: "HOE", sextant: "SEXTANT", knife: "KNIFE", collar: "ANIMAL COLLAR",
    lantern: "HANDHELD LANTERN", loupe: "JEWELLER'S LOUPE", banner: "WAR STANDARD", horn: "HUNTING HORN",
};
// How well made it is, by rung. The materials carry the place; this carries the twelve maps of practice.
const CRAFT = [
    "", "crude and lashed together, clearly improvised from what was lying about",
    "roughly made but deliberate, the bindings even",
    "solidly made, the joints fitted rather than wrapped",
    "well made, with simple decoration cut into it",
    "finely made, balanced, with inlay at the joins",
    "expertly made, every surface worked",
    "masterfully made, ornamented without being fussy",
    "exquisite, the materials showcased rather than merely used",
    "a masterwork, unmistakably the best of its kind",
    "a legendary piece, worked beyond what the materials should allow",
    "an artefact, humming with the place it came from",
];
for (const map of GROVE_MAPS) {
    if (!map.parts || map.n < 2) continue;
    const byRole = {};
    for (const p of map.parts) if (!byRole[p.role]) byRole[p.role] = p;
    for (const [slot, roles] of Object.entries(TOOL_ROLES)) {
        const mats = roles.map((r) => byRole[r]).filter(Boolean);
        if (mats.length !== 3) continue;
        const made = mats.map((m) => `${m.name} (${m.blurb.replace(/\.$/, "")})`).join(", ");
        ART[`tool-${slot}-t${map.n}`] = [
            `${ITEM} A ${TOOL_NOUN[slot]} from ${map.name}, ${CRAFT[map.n - 1]}. MADE FROM: ${made}. The object must read unmistakably as a ${TOOL_NOUN[slot]} while being built entirely out of those three materials.`,
            "item",
        ];
    }
}

for (const [id, subject] of Object.entries(PARTS)) ART[`part-${id}`] = [`${ITEM} ${subject}`, "item"];

// ── MAPS TWO TO TWELVE: THE PLACES, THEIR RESIDENTS, AND WHAT COMES OFF THEM ────────────────────
// grove-maps.js designs eleven more maps — twelve zones, twelve creatures, twelve bosses and twelve
// materials each. This registers all four families so a map can be drawn as a unit:
//
//   node scripts/gen-grove-art.mjs --map 2            # price map two
//   node scripts/gen-grove-art.mjs --map 2 --apply    # draw it (48 images, about half an hour)
//
// ⚠️ A MAP IS DRAWN AS A WHOLE OR NOT AT ALL. Half a map is twelve zones where six have backdrops, which
// is worse than none: the zones with art look finished and the ones without look broken. MAPS_BUILT is
// what lets a member in, and it should only move when every one of these exists.
//
// The briefs lean on each map and each subject's own words rather than a generic fantasy prompt, because
// the whole reason the places were written first is that a Frostmere wolf and a Rotgarden husk should not
// come back looking like the same animal in two palettes.
const BIOME_LOOK = {
    burrow: "underground, earth and root, no sky",
    stone: "bare rock, cold grey light",
    moss: "wet green, standing water, soft edges",
    field: "open flat ground, low cover, big sky",
    bramble: "dense thorn and tangle",
    char: "burnt, black, ash underfoot",
    plank: "built timber, weathered and salvaged",
    glow: "lit from within by its own light source, dark around it",
    wood: "living forest, trunks and canopy",
    heart: "ancient overgrown green, everything older than it should be",
};

for (const map of GROVE_MAPS) {
    if (!map.zones) continue;

    for (const part of map.parts) {
        ART[`part-${part.id}`] = [`${ITEM} A ${part.name} from ${map.name}: ${part.blurb} It is a raw material, a single object, unmistakably from a place that is ${map.blurb}`, "item"];
    }

    for (const c of map.creatures) {
        const home = map.zones.find((z) => z.foes[0] === map.creatures.indexOf(c));
        const look = BIOME_LOOK[home?.biome] || "";
        // ⚠️ NO `foe-` IN THE KEY. The writer adds it for kind "foe" (see the note by `name` below),
        // and a key that carries it too lands as foe-foe-*.webp while the catalogue points at foe-*.webp.
        ART[c.id] = [`${FOE} THE CREATURE: a ${c.name} of ${map.name}. ${c.blurb} It lives where everything is ${look}, and it must look like it belongs there and nowhere else.`, "foe"];
    }

    for (const z of map.zones) {
        ART[`boss-${z.bossId}`] = [`${BOSS} THE BOSS: ${z.bossName}, which rules ${z.name} in ${map.name}. ${z.blurb} It is the largest and oldest thing in a place where everything is ${BIOME_LOOK[z.biome] || ""}, and it is kin to what wanders there rather than a bigger copy of it.`, "foe"];
        ART[`zone-${z.id}`] = [`${PLATE} THE PLACE: ${z.name}, in ${map.name}. ${z.blurb} The ground and everything in frame is ${BIOME_LOOK[z.biome] || ""}. ${map.blurb}`, "plate"];
    }
}

// ── ONE EMBLEM PER MAP ──────────────────────────────────────────────────────────────────────────
// Not one per creature: 132 passive stat stacks is a second stat system. Each map has a single mark,
// and it is the mark of the PLACE, which is why the brief is the map's own line rather than a monster.
for (const map of GROVE_MAPS) {
    if (!map.emblem) continue;
    ART[`emblem-${map.emblem.id}`] = [
        `${ITEM} ${map.emblem.name}: a small carved token or medallion, the mark of ${map.name} — ${map.blurb} Made from what that place is made of, worn smooth by being carried, hanging from a short cord.`,
        "item",
    ];
}

// --map N draws one whole map: its zones, creatures, bosses and materials.
const MAP_ARG = Number(arg("--map") || 0);
if (MAP_ARG) {
    const map = GROVE_MAPS.find((m) => m.n === MAP_ARG);
    if (!map?.zones) throw new Error(`map ${MAP_ARG} has no design to draw`);
    for (const part of map.parts) ONLY.push(`part-${part.id}`);
    for (const c of map.creatures) ONLY.push(c.id);
    for (const z of map.zones) { ONLY.push(`boss-${z.bossId}`); ONLY.push(`zone-${z.id}`); }
    if (map.emblem) ONLY.push(`emblem-${map.emblem.id}`);
}

for (const [id, subject] of Object.entries(EMBLEMS)) ART[`emblem-${id}`] = [`${ITEM} ${subject}`, "item"];
for (const [id, subject] of Object.entries(FOODS)) ART[`food-${id}`] = [`${ITEM} ${subject}`, "item"];

// ⚠️ A SLAB IS DRAWN WIDE. It is a 5:1 object, and asking for one in a square frame returns a short fat
// brick with air on both sides — which the three-slice then cuts its end caps out of, so the caps come out
// as empty transparent strips and the ledge loses both ends. The widest size on the menu is the nearest
// thing to its real shape.
const SIZES = { plate: "1536x1024", foe: "1024x1024", map: "1024x1536", item: "1024x1024",
    slab: "1536x1024", hang: "1024x1536", sit: "1536x1024" };

// A plate is a full-bleed backdrop; everything else is a die-cut sprite.
const OPAQUE = new Set(["plate", "map"]);

// ── --missing ── DRAW ONLY WHAT IS NOT ON DISK ───────────────────────────────────────────────────────────────
// A re-run of --map N redraws all forty-eight, which is money spent to replace files that already exist and
// were already looked at. This filters to the gaps, so an interrupted map costs what it is short and not what
// it is worth. The name on disk is derived the same way the writer derives it, below.
const MISSING_ONLY = process.argv.includes("--missing");
const fileFor = (key, kind) => (key.startsWith("bg-") ? key.replace(/^bg-/, "zone-")
    : (kind !== "foe" || key.startsWith("boss-")) ? key
    : `foe-${key}`);
let keys = Object.keys(ART).filter((k) => !ONLY.length || ONLY.includes(k));
if (MISSING_ONLY) {
    const before = keys.length;
    keys = keys.filter((k) => !fs.existsSync(path.join(OUT, `${fileFor(k, ART[k][1])}.webp`)));
    console.log(`  --missing: ${before - keys.length} already drawn, ${keys.length} to go`);
}
// ⚠️ PRICED BY KIND, NOT "plates and everything else". The old sum called every non-plate a creature at
// the square rate, which was true until the map arrived at 1024x1536 and silently under-quoted itself.
const byKind = {};
for (const k of keys) { const kind = ART[k][1]; byKind[kind] = (byKind[kind] || 0) + 1; }

let bill = 0;
for (const [kind, count] of Object.entries(byKind)) {
    console.log(`  ${kind}:`);
    bill += priceRun({ count, size: SIZES[kind], quality: Q });
}

console.log(`The Grove — ${keys.length} image(s): ${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(", ")}`);
console.log(`  quality ${Q}   estimated $${Number(bill).toFixed(2)}`);
console.log(`  reusing 9 existing sprites: rootrat, grub, thornling, badger, gourdling, barrowhound, warren-mother, voidmoth, ashwraith`);
if (!APPLY) { console.log("\ndry run — pass --apply to draw it"); process.exit(0); }
if (!KEY) throw new Error("no OPENAI_API_KEY");

fs.mkdirSync(OUT, { recursive: true });

let done = 0;
let spentTokens = 0;
let repairCost = 0;
for (const key of keys) {
    const [prompt, kind] = ART[key];
    // ── ⚠️ THE KEY DECIDES THE FILENAME, AND THE CATALOGUE HAS TO AGREE WITH IT ────────────────────
    // The rule used to be "plates keep their key, everything else gets foe-", which turned the boss keys into
    // foe-boss-glutmaw.webp while grove-catalog.js was pointing at boss-glutmaw.webp. Nothing errors: the
    // file writes, the catalogue path 404s, and the player gets a broken-image glyph where the boss should
    // be. A prefix that is already explicit in the key must not get a second one bolted on.
    const name = key.startsWith("bg-") ? key.replace(/^bg-/, "zone-")
        : (kind !== "foe" || key.startsWith("boss-")) ? key
        : `foe-${key}`;
    const file = path.join(OUT, `${name}.webp`);
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
            // ── ⚠️ 2.5 FLARE, NOT gpt-image-1 ──────────────────────────────────────────────────
            // gpt-image-1 shipped April 2025 and three generations have landed since: 1.5, 2, and 2.5.
            // We were still on the oldest one, paying the MOST for it — $40 per million output tokens
            // against $30 for 2.5.
            //
            // FLARE over SUNBURST on purpose. They cost the same per token; sunburst is "our most
            // capable model for image generation and editing" and flare is "our fastest model for
            // high-quality, everyday image generation". 160 game sprites at 44px in a bench row are
            // everyday, and the capable one plausibly burns more tokens per image for detail nothing
            // here renders.
            //
            // ⚠️ AND IT MAY FIX THE CLIPPING, WHICH IS WHY IT MATTERS MORE THAN THE PRICE. The crowns
            // are cut off because the model ignores a prompt that already says "NO part of the subject
            // may touch or run off any edge" — an instruction-following failure, which is the thing
            // that improves most between image model generations.
            model: MODEL,
            prompt,
            size: SIZES[kind],
            quality: Q,
            background: OPAQUE.has(kind) ? "opaque" : "transparent",
            output_format: "webp",
            n: 1,
        }),
    });
    if (!resp.ok) {
        console.log(`  FAILED ${key}: ${resp.status} ${(await resp.text()).slice(0, 160)}`);
        continue;
    }
    const data = await resp.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  FAILED ${key}: no image back`); continue; }
    // ⚠️ WHAT IT ACTUALLY COST, OFF THE RESPONSE. priceRun's table is hardcoded for gpt-image-1 and
    // OpenAI does not publish per-image token counts for 2.5 at all, so the estimate printed before the
    // run is a guess for this model. usage is not — it is what we are billed on. Luke: "Your price run
    // really hasn't been that accurate anyway."
    const u = data?.usage;
    if (u) {
        spentTokens += u.output_tokens || 0;
        console.log(`    usage: ${u.output_tokens} output tokens  (~$${(((u.output_tokens || 0) * 30) / 1e6).toFixed(4)} at $30/M)`);
    }
    let bytes = Buffer.from(b64, "base64");

    // ── ⚠️ IF THE CROWN RAN OFF THE TOP, REPAIR IT FROM ITSELF ────────────────────────────────────
    // Luke asked for this on every generation, and it is the synthesis of a whole evening: gpt-image-1
    // makes the right picture and sometimes draws it off the edge of the plate; 2.5 cannot make the right
    // picture but can fix one. So the fallback only ever runs on a sprite that is MEASURABLY broken, and
    // it is handed the drawing itself rather than a description of it.
    //
    // ⚠️ MEASURED, NOT ASSUMED, AND THE TEST IS A CONTIGUOUS RUN. A sprite whose highest pixel merely
    // grazes the top row is fine and most of them do — that is canvas fill, which IS on-stage scale. What
    // marks an amputation is a long FLAT run of opaque pixels along that row, where a silhouette should be
    // curving away. 40px of a 1024 plate; antler tips come in under it, a sliced head does not.
    //
    // ⚠️ AND THE ASK IS TINY. "Change one thing, keep everything else identical." Anything that invites
    // reinterpretation gets it: the same idea phrased as "finish the head, horns, antlers or flames" grew
    // antlers on a legless blob. Never name a body part; never offer a list.
    if (kind === "foe" && !OPAQUE.has(kind)) {
        const probe = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let run = 0, worst = 0;
        for (let x = 0; x < probe.info.width; x += 1) {
            if (probe.data[x * 4 + 3] > 6) { run += 1; worst = Math.max(worst, run); } else run = 0;
        }
        if (worst >= 40) {
            process.stdout.write(`    crown clipped (${worst}px flat) — repairing on ${REPAIR_MODEL} … `);
            const form = new FormData();
            form.append("model", REPAIR_MODEL);
            form.append("prompt", "Redraw this exact character in EXACTLY the same art style, same palette, "
                + "same brushwork, same line weight, same proportions and same pose. Change one thing only: "
                + "the top of it is cut off by the edge of the picture — draw it complete, with clear empty "
                + "space above, and make sure no part of the figure touches any edge of the frame. Keep "
                + "everything else identical. Transparent background.");
            form.append("size", SIZES[kind]);
            form.append("quality", Q);
            form.append("background", "transparent");
            form.append("output_format", "png");
            form.append("n", "1");
            form.append("image", new Blob([bytes], { type: "image/webp" }), "ref.webp");
            const rr = await fetch("https://api.openai.com/v1/images/edits", {
                method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: form,
            }).then((x) => x.json()).catch((e) => ({ error: { message: String(e) } }));
            const fixed = rr?.data?.[0]?.b64_json;
            if (!fixed) {
                // ⚠️ KEEP THE ORIGINAL. A failed repair must never lose the drawing we already paid for.
                console.log(`FAILED (${JSON.stringify(rr?.error || {}).slice(0, 90)}) — keeping the clipped one`);
            } else {
                const cand = Buffer.from(fixed, "base64");
                const after = await sharp(cand).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                let r2 = 0, w2 = 0;
                for (let x = 0; x < after.info.width; x += 1) {
                    if (after.data[x * 4 + 3] > 6) { r2 += 1; w2 = Math.max(w2, r2); } else r2 = 0;
                }
                // ⚠️ ONLY KEEP IT IF IT ACTUALLY HELPED. A repair that comes back just as clipped is a
                // worse picture for the same money; there is no reason to take it.
                if (w2 < worst) { bytes = await sharp(cand).webp({ quality: 92 }).toBuffer(); console.log(`fixed (${worst}px -> ${w2}px)`); }
                else console.log(`no better (${worst}px -> ${w2}px) — keeping the original`);
                const ru = rr.usage || {};
                repairCost += ((ru.output_tokens || 0) * 30 + (ru.input_tokens_details?.image_tokens || 0) * 8) / 1e6;
            }
        }
    }
    // ── ⚠️ WHAT THE MODEL HANDS BACK IS NEARLY UNCOMPRESSED ───────────────────────────────────────
    // gpt-image-1 returns webp at close to lossless, so every backdrop this script has ever written
    // landed on disk at 1.6 to 1.8 MB — for a picture shown at about 1,400px on the widest screen
    // anyone owns. Re-encoding the identical image at quality 90 is an 85% saving across the folder and
    // is indistinguishable side by side at display size. That is over a megabyte a member downloads to
    // walk into a zone, on a phone, and it was being spent on nothing.
    bytes = await sharp(bytes).webp({ quality: 90 }).toBuffer();
    // ── ⚠️ AN ITEM IS TRIMMED, AND THAT IS NOT COSMETIC ────────────────────────────────────────────
    // Two separate bugs are paid off by this one call. The air the model leaves around a small object is
    // dead weight at 3 units tall — trimming it is what lets the drop be drawn big enough to recognise.
    // And "transparent" comes back at alpha 1-2 rather than 0, so an untrimmed cutout carries a full-frame
    // fringe that CSS drop-shadow renders as a visible BOX: see sprite-alpha-floor-drop-shadow-box. A
    // threshold of 6 is above that floor, so it cuts the fringe as well as the air.
    if (kind === "item") {
        bytes = await sharp(bytes).trim({ threshold: 6 })
            .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 92 }).toBuffer();
    }
    // ── ⚠️ A SLAB AND A DECORATION ARE TRIMMED BUT NOT SQUARED ────────────────────────────────────
    // The `item` branch above pads everything back out to 256x256, which is right for a drop sitting in a
    // square box and wrong for both of these. A 5:1 slab padded into a square spends four fifths of its
    // pixels on air AND, far worse, moves its painted ends away from the image edges — border-image slices
    // from the EDGE, so the end caps would be cut out of the padding and the ledge would render with two
    // transparent stubs. A hanging vine has the same problem at the top: it must stay flush with the edge
    // it hangs from. So: trim to the paint, then scale on the long side only.
    if (kind === "slab") {
        // ⚠️ FORCED TO EXACTLY 1024x320, WHICH IS A SQUASH AND IS MEANT TO BE. The seven slabs come back
        // between 268 and 378 pixels tall, and the stylesheet derives its end-cap width from the slice
        // against the slab height — one constant, seven files. At their natural heights that constant is
        // right for one of them and stretches the caps on the other six. The slab is an abstract band of
        // material, so a few percent of vertical scale is invisible; a cap at the wrong aspect is not.
        bytes = await sharp(bytes).trim({ threshold: 6 })
            .resize(1024, 320, { fit: "fill" }).webp({ quality: 92 }).toBuffer();
    }
    // ⚠️ AND BOTH OF THOSE BRANCHES NEED THE ALPHA FLOOR CUT FIRST, WHICH THEY DO NOT DO HERE.
    // "Transparent" comes back at alpha 1-3, so trim() finds no border to cut and these came back at their
    // full canvas size with a fringe that CSS drop-shadow renders as a hard box around the sprite. Run
    // scripts/grove-decor-clean.mjs after any --apply that touches a slab, hang or sit; it zeroes the floor,
    // re-trims, and re-pins the slab geometry the stylesheet depends on.
    if (kind === "hang" || kind === "sit") {
        const img = sharp(bytes).trim({ threshold: 6 });
        const meta = await img.metadata();
        const long = Math.max(meta.width || 1, meta.height || 1);
        const k = Math.min(1, 384 / long);
        bytes = await img.resize({
            width: Math.max(1, Math.round((meta.width || 1) * k)),
            height: Math.max(1, Math.round((meta.height || 1) * k)),
        }).webp({ quality: 92 }).toBuffer();
    }
    fs.writeFileSync(file, bytes);
    done += 1;
    console.log(`  ${done}/${keys.length}  ${file}`);
}
console.log(`\n[ai-trace] gen-grove-art: ${done} OpenAI calls`);
