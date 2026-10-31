// ── HOW YOUR HERO STANDS ────────────────────────────────────────────────────────────────────────────────────
// Luke: "maybe we add options that are purchasable with store credit... We could start with poses... 20
// poses, 10 unlockable and 10 purchase only. The purchase ones would be kind of epic."
//
// A pose is one sentence that replaces one sentence. buildSpritePrompt already says "in a confident heroic
// standing pose shown from a three-quarter view facing to the RIGHT"; a pose swaps the first half of that
// and leaves the facing rule alone, because every consumer of a hero sprite assumes it faces right.
//
// ⚠️ EVERY POSE MUST PLACE THE WEAPON AND THE SHIELD. THIS IS NOT STYLE, IT IS THE RULE THAT MAKES THEM
// SELLABLE. Measured over two trial rounds (scripts/sprite-trial.mjs, rounds five and six): "arms folded
// across the chest" was ignored outright, because SPRITE_RULES separately says "ONE WEAPON PER HAND AND NO
// DUPLICATES... a shield goes on the arm that is not holding the weapon". A member holding a sword and a
// shield cannot fold his arms, and the gear clause is the more specific instruction, so it wins. The same
// pose, rewritten to say the weapon is strapped across the back and the shield slung behind, was honoured
// exactly.
//
// So a pose that needs a free hand and does not SAY where the gear went will be overruled silently — on a
// cosmetic somebody paid store credit for. checkPoses below refuses to let one into the catalogue.
//
// ⚠️ AND THE POSE CANNOT FIGHT THE FRAME. The prompt forbids anything touching an edge, naming "a raised
// weapon" specifically, and tells the model to draw SMALLER rather than crop. A sword held overhead was
// tested for exactly that reason and held — but a pose that spreads a character wide is the one to watch.
//
// ⚠️ TWO SOURCES, ONE SHELF. `unlock` poses are earned and `shop` poses are bought with store credit. They
// live in one list because they are one thing to the player — a pose you have or do not — and two lists
// would be two places to add the twenty-first.

/** Phrases every pose is checked against: it has to say where BOTH pieces of gear are. */
const SAYS_WEAPON = /\b(weapon|sword|blade)\b/i;
const SAYS_SHIELD = /\bshield\b/i;

/**
 * @typedef {object} Pose
 * @property {string} id      stable key; stored on the member, so renaming is a migration
 * @property {string} name    what the shop and the equipment screen call it
 * @property {string} say     the sentence that replaces the default pose clause
 * @property {"unlock"|"shop"} source
 * @property {string} [how]   unlock poses: what you did to get it, in the player's words
 * @property {string} [event] unlock poses: the mkt_activity_event counted toward it
 * @property {number} [need]  unlock poses: how many of that event
 * @property {number} [cents] shop poses: the price in store credit
 */

/** @type {Pose[]} */
export const POSES = [
    // ── THE TEN YOU EARN ────────────────────────────────────────────────────────────────────────────
    // ⚠️ COUNTED, NEVER STORED. Every condition below is "how many of this event does this member
    // have", read straight off mkt_activity_event — the same mechanism the act board uses, and its note
    // says why: a rung can be re-tuned by editing this file alone, with no migration, no backfill and no
    // counter anywhere to keep in step. It also means a condition cannot be out of sync with reality.
    //
    // ⚠️ AND EVERY EVENT NAMED HERE IS ONE THE GAME ACTUALLY EMITS, checked against the live table
    // rather than invented: arena_win, open_chest, boss_attack, daily_spin, swarm_kill, fish_caught,
    // craft_salvage and cooked all have five figures of history. A pose behind an event nobody fires is
    // a pose nobody can earn — the pet audit found three of those and it reads as bad luck, not a bug.
    //
    // ⚠️ THE DEFAULT IS IN THIS LIST AND COSTS NOTHING. A catalogue where the pose you already have is
    // absent reads as "you have none", and the first thing a player does on a cosmetic screen is look for
    // the one they are wearing.
    {
        id: "ready", name: "At the Ready", source: "unlock", how: "Yours from the start",
        say: "a confident heroic standing pose, weapon held ready in one hand and the shield on the other arm",
    },
    {
        id: "guard", name: "On Guard", source: "unlock", how: "Win an arena bout", event: "arena_win", need: 1,
        say: "a braced defensive stance, shield raised across the body and the weapon drawn back low beside it, weight on the back foot",
    },
    {
        id: "shoulder", name: "Shouldered", source: "unlock", how: "Open 25 chests", event: "open_chest", need: 25,
        say: "a casual stance with the weapon resting back over one shoulder and the shield hanging loose from the other hand",
    },
    {
        id: "planted", name: "Planted", source: "unlock", how: "Land 50 hits on a weekly boss", event: "boss_attack", need: 50,
        say: "standing squarely on both feet with a wide planted stance, the weapon point-down on the ground under both hands and the shield slung on the back",
    },
    {
        id: "salute", name: "The Salute", source: "unlock", how: "Take 10 daily spins", event: "daily_spin", need: 10,
        say: "an upright salute with the weapon held vertical in front of the face in one hand, the shield lowered at the other side",
    },
    {
        id: "lunge", name: "Mid-Lunge", source: "unlock", how: "Put down 100 wanderers", event: "swarm_kill", need: 100,
        say: "a forward lunge, front knee bent deep and the weapon thrust ahead in one hand, the shield tucked tight to the other shoulder",
    },
    {
        id: "scan", name: "The Scan", source: "unlock", how: "Catch 50 fish", event: "fish_caught", need: 50,
        say: "a watchful stance with one hand shading the eyes and the weapon sheathed at the hip, the shield carried low in the other hand",
    },
    {
        id: "rest", name: "Hilt Rest", source: "unlock", how: "Salvage 100 pieces", event: "craft_salvage", need: 100,
        say: "a relaxed pose with both hands resting on the pommel of the weapon planted point-down in front, the shield slung across the back",
    },
    {
        id: "folded", name: "Arms Folded", source: "unlock", how: "Cook 50 dishes", event: "cooked", need: 50,
        say: "a relaxed confident pose with both arms FOLDED ACROSS THE CHEST and both hands empty and visible, the weapon strapped across the back and the shield slung on the back, neither held in a hand",
    },
    {
        id: "beckon", name: "Come On", source: "unlock", how: "Win 25 arena bouts", event: "arena_win", need: 25,
        say: "a taunting stance, shield forward and one hand beckoning with the fingers, the weapon held back and low in the other hand",
    },

    // ── THE TEN YOU BUY ─────────────────────────────────────────────────────────────────────────────
    // ⚠️ EPIC MEANS BIGGER STAGING, NOT BETTER STATS. Luke: "The purchase ones would be kind of epic." A
    // pose changes nothing about what a hero does — it cannot, or it stops being a cosmetic and becomes a
    // thing people have to buy to compete. What money buys here is drama: the sword overhead, the cape
    // caught mid-turn, the moment rather than the stance.
    {
        id: "triumph", name: "Triumph", source: "shop", cents: 300,
        say: "a triumphant pose with the weapon raised high overhead in one hand and the head tilted back mid shout, the shield held out wide in the other hand",
    },
    {
        id: "skyward", name: "Skyward Point", source: "shop", cents: 300,
        say: "a commanding pose with the weapon pointed straight up at arm's length in one hand, the shield braced across the chest in the other",
    },
    {
        id: "charge", name: "The Charge", source: "shop", cents: 400,
        say: "a full charging stride, body leaning hard forward, the weapon swept back behind in one hand and the shield thrust ahead in the other",
    },
    {
        id: "coiled", name: "Coiled", source: "shop", cents: 400,
        say: "a low crouched ready stance, knees bent deep and one fist planted on the ground, the weapon held back ready to spring and the shield slung on the back",
    },
    {
        id: "cleave", name: "Downward Cleave", source: "shop", cents: 500,
        say: "mid-swing in a downward cleave, the weapon brought down hard in both hands and the shield slung on the back, body twisted into the blow",
    },
    {
        id: "bulwark", name: "Bulwark", source: "shop", cents: 500,
        say: "braced behind the shield held edge-on toward the viewer with both the shoulder and the weapon tucked behind it, the weapon low and ready",
    },
    {
        id: "turn", name: "The Turn", source: "shop", cents: 600,
        say: "caught mid-turn with the cape swept wide, the weapon trailing in one hand and the shield swinging out from the other, hair and cloth in motion",
    },
    {
        id: "kneel", name: "The Oath", source: "shop", cents: 600,
        say: "kneeling on one knee with the head bowed, the weapon planted point-down in front under both hands and the shield laid flat on the ground beside",
    },
    {
        id: "aloft", name: "Standard Bearer", source: "shop", cents: 800,
        say: "standing tall with the weapon held aloft horizontally overhead in both hands like a trophy, the shield slung on the back",
    },
    {
        id: "landing", name: "Hard Landing", source: "shop", cents: 800,
        say: "landing from a leap in a deep three-point crouch, one fist driven into the ground and the weapon flared out wide in the other hand, the shield on the back arm",
    },
];

export const POSE_BY_ID = Object.fromEntries(POSES.map((p) => [p.id, p]));

/** The pose every member starts with, and the fallback whenever a stored id no longer exists. */
export const DEFAULT_POSE = "ready";

/**
 * The sentence to put in the prompt for a stored pose id.
 *
 * ⚠️ FAILS TO THE DEFAULT, NEVER TO NOTHING. A retired or mistyped id must still draw a hero; returning an
 * empty string would leave the prompt saying "in a , keeping the same face" and hand the model a fragment.
 */
export const poseSay = (id) => (POSE_BY_ID[id] || POSE_BY_ID[DEFAULT_POSE]).say;

/** Owned by default — the starter pose is nobody's purchase and nobody's unlock. */
export const isFreePose = (id) => id === DEFAULT_POSE;

/**
 * Catalogue self-check. Every pose has to place BOTH pieces of gear, or it loses to SPRITE_RULES silently.
 * Exported so a script can assert it; called at import so a bad pose cannot ship quietly.
 */
export function checkPoses() {
    const bad = POSES.filter((p) => !SAYS_WEAPON.test(p.say) || !SAYS_SHIELD.test(p.say));
    const priced = POSES.filter((p) => p.source === "shop" && !(p.cents > 0));
    const dupes = POSES.length !== new Set(POSES.map((p) => p.id)).size;
    // An unlock pose with no condition is unobtainable, which is the shape the pet audit exists to catch.
    const unearnable = POSES.filter((p) => p.source === "unlock" && !isFreePose(p.id) && !(p.event && p.need > 0));
    return { bad, priced, dupes, unearnable };
}
