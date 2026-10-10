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

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
const OUT = "public/images/grove";
const APPLY = process.argv.includes("--apply");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ONLY = (arg("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const Q = quality();

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

// key → [prompt, kind]
const ART = {
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

for (const [id, subject] of Object.entries(PARTS)) ART[`part-${id}`] = [`${ITEM} ${subject}`, "item"];
for (const [id, subject] of Object.entries(EMBLEMS)) ART[`emblem-${id}`] = [`${ITEM} ${subject}`, "item"];
for (const [id, subject] of Object.entries(FOODS)) ART[`food-${id}`] = [`${ITEM} ${subject}`, "item"];

const SIZES = { plate: "1536x1024", foe: "1024x1024", map: "1024x1536", item: "1024x1024" };

// A plate is a full-bleed backdrop; everything else is a die-cut sprite.
const OPAQUE = new Set(["plate", "map"]);

const keys = Object.keys(ART).filter((k) => !ONLY.length || ONLY.includes(k));
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
            model: "gpt-image-1",
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
    let bytes = Buffer.from(b64, "base64");
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
    fs.writeFileSync(file, bytes);
    done += 1;
    console.log(`  ${done}/${keys.length}  ${file}`);
}
console.log(`\n[ai-trace] gen-grove-art: ${done} OpenAI calls`);
