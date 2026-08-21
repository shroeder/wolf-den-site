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

const S = (o) => ({ power: 1, hits: 0, cooldown: 3, ...o });

export const SKILLS = [
    // ══ REAVER ══ open the artery, then hit what is bleeding. Everything a Reaver owns is about ending it
    // before the other fighter's plan has time to matter.
    S({
        id: "rupture", classId: "reaver", name: "Rupture",
        sprite: "/images/arena/skill-bloodlust.webp",
        blurb: "A blow that opens the artery. Wounds tick past armour, which is the point of them.",
        power: 1.6, cooldown: 3, bleed: 1,
        nodes: [
            { id: "rp_deep", name: "Deeper", sprite: "/images/arena/node/rv_rend.webp",
                desc: "The wound bites harder and the blow behind it lands heavier.",
                mod: { power: 0.25, bleedDamage: 0.08 } },
            { id: "rp_hooked", name: "Hooked", sprite: "/images/arena/node/rv_open.webp",
                desc: "Rupture pierces half of what their armour is worth.",
                mod: { pierce: 0.5 } },
            { id: "rp_drink", name: "Bloodmeal", sprite: "/images/arena/node/rv_leech.webp",
                desc: "A quarter of what Rupture lands comes back to you.",
                mod: { drain: 0.25 } },
            { id: "rp_twist", name: "Twist the Blade", sprite: "/images/arena/node/rv_critdmg.webp",
                desc: "Comes back a turn sooner, and hits harder again.",
                mod: { cooldown: -1, power: 0.2 } },
            { id: "rp_second", name: "Second Cut", sprite: "/images/arena/node/rv_flurry.webp",
                desc: "Rupture strikes twice. Each blow rolls its own crit and each can deepen the wound.",
                mod: { hits: 2 } },
        ],
    }),
    S({
        id: "onslaught", classId: "reaver", name: "Onslaught",
        sprite: "/images/arena/skill-onslaught.webp",
        blurb: "Three blows instead of one. Volume is its own kind of critical chance.",
        power: 0.7, hits: 3, cooldown: 4,
        nodes: [
            { id: "on_fourth", name: "Fourth Blow", sprite: "/images/arena/node/rv_flurry.webp",
                desc: "A fourth swing in the same breath.",
                mod: { hits: 1 } },
            { id: "on_ragged", name: "Ragged", sprite: "/images/arena/node/rv_rend.webp",
                desc: "The flurry leaves a wound behind it.",
                mod: { bleed: 1 } },
            { id: "on_wind", name: "Second Wind", sprite: "/images/arena/node/rv_haste.webp",
                desc: "Finishing the flurry hastes you: five swings at double rate.",
                mod: { haste: 1 } },
            { id: "on_heavy", name: "Heavy Hands", sprite: "/images/arena/node/rv_might.webp",
                desc: "Every blow of it lands harder.",
                mod: { power: 0.18 } },
            { id: "on_relent", name: "Relentless", sprite: "/images/arena/node/rv_speed.webp",
                desc: "Comes back two beats sooner.",
                mod: { cooldown: -2 } },
        ],
    }),
    S({
        id: "execute", classId: "reaver", name: "Execute",
        sprite: "/images/arena/skill-opportunist.webp",
        blurb: "Ordinary against a healthy fighter. Not ordinary against a hurt one.",
        power: 1.3, cooldown: 4, executeAt: 0.4, executeMax: 1.6,
        nodes: [
            { id: "ex_sight", name: "Killing Sight", sprite: "/images/arena/node/rv_execute.webp",
                desc: "Starts scaling from two-thirds health instead of two-fifths.",
                mod: { executeAt: 0.27 } },
            { id: "ex_hunger", name: "Hunger", sprite: "/images/arena/node/rv_cap.webp",
                desc: "And scales far harder at the bottom of it.",
                mod: { executeMax: 1.2 } },
            { id: "ex_through", name: "Through the Plate", sprite: "/images/arena/node/rv_pierce.webp",
                desc: "Ignores two-fifths of their armour.",
                mod: { pierce: 0.4 } },
            { id: "ex_quick", name: "No Mercy", sprite: "/images/arena/node/rv_speed.webp",
                desc: "Comes back a beat sooner.",
                mod: { cooldown: -1 } },
            { id: "ex_gamble", name: "All In", sprite: "/images/arena/node/rv_gamble.webp",
                desc: "A heavier blow, and a fifth of it burns straight past armour and shields both.",
                mod: { power: 0.3, soulfire: 0.2 } },
        ],
    }),

    // ══ WARDEN ══ the fight is won by still being there. Two of these three throw no blow at all, which is
    // the identity: a Warden spends beats on being unkillable and makes the other fighter spend theirs badly.
    S({
        id: "bastion", classId: "warden", name: "Bastion",
        sprite: "/images/arena/skill-vanguard.webp",
        blurb: "Raise the shield. What it eats never reaches you at all.",
        power: 0, cooldown: 3, shield: 0.18,
        nodes: [
            { id: "ba_wall", name: "Wall", sprite: "/images/arena/node/wd_shieldcap.webp",
                desc: "A markedly bigger shield.",
                mod: { shield: 0.1 } },
            { id: "ba_mend", name: "Mending Stance", sprite: "/images/arena/node/wd_regen.webp",
                desc: "Raising it patches you up as well.",
                mod: { heal: 0.08 } },
            { id: "ba_spite", name: "Spiteful Plate", sprite: "/images/arena/node/wd_thorns.webp",
                desc: "It answers back — a share of what the shield turns aside goes down their blade.",
                mod: { thorns: 0.35 } },
            { id: "ba_ready", name: "Ready Guard", sprite: "/images/arena/node/wd_stand.webp",
                desc: "Comes back a beat sooner.",
                mod: { cooldown: -1 } },
            { id: "ba_free", name: "Second Nature", sprite: "/images/arena/node/wd_aegis.webp",
                desc: "Raising the shield no longer costs you the beat. Put it up, then swing anyway.",
                mod: { free: true } },
        ],
    }),
    S({
        id: "retribution", classId: "warden", name: "Retribution",
        sprite: "/images/arena/skill-giantSlayer.webp",
        blurb: "Everything they have done to you since your last swing, handed back on this one.",
        power: 1.1, cooldown: 4, grudge: 0.6,
        nodes: [
            { id: "re_ledger", name: "Long Memory", sprite: "/images/arena/node/wd_grudge.webp",
                desc: "You hand back far more of what was banked.",
                mod: { grudge: 0.45 } },
            { id: "re_ring", name: "Ringing Blow", sprite: "/images/arena/node/wd_stun.webp",
                desc: "Retribution stuns. They lose the swing that was due.",
                mod: { freeze: 1 } },
            { id: "re_keep", name: "Nothing Forgiven", sprite: "/images/arena/node/wd_reprisal.webp",
                desc: "Half the ledger survives the swing instead of clearing.",
                mod: { keepGrudge: 0.5 } },
            { id: "re_brace", name: "Bracing Answer", sprite: "/images/arena/node/wd_soak.webp",
                desc: "Answering also raises a small shield.",
                mod: { shield: 0.1 } },
            { id: "re_soon", name: "Quick to Anger", sprite: "/images/arena/node/wd_counter.webp",
                desc: "Comes back a beat sooner, and lands heavier.",
                mod: { cooldown: -1, power: 0.2 } },
        ],
    }),
    S({
        id: "rally", classId: "warden", name: "Rally",
        sprite: "/images/arena/skill-warbanner.webp",
        blurb: "Stop the bleeding, put out the fire, and stand back up.",
        power: 0, cooldown: 5, heal: 0.16, cleanse: true,
        nodes: [
            { id: "ra_deep", name: "Deep Breath", sprite: "/images/arena/node/wd_health.webp",
                desc: "A substantially bigger heal.",
                mod: { heal: 0.1 } },
            { id: "ra_clear", name: "Clear Head", sprite: "/images/arena/node/wd_ward.webp",
                desc: "Rally shakes off a freeze as well as the wounds.",
                mod: { unfreeze: 1 } },
            { id: "ra_ward", name: "Rallying Ward", sprite: "/images/arena/node/wd_aegis.webp",
                desc: "You come up behind a shield.",
                mod: { shield: 0.12 } },
            { id: "ra_soon", name: "Old Soldier", sprite: "/images/arena/node/wd_vigour.webp",
                desc: "Comes back two beats sooner.",
                mod: { cooldown: -2 } },
            { id: "ra_roar", name: "War Cry", sprite: "/images/arena/node/wd_riposte.webp",
                desc: "Standing up hastes you: five swings at double rate.",
                mod: { haste: 1 } },
        ],
    }),

    // ══ RUNECALLER ══ wins the rounds after the one they are in. Burns tick past armour, a freeze is a beat
    // stolen outright, and Overflow is the one button in the game that is worth waiting for.
    S({
        id: "immolate", classId: "runecaller", name: "Immolate",
        sprite: "/images/arena/skill-eruptChance.webp",
        blurb: "Set them alight. Fire does not care what they are wearing.",
        power: 1.4, cooldown: 3, burn: 1,
        nodes: [
            { id: "im_hot", name: "White Heat", sprite: "/images/arena/node/rc_ember.webp",
                desc: "The burn ticks considerably harder.",
                mod: { burnDamage: 0.12 } },
            { id: "im_feed", name: "Feed the Fire", sprite: "/images/arena/node/rc_leech.webp",
                desc: "A fifth of everything the burn does heals you.",
                mod: { burnLeech: 0.2 } },
            { id: "im_spread", name: "Spreading", sprite: "/images/arena/node/rc_spread.webp",
                desc: "Immolate opens a wound as well as a fire.",
                mod: { bleed: 1 } },
            { id: "im_pyre", name: "Pyre", sprite: "/images/arena/node/rc_power.webp",
                desc: "A heavier blow, back a beat sooner.",
                mod: { power: 0.3, cooldown: -1 } },
            { id: "im_soul", name: "Soulfire", sprite: "/images/arena/node/rc_soulfire.webp",
                desc: "A quarter of what lands is dealt again, past armour and shields both.",
                mod: { soulfire: 0.25 } },
        ],
    }),
    S({
        id: "rimebind", classId: "runecaller", name: "Rimebind",
        sprite: "/images/arena/skill-attuned.webp",
        blurb: "A beat taken off them entirely. The cheapest damage in the game is the swing they never threw.",
        power: 0.9, cooldown: 4, freeze: 1, chill: 0.1,
        nodes: [
            { id: "ri_hold", name: "Hold Fast", sprite: "/images/arena/node/rc_freeze.webp",
                desc: "They lose a second beat.",
                mod: { freeze: 1 } },
            { id: "ri_deep", name: "Deep Winter", sprite: "/images/arena/node/rc_chill.webp",
                desc: "And their clock runs slower for the rest of the bout.",
                mod: { chill: 0.12 } },
            { id: "ri_shatter", name: "Shatter", sprite: "/images/arena/node/rc_sunder.webp",
                desc: "Ice finds the seams: half their armour is not there.",
                mod: { pierce: 0.5 } },
            { id: "ri_rime", name: "Rimeguard", sprite: "/images/arena/node/rc_thorns.webp",
                desc: "You come away behind a shield of ice.",
                mod: { shield: 0.12 } },
            { id: "ri_hard", name: "Hard Frost", sprite: "/images/arena/node/rc_edge.webp",
                desc: "A far heavier blow behind the binding.",
                mod: { power: 0.5 } },
        ],
    }),
    S({
        id: "overflow", classId: "runecaller", name: "Overflow",
        sprite: "/images/arena/skill-overcharge.webp",
        blurb: "Everything at once. The longest cooldown in the game, and the reason to survive to it.",
        power: 2.3, cooldown: 6,
        nodes: [
            { id: "ov_more", name: "Cataclysm", sprite: "/images/arena/node/rc_cata.webp",
                desc: "It burns and it freezes, guaranteed, on top of the blow.",
                mod: { burn: 1, freeze: 1 } },
            { id: "ov_split", name: "Forked", sprite: "/images/arena/node/rc_spell.webp",
                desc: "Discharges as two blows, each rolling its own crit.",
                mod: { hits: 2, power: -0.7 } },
            { id: "ov_res", name: "Reservoir", sprite: "/images/arena/node/rc_reservoir.webp",
                desc: "Comes back two beats sooner.",
                mod: { cooldown: -2 } },
            { id: "ov_pierce", name: "Unmaking", sprite: "/images/arena/node/rc_pierce.webp",
                desc: "Ignores three-fifths of their armour.",
                mod: { pierce: 0.6 } },
            { id: "ov_drink", name: "Reclamation", sprite: "/images/arena/node/rc_overcharge.webp",
                desc: "Nearly a third of what it lands comes back to you.",
                mod: { drain: 0.3 } },
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
            nodes: def.nodes.map((n) => {
                const held = unlocked && mine.includes(n.id);
                return {
                    ...n,
                    held,
                    // A node cannot be bought before the skill it lives in — that is the ONLY ordering rule.
                    canTake: unlocked && !held && pointsAvailable >= NODE_COST,
                    next: held ? null : resolveSkill(def.id, { [def.id]: [...(mine || []), n.id] }),
                };
            }),
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
