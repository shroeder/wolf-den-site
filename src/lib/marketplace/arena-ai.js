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

export function pickIncoming(b) {
    const kit = (b.foe.abilities || []).filter((a) => foeReady(b, a));
    const myFrac = b.maxHp ? b.hp / b.maxHp : 1;
    const theirFrac = b.foeMaxHp ? b.foeHp / b.foeMaxHp : 1;
    const of = (...kinds) => kit.find((a) => kinds.includes(a.kind)) || null;

    let ability = null;
    let brace = false;
    if (theirFrac <= AI_BRACE_AT) {
        // Cornered. Heal if it can, otherwise cover up — a build with no answer still stops standing still.
        ability = of("drain") || of("ward");
        if (!ability) brace = true;
    }
    if (!ability && !brace && myFrac <= FINISH_AT) ability = of("execute", "strike");
    if (!ability && !brace && b.beat <= 2) ability = of("sunder", "surge");
    if (!ability && !brace) {
        // The strongest thing available, most of the time — with a little slack so it is not a metronome and
        // a player cannot read the next four rounds off the first one.
        const offensive = kit.filter((a) => !["ward"].includes(a.kind));
        const pool = offensive.length ? offensive : kit;
        if (pool.length && Math.random() < AI_ABILITY_CHANCE) {
            ability = Math.random() < 0.75
                ? pool.reduce((best, a) => ((a.power || 1) > (best?.power || 0) ? a : best), null)
                : pool[Math.floor(Math.random() * pool.length)];
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
