import { housePrompt } from "./art-style.js";

// ── WHAT EVERY CHEST IN THE GAME IS DRAWN FROM ───────────────────────────────────────────────────────────
// Split out of chest-art.js so a GENERATOR SCRIPT can read it. chest-art.js reaches "@/lib/settings.js" and
// "@/lib/marketplace/openai-image.js", and the "@/" alias only exists inside the Next build — a plain node
// script importing it dies on the first specifier. That is the same trap _mint-shot-session.mjs fell into,
// where the failure printed a stack trace the caller took for a token and filmed the wrong page entirely.
//
// So: no "@/" and no server-only in this file, and nothing in it but the prose. chest-art.js re-exports both
// names, so every existing caller is untouched.
// Subject + the shared house style. The negative clauses about boxes matter regardless of style: gpt-image-1
// will happily draw a cardboard shipping box if you just say "chest".
const STYLE = housePrompt(
    "A fantasy RPG treasure chest with a CURVED DOMED lid, thick metal corner brackets, a big ornate front lock " +
    "plate with a keyhole, and reinforcing bands with rivets. Closed lid, three-quarter view from slightly above.",
    { extra: "It is a treasure chest, NOT a cardboard box, NOT a cube, NOT a crate, NOT a suitcase, no packing tape, no flat flaps." }
);

export const CHEST_ART_PROMPTS = {
    wooden:
        "A rugged wooden treasure chest of thick weathered oak planks bound with dark wrought-iron straps, warm " +
        "rich brown wood tones with a worn adventurer feel. " + STYLE,
    iron:
        "A sturdy dungeon treasure chest clad in riveted brushed-steel plates and heavy dark iron bands with a " +
        "chunky padlock, cool gunmetal and silver tones. " + STYLE,
    gold:
        "A lavish royal treasure chest of polished gold with elaborate engraved scrollwork filigree, jewel inlays, " +
        "and a glowing keyhole, radiant warm gold with a soft magical shine. " + STYLE,
    mythic:
        "A magical crystalline treasure chest of dark obsidian and glowing emerald-teal crystal, etched arcane runes " +
        "pulsing with energy, floating light motes and a mystical aura. " + STYLE,
    ascendant:
        "A transcendent treasure chest wreathed in molten orange-gold fire and embers, its dark metal cracked with " +
        "glowing lava veins, radiating intense heat and sparks, blazing beyond legendary. " + STYLE,
    eternal:
        "A godlike treasure chest radiating impossible prismatic rainbow light that shifts through hot pink, violet " +
        "and cyan, crackling with divine energy and shimmering aura, the pinnacle of all loot. " + STYLE,
    celestial:
        "A cosmic treasure chest seemingly carved from deep space, its surface a swirling nebula of stars and " +
        "galaxies in deep violet and indigo with glowing constellations and stardust. " + STYLE,
    primordial:
        "The ultimate primordial treasure chest of ancient white-gold metal blazing with blinding radiant light, " +
        "carved with glowing origin runes, an overwhelming divine aura — the source of all treasure. " + STYLE,
};

// ── THE HALLOWEEN CHESTS ─────────────────────────────────────────────────────────────────────────────────
// Four of them, and they are a LADDER rather than four skins: candy corn at the bottom, ghost at the top.
// Four chests of identical value would be four names for one object, and the chest screen sorts by
// CHEST_ORDER — so they would sit in a row looking like a bug.
//
// ⚠️ THE SAME CHEST, IN COSTUME. Every one of these composes from the same STYLE as the eight above — domed
// lid, corner brackets, front lock plate, three-quarter view — so they read as this game's chests dressed for
// the season rather than as four props from a different game that happen to be in the same list.
export const HALLOWEEN_CHEST_PROMPTS = {
    // ⚠️ SAY WHAT THE LOCK PLATE IS. "A sugar-white lock plate" came back as a shapeless pale blob with two
    // dots that read as a startled face — the model will draw a nothing if the prompt describes a colour
    // instead of an object. Every other chest here names a real thing in that spot (a skull, a carved face,
    // a keyhole), and this one now does too.
    hw_candycorn:
        "A treasure chest painted in bold CANDY CORN stripes — a white domed lid, a broad orange middle band, " +
        "and a yellow base — with a glossy hard-candy sheen and brass corner brackets. The front lock plate is " +
        "a single large CANDY CORN KERNEL standing point-up, white tip, orange middle, yellow base, with a " +
        "dark keyhole cut into its centre. A few loose candy corn pieces spilling at its foot. Sweet, cheap " +
        "and cheerful. " + STYLE,
    hw_pumpkin:
        "A treasure chest carved from a great ripe PUMPKIN, deep orange rind with pale ribs, a curling green " +
        "vine and a leaf at the hinge, a jack-o'-lantern face cut into the front where the lock plate sits and " +
        "warm candlelight glowing out through the eyes and the keyhole. " + STYLE,
    hw_skeleton:
        "A treasure chest built of pale BONE — a ribcage forming the banding over dark iron, knuckle-bone " +
        "rivets, and a horned SKULL as the front lock plate with the keyhole in its mouth. Cold bone-white and " +
        "gunmetal, grim and heavy. " + STYLE,
    hw_ghost:
        "A translucent GHOSTLY treasure chest of pale spectral blue-white, faintly see-through with the far " +
        "side of its own lid showing through, glowing softly from within, its base trailing away into a wispy " +
        "vapour tail instead of a flat bottom so it hovers. Ethereal and cold. " + STYLE,
};

export const HALLOWEEN_CHEST_TIERS = ["hw_candycorn", "hw_pumpkin", "hw_skeleton", "hw_ghost"];

export const CHEST_ART_TIERS = ["wooden", "iron", "gold", "mythic", "ascendant", "eternal", "celestial", "primordial"];
