// ── HOW AN ABSENT DEFENDER FIGHTS ────────────────────────────────────────────────────────────────────────────
// PURE. No DB, no server-only — deliberately, because the dev lab has to be able to run the SAME policy the
// server runs. It already kept its own copy of this, and that copy was the old uniformly-random picker: the
// lab would have shown last week's AI while claiming to show this week's, which is worse than having no lab.
//
// DRAIN_SHARE is re-declared rather than imported from arena-kit.js only to keep this module dependency-free.
const DRAIN_SHARE = 0.5;
const AI_ABILITY_CHANCE = 0.75;

// ── THE ABSENT DEFENDER PLAYS THEIR OWN BUILD ────────────────────────────────────────────────────────────────
// It used to pick a UNIFORMLY RANDOM ability three rounds in four and never do anything else. It could not
// guard, could not heal, and never respected a cooldown — so it could spam its best move forever while being
// unable to defend itself once. And any DEFENSIVE ability it happened to roll (ward, riposte, drain) was
// silently downgraded to a plain hit, because only strike/spell/execute were read for power.
//
// The result was that a member's loadout fought nothing like the member. Luke, who built a shield: "my dude is
// a defensive machine, he should be able to defend himself using skills and the guard ability when he gets
// low." His absent self did the exact opposite — it never guarded once.
//
// So the defender now plays a POLICY, in priority order, off the same kit the owner assembled:
//
//   FINISH    the challenger is under a third → an execute-type move, because that is what it is for
//   SURVIVE   it is under a third itself → drain to heal, or BRACE (see below)
//   SET UP    early, with a sunder or a surge available → spend the round making the next one hurt
//   PRESS     otherwise the strongest thing off cooldown
//
// BRACING is the piece that was missing entirely, and it is what makes a defensive build defensive when its
// owner is asleep. It costs the defender their attack — so it can never stall a fight, it trades damage out
// for damage in, which is the same bargain the player's own Guard makes.
export const AI_BRACE_AT = 0.34;        // health fraction below which it starts protecting itself
export const AI_BRACE_GUARD = 0.4;      // how much of your next swing a brace turns aside
export const FINISH_AT = 0.34;          // your health fraction that makes an execute the obvious play

export function foeReady(b, ability) {
    if (!ability) return false;
    const until = (b.foeCd || {})[ability.id] || 0;
    return b.beat >= until;
}

// ── WHAT AN ABSENT DEFENDER CARRIES ──────────────────────────────────────────────────────────────────────────
// The same two things the player brings, in the same counts, because the fight is meant to be a mirror: you
// are fighting a loadout, and a loadout that cannot reach for a poultice is not the person who built it.
//
// They are spent OPTIMALLY, which for two items is a short list:
//   POULTICE  at the moment it actually saves the round — under a third, and never at full health where a
//             quarter of it would be poured on the floor.
//   DRAUGHT   only when the kit is genuinely locked up: two or more skills cooling AND nothing good to play.
//             Spending it to refresh one ability off cooldown is how a player wastes theirs.
// ── AND NOT EVERYTHING CARRIES A SATCHEL ─────────────────────────────────────────────────────────────────────
// Handing the full kit to every opponent measured badly for exactly the people who can least afford it: a
// beginner's reachable ceiling fell from tier 16 to SIX, because the thing they were scraping past now healed
// half its health back and covered up whenever its skills were cooling.
//
// A Straw Dummy does not have a medicine bag. A Champion does, and another member always does — you are
// fighting a person's loadout, and a person brings what the game gives them. Scaling by tier keeps the early
// ladder a ladder and leaves the hard end genuinely hard.
export const AI_ITEMS = { poultice: 2, draught: 1 };
export function itemsFor(foe) {
    const tier = Number(foe?.tier) || 0;
    if (!tier) return { ...AI_ITEMS };          // a real member: the same two the player carries
    if (tier < 10) return { poultice: 0, draught: 0 };
    if (tier < 20) return { poultice: 1, draught: 0 };
    return { ...AI_ITEMS };
}
export const POULTICE_HEAL = 0.25;
const POULTICE_AT = 0.34;     // never above this — a heal that overflows is a wasted item

/**
 * Roughly what a given move would take off you, in the numbers the engine will actually use.
 *
 * Deliberately an ESTIMATE and deliberately optimistic about the crit: the point is to answer "is there a
 * kill here", and a fighter who can see a lethal blow takes the swing rather than waiting for certainty.
 * It reads the same terms resolveBeat multiplies — their damage, the move's power, the element clash, the
 * block you always get — so it cannot drift far from the blow that follows.
 */
function estimateIncoming(b, ability) {
    const power = ability && !["ward", "drain"].includes(ability.kind) ? (ability.power || 1) : 1;
    const back = 1 / (b.clash?.mult || 1);
    const crit = b.foe?.critChance ?? 0.25;
    const critMult = b.foe?.critMult ?? 2.5;
    // The average blow, plus the share of the time it crits. An execute against a hurt target is worth more,
    // exactly as it is in the engine.
    const executeBonus = ability?.kind === "execute" && b.hp <= b.maxHp * 0.35 ? 1.5 : 1;
    const raw = (b.foe?.damage || 1) * power * back * executeBonus * (1 + crit * (critMult - 1));
    // What you turn aside before anything reaches your health. BLOCK is the floor every fighter gets.
    return Math.max(0, raw * (1 - 0.18));
}

/** Your effective health: what a blow actually has to chew through to end the bout. */
const effectiveHp = (b) => Math.max(0, (b.hp || 0) + (b.shield || 0));

export function pickIncoming(b) {
    const all = b.foe.abilities || [];
    const kit = all.filter((a) => foeReady(b, a));
    const myFrac = b.maxHp ? b.hp / b.maxHp : 1;
    const theirFrac = b.foeMaxHp ? b.foeHp / b.foeMaxHp : 1;
    const of = (...kinds) => kit.find((a) => kinds.includes(a.kind)) || null;
    const items = b.foeItems || itemsFor(b.foe);

    // ── IS THERE A KILL HERE? ────────────────────────────────────────────────────────────────────────────
    // This question is asked FIRST, before anything about its own health, and that ordering is the whole of
    // the fix. It used to heal the moment it dropped below a third — even with the bout already won on the
    // next swing — so a cornered opponent would drink a poultice while you stood on nine health. It looks for
    // the finish now and only tends to itself when there is not one.
    //
    // The comparison is against your effective health (health plus anything you have banked), so a shield you
    // just put up genuinely deters it rather than being invisible.
    const offensiveNow = kit.filter((a) => !["ward"].includes(a.kind));
    const lethal = offensiveNow
        .map((a) => ({ a, dmg: estimateIncoming(b, a) }))
        .filter((x) => x.dmg >= effectiveHp(b))
        .sort((x, y) => y.dmg - x.dmg)[0];
    const plainKills = estimateIncoming(b, null) >= effectiveHp(b);
    if (lethal || plainKills) {
        const finisher = lethal?.a || null;
        if (finisher) {
            if (!b.foeCd) b.foeCd = {};
            b.foeCd[finisher.id] = b.beat + Math.max(1, finisher.cooldown || 2);
        }
        return {
            name: finisher?.name || "a heavy swing",
            kind: finisher?.kind || "swing",
            element: finisher?.element || b.foe.element || null,
            sprite: finisher?.sprite || null,
            power: finisher && !["ward", "drain"].includes(finisher.kind) ? (finisher.power || 1) : 1,
            heal: 0, brace: false, isAbility: Boolean(finisher),
        };
    }

    // ── ITEMS, because an item is worth more than the swing it replaces only at specific moments, and those
    // moments are the ones a real player watches for. A heal is not one of them when you are nearly dead:
    // pressing is. `myFrac` guards it so it will not spend a turn healing while it has you on the ropes.
    if (theirFrac <= POULTICE_AT && (items.poultice || 0) > 0 && myFrac > FINISH_AT) {
        return { name: "a field poultice", kind: "item", item: "poultice", heal: POULTICE_HEAL,
            power: 0, brace: false, isAbility: true, element: null, sprite: null };
    }
    const cooling = all.length - kit.length;
    if ((items.draught || 0) > 0 && cooling >= 2 && !of("execute", "strike", "spell", "flurry", "gamble", "rend", "sunder", "drain")) {
        return { name: "a quickening draught", kind: "item", item: "draught", refresh: true,
            power: 0, brace: false, isAbility: true, element: null, sprite: null };
    }

    let ability = null;
    let brace = false;
    // GOING FOR THE THROAT BEATS COVERING UP. The finish check moves above the cornered one: if you are the
    // one nearly dead, a fighter presses even while hurt, because trading blows is winning the trade. It only
    // protects itself when the race is not already in its favour.
    if (myFrac <= FINISH_AT) ability = of("execute", "strike", "flurry", "spell");
    if (!ability && theirFrac <= AI_BRACE_AT) {
        // Cornered, and no finish available. Heal if it can, otherwise cover up — a build with no answer
        // still stops standing still.
        ability = of("drain") || of("ward");
        if (!ability) brace = true;
    }
    if (!ability && !brace && b.beat <= 2) ability = of("sunder", "surge");
    if (!ability && !brace) {
        // ── ALWAYS, IF IT HAS ONE ────────────────────────────────────────────────────────────────────────
        // This used to fire three times in four, so one round in four a defender with a full kit threw a
        // plain swing for no reason. A person does not do that: if a skill is off cooldown, a person uses it.
        // The variety now comes from WHICH — a quarter of the time it takes something other than its best,
        // which keeps it unreadable without ever making it play badly.
        const offensive = kit.filter((a) => !["ward"].includes(a.kind));
        const pool = offensive.length ? offensive : kit;
        if (pool.length) {
            ability = Math.random() < 0.75
                ? pool.reduce((best, a) => ((a.power || 1) > (best?.power || 0) ? a : best), null)
                : pool[Math.floor(Math.random() * pool.length)];
        } else if (theirFrac <= 0.6 && all.length >= 2) {
            // Nothing off cooldown and taking damage: covering up beats a bare swing. THIS is what "guard
            // optimally" means for a side that cannot see your next move — brace on the rounds where it has
            // nothing better, not only when it is nearly dead. Gated on owning at least TWO abilities: a foe
            // with a single skill has it on cooldown half the time, and letting that brace every other round
            // turned the bottom of the ladder into a wall for the people least able to push through it.
            brace = true;
        }
    }
    if (ability) {
        if (!b.foeCd) b.foeCd = {};
        b.foeCd[ability.id] = b.beat + Math.max(1, ability.cooldown || 2);
    }
    return {
        name: brace ? "a braced guard" : (ability?.name || "a heavy swing"),
        kind: brace ? "brace" : (ability?.kind || "swing"),
        element: ability?.element || b.foe.element || null,
        sprite: ability?.sprite || null,
        // POWER IS READ FOR EVERY OFFENSIVE KIND NOW. It used to be honoured only for strike/spell/execute, so
        // a foe that chose a flurry or a rend swung it at power 1 — its own ability, defanged.
        power: brace ? 0 : (ability && !["ward", "drain"].includes(ability.kind) ? (ability.power || 1) : 1),
        heal: ability?.kind === "drain" ? DRAIN_SHARE : 0,
        brace,
        isAbility: Boolean(ability) || brace,
    };
}
