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
//   haste       1 hastes you: five swings at double rate
//   grudge      share of the damage banked since your last swing, added to this blow
//   executeAt   their health fraction below which this starts scaling up
//   executeMax  the extra multiplier at zero health, scaling in linearly from executeAt
//   pierce      extra share of their armour this blow ignores
//   chill       share taken off their clock for the rest of the bout
//   soulfire    share of what landed, dealt again past armour and shields both
//   free        true means it does NOT cost your beat — you cast it and still swing
export const SKILL_UNLOCK_COST = 1;
export const NODE_COST = 1;

// ── THE EXCHANGE RATE ────────────────────────────────────────────────────────────────────────────────────────
// Three points in the passive tree buys one skill point. Luke's number, and it lands the economy in a good
// place: the passive tree caps at 60 points, so a fully-invested member ends with 20 skill points against the
// 18 it costs to own all three skills at full depth. Completionism is reachable at the very end of a very long
// road, and everybody short of that — which is everybody — is making a real choice about depth against breadth.
export const TREE_POINTS_PER_SKILL_POINT = 3;

/** How many skill points a member has earned, ever. Derived from what is in the passive tree rather than
 *  stored, so it can never drift out of step with a respec. */
export const skillPointsFrom = (treePointsSpent = 0) =>
    Math.floor(Math.max(0, Number(treePointsSpent) || 0) / TREE_POINTS_PER_SKILL_POINT);

// ── A SKILL IS A FORK, NOT A STACK ───────────────────────────────────────────────────────────────────────────
// The first build gave each skill five flat nodes with no ordering. Every one of them was an improvement, so
// every path through them arrived at the same place — a bigger version of the skill you started with. Luke, on
// seeing it: "I was hoping there'd be meaningful decisions for each skill... being able to invest between
// different branches in it so that you can have it do different things depending on which branch."
//
// So every skill is TWO BRANCHES OF THREE, and the branches disagree about what the skill is for. Rupture is
// either a wound that kills over six beats or a single hooked blow that ignores armour. Rimebind either steals
// two beats or trades the freeze away entirely for a hammer. Overflow either detonates everything at once or
// comes back twice as often. Those are different buttons, not different sizes of the same button.
//
// ── THE CAPSTONES GIVE SOMETHING UP ──────────────────────────────────────────────────────────────────────────
// Deliberately, and it is the part that makes a branch a choice rather than a direction. Exsanguinate makes
// the wound enormous and the blow that opens it feeble. Cleave drops a blow to make the rest huge. Hard Frost
// throws the freeze away. A capstone that was purely better would mean the branches only differed in flavour,
// and the member picking one would be picking a colour.
//
// ── THE ORDERING IS THE COMMITMENT ───────────────────────────────────────────────────────────────────────────
// Within a branch a node needs the one before it. That is the only prerequisite in the system, and it is what
// makes depth cost something structural rather than just costing points: you cannot reach either capstone if
// you spent your points halfway down both. Splitting is a legitimate build — two solid mid-branch nodes — it
// just is not the same build as committing.
//
// The economy: 1 to unlock, 3 more to run one branch to its capstone, 7 to own all six nodes. Three skills
// fully owned is 21 points against the 20 a maxed passive tree pays out, so nobody ever holds all of it.
const S = (o) => ({ power: 1, hits: 0, cooldown: 3, ...o });

// `br` stamps the branch and the depth onto each node, so the flat list stays the thing resolveSkill merges
// while the panel still has the structure it needs to draw two columns.
const br = (branch, nodes) => nodes.map((n, i) => ({ ...n, branch, tier: i }));

export const SKILLS = [
    // ══ REAVER ══ open the artery, then hit what is bleeding.
    S({
        id: "rupture", classId: "reaver", name: "Rupture",
        sprite: "/images/arena/skill-bloodlust.webp",
        blurb: "A blow that opens the artery. Wounds tick past armour, which is the point of them.",
        power: 1.6, cooldown: 3, bleed: 1,
        branches: [
            { id: "hemorrhage", name: "Hemorrhage", tag: "The wound does the killing" },
            { id: "butcher", name: "Butcher", tag: "The blow does the killing" },
        ],
        nodes: [
            ...br("hemorrhage", [
                { id: "rp_deep", name: "Deeper", sprite: "/images/arena/node/rv_rend.webp",
                    desc: "The wound bites considerably harder.", mod: { bleedDamage: 0.1 } },
                { id: "rp_sepsis", name: "Sepsis", sprite: "/images/arena/node/rv_leech.webp",
                    desc: "A fifth of everything the wound does heals you.", mod: { bleedLeech: 0.2 } },
                { id: "rp_exsang", name: "Exsanguinate", sprite: "/images/arena/node/rv_open.webp",
                    desc: "CAPSTONE. The wound becomes the weapon — it bites half again as hard, and the blow that opens it is a light one.",
                    mod: { bleedDamage: 0.16, power: -0.45 } },
            ]),
            ...br("butcher", [
                { id: "rp_hooked", name: "Hooked", sprite: "/images/arena/node/rv_pierce.webp",
                    desc: "Rupture pierces half of what their armour is worth.", mod: { pierce: 0.5 } },
                { id: "rp_twist", name: "Twist the Blade", sprite: "/images/arena/node/rv_critdmg.webp",
                    desc: "Comes back a beat sooner, and hits harder.", mod: { cooldown: -1, power: 0.25 } },
                { id: "rp_second", name: "Second Cut", sprite: "/images/arena/node/rv_flurry.webp",
                    desc: "CAPSTONE. Rupture strikes twice. Each blow rolls its own crit and each can deepen the wound.",
                    mod: { hits: 2, power: 0.15 } },
            ]),
        ],
    }),
    S({
        id: "onslaught", classId: "reaver", name: "Onslaught",
        sprite: "/images/arena/skill-onslaught.webp",
        blurb: "Three blows instead of one. Volume is its own kind of critical chance.",
        power: 0.7, hits: 3, cooldown: 4,
        branches: [
            { id: "storm", name: "Storm", tag: "More blows, more rolls" },
            { id: "weight", name: "Weight", tag: "Fewer blows, each one lands" },
        ],
        nodes: [
            ...br("storm", [
                { id: "on_fourth", name: "Fourth Blow", sprite: "/images/arena/node/rv_flurry.webp",
                    desc: "A fourth swing in the same breath.", mod: { hits: 1 } },
                { id: "on_relent", name: "Relentless", sprite: "/images/arena/node/rv_speed.webp",
                    desc: "Comes back two beats sooner.", mod: { cooldown: -2 } },
                { id: "on_whirl", name: "Whirlwind", sprite: "/images/arena/node/rv_haste.webp",
                    desc: "CAPSTONE. Six blows, each one lighter, and finishing the flurry hastes you.",
                    mod: { hits: 2, power: -0.14, haste: 1 } },
            ]),
            ...br("weight", [
                { id: "on_heavy", name: "Heavy Hands", sprite: "/images/arena/node/rv_might.webp",
                    desc: "Every blow of it lands markedly harder.", mod: { power: 0.25 } },
                { id: "on_ragged", name: "Ragged", sprite: "/images/arena/node/rv_rend.webp",
                    desc: "The flurry leaves a wound behind it.", mod: { bleed: 1 } },
                { id: "on_cleave", name: "Cleave", sprite: "/images/arena/node/rv_cap.webp",
                    desc: "CAPSTONE. Two blows instead of three, each one enormous and straight through the plate.",
                    mod: { hits: -1, power: 0.75, pierce: 0.4 } },
            ]),
        ],
    }),
    S({
        id: "execute", classId: "reaver", name: "Execute",
        sprite: "/images/arena/skill-opportunist.webp",
        blurb: "Ordinary against a healthy fighter. Not ordinary against a hurt one.",
        power: 1.3, cooldown: 4, executeAt: 0.4, executeMax: 1.6,
        branches: [
            { id: "predator", name: "Predator", tag: "It starts working sooner" },
            { id: "guillotine", name: "Guillotine", tag: "It finishes far harder" },
        ],
        nodes: [
            ...br("predator", [
                { id: "ex_sight", name: "Killing Sight", sprite: "/images/arena/node/rv_execute.webp",
                    desc: "Starts scaling from two-thirds health instead of two-fifths.", mod: { executeAt: 0.27 } },
                { id: "ex_quick", name: "No Mercy", sprite: "/images/arena/node/rv_speed.webp",
                    desc: "Comes back a beat sooner.", mod: { cooldown: -1 } },
                { id: "ex_mark", name: "Hunter's Mark", sprite: "/images/arena/node/rv_open.webp",
                    desc: "CAPSTONE. It scales from nearly full health, but never as steeply — Execute stops being a finisher and becomes your swing.",
                    mod: { executeAt: 0.23, executeMax: -0.45 } },
            ]),
            ...br("guillotine", [
                { id: "ex_hunger", name: "Hunger", sprite: "/images/arena/node/rv_critdmg.webp",
                    desc: "Scales far harder at the bottom of it.", mod: { executeMax: 1.2 } },
                { id: "ex_through", name: "Through the Plate", sprite: "/images/arena/node/rv_pierce.webp",
                    desc: "Ignores two-fifths of their armour.", mod: { pierce: 0.4 } },
                { id: "ex_headsman", name: "Headsman", sprite: "/images/arena/node/rv_gamble.webp",
                    desc: "CAPSTONE. On a dying fighter it is the biggest number in the game, and a quarter of it burns past shields.",
                    mod: { executeMax: 1.5, soulfire: 0.25 } },
            ]),
        ],
    }),

    // ══ WARDEN ══ the fight is won by still being there.
    S({
        id: "bastion", classId: "warden", name: "Bastion",
        sprite: "/images/arena/skill-vanguard.webp",
        blurb: "Raise the shield. What it eats never reaches you at all.",
        power: 0, cooldown: 3, shield: 0.18,
        branches: [
            { id: "fortress", name: "Fortress", tag: "Nothing gets through" },
            { id: "reprisal", name: "Reprisal", tag: "The shield is a weapon" },
        ],
        nodes: [
            ...br("fortress", [
                { id: "ba_wall", name: "Wall", sprite: "/images/arena/node/wd_shieldcap.webp",
                    desc: "A markedly bigger shield.", mod: { shield: 0.1 } },
                { id: "ba_mend", name: "Mending Stance", sprite: "/images/arena/node/wd_regen.webp",
                    desc: "Raising it patches you up as well.", mod: { heal: 0.08 } },
                { id: "ba_aegis", name: "Aegis", sprite: "/images/arena/node/wd_aegis.webp",
                    desc: "CAPSTONE. The shield is half again as large and the mending doubles. Almost nothing reaches health.",
                    mod: { shield: 0.16, heal: 0.08 } },
            ]),
            ...br("reprisal", [
                { id: "ba_spite", name: "Spiteful Plate", sprite: "/images/arena/node/wd_thorns.webp",
                    desc: "It answers back — a share of what the shield turns aside goes down their blade.",
                    mod: { thorns: 0.35 } },
                { id: "ba_ready", name: "Ready Guard", sprite: "/images/arena/node/wd_stand.webp",
                    desc: "Comes back a beat sooner.", mod: { cooldown: -1 } },
                { id: "ba_free", name: "Second Nature", sprite: "/images/arena/node/wd_riposte.webp",
                    desc: "CAPSTONE. Raising the shield no longer costs you the beat. Put it up, then swing anyway.",
                    mod: { free: true, thorns: 0.2 } },
            ]),
        ],
    }),
    S({
        id: "retribution", classId: "warden", name: "Retribution",
        sprite: "/images/arena/skill-giantSlayer.webp",
        blurb: "Everything they have done to you since your last swing, handed back on this one.",
        power: 1.1, cooldown: 4, grudge: 0.6,
        branches: [
            { id: "ledger", name: "Ledger", tag: "Bank it all, spend it once" },
            { id: "punish", name: "Punish", tag: "Answer often, and stop them" },
        ],
        nodes: [
            ...br("ledger", [
                { id: "re_memory", name: "Long Memory", sprite: "/images/arena/node/wd_grudge.webp",
                    desc: "You hand back far more of what was banked.", mod: { grudge: 0.45 } },
                { id: "re_keep", name: "Nothing Forgiven", sprite: "/images/arena/node/wd_reprisal.webp",
                    desc: "Half the ledger survives the swing instead of clearing.", mod: { keepGrudge: 0.5 } },
                { id: "re_reckon", name: "Reckoning", sprite: "/images/arena/node/wd_soak.webp",
                    desc: "CAPSTONE. The whole ledger comes back at once on a heavier blow — but it is a slow, patient button.",
                    mod: { grudge: 0.7, power: 0.35, cooldown: 1 } },
            ]),
            ...br("punish", [
                { id: "re_ring", name: "Ringing Blow", sprite: "/images/arena/node/wd_stun.webp",
                    desc: "Retribution stuns. They lose the swing that was due.", mod: { freeze: 1 } },
                { id: "re_brace", name: "Bracing Answer", sprite: "/images/arena/node/wd_ward.webp",
                    desc: "Answering also raises a small shield.", mod: { shield: 0.1 } },
                { id: "re_back", name: "Backhand", sprite: "/images/arena/node/wd_counter.webp",
                    desc: "CAPSTONE. Comes back twice as often and every answer takes a beat off them — a smaller ledger, spent constantly.",
                    mod: { cooldown: -2, grudge: -0.25 } },
            ]),
        ],
    }),
    S({
        id: "rally", classId: "warden", name: "Rally",
        sprite: "/images/arena/skill-warbanner.webp",
        blurb: "Stop the bleeding, put out the fire, and stand back up.",
        power: 0, cooldown: 5, heal: 0.16, cleanse: true,
        branches: [
            { id: "medic", name: "Field Medic", tag: "Stay standing" },
            { id: "warcry", name: "War Cry", tag: "Get back up swinging" },
        ],
        nodes: [
            ...br("medic", [
                { id: "ra_deep", name: "Deep Breath", sprite: "/images/arena/node/wd_health.webp",
                    desc: "A substantially bigger heal.", mod: { heal: 0.1 } },
                { id: "ra_soon", name: "Old Soldier", sprite: "/images/arena/node/wd_vigour.webp",
                    desc: "Comes back two beats sooner.", mod: { cooldown: -2 } },
                { id: "ra_const", name: "Constitution", sprite: "/images/arena/node/wd_fort.webp",
                    desc: "CAPSTONE. It heals nearly half of everything you have, and comes back sooner again.",
                    mod: { heal: 0.16, cooldown: -1 } },
            ]),
            ...br("warcry", [
                { id: "ra_clear", name: "Clear Head", sprite: "/images/arena/node/wd_deflect.webp",
                    desc: "Rally shakes off a freeze as well as the wounds.", mod: { unfreeze: 1 } },
                { id: "ra_ward", name: "Rallying Ward", sprite: "/images/arena/node/wd_guard.webp",
                    desc: "You come up behind a shield.", mod: { shield: 0.12 } },
                { id: "ra_fury", name: "Battle Fury", sprite: "/images/arena/node/wd_drain.webp",
                    desc: "CAPSTONE. Standing up costs you no beat and hastes you — a lighter heal, but you never stop swinging.",
                    mod: { free: true, haste: 1, heal: -0.06 } },
            ]),
        ],
    }),

    // ══ RUNECALLER ══ wins the rounds after the one they are in.
    S({
        id: "immolate", classId: "runecaller", name: "Immolate",
        sprite: "/images/arena/skill-eruptChance.webp",
        blurb: "Set them alight. Fire does not care what they are wearing.",
        power: 1.4, cooldown: 3, burn: 1,
        branches: [
            { id: "pyre", name: "Pyre", tag: "The fire does the killing" },
            { id: "lance", name: "Lance", tag: "The bolt does the killing" },
        ],
        nodes: [
            ...br("pyre", [
                { id: "im_hot", name: "White Heat", sprite: "/images/arena/node/rc_ember.webp",
                    desc: "The burn ticks considerably harder.", mod: { burnDamage: 0.12 } },
                { id: "im_feed", name: "Feed the Fire", sprite: "/images/arena/node/rc_leech.webp",
                    desc: "A fifth of everything the burn does heals you.", mod: { burnLeech: 0.2 } },
                { id: "im_conflag", name: "Conflagration", sprite: "/images/arena/node/rc_spread.webp",
                    desc: "CAPSTONE. The fire roars and opens a wound besides — but the bolt itself is barely a candle.",
                    mod: { burnDamage: 0.2, bleed: 1, power: -0.5 } },
            ]),
            ...br("lance", [
                { id: "im_focus", name: "Focused Flame", sprite: "/images/arena/node/rc_power.webp",
                    desc: "A heavier bolt, back a beat sooner.", mod: { power: 0.35, cooldown: -1 } },
                { id: "im_sear", name: "Searing", sprite: "/images/arena/node/rc_pierce.webp",
                    desc: "Ignores nearly half their armour.", mod: { pierce: 0.45 } },
                { id: "im_soul", name: "Soulfire", sprite: "/images/arena/node/rc_soulfire.webp",
                    desc: "CAPSTONE. A third of what lands is dealt again, past armour and shields both.",
                    mod: { soulfire: 0.3, power: 0.2 } },
            ]),
        ],
    }),
    S({
        id: "rimebind", classId: "runecaller", name: "Rimebind",
        sprite: "/images/arena/skill-attuned.webp",
        blurb: "A beat taken off them entirely. The cheapest damage in the game is the swing they never threw.",
        power: 0.9, cooldown: 4, freeze: 1, chill: 0.1,
        branches: [
            { id: "winter", name: "Deep Winter", tag: "Take their beats away" },
            { id: "shatter", name: "Shatter", tag: "Trade the ice for a hammer" },
        ],
        nodes: [
            ...br("winter", [
                { id: "ri_hold", name: "Hold Fast", sprite: "/images/arena/node/rc_freeze.webp",
                    desc: "They lose a second beat.", mod: { freeze: 1 } },
                { id: "ri_cold", name: "Killing Cold", sprite: "/images/arena/node/rc_chill.webp",
                    desc: "And their clock runs slower for the rest of the bout.", mod: { chill: 0.12 } },
                { id: "ri_zero", name: "Absolute Zero", sprite: "/images/arena/node/rc_reservoir.webp",
                    desc: "CAPSTONE. Deeper cold, back a beat sooner. They fight the whole bout on your clock.",
                    mod: { chill: 0.15, cooldown: -1 } },
            ]),
            ...br("shatter", [
                { id: "ri_shatter", name: "Shatter", sprite: "/images/arena/node/rc_sunder.webp",
                    desc: "Ice finds the seams: half their armour is not there.", mod: { pierce: 0.5 } },
                { id: "ri_rime", name: "Rimeguard", sprite: "/images/arena/node/rc_thorns.webp",
                    desc: "You come away behind a shield of ice.", mod: { shield: 0.12 } },
                { id: "ri_hard", name: "Hard Frost", sprite: "/images/arena/node/rc_edge.webp",
                    desc: "CAPSTONE. Give up the binding entirely and it becomes the heaviest single blow a Runecaller throws.",
                    mod: { freeze: -1, power: 1.1 } },
            ]),
        ],
    }),
    S({
        id: "overflow", classId: "runecaller", name: "Overflow",
        sprite: "/images/arena/skill-overcharge.webp",
        blurb: "Everything at once. The longest cooldown in the game, and the reason to survive to it.",
        power: 2.3, cooldown: 6,
        branches: [
            { id: "cataclysm", name: "Cataclysm", tag: "One button, everything on it" },
            { id: "wellspring", name: "Wellspring", tag: "Not one button — a rhythm" },
        ],
        nodes: [
            ...br("cataclysm", [
                { id: "ov_kindle", name: "Kindle", sprite: "/images/arena/node/rc_burn.webp",
                    desc: "It burns, guaranteed, on top of the blow.", mod: { burn: 1 } },
                { id: "ov_bind", name: "Bind", sprite: "/images/arena/node/rc_freeze.webp",
                    desc: "And freezes, guaranteed.", mod: { freeze: 1 } },
                { id: "ov_cata", name: "Cataclysm", sprite: "/images/arena/node/rc_cata.webp",
                    desc: "CAPSTONE. Heavier again, and the cold lingers for the rest of the bout.",
                    mod: { power: 0.55, chill: 0.15 } },
            ]),
            ...br("wellspring", [
                { id: "ov_fork", name: "Forked", sprite: "/images/arena/node/rc_spell.webp",
                    desc: "Discharges as two blows, each rolling its own crit.", mod: { hits: 2, power: -0.75 } },
                { id: "ov_drink", name: "Reclamation", sprite: "/images/arena/node/rc_overcharge.webp",
                    desc: "Nearly a third of what it lands comes back to you.", mod: { drain: 0.3 } },
                { id: "ov_well", name: "Wellspring", sprite: "/images/arena/node/rc_stacks.webp",
                    desc: "CAPSTONE. Half the cooldown. It stops being the thing you wait for and becomes the thing you do.",
                    mod: { cooldown: -3 } },
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
                        return {
                            ...n,
                            held,
                            open,
                            canTake: open && !held && pointsAvailable >= NODE_COST,
                            next: held ? null : resolveSkill(def.id, { [def.id]: [...(mine || []), n.id] }),
                        };
                    }),
                };
            }),
            nodes: def.nodes.map((n) => ({ ...n, held: unlocked && mine.includes(n.id) })),
        };
    });
}

/** What a member has spent on skills, for the panel and for the respec price. */
export function skillPointsSpent(taken = {}) {
    let n = 0;
    for (const [id, nodes] of Object.entries(taken || {})) {
        if (!skillById(id) || !Array.isArray(nodes)) continue;
        n += SKILL_UNLOCK_COST + nodes.length * NODE_COST;
    }
    return n;
}

// ── THE HOUSE PLAYS ITS SKILLS TOO ───────────────────────────────────────────────────────────────────────────
// The mirror of houseHand, and it exists for the mirror of that reason. Luke, on the timing: "it can't be super
// lopsided playing async against someone who has no ability to tap." A defence that taps competently and then
// throws nothing but plain attacks is the same lopsidedness one level up, and it is worse, because a skill is
// a bigger lever than a tap.
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
