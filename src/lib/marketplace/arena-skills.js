// ── THE SKILLS, AND THE TREE INSIDE EACH ONE ─────────────────────────────────────────────────────────────────
// Pure. No DB, no server-only — the panel and the ring read the same catalog, so what a node promises is what
// the bout applies.
//
// ── WHY THIS IS NOT MORE NODES ON THE PASSIVE TREE ───────────────────────────────────────────────────────────
// The passive tree is thirty-six nodes that tune numbers a bout already uses, and every one of them is a stat
// going up. That is a fine thing to spend on and a poor thing to PLAY, because none of it is a decision you
// make during a fight — you spend the point in the morning and the bout resolves the same way it was always
// going to.
//
// A skill is the other kind of investment: it is a button that exists on your deck because you paid for it.
// Luke's shape, and the reason it is a panel rather than a fourth tier —
//
//   · every 3 points in the passive tree earns 1 skill point
//   · 1 skill point UNLOCKS a skill outright — no tier gate, no prerequisite, pick the one you want
//   · each skill then has its own small tree, 5 nodes at 1 point each, that changes how it FUNCTIONS
//
// So six points takes one skill as far as it goes, and three points takes all three at their base. That is the
// whole decision, and it is a real one: a Reaver who has poured everything into Rupture fights nothing like a
// Reaver holding all three at base, and neither of them is wrong.
//
// ── NODES ARE DELTAS, NOT CODE ───────────────────────────────────────────────────────────────────────────────
// A node is `mod`: a bag of numbers added to the skill's own. Nothing here is a function, a hook or a special
// case, which buys two things that matter more than the flexibility it gives up. The ring applies ONE merged
// skill and never asks which nodes produced it — so a node cannot introduce a mechanic the engine does not
// have, and cannot quietly stop working the way five of the old tree's nodes did when they were computed for
// the defender and dropped on the floor. And the card can print the modified numbers, so a member can see what
// their point actually bought instead of reading a promise about it.
//
// ── THE VOCABULARY ───────────────────────────────────────────────────────────────────────────────────────────
// Every key below is a thing the engine already does. Nothing here invents a mechanic — that was the rule the
// passive trees were written under and it is the reason they could be balanced at all.
//
//   power       multiplier on your damage for this swing. 0 means the skill throws no blow at all.
//   hits        a fixed number of blows, each rolling its own crit, instead of rolling doublestrike
//   cooldown    beats of YOURS before it comes back. 0 is usable every turn.
//   bleed/burn  1 guarantees the wound or the fire rather than rolling for it
//   freeze      beats they lose outright
//   shield      share of your maximum health raised as a shield, which eats damage before health does
//   heal        share of your maximum health restored
//   drain       share of what this blow lands, healed back — on top of any Lifedrink you carry
//   cleanse     clears the bleed and the burn on YOU
//   haste       1 grants you another turn, on the spot
//   grudge      share of the damage banked since your last swing, added to this blow
//   executeAt   their health fraction below which this starts scaling up
//   executeMax  the extra multiplier at zero health, scaling in linearly from executeAt
//   desperateAt the fraction of YOUR OWN health below which the blow starts scaling up
//   desperateMax  and what it is worth at your last hit point — the comeback term
//   pierce      extra share of their armour this blow ignores
//   chill       share of THEIR turns that simply do not happen, for the rest of the bout
//   soulfire    share of what landed, dealt again past armour and shields both
//   free        true means it does NOT cost your beat — you cast it and still swing
// ── WHAT A WHOLE CHARACTER COSTS ─────────────────────────────────────────────────────────────────────────────
// Three skills to unlock and one three-node path in each: 3 + 9 = 12, which is exactly what the climb to
// ARENA_MAX_LEVEL pays out at one point every other level. Nothing is left over and nothing is short.
export const SKILL_UNLOCK_COST = 1;
export const NODE_COST = 1;

// ── ONE POINT EVERY OTHER LEVEL, TWELVE IN TOTAL ─────────────────────────────────────────────────────────────
// Luke: "I think for skills, you should only be allowed to invest in one path per skill... 3 skills, 1 tree
// each 9 points", then "one every 2 levels up to 24 not 18".
//
// Every skill is three branches of three nodes, so one path per skill is 3 nodes, and a whole character is
// three unlocks plus nine nodes — 12. The climb pays exactly that: one point every other level to
// ARENA_MAX_LEVEL 24. The last point lands on the last level, so skills are still paying out the whole way up
// rather than finishing early and leaving the back half of the climb worth nothing to them.
//
// ⚠️ THIS IS DERIVED FROM LEVEL, NOT FROM TREE POINTS SPENT, and that decoupling is deliberate. It used to be
// "every point you invest in the passive tree earns one here", which tied two screens together: refunding a
// tree node could un-buy a skill point already spent on a capstone, so tree refunds had to be REFUSED with an
// explanation (see refundWouldOrphanSkills). Off level, that cannot happen — respec the tree as often as you
// like and your skills are untouched.
export const SKILL_POINT_CAP = 12;
export const LEVELS_PER_SKILL_POINT = 2;

/** How many skill points a member has earned, ever. Derived from arena level rather than stored, so it can
 *  never drift out of step with a respec. */
export const skillPointsFrom = (level = 0) =>
    Math.min(SKILL_POINT_CAP, Math.floor(Math.max(0, Number(level) || 0) / LEVELS_PER_SKILL_POINT));

// ── A SKILL IS A THREE-WAY ARGUMENT ──────────────────────────────────────────────────────────────────────────
// The first build gave each skill five flat nodes with no ordering: every one was an improvement, so every path
// arrived at the same place. The second gave it two branches. Luke: "I think each skill should have three
// different disagreements, not two."
//
// He is right that two is not enough, and the reason is structural rather than a matter of taste. Two branches
// is a binary — more damage or more defence — and a member picks the one their gear already points at. THREE
// is a triangle, and a triangle has no obvious answer: every skill now offers a way to kill faster, a way to
// keep the pressure on, and a way to stay alive, and which of those is right depends on the fight in front of
// you rather than on a table.
//
// ── THE TRIAD ────────────────────────────────────────────────────────────────────────────────────────────────
// Every skill's three branches answer the same three questions in its own vocabulary:
//
//   how it KILLS      burst, or damage over time, or scaling — the branch that ends the fight
//   how it PRESSES    tempo and control — cooldowns, freezes, extra beats, blows they never get to answer
//   how it HOLDS      sustain and mitigation — drain, shields, cleanses, the branch that loses slower
//
// ── THE CAPSTONES GIVE SOMETHING UP ──────────────────────────────────────────────────────────────────────────
// Deliberately, and it is the part that makes a branch a choice rather than a direction. Exsanguinate makes the
// wound enormous and the blow that opens it feeble. Cleave drops a blow to make the rest huge. Hard Frost
// throws the freeze away entirely. A capstone that was purely better would mean the branches differed in
// flavour and the member picking one was picking a colour.
//
// ── THE ORDERING IS THE COMMITMENT ───────────────────────────────────────────────────────────────────────────
// Within a branch a node needs the one above it. That is the only prerequisite in the system, and it is what
// makes depth cost something structural rather than just costing points: three capstones exist and you can
// never hold more than one of them cheaply.
//
// The economy: 1 to unlock, 3 more to run a branch to its capstone, 10 to own all nine nodes, 30 for all three
// skills. At the 1:1 exchange rate that is roughly a week to a first capstone, a month to a finished skill,
// and years to everything — so the ceiling still exists, it is just no longer somewhere nobody can see.
const S = (o) => ({ power: 1, hits: 0, cooldown: 3, ...o });

// `br` stamps the branch and the depth onto each node, so the flat list stays the thing resolveSkill merges
// while the panel still has the structure it needs to draw three ladders.
const br = (branch, nodes) => nodes.map((n, i) => ({ ...n, branch, tier: i }));

export const SKILLS = [
    // ══ REAVER ══ open the artery, then hit what is bleeding.
    S({
        id: "rupture", classId: "reaver", name: "Rupture",
        sprite: "/images/arena/skill/rupture.webp",
        blurb: "A blow that opens the artery. Wounds tick past armour, which is the point of them.",
        // ── THE WOUND IS THE POINT OF THIS SKILL ─────────────────────────────────────────────────────────
        // Three stacks, not one. Bleed bleeds ALL its stacks at once and then half of them close, so one
        // stack is a single small tick and the whole front-loaded shape never happens. Measured over 200
        // Reaver-vs-Warden bouts while this was `bleed: 1`: the highest stack ever seen was 3, and 538 of 619
        // ticks left nothing behind — the halving outpaced a 30% proc rate and bleed sat at one stack for the
        // entire fight. Laying three is what makes Rupture a spike instead of a rounding error.
        power: 1.6, cooldown: 3, bleed: 3,
        branches: [
            { id: "hemorrhage", name: "Hemorrhage", tag: "The wound does the killing" },
            { id: "butcher", name: "Butcher", tag: "The blow does the killing" },
            { id: "sanguine", name: "Sanguine", tag: "The wound feeds you" },
        ],
        nodes: [
            ...br("hemorrhage", [
                { id: "rp_deep", name: "Deeper", sprite: "/images/arena/skill/node/rp_deep.webp",
                    desc: "The wound bites considerably harder.", mod: { bleedDamage: 0.1 } },
                { id: "rp_ragged", name: "Ragged Edge", sprite: "/images/arena/skill/node/rp_ragged.webp",
                    desc: "Harder again, and the blow behind it lands heavier.", mod: { bleedDamage: 0.08, power: 0.15 } },
                { id: "rp_exsang", name: "Exsanguinate", sprite: "/images/arena/skill/node/rp_exsang.webp",
                    desc: "CAPSTONE. The wound becomes the weapon — it opens deeper, bites half again as hard, and the blow that opens it is a light one.",
                    mod: { bleedDamage: 0.18, power: -0.6, bleed: 2 } },
            ]),
            ...br("butcher", [
                { id: "rp_hooked", name: "Hooked", sprite: "/images/arena/skill/node/rp_hooked.webp",
                    desc: "Rupture pierces half of what their armour is worth.", mod: { pierce: 0.5 } },
                { id: "rp_twist", name: "Twist the Blade", sprite: "/images/arena/skill/node/rp_twist.webp",
                    desc: "Comes back a beat sooner, and hits harder.", mod: { cooldown: -1, power: 0.25 } },
                { id: "rp_second", name: "Second Cut", sprite: "/images/arena/skill/node/rp_second.webp",
                    desc: "CAPSTONE. Rupture strikes twice. Each blow rolls its own crit and each can deepen the wound.",
                    mod: { hits: 2, power: 0.15 } },
            ]),
            ...br("sanguine", [
                { id: "rp_meal", name: "Bloodmeal", sprite: "/images/arena/skill/node/rp_meal.webp",
                    desc: "A quarter of what Rupture lands comes back to you.", mod: { drain: 0.25 } },
                { id: "rp_sepsis", name: "Sepsis", sprite: "/images/arena/skill/node/rp_sepsis.webp",
                    desc: "A fifth of everything the wound does heals you too.", mod: { bleedLeech: 0.2 } },
                { id: "rp_vamp", name: "Red Thirst", sprite: "/images/arena/skill/node/rp_vamp.webp",
                    desc: "CAPSTONE. Half of the blow and a third of the wound both feed you. A lighter cut, and you fight forever.",
                    mod: { drain: 0.25, bleedLeech: 0.15, power: -0.3 } },
            ]),
        ],
    }),
    S({
        id: "onslaught", classId: "reaver", name: "Onslaught",
        sprite: "/images/arena/skill/onslaught.webp",
        blurb: "Three blows instead of one. Volume is its own kind of critical chance.",
        power: 0.7, hits: 3, cooldown: 4,
        branches: [
            { id: "storm", name: "Storm", tag: "More blows, more rolls" },
            { id: "weight", name: "Weight", tag: "Fewer blows, each one lands" },
            { id: "frenzy", name: "Frenzy", tag: "It never stops coming" },
        ],
        nodes: [
            ...br("storm", [
                { id: "on_fourth", name: "Fourth Blow", sprite: "/images/arena/skill/node/on_fourth.webp",
                    desc: "A fourth swing in the same breath.", mod: { hits: 1 } },
                { id: "on_fifth", name: "Fifth Blow", sprite: "/images/arena/skill/node/on_fifth.webp",
                    desc: "And a fifth.", mod: { hits: 1 } },
                { id: "on_whirl", name: "Whirlwind", sprite: "/images/arena/skill/node/on_whirl.webp",
                    desc: "CAPSTONE. Seven blows, each one lighter. Nothing in the game rolls a critical this often.",
                    mod: { hits: 2, power: -0.16 } },
            ]),
            ...br("weight", [
                { id: "on_heavy", name: "Heavy Hands", sprite: "/images/arena/skill/node/on_heavy.webp",
                    desc: "Every blow of it lands markedly harder.", mod: { power: 0.25 } },
                { id: "on_ragged", name: "Ragged", sprite: "/images/arena/skill/node/on_ragged.webp",
                    desc: "The flurry leaves a wound behind it.", mod: { bleed: 1 } },
                { id: "on_cleave", name: "Cleave", sprite: "/images/arena/skill/node/on_cleave.webp",
                    desc: "CAPSTONE. Two blows instead of three, each one enormous and straight through the plate.",
                    mod: { hits: -1, power: 0.75, pierce: 0.4 } },
            ]),
            ...br("frenzy", [
                { id: "on_relent", name: "Relentless", sprite: "/images/arena/skill/node/on_relent.webp",
                    desc: "Comes back two beats sooner.", mod: { cooldown: -2 } },
                { id: "on_wind", name: "Second Wind", sprite: "/images/arena/skill/node/on_wind.webp",
                    desc: "Finishing the flurry doubles your turn bar's speed for six seconds.", mod: { haste: 1 } },
                { id: "on_cadence", name: "Cadence", sprite: "/images/arena/skill/node/on_cadence.webp",
                    desc: "CAPSTONE. Ready every other beat. Lighter blows, thrown twice as often as anybody else can answer.",
                    mod: { cooldown: -2, power: -0.18 } },
            ]),
        ],
    }),
    S({
        id: "execute", classId: "reaver", name: "Execute",
        sprite: "/images/arena/skill/execute.webp",
        blurb: "Ordinary against a healthy fighter. Not ordinary against a hurt one.",
        power: 1.3, cooldown: 4, executeAt: 0.4, executeMax: 1.6,
        branches: [
            { id: "predator", name: "Predator", tag: "It starts working sooner" },
            { id: "guillotine", name: "Guillotine", tag: "It finishes far harder" },
            { id: "laststand", name: "Last Stand", tag: "It reads YOUR wounds, not theirs" },
        ],
        nodes: [
            ...br("predator", [
                { id: "ex_sight", name: "Killing Sight", sprite: "/images/arena/skill/node/ex_sight.webp",
                    desc: "Starts scaling from two-thirds health instead of two-fifths.", mod: { executeAt: 0.27 } },
                { id: "ex_quick", name: "No Mercy", sprite: "/images/arena/skill/node/ex_quick.webp",
                    desc: "Comes back a beat sooner.", mod: { cooldown: -1 } },
                { id: "ex_mark", name: "Hunter's Mark", sprite: "/images/arena/skill/node/ex_mark.webp",
                    desc: "CAPSTONE. It scales from nearly full health, but never as steeply — Execute stops being a finisher and becomes your swing.",
                    mod: { executeAt: 0.23, executeMax: -0.45, cooldown: -1 } },
            ]),
            ...br("guillotine", [
                { id: "ex_hunger", name: "Hunger", sprite: "/images/arena/skill/node/ex_hunger.webp",
                    desc: "Scales far harder at the bottom of it.", mod: { executeMax: 1.2 } },
                { id: "ex_through", name: "Through the Plate", sprite: "/images/arena/skill/node/ex_through.webp",
                    desc: "Ignores two-fifths of their armour.", mod: { pierce: 0.4 } },
                { id: "ex_headsman", name: "Headsman", sprite: "/images/arena/skill/node/ex_headsman.webp",
                    desc: "CAPSTONE. On a dying fighter it is the biggest number in the game, and a quarter of it burns past shields.",
                    mod: { executeMax: 1.5, soulfire: 0.25 } },
            ]),
            ...br("laststand", [
                { id: "ex_desp", name: "Desperation", sprite: "/images/arena/skill/node/ex_desp.webp",
                    desc: "It also scales on how hurt YOU are, from half health down.",
                    mod: { desperateAt: 0.5, desperateMax: 0.9 } },
                { id: "ex_cling", name: "Cling On", sprite: "/images/arena/skill/node/ex_cling.webp",
                    desc: "A fifth of what it lands comes back to you — the swing that saves you.", mod: { drain: 0.2 } },
                { id: "ex_defy", name: "Defiance", sprite: "/images/arena/skill/node/ex_defy.webp",
                    desc: "CAPSTONE. Cornered, it is monstrous; healthy, it is nothing special. The comeback button.",
                    mod: { desperateAt: 0.25, desperateMax: 1.4, executeMax: -0.7 } },
            ]),
        ],
    }),

    // ══ WARDEN ══ the fight is won by still being there.
    S({
        id: "bastion", classId: "warden", name: "Bastion",
        sprite: "/images/arena/skill/bastion.webp",
        blurb: "Raise the shield. What it eats never reaches you at all.",
        power: 0, cooldown: 3, shield: 0.18,
        branches: [
            { id: "fortress", name: "Fortress", tag: "Nothing gets through" },
            { id: "reprisal", name: "Reprisal", tag: "The shield is a weapon" },
            { id: "resolve", name: "Resolve", tag: "Nothing holds you still" },
        ],
        nodes: [
            ...br("fortress", [
                { id: "ba_wall", name: "Wall", sprite: "/images/arena/skill/node/ba_wall.webp",
                    desc: "A markedly bigger shield.", mod: { shield: 0.1 } },
                { id: "ba_mend", name: "Mending Stance", sprite: "/images/arena/skill/node/ba_mend.webp",
                    desc: "Raising it patches you up as well.", mod: { heal: 0.08 } },
                { id: "ba_aegis", name: "Aegis", sprite: "/images/arena/skill/node/ba_aegis.webp",
                    desc: "CAPSTONE. The shield is half again as large and the mending doubles. Almost nothing reaches health.",
                    mod: { shield: 0.16, heal: 0.08, cooldown: 1 } },
            ]),
            ...br("reprisal", [
                { id: "ba_spite", name: "Spiteful Plate", sprite: "/images/arena/skill/node/ba_spite.webp",
                    desc: "It answers back — a share of what the shield turns aside goes down their blade.",
                    mod: { thorns: 0.35 } },
                { id: "ba_ready", name: "Ready Guard", sprite: "/images/arena/skill/node/ba_ready.webp",
                    desc: "Comes back a beat sooner.", mod: { cooldown: -1 } },
                { id: "ba_free", name: "Second Nature", sprite: "/images/arena/skill/node/ba_free.webp",
                    desc: "CAPSTONE. Raising the shield no longer costs you the beat. Put it up, then swing anyway.",
                    mod: { free: true, thorns: 0.2, shield: -0.05 } },
            ]),
            ...br("resolve", [
                { id: "ba_clear", name: "Clear Head", sprite: "/images/arena/skill/node/ba_clear.webp",
                    desc: "Raising the shield shakes the ice off your turn bar and starts it moving again.", mod: { unfreeze: 1 } },
                { id: "ba_staunch", name: "Staunch", sprite: "/images/arena/skill/node/ba_staunch.webp",
                    desc: "And puts out a burn and closes a wound.", mod: { cleanse: true } },
                { id: "ba_unbowed", name: "Unbowed", sprite: "/images/arena/skill/node/ba_unbowed.webp",
                    desc: "CAPSTONE. Shrug off two beats of ice, clear everything, and come up hasted. A smaller shield — you are not hiding behind it.",
                    mod: { unfreeze: 1, haste: 1, shield: -0.06 } },
            ]),
        ],
    }),
    S({
        id: "retribution", classId: "warden", name: "Retribution",
        sprite: "/images/arena/skill/retribution.webp",
        blurb: "Everything they have done to you since your last swing, handed back on this one.",
        power: 1.1, cooldown: 4, grudge: 0.6,
        branches: [
            { id: "ledger", name: "Ledger", tag: "Bank it all, spend it once" },
            { id: "punish", name: "Punish", tag: "Answer often, and stop them" },
            { id: "bloodprice", name: "Blood Price", tag: "The answer puts you back together" },
        ],
        nodes: [
            ...br("ledger", [
                { id: "re_memory", name: "Long Memory", sprite: "/images/arena/skill/node/re_memory.webp",
                    desc: "You hand back far more of what was banked.", mod: { grudge: 0.45 } },
                { id: "re_keep", name: "Nothing Forgiven", sprite: "/images/arena/skill/node/re_keep.webp",
                    desc: "Half the ledger survives the swing instead of clearing.", mod: { keepGrudge: 0.5 } },
                { id: "re_reckon", name: "Reckoning", sprite: "/images/arena/skill/node/re_reckon.webp",
                    desc: "CAPSTONE. The whole ledger comes back at once on a heavier blow — but it is a slow, patient button.",
                    mod: { grudge: 0.7, power: 0.35, cooldown: 1 } },
            ]),
            ...br("punish", [
                { id: "re_ring", name: "Ringing Blow", sprite: "/images/arena/skill/node/re_ring.webp",
                    desc: "Retribution freezes. Their turn bar stops dead.", mod: { freeze: 1 } },
                { id: "re_brace", name: "Bracing Answer", sprite: "/images/arena/skill/node/re_brace.webp",
                    desc: "Answering also raises a small shield.", mod: { shield: 0.1 } },
                { id: "re_back", name: "Backhand", sprite: "/images/arena/skill/node/re_back.webp",
                    desc: "CAPSTONE. Comes back twice as often and every answer takes a beat off them — a smaller ledger, spent constantly.",
                    mod: { cooldown: -2, grudge: -0.25 } },
            ]),
            ...br("bloodprice", [
                { id: "re_toll", name: "Toll", sprite: "/images/arena/skill/node/re_toll.webp",
                    desc: "A quarter of what the answer lands heals you.", mod: { drain: 0.25 } },
                { id: "re_pierce", name: "Through the Guard", sprite: "/images/arena/skill/node/re_pierce.webp",
                    desc: "It ignores two-fifths of their armour, so the drink is a real one.", mod: { pierce: 0.4 } },
                { id: "re_wergild", name: "Wergild", sprite: "/images/arena/skill/node/re_wergild.webp",
                    desc: "CAPSTONE. Half of everything it lands comes back, and the swing itself mends you. A modest blow that refuses to lose.",
                    mod: { drain: 0.25, heal: 0.1, grudge: -0.2 } },
            ]),
        ],
    }),
    S({
        id: "rally", classId: "warden", name: "Rally",
        sprite: "/images/arena/skill/rally.webp",
        blurb: "Stop the bleeding, put out the fire, and stand back up.",
        power: 0, cooldown: 5, heal: 0.16, cleanse: true,
        branches: [
            { id: "medic", name: "Field Medic", tag: "Stay standing" },
            { id: "warcry", name: "War Cry", tag: "Get back up swinging" },
            { id: "standard", name: "Standard", tag: "Come up behind a wall" },
        ],
        nodes: [
            ...br("medic", [
                { id: "ra_deep", name: "Deep Breath", sprite: "/images/arena/skill/node/ra_deep.webp",
                    desc: "A substantially bigger heal.", mod: { heal: 0.1 } },
                { id: "ra_soon", name: "Old Soldier", sprite: "/images/arena/skill/node/ra_soon.webp",
                    desc: "Comes back two beats sooner.", mod: { cooldown: -2 } },
                { id: "ra_const", name: "Constitution", sprite: "/images/arena/skill/node/ra_const.webp",
                    desc: "CAPSTONE. It heals nearly half of everything you have, and comes back sooner again.",
                    mod: { heal: 0.16, cooldown: -1 } },
            ]),
            ...br("warcry", [
                { id: "ra_clear", name: "Clear Head", sprite: "/images/arena/skill/node/ra_clear.webp",
                    desc: "Rally shakes the ice off your turn bar as well as closing the wounds.", mod: { unfreeze: 1 } },
                { id: "ra_roar", name: "Roar", sprite: "/images/arena/skill/node/ra_roar.webp",
                    desc: "You come up swinging — your turn bar runs at double speed for six seconds.", mod: { haste: 1 } },
                { id: "ra_fury", name: "Battle Fury", sprite: "/images/arena/skill/node/ra_fury.webp",
                    desc: "CAPSTONE. Standing up costs you no beat at all — a lighter heal, but you never stop swinging.",
                    mod: { free: true, heal: -0.07 } },
            ]),
            ...br("standard", [
                { id: "ra_ward", name: "Rallying Ward", sprite: "/images/arena/skill/node/ra_ward.webp",
                    desc: "You come up behind a shield.", mod: { shield: 0.12 } },
                { id: "ra_bristle", name: "Bristling", sprite: "/images/arena/skill/node/ra_bristle.webp",
                    desc: "And what that shield turns aside goes back down their blade.", mod: { thorns: 0.35 } },
                { id: "ra_banner", name: "Planted Banner", sprite: "/images/arena/skill/node/ra_banner.webp",
                    desc: "CAPSTONE. An enormous shield on top of the mending. Two beats where nothing they do matters.",
                    mod: { shield: 0.2, thorns: 0.15, heal: -0.05 } },
            ]),
        ],
    }),

    // ══ RUNECALLER ══ wins the rounds after the one they are in.
    S({
        id: "immolate", classId: "runecaller", name: "Immolate",
        sprite: "/images/arena/skill/immolate.webp",
        blurb: "Set them alight. Fire does not care what they are wearing.",
        power: 1.4, cooldown: 3, burn: 1,
        branches: [
            { id: "pyre", name: "Pyre", tag: "The fire does the killing" },
            { id: "lance", name: "Lance", tag: "The bolt does the killing" },
            { id: "emberdrink", name: "Emberdrink", tag: "The fire keeps you standing" },
        ],
        nodes: [
            ...br("pyre", [
                { id: "im_hot", name: "White Heat", sprite: "/images/arena/skill/node/im_hot.webp",
                    desc: "The burn ticks considerably harder.", mod: { burnDamage: 0.12 } },
                { id: "im_spread", name: "Spreading", sprite: "/images/arena/skill/node/im_spread.webp",
                    desc: "The fire opens a wound besides, and both tick past armour.", mod: { bleed: 1 } },
                { id: "im_conflag", name: "Conflagration", sprite: "/images/arena/skill/node/im_conflag.webp",
                    desc: "CAPSTONE. The fire roars — but the bolt that lights it is barely a candle.",
                    mod: { burnDamage: 0.2, power: -0.6 } },
            ]),
            ...br("lance", [
                { id: "im_focus", name: "Focused Flame", sprite: "/images/arena/skill/node/im_focus.webp",
                    desc: "A heavier bolt, back a beat sooner.", mod: { power: 0.35, cooldown: -1 } },
                { id: "im_sear", name: "Searing", sprite: "/images/arena/skill/node/im_sear.webp",
                    desc: "Ignores nearly half their armour.", mod: { pierce: 0.45 } },
                { id: "im_soul", name: "Soulfire", sprite: "/images/arena/skill/node/im_soul.webp",
                    desc: "CAPSTONE. A third of what lands is dealt again, past armour and shields both.",
                    mod: { soulfire: 0.3, power: 0.2 } },
            ]),
            ...br("emberdrink", [
                { id: "im_feed", name: "Feed the Fire", sprite: "/images/arena/skill/node/im_feed.webp",
                    desc: "A fifth of everything the burn does heals you.", mod: { burnLeech: 0.2 } },
                { id: "im_bank", name: "Banked Coals", sprite: "/images/arena/skill/node/im_bank.webp",
                    desc: "The bolt itself feeds you a quarter of what it lands.", mod: { drain: 0.25 } },
                { id: "im_phoenix", name: "Phoenix", sprite: "/images/arena/skill/node/im_phoenix.webp",
                    desc: "CAPSTONE. The fire drinks deep and you come up behind a ward. A gentler bolt, and an attrition nobody wins.",
                    mod: { burnLeech: 0.2, shield: 0.14, power: -0.35 } },
            ]),
        ],
    }),
    S({
        id: "rimebind", classId: "runecaller", name: "Rimebind",
        sprite: "/images/arena/skill/rimebind.webp",
        blurb: "A beat taken off them entirely. The cheapest damage in the game is the swing they never threw.",
        power: 0.9, cooldown: 4, freeze: 1, chill: 0.1,
        branches: [
            { id: "winter", name: "Deep Winter", tag: "Take their beats away" },
            { id: "shatter", name: "Shatter", tag: "Trade the ice for a hammer" },
            { id: "rimeguard", name: "Rimeguard", tag: "The ice is armour" },
        ],
        nodes: [
            ...br("winter", [
                { id: "ri_hold", name: "Hold Fast", sprite: "/images/arena/skill/node/ri_hold.webp",
                    desc: "The ice holds them twice as long.", mod: { freeze: 1 } },
                { id: "ri_cold", name: "Killing Cold", sprite: "/images/arena/skill/node/ri_cold.webp",
                    desc: "And the cold stays on them: their turn bar runs 12% slower, wearing off over eight seconds.", mod: { chill: 0.12 } },
                { id: "ri_zero", name: "Absolute Zero", sprite: "/images/arena/skill/node/ri_zero.webp",
                    desc: "CAPSTONE. 15% off their turn bar on top, and back a beat sooner. The cold stacks and nothing caps it.",
                    mod: { chill: 0.15, cooldown: -1, power: -0.2 } },
            ]),
            ...br("shatter", [
                { id: "ri_shatter", name: "Shatter", sprite: "/images/arena/skill/node/ri_shatter.webp",
                    desc: "Ice finds the seams: half their armour is not there.", mod: { pierce: 0.5 } },
                { id: "ri_split", name: "Splintering", sprite: "/images/arena/skill/node/ri_split.webp",
                    desc: "A markedly heavier blow behind the binding.", mod: { power: 0.45 } },
                { id: "ri_hard", name: "Hard Frost", sprite: "/images/arena/skill/node/ri_hard.webp",
                    desc: "CAPSTONE. Give up the binding entirely and it becomes the heaviest single blow a Runecaller throws.",
                    mod: { freeze: -1, power: 1.1 } },
            ]),
            ...br("rimeguard", [
                { id: "ri_rime", name: "Rime", sprite: "/images/arena/skill/node/ri_rime.webp",
                    desc: "You come away behind a shield of ice.", mod: { shield: 0.14 } },
                { id: "ri_barbs", name: "Frost Barbs", sprite: "/images/arena/skill/node/ri_barbs.webp",
                    desc: "What the ice turns aside goes back down their blade.", mod: { thorns: 0.4 } },
                { id: "ri_glacier", name: "Glacier", sprite: "/images/arena/skill/node/ri_glacier.webp",
                    desc: "CAPSTONE. A wall of ice, thorned, that mends you as it forms. The binding is an afterthought.",
                    mod: { shield: 0.18, heal: 0.1, power: -0.4 } },
            ]),
        ],
    }),
    S({
        id: "overflow", classId: "runecaller", name: "Overflow",
        sprite: "/images/arena/skill/overflow.webp",
        blurb: "Everything at once. The longest cooldown in the game, and the reason to survive to it.",
        power: 2.3, cooldown: 6,
        branches: [
            { id: "cataclysm", name: "Cataclysm", tag: "One button, everything on it" },
            { id: "wellspring", name: "Wellspring", tag: "Not one button — a rhythm" },
            { id: "reclaim", name: "Reclamation", tag: "It puts back what it spends" },
        ],
        nodes: [
            ...br("cataclysm", [
                { id: "ov_kindle", name: "Kindle", sprite: "/images/arena/skill/node/ov_kindle.webp",
                    desc: "It burns, guaranteed, on top of the blow.", mod: { burn: 1 } },
                { id: "ov_bind", name: "Bind", sprite: "/images/arena/skill/node/ov_bind.webp",
                    desc: "And freezes, guaranteed.", mod: { freeze: 1 } },
                { id: "ov_cata", name: "Cataclysm", sprite: "/images/arena/skill/node/ov_cata.webp",
                    desc: "CAPSTONE. Heavier again, and the cold lingers for the rest of the bout.",
                    mod: { power: 0.55, chill: 0.15 } },
            ]),
            ...br("wellspring", [
                { id: "ov_fork", name: "Forked", sprite: "/images/arena/skill/node/ov_fork.webp",
                    desc: "Discharges as two blows, each rolling its own crit.", mod: { hits: 2, power: -0.75 } },
                { id: "ov_quick", name: "Quickened", sprite: "/images/arena/skill/node/ov_quick.webp",
                    desc: "Comes back two beats sooner.", mod: { cooldown: -2 } },
                { id: "ov_well", name: "Wellspring", sprite: "/images/arena/skill/node/ov_well.webp",
                    desc: "CAPSTONE. Half the cooldown again. It stops being the thing you wait for and becomes the thing you do.",
                    mod: { cooldown: -2, power: -0.3 } },
            ]),
            ...br("reclaim", [
                { id: "ov_drink", name: "Drink Deep", sprite: "/images/arena/skill/node/ov_drink.webp",
                    desc: "Nearly a third of what it lands comes back to you.", mod: { drain: 0.3 } },
                { id: "ov_pierce", name: "Unmaking", sprite: "/images/arena/skill/node/ov_pierce.webp",
                    desc: "Ignores three-fifths of their armour, so there is more to drink.", mod: { pierce: 0.6 } },
                { id: "ov_font", name: "Font", sprite: "/images/arena/skill/node/ov_font.webp",
                    desc: "CAPSTONE. Half of an enormous blow comes back, and you stand behind a ward afterwards.",
                    mod: { drain: 0.2, shield: 0.16, power: -0.25 } },
            ]),
        ],
    }),
];

export const skillById = (id) => SKILLS.find((s) => s.id === id) || null;
export const skillsForClass = (classId) => SKILLS.filter((s) => s.classId === classId);

/**
 * A skill as the ring will actually apply it: the base, plus every node the member has taken, merged.
 *
 * `taken` is the member's `skills` bag — { skillId: [nodeId, ...] }. A skill absent from it is not unlocked and
 * returns null, which is the ONLY gate. There is no tier, no prerequisite and no ordering inside a skill's
 * tree: five nodes, one point each, take them in whatever order you like.
 */
export function resolveSkill(skillId, taken = {}) {
    const base = skillById(skillId);
    if (!base) return null;
    const nodeIds = taken[skillId];
    if (!Array.isArray(nodeIds)) return null;              // not unlocked at all
    const out = { ...base, nodes: undefined, taken: [] };
    delete out.nodes;
    for (const n of base.nodes) {
        if (!nodeIds.includes(n.id)) continue;
        out.taken.push(n.id);
        for (const [k, v] of Object.entries(n.mod)) {
            if (typeof v === "boolean") out[k] = v;
            else out[k] = (Number(out[k]) || 0) + v;
        }
    }
    // A node that shaves the cooldown can never take it below usable-next-turn, and a node that trims power
    // can never make a skill heal the other fighter. Clamped here rather than in the ring, so a bad number
    // cannot reach the engine at all.
    out.cooldown = Math.max(0, Math.round(out.cooldown));
    out.power = Math.max(0, out.power);
    out.hits = Math.max(0, Math.round(out.hits));
    out.pierce = Math.max(0, Math.min(1, out.pierce || 0));
    // Both scaling windows are FRACTIONS OF HEALTH and both can be pushed by a capstone that also pushes the
    // other way — Defiance raises the desperate window while cutting the execute one. Clamped so a stacked
    // build can never invert either into a negative window, which would read as "scales when they are above
    // full health" and multiply by a negative.
    out.executeAt = Math.max(0, Math.min(1, out.executeAt || 0));
    out.executeMax = Math.max(0, out.executeMax || 0);
    out.desperateAt = Math.max(0, Math.min(1, out.desperateAt || 0));
    out.desperateMax = Math.max(0, out.desperateMax || 0);
    // A freeze a capstone gave away (Hard Frost) must land on zero, not on minus one — a negative freeze would
    // subtract from the beats they have already lost.
    out.freeze = Math.max(0, Math.round(out.freeze || 0));
    return out;
}

// ── WHAT A NODE ACTUALLY CHANGES, IN THE UNITS ON THE CARD ───────────────────────────────────────────────────
// A node's `desc` says "a markedly bigger shield" and a member's next question is always "bigger than what, by
// how much". The panel had the answer the whole time and was not printing it: skillState already resolves the
// skill with and without each node, so the difference between those two objects IS the number.
//
// Derived by diffing two resolved skills rather than by reading `mod`, deliberately. `mod` is the raw delta,
// which is not what lands — clamps, a capstone pulling one number down while pushing another up, and two nodes
// touching the same field all happen between `mod` and the bout. Diffing the resolved objects reports what the
// ring will actually swing with.
const FIELD_LABELS = {
    power: ["Power", "x"], hits: ["Blows", ""], cooldown: ["Cooldown", "beats"],
    shield: ["Shield", "%"], heal: ["Heal", "%"], drain: ["Drain", "%"], pierce: ["Pierce", "%"],
    soulfire: ["Soulfire", "%"], grudge: ["Grudge", "%"], thorns: ["Thorns", "%"], chill: ["Chill", "%"],
    freeze: ["Freeze", "x"], bleedDamage: ["Wound tick", "%"], bleedLeech: ["Wound leech", "%"],
    burnDamage: ["Burn tick", "%"], burnLeech: ["Burn leech", "%"], keepGrudge: ["Ledger kept", "%"],
    executeAt: ["Execute from", "%"], executeMax: ["Execute peak", "%"],
    desperateAt: ["Desperate from", "%"], desperateMax: ["Desperate peak", "%"],
    bleed: ["Wound", "flag"], burn: ["Burn", "flag"], cleanse: ["Cleanse", "flag"],
    unfreeze: ["Shrug the ice off", "flag"], haste: ["Double bar speed", "flag"], free: ["Costs no beat", "flag"],
};

const shown = (v, unit) => {
    if (unit === "flag") return v ? "yes" : "no";
    if (unit === "%") return `${Math.round((Number(v) || 0) * 100)}%`;
    if (unit === "x") return `${(Number(v) || 0).toFixed(2)}x`;
    return String(Math.round(Number(v) || 0));
};

/** The fields that move between two resolved skills, as { label, from, to, better }. */
export function skillDelta(before, after) {
    if (!before || !after) return [];
    const out = [];
    for (const [key, [label, unit]] of Object.entries(FIELD_LABELS)) {
        const a = before[key] ?? (unit === "flag" ? false : 0);
        const b = after[key] ?? (unit === "flag" ? false : 0);
        if (unit === "flag" ? Boolean(a) === Boolean(b) : Math.abs((Number(a) || 0) - (Number(b) || 0)) < 1e-9) continue;
        out.push({
            key, label, from: shown(a, unit), to: shown(b, unit),
            // Lower is better for exactly one field, and getting that backwards would paint every
            // cooldown reduction red.
            better: key === "cooldown" ? Number(b) < Number(a) : (unit === "flag" ? Boolean(b) : Number(b) > Number(a)),
        });
    }
    return out;
}

/**
 * THE PANEL'S VIEW OF A CLASS, the same way treeState is the tree's.
 *
 * The screen renders from this and nothing else, so it can never offer a node the server would refuse — that
 * rule is why the passive tree could be trusted and it is worth keeping. `now` and `next` are what the skill
 * IS and what it BECOMES with the node in hand, both built by resolveSkill, so a card cannot print a promise
 * the ring will not honour.
 */
export function skillState(classId, taken = {}, pointsAvailable = 0) {
    return skillsForClass(classId).map((def) => {
        const mine = Array.isArray(taken[def.id]) ? taken[def.id] : null;
        const unlocked = Boolean(mine);
        const resolved = unlocked ? resolveSkill(def.id, taken) : resolveSkill(def.id, { [def.id]: [] });
        return {
            id: def.id,
            name: def.name,
            blurb: def.blurb,
            sprite: def.sprite,
            classId: def.classId,
            unlocked,
            canUnlock: !unlocked && pointsAvailable >= SKILL_UNLOCK_COST,
            spent: unlocked ? SKILL_UNLOCK_COST + mine.length * NODE_COST : 0,
            now: resolved,
            // ── THE BRANCHES, EACH AS ITS OWN LADDER ─────────────────────────────────────────────────────
            // Grouped rather than flat, because the panel has to draw them as two columns and because the
            // prerequisite only ever looks at the node directly above — a branch is a ladder, not a graph.
            branches: (def.branches || []).map((b) => {
                const rungs = def.nodes.filter((n) => n.branch === b.id).sort((x, y) => x.tier - y.tier);
                let blocked = false;                 // everything below the first rung you have not bought
                return {
                    ...b,
                    depth: rungs.filter((n) => unlocked && mine.includes(n.id)).length,
                    nodes: rungs.map((n) => {
                        const held = unlocked && mine.includes(n.id);
                        // A node needs the one above it in ITS OWN branch. That is the whole prerequisite
                        // system, and it is what stops a member reaching a capstone by spending points
                        // halfway down both sides.
                        const open = unlocked && !blocked;
                        if (!held) blocked = true;
                        // Everything under it in this branch dies with it — none of it could have been
                        // bought without this rung — so a refund preview has to remove them too or the
                        // number it prints is not the number the refund produces.
                        const doomed = new Set([n.id, ...rungs.filter((x) => x.tier > n.tier).map((x) => x.id)]);
                        const withoutIt = held
                            ? resolveSkill(def.id, { [def.id]: mine.filter((id) => !doomed.has(id)) })
                            : null;
                        const withIt = held ? null : resolveSkill(def.id, { [def.id]: [...(mine || []), n.id] });
                        return {
                            ...n,
                            held,
                            open,
                            canTake: open && !held && pointsAvailable >= NODE_COST,
                            next: withIt,
                            // What this rung is worth, in the units the card prints. For an unheld node it is
                            // what taking it buys; for a held one it is what giving it back would cost, which
                            // is the same question asked from the other side.
                            delta: held
                                ? skillDelta(withoutIt, resolveSkill(def.id, taken))
                                : skillDelta(resolveSkill(def.id, taken), withIt),
                            // How many points come back if this rung goes — itself plus everything under it.
                            refunds: held ? [...doomed].filter((id) => mine.includes(id)).length : 0,
                        };
                    }),
                };
            }),
            nodes: def.nodes.map((n) => ({ ...n, held: unlocked && mine.includes(n.id) })),
        };
    });
}

/** What a member has spent on skills, for the panel and for the respec price. */
// ── AND ONLY THE ONES THIS CLASS CAN ACTUALLY USE ────────────────────────────────────────────────────────────
// GrayKitsune: "Used the coin bought switch from Reaver to Warden, put my skill points in but now I can't put
// any of my active skill points in."
//
// Changing class emptied the passive tree and left the ACTIVE skills bag untouched, so a Warden was still
// carrying nine nodes of Rupture and four of Onslaught — Reaver skills, unusable, unreachable, and counted
// here as spent. An unlock and a node each cost one, so his thirteen nodes and two unlocks came to exactly
// the fifteen points his re-spent tree had just earned him. Available: nothing. He had paid gold to switch
// class and the switch took every skill point he owned.
//
// `classId` is optional so the lab and the previews can still ask "what does this bag cost" in the abstract,
// but every gate that decides whether a member may SPEND passes it. Fixing it on the read as well as on the
// write means anybody already stranded is freed the moment this ships, with no migration to get wrong.
export function skillPointsSpent(taken = {}, classId = null) {
    let n = 0;
    for (const [id, nodes] of Object.entries(taken || {})) {
        const sk = skillById(id);
        if (!sk || !Array.isArray(nodes)) continue;
        if (classId && sk.classId !== classId) continue;
        n += SKILL_UNLOCK_COST + nodes.length * NODE_COST;
    }
    return n;
}

// ── AND SO DOES SOMETHING THAT WAS NEVER A PERSON ────────────────────────────────────────────────────────────
// Road rungs, Gauntlet tiers, plaza raiders and hooked monsters have no arena row, so they have no skills bag,
// so housePick found nothing and every one of them threw a bare swing for the whole fight. Luke, playing a
// rung: "he takes like eight attacks and doesn't go water splash or icicle blast or something."
//
// He is describing a foe that CANNOT. NPCs carry `abilities` — the old gear-signature list — and the ring does
// not read it; that list belonged to an engine that was deleted. So they had a deck the fight could not see.
//
// This gives them a real one, off the catalog members use, so an NPC is a made-up player in this too — the
// same rule arena-npc.js already follows for stats ("an NPC is a made-up player now, not a parallel stat
// system"). Two systems inventing opponents is how they end up disagreeing about what a fight is.
//
// THE ARCHETYPE PICKS THE CLASS and the rung picks the depth, so a rung-8 brute swings Onslaught at base and a
// rung-60 one arrives with a capstone. Deterministic off the rung: the same rung always brings the same build,
// which is what lets somebody walk away and plan against it rather than reroll until it is easy.
const NPC_CLASS = {
    wall: "warden", brute: "reaver", berserker: "reaver",
    duelist: "reaver", balanced: "runecaller", caster: "runecaller",
};

// Which branch each archetype commits to — the one that reads like the thing it is supposed to BE.
const NPC_BRANCH = {
    wall: ["fortress", "medic", "ledger"],
    brute: ["weight", "guillotine", "butcher"],
    berserker: ["storm", "butcher", "frenzy"],
    duelist: ["predator", "hemorrhage", "punish"],
    balanced: ["lance", "winter", "cataclysm"],
    caster: ["pyre", "shatter", "wellspring"],
};

/**
 * The deck a designed opponent brings, given its archetype and how far up it stands.
 *
 * Depth is the whole difficulty curve here: one skill at base low down, a second by the middle, a capstone at
 * the top. It is deliberately NOT random — a rung you cannot plan against is a rung you can only grind.
 */
export function npcSkills(rung = 1, archetype = "balanced") {
    const classId = NPC_CLASS[archetype] || "runecaller";
    const want = NPC_BRANCH[archetype] || NPC_BRANCH.balanced;
    const mine = skillsForClass(classId);
    // How many rungs deep, and how many skills wide. A rung-1 foe has one skill at base; by rung 40 it has
    // two skills with a capstone on the first.
    const depth = Math.max(1, Math.min(3, 1 + Math.floor(Math.max(0, rung) / 18)));
    const width = Math.max(1, Math.min(3, 1 + Math.floor(Math.max(0, rung) / 12)));
    const bag = {};
    for (let i = 0; i < width; i += 1) {
        const branchId = want[i];
        const skill = mine.find((sk) => sk.branches.some((b) => b.id === branchId));
        if (!skill) continue;
        // The first skill runs deepest; the ones after it are shallower, so a foe reads as one plan with
        // support rather than three half-finished ideas.
        const d = Math.max(1, depth - i);
        bag[skill.id] = skill.nodes
            .filter((n) => n.branch === branchId && n.tier < d)
            .map((n) => n.id);
    }
    return bag;
}

// ── THE HOUSE PLAYS ITS SKILLS TOO ───────────────────────────────────────────────────────────────────────────
// You fight a LOADOUT, not a person — nobody is sitting on the other end of a defence to pick anything. Luke,
// back when the lopsidedness was about timing: "it can't be super lopsided playing async against someone who
// has no ability to tap." The timing is gone and that sentence outlived it, because it was never really about
// taps: a defence that throws nothing but plain attacks is a practice dummy wearing somebody's gear.
//
// Measured before this existed: a member with ONE point in any of the nine beat a skill-less mirror of
// themselves 88-100% of the time. That is not a balance result, it is a punching bag.
//
// So the defence fights its own build — the class it picked and the nodes it actually bought — and chooses
// between them on the same three facts a person would look at: how hurt am I, how hurt are they, and is the
// big one ready. `priority` returns a want; the highest want that is off cooldown gets cast.
//
// Deliberately NOT a good player. It does not count beats to line up Overflow behind a Rimebind, and it does
// not hold Execute for the kill it can see coming. A defence should be competent and legible, not a machine
// nobody can beat — the point is that it plays its kit, not that it plays it perfectly.
const WANTS = {
    // End it. Worth more the closer they are to the floor, and worth nothing at all up top.
    execute: ({ foeFrac }) => (foeFrac < 0.45 ? 3 + (0.45 - foeFrac) * 8 : 0.2),
    // Volume, whenever there is nothing better to do.
    onslaught: () => 1.6,
    // Get the wound running early — it pays over the beats that follow, so it is worth most while there ARE
    // beats that follow.
    rupture: ({ foeFrac }) => (foeFrac > 0.3 ? 2.2 : 1),
    immolate: ({ foeFrac }) => (foeFrac > 0.3 ? 2.2 : 1),
    // Control. Best used while they still have swings worth stealing.
    rimebind: ({ foeFrac }) => (foeFrac > 0.25 ? 2.4 : 1.2),
    // The big one. Always worth casting the moment it is up.
    overflow: () => 4,
    // Put the shield up when there is not one, and never otherwise.
    bastion: ({ shield }) => (shield > 0 ? 0 : 2.6),
    // Bank first, spend when there is something banked worth spending.
    retribution: ({ banked, maxHp }) => 1.2 + Math.min(3, (banked / Math.max(1, maxHp)) * 12),
    // Patch up when it matters, and not before — a Rally at full health is a wasted beat.
    rally: ({ selfFrac, bleeding }) => (selfFrac < 0.55 ? 4.5 - selfFrac * 4 : (bleeding ? 1.4 : 0)),
};

/**
 * What the absent fighter reaches for this beat, or null to throw a plain attack.
 *
 * `taken` is their own skills bag, so a defence fights the build its owner actually paid for. `cd` is the
 * ring's cooldown bag for that side.
 */
export function housePick(taken = {}, cd = {}, ctx = {}) {
    let best = null;
    let bestWant = 1;                       // a plain attack is worth 1; nothing below that is worth a beat
    for (const id of Object.keys(taken || {})) {
        if (cd[id] > 0) continue;
        const skill = resolveSkill(id, taken);
        if (!skill) continue;
        const want = (WANTS[id] || (() => 1.5))(ctx);
        if (want > bestWant) { best = skill; bestWant = want; }
    }
    return best;
}
