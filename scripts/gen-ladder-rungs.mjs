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
import fs from "node:fs";
import path from "node:path";

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
    10: "A hulking yard king in a scavenged leather harness, a barrel stave studded with nails hoisted overhead, roaring.",
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
};

const want = process.argv.slice(2);

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
                const candidate = await generate(fighterPrompt(RUNGS[n]), KEY);
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
