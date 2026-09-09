// ── A PICTURE FOR EVERY POTION AND EVERY TRINKET ─────────────────────────────────────────────────────────────
// Both lists were drawn with ONE shared glyph: every potion in the game was `ui-potion.png` and every trinket
// was `ui-heart.png`, which is fine as a placeholder in the map's top bar and fatal on the merchant's shelf —
// a shop is a row of things you are choosing BETWEEN, and three identical bottles is not a choice, it is a
// list with pictures on it. Luke, on the merchant: "it doesn't Slay the Spire." Theirs draws every potion and
// every relic as its own object, and that is most of what a shop screen IS.
//
// Driven off PERKS and POTIONS in cards-kit rather than off a list here, so a new one authored in the rules
// gets its art by re-running this — the same reason the chrome generator reads RARITY_META instead of naming
// colours. A perk with no file falls back to the old glyph, so the rules are never blocked on the art.
//
// Run:  node scripts/gen-card-items.mjs [--force] [--only whetstone,blood]
import fs from "node:fs";
import sharp from "sharp";
import { housePrompt } from "../src/lib/marketplace/art-style.js";
import { BOSS_PERKS, PERKS, POTIONS } from "../src/lib/marketplace/cards-kit.js";

// ── AND THE HUNDRED AND TWENTY-FOUR NOBODY WAS GOING TO HAND-WRITE ───────────────────────────────────────
// The catalogue went to 180 trinkets and 50 bottles to stand where theirs stands, and 124 of them arrived
// with no picture. A trinket with no file renders as an empty gap on the strip, so this is not optional
// polish — it is the difference between a trinket existing and a trinket being invisible.
//
// Hand-writing 124 was not going to happen and one template would have drawn 124 of the same object. What
// makes this composable is that the NAMES are already objects: a Dried Fig, a Bark Bracer, a Filed Tooth, a
// Red Bell, an Ash Hourglass. So the name IS the subject, and the only thing that has to be supplied is the
// material and the treatment — which comes off the trinket's dominant hook, so a thing that guards is drawn
// in iron and hide and a thing that heals is drawn in linen and clay.
//
// A hand-written entry in PERK_ART or POTION_ART always wins. The ones written by hand are better than
// anything composed, and this is a floor rather than a replacement.
const HOOK_LOOK = [
    ["block", "forged in dark iron and boiled hide, dented and scarred from use"],
    ["blockEach", "forged in dark iron and boiled hide, dented and scarred from use"],
    ["blockTurn2", "forged in dark iron and boiled hide, dented and scarred from use"],
    ["blockKeeps", "forged in dark iron and boiled hide, dented and scarred from use"],
    // The keyword trinkets and bottles added with Dexterity, Poison, Artifact, Regeneration and Intangible.
    // Every one of these arrived with a hook this table had never seen, fell through to the default look and
    // then to no file at all — five trinkets and four bottles drawn as an empty gap on the shelf.
    ["dexterity", "spun from pale silk and smooth glass, light and finely balanced"],
    ["dexterityEach", "spun from pale silk and smooth glass, light and finely balanced"],
    ["poisonAll", "glistening and faintly wet, in sickly green and dark chitin"],
    ["artifact", "carved from pale warding stone and cut with one hard geometric seal"],
    ["regen", "green and still living, with new growth and damp bark on it"],
    ["intangible", "half there, pale and smoke-like, its edges going translucent"],
    ["thorns", "bristling and sharp-edged, made of something that would hurt to hold"],
    ["firstAttackBonus", "wrought in bright steel and lacquer, kept sharp and ready"],
    ["strength", "wrought in bright steel and bone, heavy in the hand"],
    ["strengthLow", "wrought in bright steel and bone, heavy in the hand"],
    ["strengthEach", "wrought in bright steel and bone, heavy in the hand"],
    ["startDamageAll", "smouldering, with heat shimmer and a dull orange glow inside it"],
    ["onKillEnergy", "strung on a leather thong and marked with small tally scratches"],
    ["onKillDraw", "strung on a leather thong and marked with small tally scratches"],
    ["vulnerableAll", "chalked and pigment-stained, the marks fresh and smudged"],
    ["weakAll", "chalked and pigment-stained, the marks fresh and smudged"],
    ["frailAll", "chalked and pigment-stained, the marks fresh and smudged"],
    ["vulnBonus", "chalked and pigment-stained, the marks fresh and smudged"],
    ["healAfter", "clean linen and glazed clay, plain and well kept"],
    ["healAfterLow", "clean linen and glazed clay, plain and well kept"],
    ["healBonus", "clean linen and glazed clay, plain and well kept"],
    ["restBonus", "soft and worn, the colours faded from long use"],
    ["potionSlots", "oiled leather and brass, fitted and buckled"],
    ["potionLuck", "oiled leather and brass, fitted and buckled"],
    ["healPerPotion", "oiled leather and brass, fitted and buckled"],
    ["energy", "crackling faintly, with a hard bright light caught inside it"],
    ["energyEach", "crackling faintly, with a hard bright light caught inside it"],
    ["draw", "light and quick-looking, worn smooth where a hand holds it"],
    ["drawEach", "light and quick-looking, worn smooth where a hand holds it"],
    ["offerPlus", "light and quick-looking, worn smooth where a hand holds it"],
    ["emberPerWin", "tarnished brass and old coin, with a warm coppery shine"],
    ["embers", "tarnished brass and old coin, with a warm coppery shine"],
    ["removalCut", "tarnished brass and old coin, with a warm coppery shine"],
    ["eggUpgrades", "smouldering, with heat shimmer and a dull orange glow inside it"],
    ["maxHpPerElite", "carved from antler and dark wood, old and much handled"],
    ["maxHp", "carved from antler and dark wood, old and much handled"],
    ["revive", "carved from antler and dark wood, old and much handled"],
];

function lookFor(def) {
    for (const [hook, look] of HOOK_LOOK) if (def[hook]) return look;
    return "old and much handled, its surface worn smooth";
}

// "The Long Wind-Up" -> "the long wind-up". The article is kept when the name carries one, because "A The
// Great Bell" is the shape of every bad generated prompt ever written.
function asSubject(name) {
    const n = String(name).trim();
    return /^(a|an|the)\s/i.test(n) ? n[0].toLowerCase() + n.slice(1) : `a ${n.toLowerCase()}`;
}

// ⚠️ A BOTTLE HAS TO LOOK LIKE A BOTTLE. Composed from the name alone, "Hedge Oil" came back as a spiky
// burr — a perfectly good picture of the wrong kind of object. A potion is chosen off a shelf beside two
// others and its whole silhouette language is vessels, so the subject SAYS vessel and the name becomes what
// is inside it. A trinket has no such constraint: it is whatever the name says it is.
const composedItem = (def, potion = false) => (potion
    ? `a stoppered glass bottle of ${String(def.name).replace(/^(a|an|the)\s+/i, "").toLowerCase()}, `
        + `${lookFor(def)}, the liquid inside catching the light`
    : `${asSubject(def.name)}, ${lookFor(def)}`);
import "./lib/ai-trace.mjs";

const props = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/local.properties", "utf8");
const key = props.match(/OPENAI_API_KEY=(.+)/)?.[1]?.trim();
if (!key) throw new Error("no OPENAI_API_KEY");

// ⚠️ DRAWN AT 34-64px ON A SHELF. Everything here is judged at thumbnail size beside two others, so what it
// needs is a SILHOUETTE that differs from its neighbours — a squat round flask next to a tall thin phial next
// to a horn — not interior detail that the downscale eats. Say the shape, not the filigree.
const SMALL = "Drawn as ONE single object seen straight on from the front, filling most of the frame, with a "
    + "bold unmistakable silhouette that stays readable shrunk to the size of a thumbnail. No hand holding it, "
    + "no table under it, no scene, no second object beside it.";

// ── THE BOTTLES ──────────────────────────────────────────────────────────────────────────────────────────────
// Shape says what it does before the colour does: the healing one is a fat round belly, the energy one is a
// spark in a jar. Colour is the second read and it matches the number the potion moves.
const POTION_ART = {
    swift: "A tall slender glass phial with a long narrow neck and a waxed cork, filled with swirling pale "
        + "silver-blue liquid that streams upward inside the glass like wind caught in a bottle.",
    blood: "A fat round-bellied glass flask with a short neck and a cork stopper, filled to the shoulder with "
        + "thick glowing crimson liquid, a soft red light coming from inside it.",
    bark: "A squat heavy stoppered jar of thick green-brown liquid, its glass wrapped in a collar of birch "
        + "bark and bound with twine, with a knot of dark wood grain visible through the murk.",
    fury: "A stout glass bottle shaped like a clenched fist, filled with churning molten orange liquid that "
        + "throws sparks against the glass, its neck bound in a strip of red leather.",
    spark: "A small round jar of clear glass sealed with a brass cap, with a bright crackling arc of yellow "
        + "white lightning caught and turning inside it, lighting the glass from within.",
    // ── THE SIX THAT ANSWER A ROOM ── see the note in POTIONS. Shape first: a flask you throw is not the
    // same silhouette as a flask you drink, and at 34px the silhouette is all there is.
    fire: "A round glass grenade-flask with a heavy sealed neck and a short fuse of waxed cord, filled with "
        + "churning orange fire that presses against the glass, bright and about to go.",
    fear: "A tall crooked black glass phial with a bone stopper, filled with roiling violet smoke that has "
        + "shapes moving in it, the glass fogged from the inside.",
    sap: "A wide-bellied jar of cloudy grey-green sap, thick and slow, its cork sunk deep and a dull weight "
        + "to it, a dead leaf stuck to the glass.",
    salve: "A shallow round tin pot with its lid off beside it, packed with pale green ointment, a smear of "
        + "it on the rim and a clean linen strip folded under.",
    ironskin: "A squat iron-banded bottle of dull grey liquid with a hammered metal collar and a heavy stone "
        + "stopper, the glass thick and smoked.",
    insight: "A small clear glass sphere on a short brass neck, filled with pale gold light that gathers into "
        + "a single bright point at its centre.",
    // ── THE EIGHTEEN THAT TOOK THE SHELF TO TWENTY-NINE ──────────────────────────────────────────────────
    // Silhouette first and silhouette hardest, because there are twenty-nine of these now and three of them
    // sit side by side on a merchant's shelf at 34px. Sorted by what they DO, so the healing ones share a
    // family of round bellied shapes, the throwables are heavy-necked and stoppered, and the ones that mark
    // the room are flat-sided and awkward — a shape you would not drink from.
    hearth: "A round-bellied earthenware jug glazed warm amber, its short neck stoppered with a wooden bung, "
        + "a band of soot around its base.",
    deep_draught: "A deep bulbous flask of dark green glass, wider at the bottom than a hand, filled almost to "
        + "the neck with still red-gold liquid.",
    last_light: "A rounded lantern-shaped glass vessel with a brass foot and cap, holding a single soft warm "
        + "light suspended in clear liquid.",
    mending: "A squat twin-chambered glass bottle, one chamber of pale gold and one of pale green, joined at "
        + "the neck under a single cork.",
    bulwark: "A heavy square-shouldered stone bottle banded in iron with a screw cap, thick and blunt, its "
        + "grey surface chipped at the corners.",
    stone_milk: "A wide-mouthed clay crock of thick chalky white liquid with a cloth tied over its mouth, "
        + "small grey pebbles settled in the bottom.",
    brambles: "A tall narrow bottle of dark oil with a bramble stem coiled inside it, its thorns pressed "
        + "against the glass, stoppered with a knot of green wax.",
    tinct_iron: "A slim apothecary bottle of dull grey-blue liquid with an iron nail standing upright in it, "
        + "the glass fogged where the metal meets the liquid.",
    rage_oil: "A stubby wide-shouldered bottle of thick dark red oil, its cork rammed in at an angle, a rag "
        + "knotted around the neck.",
    wolfsbane: "A tall throwing-flask of smoked glass with a long weighted neck, filled with churning violet "
        + "liquid, sealed under a lead cap.",
    cinder_flask: "A round black-iron grenade flask with a screw top and a short fuse, glowing orange along "
        + "the seams where the metal has thinned.",
    quicklime: "A stout sealed pot of coarse white powder with a cracked wax seal over its mouth, faint heat "
        + "shimmer rising off the top.",
    chalk_flask: "A flat-sided glass flask of thin milky liquid with chalk sediment drifting through it, its "
        + "stopper a plug of raw white chalk.",
    dread_flask: "A flat hexagonal bottle of near-black liquid with a bone stopper, its glass so dark only the "
        + "highlight along one edge shows the shape.",
    hex_flask: "A lopsided flat bottle of oily liquid shot through with purple and green, wrapped in a strip "
        + "of inked parchment covered in small marks.",
    clarity: "A perfectly clear glass sphere on a short stem, holding water so still it looks empty, a single "
        + "point of white light at its centre.",
    surge: "A short thick-walled cylinder of clear glass capped in copper at both ends, with three bright "
        + "arcs of white lightning stacked inside it.",
    quick_step: "A narrow flat pocket flask of pale blue glass with a hinged brass cap, small enough to close "
        + "a hand around, a faint streak of motion inside.",
};

// ── THE TRINKETS ─────────────────────────────────────────────────────────────────────────────────────────────
// A relic is a KEPT OBJECT — it sits in the strip along the top of the screen for the rest of the run — so
// every one of these is drawn as a worn thing somebody carried, not as an icon of the effect it has.
const PERK_ART = {
    ember_heart: "A fist-sized heart carved from dark volcanic stone, cracked open down its middle with hot "
        + "orange embers glowing in the fissure, bound in a cradle of blackened iron wire.",
    whetstone: "A worn rectangular sharpening stone of grey grit, one long face rubbed into a shallow hollow "
        + "from years of use, resting against a small leather strop tied around it.",
    tin_shield: "A small battered round buckler of dull tin, dented across its face, with a domed rivet at its "
        + "centre and a leather strap curling behind it.",
    lucky_paw: "A dried rabbit's-foot charm on a knotted leather thong, its fur pale and worn smooth, capped "
        + "at the top with a tarnished silver band.",
    old_lantern: "A small dented brass hand lantern with cracked glass panes and a ring handle, one stub of "
        + "candle burning low inside it, throwing warm light through the cracks.",
    iron_ration: "A hard dark travel biscuit and a strip of dried meat bound together with twine in a scrap of "
        + "waxed cloth, plain and dense.",
    // ⚠️ THE ONE EVERY RUN OPENS HOLDING, AND IT HAD NO PICTURE. Warm Blood is the starter trinket — theirs is
    // Burning Blood, the relic the Ironclad never plays without — so it is on the strip at the top-left of the
    // map for the whole of every run, and it was rendering as a browser's torn-page glyph with the words
    // "Warm Blood" beside it. Nobody wrote its prompt, and the generator skips what it has no prompt for
    // SILENTLY, which is why a missing picture on the most-seen object in the game survived this long.
    warm_blood: "A small stoppered glass vial of dark red blood held in a cage of blackened iron straps, the "
        + "liquid inside lit from within by a slow ember glow, warm and alive rather than gory.",
    // ── THE BOSS TRINKETS ── bigger, older and obviously worth killing something for. Theirs read as relics
    // rather than as equipment, so these are objects with a history: a crown, a banner, a hide.
    ember_crown: "A heavy blackened iron crown with tall uneven points, its band set with three glowing "
        + "orange embers that light the metal from within, scorched and battle-worn.",
    war_banner: "A short war banner on a broken spear shaft: dark red cloth with a pale wolf-head sigil, the "
        + "hem torn and the shaft bound with leather cord.",
    stone_hide: "A thick slab of grey scaled hide bound into a shoulder guard with iron rivets and leather "
        + "straps, heavy and cracked like weathered stone.",
    deep_pockets: "A fat leather coin pouch, its drawstring loose and a spill of dull gold coins caught "
        + "half-out of the mouth, the leather worn pale at the seams.",
    old_wolf: "An old grey wolf skull with one cracked fang, bound at the brow with a strip of red cloth and "
        + "a single brass ring, dignified rather than grisly.",

    // ── THE TEN THAT MADE IT A POOL ── every one a carried, worn thing rather than an icon of its effect.
    travel_pack: "A small canvas rucksack with worn leather straps and a rolled blanket lashed under the "
        + "flap, its buckles tarnished and one strap mended with a knot.",
    bronze_scales: "A palm-sized patch of overlapping bronze scale armour, each scale rivetted to dark "
        + "leather backing, the edges of the scales bright where they have been chipped.",
    marble_bag: "A small drawstring pouch of dark blue cloth spilling three glass marbles onto nothing, the "
        + "marbles catching the light with coloured twists inside them.",
    horn_cleat: "A cleat of pale polished horn bound to a short length of tarred rope, the horn yellowed with "
        + "age and the rope frayed at its cut end.",
    river_pearl: "A single large irregular freshwater pearl, faintly pink and imperfectly round, resting in "
        + "the cracked half of a river mussel shell.",
    red_fang: "A single long curved fang, ivory going to brown at the root, its point stained dark red, "
        + "bound near the root with a whipping of red thread.",
    down_pillow: "A small plump travel pillow of faded blue-striped ticking, its corners soft and grubby, one "
        + "seam split with a wisp of white down escaping.",
    bone_broth: "A dented tin camp cup of steaming pale broth with a cracked knuckle bone standing in it, the "
        + "handle wrapped in a strip of cloth.",
    wide_belt: "A broad worn leather belt with a heavy brass buckle, four small stitched loops along it sized "
        + "to hold bottles, the leather darkened where the loops sit.",
    grindstone: "A small round hand grindstone of grey rough grit on a short iron spindle with a wooden "
        + "crank handle, bright metal filings caught in its rim.",

    // ── AND THE TEN THAT CAME WITH THE SCALING CARDS ── same rule: a kept object somebody carried.
    anchor: "A small rust-pitted iron boat anchor with one bent fluke, a short length of frayed rope still "
        + "knotted through its ring.",
    mango: "A single ripe mango, its skin blushing red into gold, one slice cut away to show the deep orange "
        + "flesh and the pale flat stone inside.",
    smooth_stone: "A flat oval river stone of pale grey, worn perfectly smooth and slightly dished on one "
        + "face, with a single darker band running across it.",
    red_mask: "A carved wooden face mask painted dull red, with narrow slit eyes and a grim flat mouth, its "
        + "paint chipped at the brow and a leather tie hanging from one side.",
    paper_frog: "A small folded paper frog of creased crimson paper, sharply origami-angled, sitting squat "
        + "with its folded hind legs tensed to jump.",
    magic_flower: "A single pale blue flower with six long petals on a slender green stem, faintly glowing at "
        + "its golden centre, one leaf curling from the stalk.",
    // Came back once on a pale rectangular panel instead of on nothing — the fan's own paper leaf is a flat
    // light shape and the model kept reading it as a card to draw ON. Says "no backing" out loud now.
    toy_fan: "A small folding hand fan opened into a fan shape, its leaf deep teal painted with a curling "
        + "wave, ribs of dark split bamboo and a red cord tassel swinging from the pivot. Nothing behind it "
        + "at all: no panel, no card, no paper backing, no rectangle.",
    lizard_tail: "A severed lizard's tail of green-brown scales, tapering and slightly curled, the cut end "
        + "clean and already beading with a bright regrowing bud.",
    question_card: "A single face-down playing card of dark blue with a worn gilt border, a large pale "
        + "question mark stamped at its centre, one corner softly bent.",
    molten_egg: "A large dark stone egg cracked in a web of fissures with hot orange light glowing out of "
        + "them, resting in a small nest of blackened wire.",

    // ── THE FORTY-THREE THAT ARRIVED WITH THE SPIRE-PARITY PASS ──────────────────────────────────────────────
    // Same rule as everything above: say the SHAPE, because these are judged at thumbnail size on a shelf
    // beside two others. Grouped the way the perk table is, and deliberately spread across silhouettes — a
    // run holding six of these should be able to tell them apart on the strip without reading a word.
    acorn_cache: "A cluster of three fat oak acorns still in their rough cups, bound together with a twist of "
        + "green twine.",
    thick_pelt: "A thick folded fur pelt, dark and dense, rolled into a squat bundle and strapped with a "
        + "worn leather belt.",
    winter_fat: "A round sealed clay crock of pale rendered fat, its wooden lid tied down with cord under a "
        + "circle of waxed cloth.",
    hollow_bone: "A short pale hollow legbone cut clean at both ends, one end capped with a carved wooden "
        + "plug, a thong through a drilled hole.",
    oak_shield: "A small round shield of pale oak planks with an iron rim and a plain domed boss at its "
        + "centre, one plank split and mended with a metal staple.",
    iron_carapace: "A curved segmented plate of blackened iron shaped like a beetle's back, its overlapping "
        + "bands riveted along each seam.",
    clay_shard: "A single thick curved shard of fired red clay, broken from a larger vessel, its glazed outer "
        + "face still carrying part of a painted spiral.",
    packed_earth: "A dense flat brick of dark packed earth bound with visible dry grass and root fibre, its "
        + "edges crumbling slightly.",
    river_stone: "A smooth flat grey river stone, perfectly oval and water-worn, with one pale quartz band "
        + "running across its face.",
    iron_claw: "A single curved iron claw the length of a finger, its base wrapped in leather cord, the point "
        + "honed bright.",
    desperate_fang: "A long yellowed predator's fang, cracked lengthwise and bound with red thread through a "
        + "hole drilled at its root.",
    boars_tusk: "A thick curved boar's tusk, ivory going brown at the root, its tip worn blunt and its base "
        + "capped in tarnished bronze.",
    spined_hide: "A stiff square of thick dark hide studded all over with short black quills standing "
        + "upright, curling at its corners.",
    quill_mantle: "A short shoulder mantle of overlapping grey quills laid like scales, fastened at the "
        + "throat with a bone pin.",
    chipped_marble: "A small polished marble sphere of veined white stone with one chip broken out of its "
        + "side, showing dull grey underneath.",
    ash_veil: "A torn length of fine grey gauze, weightless and half-transparent, drifting in a loose fold "
        + "with pale ash caught in its weave.",
    paper_crane: "A folded paper crane of pale cream paper, sharply creased, one wing marked with a single "
        + "red brushstroke.",
    chalk_dust: "A stub of white chalk worn to a wedge, lying in a small drift of its own pale dust with a "
        + "single smeared fingerprint through it.",
    // ⚠️ THE FOUR THE COMPOSER COULD NOT DO. "Grey Ash", "Warm Stone", "Long Sleep" and "Old Habit" name no
    // object at all, so the model supplied one and every time it supplied a CHARACTER — a blue minotaur for
    // Grey Ash, a monk for Old Habit. That is now the fourth time an abstract subject has done this in this
    // repo (see `oldwall`, `winding_halls` and `three_marks`), and the fix is always the same: name the
    // material, and say outright that nothing in the frame is alive.
    grey_ash: "A small heap of fine grey ash on a flat stone, a shallow scoop taken out of one side and a "
        + "few pale flakes drifting off it. Inanimate ash and stone only: no creature, no figure, no face.",
    warm_stone: "A smooth oval river stone glowing faintly warm from within, resting in a nest of folded "
        + "cloth. An inanimate stone and nothing else: no creature, no figure, no face.",
    long_sleep: "A rolled woollen bedroll tied with two leather straps, a folded blanket strapped on top, "
        + "standing on end. Bedding only: no creature, no figure, no face, nobody sleeping in it.",
    old_habit: "A coarse brown monk's robe on a wooden peg, empty and hanging in folds, a knotted rope belt "
        + "looped over it. An empty garment on a peg: no creature, no figure, no face, nobody wearing it.",
    // ⚠️ CAME BACK AS A MINOTAUR. "Three marks" carried no object at all, so the model supplied one — the
    // same failure the event generator hit twice (see `oldwall` and `winding_halls` there). The subject now
    // leads with the MATERIAL and says outright that nothing is alive in the frame.
    three_marks: "A flat rectangular grey stone tablet, close up and filling the frame, with three short "
        + "slash marks gouged deep into its face, each groove packed with a different coloured pigment — "
        + "white, blue and red. An inanimate carved stone and nothing else: no creature, no face, no figure, "
        + "no character.",
    field_dressing: "A tight roll of clean linen bandage with a curved bronze pin stuck through it and one "
        + "end unwinding.",
    sunflower_seed: "One large striped sunflower seed, husk intact, sitting beside a short green shoot just "
        + "breaking out of a second one.",
    marrow_broth: "A dented tin cup of thick pale broth with a cracked marrow bone standing upright in it, "
        + "steam coming off the surface.",
    spring_water: "A clear glass flask of still water with a cork stopper, catching pale light through it, a "
        + "single green leaf sealed inside.",
    feather_bed: "A plump folded quilt of pale ticking stitched in squares, one corner turned back, a loose "
        + "grey feather resting on it.",
    banked_coals: "A shallow iron pan of grey ash with three orange coals half-buried in it, faint heat "
        + "shimmer rising.",
    oiled_satchel: "A small dark oiled-leather satchel with a brass buckle and a stiff flap, its surface "
        + "shining with waterproofing.",
    cork_stopper: "A fat tapered cork stopper with a carved wooden top shaped like a wolf's head, a scrap of "
        + "wire still twisted around its neck.",
    glass_vial: "A slim empty glass vial in a woven wicker sleeve, its stopper hanging beside it on a short "
        + "cord.",
    courier_sack: "A canvas courier's satchel with a wide worn strap, its flap bulging open with the corners "
        + "of folded papers showing.",
    spark_stone: "Two pieces of grey flint held together, one striking the other, with a spray of orange "
        + "sparks jumping between them.",
    tinder_box: "A small hinged tin box lying open, packed with dry charred cloth, a striker and a flint "
        + "resting in the lid.",
    prospectors_eye: "A brass jeweller's loupe with a chipped lens, its barrel scratched, standing on end.",
    smiths_mark: "A blacksmith's iron stamp with a wolf's-head die on its face, its striking end mushroomed "
        + "from hammer blows.",
    cut_purse: "A fat drawstring coin purse of brown leather, slit open down one side, three gold coins "
        + "spilling out of the cut.",
    tallow_candle: "A short fat tallow candle burning with a low smoky flame, thick wax runs down its sides, "
        + "set on a plain iron pricket.",
    tortoise_sign: "A carved wooden sign-plate showing a tortoise in profile, the grain worn smooth, a strip "
        + "of iron nailed across its bottom edge.",
    long_hunger: "A narrow iron ring set with a single dull red stone, the band worn thin and slightly "
        + "misshapen from wear.",
    wide_eye: "A carved bone disc with a wide staring eye incised into it and rubbed with black pigment, a "
        + "hole drilled at the top.",
    // ── THE BOSS TRINKETS ────────────────────────────────────────────────────────────────────────────────────
    coal_heart: "A lump of black anthracite roughly the shape of a heart, split by a glowing orange seam, "
        + "resting in a nest of fine grey ash.",
    both_marks: "Two overlapping painted marks on a flat slate — one a red slash, one a blue circle — the "
        + "pigment thick and still wet at the edges.",
    barricade_stone: "A squat rectangular block of grey granite with iron banding around its middle and two "
        + "lifting rings sunk into its top.",
    demon_tooth: "A single enormous curved black tooth, serrated down one edge, its root wrapped in dark "
        + "leather and a length of chain.",
    second_sight: "A pale carved stone mask with two empty eye-holes and a third eye cut into its forehead, "
        + "the third one lit faintly from within.",
    gorgons_eye: "A large polished amber eye with a vertical slit pupil, set into a heavy bronze bezel with "
        + "clawed mounts.",
    iron_lung: "A bellows of dark iron and stiff leather, its handles worn, shaped unmistakably like a single "
        + "lung with a ribbed iron pipe leaving the top.",
};

const JOBS = [
    ...Object.values(POTIONS).map((p) => ({
        id: p.id, dir: "public/images/cards/potions", subject: POTION_ART[p.id] || composedItem(p, true),
        store: 256,
    })),
    // BOSS TRINKETS LIVE IN THE SAME FOLDER as the ordinary ones, because every screen that draws a trinket
    // looks it up by id in one place — see takePerk on why there is one catalogue as far as the rest of the
    // game is concerned.
    ...Object.values({ ...PERKS, ...BOSS_PERKS }).map((k) => ({
        id: k.id, dir: "public/images/cards/items", subject: PERK_ART[k.id] || composedItem(k),
        store: 256,
    })),
];


const FORCE = process.argv.includes("--force");
const only = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();

// ⚠️ AND IT SAYS SO, LOUDLY. A rule authored without art used to fall through this loop with one quiet line
// in the middle of the output; the thing it produces is a broken-image glyph on a live screen, which is worth
// a line at the END where the count is read.
const noPrompt = JOBS.filter((j) => !j.subject).map((j) => j.id);

let made = 0, skipped = 0, spent = 0;
for (const job of JOBS) {
    if (only && !only.has(job.id)) continue;
    if (!job.subject) { console.log(`  ${job.id.padEnd(12)} no prompt written — skipped`); continue; }
    fs.mkdirSync(job.dir, { recursive: true });
    const out = `${job.dir}/${job.id}.png`;
    if (fs.existsSync(out) && !FORCE) { skipped += 1; continue; }

    const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: "gpt-image-1", prompt: housePrompt(job.subject, { extra: SMALL }),
            size: "1024x1024", background: "transparent", output_format: "png", quality: "medium", n: 1,
        }),
    });
    if (!resp.ok) { console.log(`  ${job.id}: OpenAI ${resp.status} ${(await resp.text()).slice(0, 160)}`); continue; }
    const b64 = (await resp.json())?.data?.[0]?.b64_json;
    if (!b64) { console.log(`  ${job.id}: no image returned`); continue; }

    // Trimmed to the object, then stored at four times the size it is drawn — a 1MB flask behind a 64px
    // picture is bytes a phone fetches and nobody sees. `fit: inside` NOT `fill`: these are not all the same
    // proportion (a tall phial is not a round buckler) and stretching each one into a square is exactly how a
    // set of objects stops looking like a set of objects.
    const small = await sharp(Buffer.from(b64, "base64"))
        .trim({ threshold: 8 })
        .resize(job.store, job.store, { fit: "inside", withoutEnlargement: false })
        .png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(out, small);
    made += 1;
    spent += 0.042;
    console.log(`  ${job.id.padEnd(12)} ${(small.length / 1024).toFixed(0)}kb`);
}

console.log(`\ndrew ${made}, skipped ${skipped} — about $${spent.toFixed(2)}`);
if (noPrompt.length) {
    console.log(`
⚠️  NO PROMPT WRITTEN, SO NO PICTURE DRAWN: ${noPrompt.join(", ")}`);
    console.log("   Each of these renders as a broken image wherever the game shows it. Add them to PERK_ART / POTION_ART.");
}
