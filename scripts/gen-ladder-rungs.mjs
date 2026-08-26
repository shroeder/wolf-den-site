// A FIGHTER FOR EVERY RUNG ON THE LONG ROAD. One hundred of them, drawn as opponents.
//
// The road shipped sharing one plate across the nine non-champions of each house, so ten fighters with ten
// hand-written names — Bartra the Bootblack, The Thing in Seam Nine, Your Own Shadow — rendered as the same
// picture ten times. The names are the half of this feature that was authored; sharing a portrait throws that
// away at exactly the moment somebody is choosing who to walk up to.
//
// FULL-BODY COMBAT SPRITES, not portraits. The first pass drew busts, which is wrong twice over: the road
// list wants to show you who you are about to fight, and the ARENA puts the same art on the sand opposite your
// hero. A floating head does not stand on the ground beside a full-body fighter. Same pipeline as the Gauntlet
// tiers (scripts/lib/fighter-sprite.mjs): same style, same facing check, same deterministic frame — so a rung
// and a tier stand at the same scale in the same ring.
//
// Usage:  node scripts/gen-ladder-rungs.mjs [rung ...]     (no args = every missing one)
//         node scripts/gen-ladder-rungs.mjs --count        (price it before it runs)
//         node scripts/gen-ladder-rungs.mjs --reframe      (re-frame what is on disk; free)
//         node scripts/gen-ladder-rungs.mjs --sheet        (contact sheet of all 100; free)
//         node scripts/gen-ladder-rungs.mjs --flip 37 52   (mirror by hand; free)
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { facesLeft, fighterPrompt, frame, generate, inkMargins, shortSides } from "./lib/fighter-sprite.mjs";
import "./lib/ai-trace.mjs"; // every OpenAI call in this script lands in the AI Costs history

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const KEY = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) throw new Error("no OPENAI_API_KEY in accounting_app/local.properties");

const OUT = "public/images/arena/ladder";
fs.mkdirSync(OUT, { recursive: true });

// Rung → subject, written to that rung's own NAME. The house sets the palette and the world; the name sets
// the fighter. Nothing here is derived — a derived fighter is the shared plate again with extra steps.
const RUNGS = {
    // ── 1–10 THE YARD ── behind the tavern, for coin and pride. Working clothes, no armour, improvised weapons.
    1: "A cheerful young bootblack in a soot-stained apron and rolled sleeves, fists up in a clumsy boxing guard, brush still tucked in his belt.",
    2: "A weathered dock brawler missing one ear, flat cap, sleeves torn off, swinging a knotted length of rope.",
    3: "A thick-necked dock labourer in a salt-stained jerkin, a coil of rope over one shoulder, a cargo hook in his fist.",
    4: "A sharp-eyed gutter fighter in a patched hood and fingerless gloves, a short knife held low and reversed, crouched to spring.",
    5: "A grizzled old labourer with a grey beard, a heavy iron mattock resting on his shoulder, entirely unbothered.",
    6: "A broad bare-knuckle tavern champion with a flattened nose and a gold tooth, filthy prize sash over one shoulder, fists raised.",
    7: "A lithe acrobat balanced on the balls of his feet, rope coiled round one forearm, ready to tumble.",
    8: "A burly fishmonger woman in a rubber apron, filleting knife in one hand, a huge fish held like a club in the other.",
    9: "A stocky boxer woman with taped fists in a tight classic guard, braided hair, chin tucked.",
    10: "A hulking yard king in a scavenged leather harness, roaring, a nail-studded barrel stave gripped low across his body at waist height. His arms stay DOWN and the weapon stays BELOW his shoulders — nothing raised above his head.",   // pose authored to FIT: hoisted overhead, the stave left the frame on every roll
    // ── 11–20 THE WATCH ── municipal, disciplined, blue and steel.
    11: "A very young city watch recruit in an oversized blue tabard and a helmet slightly too big, gripping a spear too tightly.",
    12: "A watchman lamplighter in a blue cloak, a shuttered brass lantern raised in one hand, a baton in the other.",
    13: "A hard-faced watch sergeant in blue-trimmed mail with a sash and a short club, one hand raised in warning.",
    14: "A heavyset gate warden in blue enamelled plate with a closed visor, both gauntlets on a planted greatsword.",
    15: "A tall halberdier in a blue tabard, halberd levelled, one foot forward.",
    16: "A watchwoman of the night shift in dark blue mail with a hooded lantern at her belt, crossbow raised.",
    17: "A stout toll collector in a blue coat with a strongbox chained to his belt, a cudgel resting on his shoulder.",
    18: "A decorated watch captain in ornate blue plate with a white sash and a plumed helm, sword drawn and levelled.",
    19: "A grim watch officer with a silver whistle at his lips, blue steel gorget, twin batons crossed.",
    20: "A towering watch commander in blue-black officer's plate with a white plume, greatsword held two-handed at the guard.",
    // ── 21–30 THE PIT ── they do this for a living and they enjoy it. Sand, straps, showmanship.
    21: "A wiry sand-dusted pit fighter in a leather harness and studded straps, a short trident spun in one hand.",
    22: "Two identical grinning brothers back to back in matching bronze half-masks, a heavy cleaver each.",
    23: "A muscular arena duellist woman with a curved blade in each hand crossed before her, orange wrapped braid.",
    24: "A gaunt pit fighter with a fixed unsettling smile, arms spread wide, a curved knife in each hand.",
    25: "A thick-set brawler with a broken nose and a bronze shoulder guard, one huge studded gauntlet cocked back.",
    26: "An ash-streaked gladiator woman in charred orange leathers, a burning brand held out like a sword.",
    27: "A handsome showman gladiator in a gilded orange half-cape, playing to the crowd with a spear held loose.",
    28: "A scarred undefeated champion in heavy orange-strapped plate with a bronze laurel, sword and buckler set.",
    29: "A towering house champion in a snarling bronze beast-mask helm and layered orange armour, a chained flail.",
    30: "A colossal titan of the sand in bronze plate and sandstone, an enormous two-handed hammer raised overhead.",
    // ── 31–40 THE WOOD ── nobody sees them until it is decided. Green, hooded, quiet.
    31: "A hooded trapper in mottled green leathers holding a wire snare taut between both fists.",
    32: "A silent hooded hunter in deep green, face entirely in shadow, a hand axe in each hand, half crouched.",
    33: "A woman with bark-textured skin and moss in her braided hair, a green cloak, a knotted wooden staff.",
    34: "An archer in forest green with a longbow drawn to the cheek, green-fletched arrow nocked.",
    35: "A small feral scout crouched low, dirt under long nails, a green hood, a stone knife bared.",
    36: "A tall gaunt watcher in a green cloak painted with too many eyes, a hunting spear held level.",
    37: "A slight figure in green thorn-covered armour, thistles growing through the plates, twin thorn blades.",
    38: "A cloaked figure crowned with great branching antlers, glowing green eyes, a heavy antler-hafted axe.",
    39: "A still hooded woman in ancient green robes with ivy up one arm, a long green-glowing glaive.",
    40: "A colossal warden of roots, a humanoid mass of green timber and rope-like vines, huge wooden fists.",
    // ── 41–50 THE DEEP ── whatever the mine did not want. Pale, violet, wrong.
    41: "A scrawny pallid tunnel scavenger in filthy canvas with a candle strapped to his forehead, a rusted pick.",
    42: "A colourless hunched digger with skin like wet paper, pickaxe hefted, no whites to his eyes.",
    43: "A figure with a mass of guttering candles instead of hair, wax down the collar, a mining hammer.",
    44: "A pale malformed thing in shredded mining rags, too many joints in the arms, violet crystal at the jaw.",
    45: "A brutish miner whose lower jaw is grown over with grey stone, violet crystal teeth, twin rock hammers.",
    46: "A dust-choked figure wreathed in falling violet rubble, arms raised, half made of collapsing stone.",
    47: "A stern deep warden in violet-lacquered mining plate with a lantern of purple flame and a long pick.",
    48: "A blind mine foreman with violet crystal grown from the eye sockets, a heavy sledgehammer, listening.",
    49: "A silhouette of a miner made of solid shadow with two violet pinpricks for eyes, edges dissolving.",
    50: "An enormous humanoid mass of raw violet ore and black rock, crystal spines, fists like boulders.",
    // ── 51–60 THE TIDE ── came up the beach and did not leave. Soaked, teal, encrusted.
    51: "A drowned fisherwoman in rotted teal oilskins, salt crusted white, a gutting knife and a hook.",
    52: "A drowned boy in a soaked sailor's smock, far too pale, water pouring from his sleeves, a belaying pin.",
    53: "A drowned net-mender hunched with a bone needle and a weighted net ready to cast.",
    54: "A drowned sailor encrusted almost solid in barnacles and coral, one eye visible, swinging a coral club.",
    55: "A figure of curling teal water in the shape of a man, features barely holding, arms sweeping wide.",
    56: "A kelp-draped drowned walker, ribbons of seaweed trailing from outstretched arms, hollow sockets.",
    57: "A bloated drowned ship's cook in a filthy teal apron with a rusted cleaver and a stockpot lid for a shield.",
    58: "A drowned pirate captain in a barnacled greatcoat and tricorn, one arm a rusted anchor, cutlass drawn.",
    59: "A towering wall of teal water shaped like a hooded figure, curling forward to break.",
    60: "A vast drowned pilot in coral-fused armour, a harpoon the size of a mast, kraken ink swirling.",
    // ── 61–70 THE HALL ── old money, older grudges, sharpest steel. Gilt and silk.
    61: "A young noble squire in a gold-trimmed doublet, a helm under one arm and a training sword raised.",
    62: "An elegant duellist in white and gold, rapier extended in a perfect lunge, one white glove.",
    63: "An imperious noblewoman in gold brocade and a high lace collar, a slim blade drawn from a fan.",
    64: "A silver-haired swordmaster in gilded ceremonial half-plate, longsword held two-handed at the ready.",
    65: "A cold aristocrat in black and gold with one black leather glove, a thin duelling blade held low.",
    66: "A golden-haired heir in immaculate gilded armour with an ornate shield and an unmarked sword.",
    67: "A grim second in plain gold-trimmed black, holding two duelling swords, one for someone else.",
    68: "A gallant knight in polished gold filigreed plate with a red plume, lance couched.",
    69: "A shrewd elderly noble in heavy gold chains of office, a jewelled sceptre-mace in one hand.",
    70: "A regal figure in towering gold ceremonial war-plate on a throne-like base, greatsword planted, crowned.",
    // ── 71–80 THE ASH ── what the forge made and could not unmake. Molten, cracked, orange.
    71: "A soot-black apprentice boy with embers in his hair and cracked skin, forge tongs raised like a weapon.",
    72: "A huge smith whose chest is cracked open with orange fire inside, breathing smoke, a great bellows-hammer.",
    73: "A figure whose torso is a running furnace of orange slag, iron ribs, no face, molten fists.",
    74: "A steaming figure of half-cooled black metal, water hissing off it, a quenched blade in each hand.",
    75: "A master smith in a scorched apron and cracked iron mask, orange eye-slits, a colossal forge hammer.",
    76: "A humanoid of unfinished blade metal, one arm still a rough billet, orange heat along every edge.",
    77: "A veiled woman in charred black mourning cloth, forge-orange light behind the veil, twin hooked blades.",
    78: "A colossal figure with an anvil for a torso, orange fire between the plates, one enormous hammer.",
    79: "A warped armoured figure struck out of shape nine times, dents and cracks glowing orange, a bent greatsword.",
    80: "A vast primordial forge-god of black iron and lava, orange light pouring from every seam, hammer overhead.",
    // ── 81–90 THE VEIL ── it is not clear these are people. Violet, blurred, missing pieces.
    81: "A figure in drifting grey silks whose face is smeared away, violet light where eyes were, a curved blade.",
    82: "An ordinary swordsman rendered entirely in reversed violet tones, as if seen in a dark mirror.",
    83: "A hooded figure holding a stolen face on a stick before its blank head, a violet dagger in the other hand.",
    84: "An empty violet-black robe standing upright, nothing inside the hood, a sword floating where a hand should be.",
    85: "A tall shrouded figure with a clock face for a head, hands frozen, violet light bleeding from the dial.",
    86: "A hunched violet silhouette with far too many arms, each holding a different weapon, no features.",
    87: "A featureless violet figure with its mouth open impossibly wide, tilted, reaching out.",
    88: "A third spectral wolf-headed warrior in violet mist, two faint wolf shapes standing behind it.",
    89: "A person's own shadow standing up off the ground, violet-edged, holding a shadow of a sword.",
    90: "An enormous tear in the air shaped like a cloaked figure, violet void inside, reaching out with both arms.",
    // ── 91–100 THE CROWN ── the last ten. They are not sport.
    91: "The Den's first champion, an ancient gold-armoured warrior with a weathered laurel crown and a worn longsword.",
    92: "An undefeated champion in immaculate black and gold plate, closed helm, sword and tower shield set.",
    93: "A patient armoured figure rising from a seated guard in gold-inlaid armour, dust on the shoulders.",
    94: "A champion in Wolf Den gold and black with a snarling wolf-head pauldron and a banner-cape, axe raised.",
    95: "A one-eyed grizzled warlord in black and gold masterwork armour with a heavy fur mantle, greatsword low.",
    96: "A frost-rimed gold-armoured champion breathing white vapour, ice on the wolf-crest helm, frozen blade.",
    97: "A judge-like armoured figure in gold and black, a closed book in one hand and a warhammer in the other.",
    98: "A single armoured figure surrounded by the overlapping ghostly outlines of an entire wolf pack, twin blades.",
    99: "A colossal wolf-headed champion in black and gold god-plate, eyes burning gold, an enormous greataxe.",
    100: "The Wolf Den itself given shape — a titanic armoured wolf-warrior of black stone and gold, banners and chains hanging from its arms, a mountain of a greatsword.",
    // ═══ THE LONG ROAD · 101-200 ═══ bought at the Counter for 100,000 chips. The Crown is the last house
    // with a door on it; everything from here is what was on the other side.
    // ── 101–110 THE GATE ── pale blue, iron, hinges and bolts. Things that ARE the door, or guard it.
    101: "A gaunt doorward in pale blue-grey robes over iron scale, an enormous ring of black keys hanging at the hip, one hand raised flat in refusal.",
    102: "A hunched armoured figure whose shoulders and elbows are enormous iron door hinges, pivoting as it steps forward, fists like bolt heads.",
    103: "A broad squat warrior wearing a carved stone lintel across the shoulders like a yoke, arms braced beneath it, face set.",
    104: "A stern widow in mourning blue-grey with an iron turnkey's ring at her belt and a heavy key held reversed like a dagger.",
    105: "A massive shape of pale timber and iron banding leaning heavily forward as though pushing against something unseen, no face, hands splayed.",
    106: "A low wide guardian of pale stone shaped like a threshold slab risen upright, worn smooth in the middle, arms folded.",
    107: "A blue-steel automaton built like a sliding door-bolt, one arm a long squared bar that shoots forward, faceplate blank.",
    108: "A wiry keeper in a pale blue hood covered in hanging latches and clasps, a lockpick in one hand and a hooked bar in the other.",
    109: "A tall thin figure of black iron hinged in five places along its body, folding and unfolding, pale blue light in the joints.",
    110: "The Gate itself given shape — a colossal iron-banded doorway walking on two stone legs, pale blue light blazing through the gap between its halves, its arms two enormous bolts held DOWN and CROSSED at waist height. Nothing raised above the shoulders.",
    // ── 111–120 THE WASTE ── dust ochre and rust. Sun-cured, thirsty, nothing green.
    111: "A leathery salt-crusted wanderer in sun-bleached wrappings and a wide ragged hat, a chipped machete in one hand, lips cracked.",
    112: "A desiccated figure of cracked ochre skin stretched over bone, mouth open far too wide, reaching with both hands.",
    113: "A wanderer whose feet and shins are fused into rough desert glass, staggering forward, a shard of the same glass gripped as a blade.",
    114: "A hollow-cheeked survivor nine days without water, sun-blistered, dragging a heavy chain, eyes fixed and glassy.",
    115: "A stooped grey figure balancing a stack of flat cairn stones on its shoulder, one stone raised low in the other hand as a hammer.",
    116: "A towering matriarch armoured in riveted sheets of orange rust, a rust-eaten anchor chain wound round one arm.",
    117: "A ragged silhouette made of blowing ochre dust barely holding a human shape, tattered cloth streaming sideways.",
    118: "A gaunt well-keeper in bleached robes hunched over a battered iron bucket held like a shield, a well-hook in the free hand.",
    119: "A bloated sand-swollen thing with an open funnel of a mouth, sand pouring continuously from its cupped hands.",
    120: "The Waste entire given shape — a vast humanoid dune of ochre sand and bleached bone with a sun-cracked skull for a head, arms hanging LOW and heavy at its sides, sand streaming off its knuckles. Nothing raised above the shoulders.",
    // ── 121–130 THE CHOIR ── warm gold and bone white. Certain, armed, and singing.
    121: "A young novice in a plain white cassock with a gold sash, holding a censer on a chain in a nervous two-handed grip.",
    122: "A robed singer in white and gold with the mouth open mid-note, gold light spilling from the throat, a bladed hymn-stand held forward.",
    123: "A stocky censer-bearer swinging a heavy brass thurible on a long chain, smoke trailing, gold-trimmed white robes.",
    124: "A tall serene woman in white and gold holding one long note, hands clasped, a ring of gold light suspended around her head.",
    125: "A slender chorister in layered white robes with a second faint gold figure singing in unison a half-step behind, blade drawn.",
    126: "A thickset bell-ringer in gold-trimmed white gripping a heavy bell-rope, a hand bell the size of a helmet in the other hand.",
    127: "A silent brother in a white cowl with a gold band sealing the mouth, both hands on a plain heavy mace.",
    128: "A grave cantor in ornate white and gold vestments with a gilded pitch-fork tuning rod raised low, eyes closed.",
    129: "A radiant figure formed of a hundred overlapping gold notation marks in a rough human shape, arms outstretched.",
    130: "The Choirmaster — a towering conductor in white and gold vestments with a mane of white hair, a long gold baton held LOW across the body at waist height, gold light pouring from the open mouth. Arms stay DOWN.",
    // ── 131–140 THE VAULT ── cold institutional grey-blue. Catalogued, sealed, labelled.
    131: "A humanoid figure wrapped entirely in grey preservation cloth and bound with numbered brass wire, straining against the wrapping.",
    132: "A confused creature of mismatched parts in a grey collections smock, two left arms, head slightly too small.",
    133: "A featureless grey figure that the eye slides off, edges blurring, one clearly solid iron bar held in both hands.",
    134: "A hunched thing crouched inside the frame of a grey iron display case, gripping the bars from within, pale eyes.",
    135: "A perfectly still armoured figure in muted grey-blue with a padded helm, absorbing all sound, gauntlets raised in a boxer's guard.",
    136: "A tall pallid specimen in a grey containment harness with brass fittings and a numbered tag at the throat, arms outstretched.",
    137: "A stooped grey-coated curator with a lantern and a ledger chained to the wrist, a brass-tipped cane raised as a weapon.",
    138: "A bound figure in grey canvas restraints stamped with brass seals, straps snapping, shoulders forward.",
    139: "A dusty crouched thing from the back of a shelf, grey and long-limbed, knuckles on the ground, pale eyes.",
    140: "The Accession — an enormous grey-blue vault door risen as a warrior, brass dials and numbered plates set into its chest, its two arms heavy locking bars held DOWN and crossed at the waist, cold blue light at the seams. Nothing above the shoulders.",
    // ── 141–150 THE STORM ── steel blue and white. Weather that came looking for you.
    141: "A lean figure of white spray and blue wind in a streaming oilskin, leaning hard into its own gale, a boat hook levelled.",
    142: "A brass-and-glass automaton with a huge barometer dial set in its chest, needle swinging, heavy brass fists raised.",
    143: "A tall gaunt wind-thing of blue-white air with streaming ragged sleeves, arms sweeping wide, hair horizontal.",
    144: "A perfectly calm figure in still white robes standing in a ring of dead air, blue chaos behind, hands empty and open.",
    145: "A broad armoured brute of blue-white ice studded with hailstones, both fists clenched, frost breath.",
    146: "A rider hunched low on the leading edge of a rolling blue-black cloud bank, a lightning-forked lance held level.",
    147: "A towering wall of blue-green water frozen mid-break in a rough human shape, one arm curling forward to fall.",
    148: "A colossal-shouldered figure of blue-black thunderhead cloud with white light flickering inside its chest, fists low.",
    149: "A small hunched survivor in a battered blue coat shielding one guttering lantern flame, a broken oar as a club.",
    150: "The Whole Sky — a vast figure of blue-black storm cloud shot through with white lightning, a crown of rain at its brow, its enormous arms hanging DOWN with lightning arcing between the knuckles. Nothing raised above the shoulders.",
    // ── 151–160 THE HOLLOW ── muted violet and grey. Not that they want something. They ARE the wanting.
    151: "A thin violet-grey figure clutching its own hollow stomach with both hands, ribs showing, mouth a dark absence.",
    152: "A bloated pale-violet thing with a second smaller mouth opening in its chest, both hands cupped and reaching.",
    153: "A half-formed grey figure with one recognisable human arm and the rest unfinished violet vapour, reaching with the real hand.",
    154: "A tall faceless violet shape that is nothing but an enormous vertical open mouth from crown to waist, arms spread wide.",
    155: "A grey-violet glutton with far too many thin arms, every hand grasping, a small hunched head.",
    156: "A politely dressed violet-grey figure in a threadbare formal coat, hat in hand, smiling with far too many teeth.",
    157: "A familiar-looking hollow twin in muted violet, the same shape as a person but empty inside, arms slack and reaching.",
    158: "A heavy contented violet-grey mass with a distended middle and small clawed hands, remembering, mouth wet.",
    159: "A skeletal violet ascetic drawn tight over bone, utterly still, both hands folded, eyes two pits.",
    160: "The Hunger itself — a colossal violet-grey figure that is mostly a yawning void where a torso should be, ribs framing the dark, its long arms hanging DOWN with fingers splayed toward the ground. Nothing above the shoulders.",
    // ── 161–170 THE ORRERY ── brass, copper, violet enamel. Machinery told to keep going.
    161: "A brass automaton with a huge escapement wheel turning in its chest, ticking, one arm a pivoting anchor-shaped bar.",
    162: "A copper-plated fighter with three meshed gears for a shoulder joint, a toothed gear-edged blade in one hand.",
    163: "A squat brass machine with an enormous lead counterweight on a chain over one shoulder, swinging it low.",
    164: "A tall clockwork soldier of violet enamel and brass with a visible coiled mainspring spine, sabre levelled.",
    165: "A brass figure with an oversized winding key permanently set in its back, running down, one arm still raised.",
    166: "A small dense brass automaton shaped like a catch that stops a wheel, planted and immovable, both fists set.",
    167: "A half-ruined brass frame with only its chest mechanism still turning, dragging one dead leg, a pipe as a club.",
    168: "A lopsided copper automaton with one gear tooth visibly snapped, shuddering, a bent brass bar held two-handed.",
    169: "A stately violet-and-brass clockwork noble making its final rotation, both hands on a slender gold-toothed rapier.",
    170: "The Great Wheel — an enormous brass orrery risen as a warrior, concentric violet-enamelled rings turning through its torso, its heavy brass arms held DOWN and slightly forward, small planets orbiting its waist. Nothing above the shoulders.",
    // ── 171–180 THE LONG DARK ── near-black with cold slate blue. The distance between everything.
    171: "A figure that appears twice, slightly offset, in cold slate blue against black, both versions reaching.",
    172: "A tall black silhouette rimmed in faint blue frost, breath crystallising, long thin arms lowered.",
    173: "An incomplete black outline of a warrior that never fully arrived, blue starlight showing through the gaps, sword half-formed.",
    174: "A slowly tumbling black figure caught mid-drift, weightless, one arm trailing, slate blue highlights.",
    175: "A black figure seen from behind that is somehow also facing you, blue rim light on both sides at once.",
    176: "A dense black umbral shape with a hard blue edge, entirely lightless within, fists clenched at its sides.",
    177: "A long-limbed traveller of matte black with faint blue road-dust on its shins, walking staff held level.",
    178: "An utterly nondescript grey-black humanoid with no distinguishing feature whatsoever, plain and forgettable, fists up.",
    179: "A black figure falling endlessly downward but standing upright, hair and cloak streaming up, blue void behind.",
    180: "The Dark entire — a vast void-black figure with cold blue starlight where a face should be, so lightless it reads as a hole in the picture, its enormous arms hanging DOWN. Nothing raised above the shoulders.",
    // ── 181–190 THE FIRST ── deep green and old stone. Here before the road was.
    181: "A primordial figure of moss-veined grey stone with a carved spiral for a face, a stone-headed club held low.",
    182: "A rough humanoid of green-lichened rock, clearly copying a human stance without understanding it, arms up wrong.",
    183: "An ancient brawler in cured hide and green-stained bone, older than any technique, fists raised in a stance nobody teaches.",
    184: "A tall green-grey figure with one enormous unhealed gash down its whole body, holding the wound closed with one hand.",
    185: "A gnarled root-and-stone giant with a great trailing beard of green moss, one root-knot fist lowered.",
    186: "An elder shape of standing stone worn almost featureless, deep green in its hollows, arms folded across its chest.",
    187: "A grave green-cloaked ancient demonstrating a perfect fighting guard, stone hands, patient eyes.",
    188: "A hunched moss-covered figure nursing an ancient resentment, green stone knuckles dragging, head low.",
    189: "A single immense weathered menhir risen upright with two thick stone arms and green lichen crawling up it, fists low.",
    190: "The First of All — a colossal figure of black primordial stone veined in deep green light, a spiral carved where the face should be, its enormous arms hanging DOWN and slightly open. Nothing raised above the shoulders.",
    // ── 191–200 THE SUN ── white-gold and blinding. The end of the road.
    191: "A figure wreathed in a ragged white-gold corona, its own outline hard to fix, arms outstretched and burning.",
    192: "A white-hot armoured warrior too bright to look at directly, gold light bleeding from every joint, sword lowered.",
    193: "A brilliant white-gold figure that throws no shadow at all on the ground beneath it, arms at its sides.",
    194: "A pitiless white-armoured champion at absolute noon, a gold disc at its back, greatsword held low and level.",
    195: "A pale figure of the white hour in bleached gold robes, features washed out to nothing, both hands open.",
    196: "A white-gold warrior with a single enormous unblinking golden eye set in its chest, spear levelled.",
    197: "A weary gold-armoured figure cupping the very last warmth in both hands, dimming, head bowed.",
    198: "A blazing white-gold champion refusing to set, planted, gold banner-cape streaming upward, blade lowered.",
    199: "A perfect white-gold duellist at the final degree of an arc, sword extended level, utterly still.",
    200: "The Sun itself given shape — a titanic white-gold figure of pure light in the rough armour of a warrior, a blinding corona behind its head, its enormous arms hanging DOWN with molten gold light dripping from the fingertips. Nothing raised above the shoulders.",
};

const want = process.argv.slice(2);

// ── node scripts/gen-ladder-rungs.mjs --facing ── re-ask which way each sprite looks and mirror the ones
// that came back facing left. The check runs once during generation, but one vision call per sprite gets a
// handful wrong, and a sprite facing left is mirrored by the arena into facing AWAY from your hero — two
// fighters standing back to back. Flipping is free and lossless, so this is worth a second pass over the set.
if (want.includes("--facing")) {
    const files = fs.readdirSync(OUT).filter((n) => n.startsWith("rung-") && n.endsWith(".webp"));
    const flipped = [];
    const queue = [...files];
    await Promise.all(Array.from({ length: 6 }, async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
            const fp = path.join(OUT, f);
            const buf = fs.readFileSync(fp);
            if (!(await facesLeft(buf, KEY).catch(() => false))) continue;
            fs.writeFileSync(fp, await frame(buf, { flip: true }));
            flipped.push(f.replace("rung-", "").replace(".webp", ""));
        }
    }));
    console.log(flipped.length ? `mirrored ${flipped.length}: ${flipped.sort((a, b) => a - b).join(", ")}` : "every sprite already faces right");
    process.exit(0);
}

// ── THE ONLY AUDIT THAT WORKS ────────────────────────────────────────────────────────────────────────────────
// A contact sheet, read by eye. Two defects in this set are invisible to every automatic check we have:
//
//   AMPUTATION — the model draws a figure whose legs stop flat at the shin. frame() trims to the content box
//   and pads it, so an amputated fighter comes out neatly centred with a healthy border and passes the margin
//   audit with full marks. A bounding box cannot tell a whole figure from half of one.
//
//   FACING — worth stating plainly because there is a --facing pass in this file that looks like the answer
//   and is not. A vision model asked "which way is this facing?" flip-flops: on the fleet captains it flipped
//   twelve, then re-read its own output and called ten of those left-facing again. Trusting it a second time
//   is how a set ends up worse than it started. Read the sheet, then --flip the ones that are wrong by hand.
// `--ingame` mirrors every cell, which is what ArenaClient does to a foe at render time ("a foe's rest pose is
// scaleX(-1)", supplied by arBreatheFoe). Read THAT sheet for facing: the source art is not the picture the
// player gets, and holding the mirror in your head across a hundred figures is how a wrong-facing fighter
// survives an audit. In the --ingame sheet anything facing RIGHT is facing away from the hero.
if (want.includes("--sheet")) {
    const inGame = want.includes("--ingame");
    const nums = Object.keys(RUNGS).map(Number).filter((n) => fs.existsSync(path.join(OUT, `rung-${n}.webp`))).sort((a, b) => a - b);
    const cell = 260, cols = 10, rows = Math.ceil(nums.length / cols);
    const comp = [];
    for (let i = 0; i < nums.length; i += 1) {
        const img = sharp(path.join(OUT, `rung-${nums[i]}.webp`))
            .resize(cell - 12, cell - 12, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
        comp.push({
            input: await (inGame ? img.flop() : img).png().toBuffer(),
            left: (i % cols) * cell + 6, top: Math.floor(i / cols) * cell + 6,
        });
    }
    const out = inGame ? "road-sheet-ingame.png" : "road-sheet.png";
    await sharp({ create: { width: cols * cell, height: rows * cell, channels: 4, background: { r: 250, g: 250, b: 252, alpha: 1 } } })
        .composite(comp).png().toFile(out);
    console.log(`wrote ${out} — ${nums.length} fighters, ${cols} across (row 1 = rungs 1-10, row 2 = 11-20, …)`);
    console.log(inGame ? "As the fight screen shows them. Anything facing RIGHT is facing away — --flip it."
        : "Source art. Add --ingame for the picture the player actually gets.");
    process.exit(0);
}

// Mirror by hand, after reading the sheet. Lossless and free.
if (want.includes("--flip")) {
    const ns = want.filter((a) => /^\d+$/.test(a));
    if (!ns.length) throw new Error("--flip needs at least one rung number");
    for (const n of ns) {
        const p = path.join(OUT, `rung-${n}.webp`);
        if (!fs.existsSync(p)) { console.log("skip (missing):", n); continue; }
        fs.writeFileSync(p, await sharp(fs.readFileSync(p)).flop().webp({ quality: 92 }).toBuffer());
        console.log("flipped", n);
    }
    process.exit(0);
}

if (want.includes("--reframe")) {
    for (const f of fs.readdirSync(OUT).filter((n) => n.startsWith("rung-") && n.endsWith(".webp"))) {
        const p = path.join(OUT, f);
        fs.writeFileSync(p, await frame(fs.readFileSync(p)));
    }
    console.log("reframed");
    process.exit(0);
}

const nums = want.filter((a) => /^\d+$/.test(a)).map(Number);
const todo = Object.keys(RUNGS).map(Number)
    .filter((n) => (nums.length ? nums.includes(n) : !fs.existsSync(path.join(OUT, `rung-${n}.webp`))))
    .sort((a, b) => a - b);

if (want.includes("--count")) {
    console.log(`${todo.length} to draw · ~$${(todo.length * 0.042).toFixed(2)} at medium, plus one vision call each for facing`);
    process.exit(0);
}
if (!todo.length) { console.log("nothing to do"); process.exit(0); }
console.log(`generating ${todo.length} fighters (~$${(todo.length * 0.042).toFixed(2)})`);

const queue = [...todo];
let done = 0; const failed = []; const cropped = [];
await Promise.all(Array.from({ length: 4 }, async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
        try {
            let buf = null;
            let short = [];
            // Three rolls at most: the framing is a prompt instruction, and prompts are advice, not a contract.
            for (let roll = 1; roll <= 3; roll += 1) {
                // A RE-ROLL ALONE DOES NOT FIX A SLICED HEAD. Rungs 9 and 19 each burned all three rolls
                // coming back at top 0.0%: the model composes a character to FILL its canvas, so asking
                // again asks for the same composition. What moves it is telling the later rolls to pull the
                // camera back, which costs nothing downstream because frame() rescales the ink to one
                // standard size however it arrives. And a slice cannot be repaired after the fact — frame()
                // trims to ink and never crops, so a cut crown just gets a tidy margin drawn around it.
                const zoomOut = roll === 1 ? "" : " CRITICAL FRAMING: zoom the camera OUT and draw the character"
                    + " SMALL in the frame, filling only the central 65% of the image height. There must be a"
                    + " large band of empty transparent space above the top of the head and below the feet."
                    + " The head must be nowhere near the top edge.";
                const candidate = await generate(fighterPrompt(RUNGS[n]) + zoomOut, KEY);
                short = shortSides(await inkMargins(candidate));
                buf = candidate;                 // keep the last one so a stubborn subject still ships
                if (!short.length) break;
            }
            if (short.length) cropped.push(`${n} (${short.join(", ")})`);
            const flip = await facesLeft(buf, KEY).catch(() => false);
            fs.writeFileSync(path.join(OUT, `rung-${n}.webp`), await frame(buf, { flip }));
            done += 1;
            console.log(`✓ ${n}${flip ? " (mirrored)" : ""}`);
        } catch (e) { failed.push(n); console.log(`✗ ${n}: ${e.message}`); }
    }
}));
console.log(`\nDONE — ${done}/${todo.length}`);
if (cropped.length) console.log(`STILL TIGHT AT THE EDGE: ${cropped.join(", ")}`);
if (failed.length) { console.log(`FAILED: ${failed.join(", ")}`); process.exit(1); }
