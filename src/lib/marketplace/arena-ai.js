// ── HOW AN ABSENT DEFENDER FIGHTS ────────────────────────────────────────────────────────────────────────────
// PURE. No DB, no server-only — deliberately, because the dev lab has to be able to run the SAME policy the
// server runs. It already kept its own copy of this, and that copy was the old uniformly-random picker: the
// lab would have shown last week's AI while claiming to show this week's, which is worse than having no lab.
//
// "Dependency-free" was the rule here, and it cost us. GUARD_SOAK was copied in as a literal 0.30 and would
// have kept that value through the rebalance below it, leaving the AI valuing a brace at twice what it now
// buys — reaching for guard in the exact spot it should reach for the poultice, and looking like bad play
// rather than a number whose dependants were not moved with it.
//
// A BALANCE NUMBER CANNOT BE DUPLICATED. It comes from where it is defined or the copy quietly becomes a
// second, wrong game. DRAIN_SHARE was the same trap already sprung and merely not yet triggered: arena-kit
// exports it, arena.js reads it from there, and this file kept its own 0.5 — equal today, and one rebalance
// away from not being. Both are imported now.
//
// There was never a purity to protect: arena-kit.js is itself pure ("No DB, no server-only") and the dev lab
// already imports both modules side by side. The import costs nothing; the copies cost correctness.
import { DRAIN_SHARE, guardSoakFrom, REND_TICK_CAP } from "@/lib/marketplace/arena-kit.js";
// Was DOOM_TURNS from arena-kit. The doom status is never applied by anything the game runs, so the constant
// went with the rest of that family; this file is the dev lab's opponent brain and keeps its own number.
const DOOM_BEATS = 3;
import { DEFAULT_GUARD } from "@/lib/marketplace/arena-classes.js";
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
// The foe's copy of the poultice in BATTLE_ITEMS (arena-kit.js). Trimmed 10% with it — the AI drinks the same
// item the player does, and a heal that is worth more in their hand than yours is the kind of asymmetry that
// makes a fight feel rigged. If one moves, move both.
export const POULTICE_HEAL = 0.225;
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

/** Their effective health: what YOUR blow has to chew through. The mirror of effectiveHp. */
const foeEffectiveHp = (b) => Math.max(0, (b.foeHp || 0) + (b.foeShield || 0));

/** How many beats until YOU fall, at the rate they have been hitting you. */
function beatsUntilYouFall(b) {
    const dmg = estimateIncoming(b, null);
    return dmg > 0 ? Math.ceil(effectiveHp(b) / dmg) : 99;
}

/**
 * How many beats until THEY fall, at the rate you have been hitting them.
 *
 * Read off what you have actually been doing rather than off your card, because the AI cannot see your gear
 * and should not be allowed to. Averaged over your last three landed blows, which is exactly the read a person
 * makes across a bout: they do not know your stats, they know how much the last few hurt.
 */
function beatsUntilTheyFall(b) {
    const mine = (b.log || []).filter((l) => l.who === "you" && l.grade !== "burn" && l.damage > 0).slice(-3);
    if (!mine.length) return 99;
    const avg = mine.reduce((t, l) => t + l.damage, 0) / mine.length;
    return avg > 0 ? Math.ceil(foeEffectiveHp(b) / avg) : 99;
}

const READY = (b, kit, ...kinds) => kit.find((a) => kinds.includes(a.kind)) || null;

/**
 * ── HOW AN ABSENT DEFENDER DECIDES ──────────────────────────────────────────────────────────────────────────
 *
 * The old policy was four rules deep — finish, survive, open with a set-up, otherwise hit the hardest thing —
 * and every one of them looked at exactly one number. It could not tell a fight it was winning from a fight it
 * was losing, so it played a race it had already lost the same way it played one it had already won, and it
 * spent its rarest moves on beats where they paid nothing: a rend on a target that was already burning, a
 * sunder on a guard that was already stripped, a surge on a bout with one beat left in it.
 *
 * It answers two questions first now, and every rule below is written in terms of them:
 *
 *     MINE   how many beats until I fall, at the rate you have actually been hitting me
 *     YOURS  how many beats until YOU fall, at the rate I have been hitting you
 *
 * That single comparison is what separates a player from a script. Ahead in the race, it presses and spends
 * its beats on things that compound. Behind, it stops setting up a future it is not going to reach — it takes
 * the variance, it drinks, it covers, it gambles. Level, it spends the free stances, because a ward and a
 * riposte cost it nothing and it has a beat to spare.
 *
 * ── AND IT PLAYS THE WHOLE KIT ──────────────────────────────────────────────────────────────────────────────
 * A ward, a riposte, a surge, a sunder, a rend and a gamble in a defender's bag used to be nine names for one
 * move, because the engine collapsed them all to a number. arena.js resolves each of them properly on their
 * side now, so this is the half that decides WHEN each one is the right answer — with a reason for every one:
 *
 *     WARD/RIPOSTE  free. They do not cost the beat, so the only question is whether they are worth setting,
 *                   and the answer is yes whenever there is room in the shield or a blow of yours coming.
 *     SUNDER        only if you are not already sundered AND the fight is running long enough to bank it.
 *     REND          only if you are not already burning — a second rend on a lit target is a wasted beat.
 *     SURGE         only with two or more beats of its own left to spend the charges on.
 *     GAMBLE        when it is BEHIND. Variance is what you take when the average is losing.
 *     FLURRY        into a low guard, where several small blows beat one big one.
 *     DRAIN         when hurt, because it is the only heal that is also an attack.
 *     EXECUTE       when you are low, which is what it is for.
 */
export function pickIncoming(b) {
    const all = b.foe.abilities || [];
    const kit = all.filter((a) => foeReady(b, a));
    const myFrac = b.maxHp ? b.hp / b.maxHp : 1;
    const theirFrac = b.foeMaxHp ? b.foeHp / b.foeMaxHp : 1;
    const of = (...kinds) => READY(b, kit, ...kinds);
    const items = b.foeItems || itemsFor(b.foe);
    const FP = b.foe?.perks || {};
    const youFallIn = beatsUntilYouFall(b);
    const theyFallIn = beatsUntilTheyFall(b);
    const winning = youFallIn < theyFallIn;         // it puts you down before you put it down
    const losing = theyFallIn < youFallIn;
    // How long anything it sets up this beat has to pay itself off. A burn needs ticks, a sunder needs a swing
    // to land in it and a surge needs charges spent — all three are worthless if EITHER fighter falls first.
    const runway = Math.min(youFallIn, theyFallIn);

    // The cooldown it will pay for a move, shortened by its own Quickening nodes exactly as yours are.
    const cdFor = (a) => Math.max(1, Math.round((a.cooldown || 2) - (FP.cdCut || 0)));
    const spend = (a) => { if (a) { if (!b.foeCd) b.foeCd = {}; b.foeCd[a.id] = b.beat + cdFor(a); } };

    const swing = (ability, free) => {
        spend(ability);
        if (free) spend(free);
        const k = ability?.kind;
        return {
            name: free ? `${free.name}, then ${ability?.name || "a swing"}` : (ability?.name || "a heavy swing"),
            kind: k || "swing",
            element: ability?.element || b.foe.element || null,
            sprite: ability?.sprite || free?.sprite || null,
            power: ability && !["ward", "drain"].includes(k) ? (ability.power || 1) : 1,
            hits: k === "flurry" ? Math.max(1, ability.hits || 3) : 1,
            heal: k === "drain" ? DRAIN_SHARE : 0,
            // ── AND WHAT THE MOVE LEAVES BEHIND ──────────────────────────────────────────────────────────
            // THIS IS THE THIRD ALLOWLIST these flags have to survive — the tree builds the ability, the bout
            // freezes the fighter, and this rebuilds the one move being thrown. Dropping them here is why PvP
            // and PvE behaved differently: an NPC's moves are declared in arena-npc.js and never carried these
            // at all, so a bare `rend` correctly means a wound. A MEMBER's Emberbrand carries `burns: true`,
            // and this line is where it was being thrown away — so an opponent's fire spell arrived as a
            // BLEED, no burn stacks appeared, and a Runecaller's Emberdrinker (which drinks from burns) had
            // nothing to drink. Luke: "when I'm playing other players and they use Emberbrand I don't get any
            // burn stacks... it also appears like I'm not healing from my burn damage in PvP."
            burns: Boolean(ability?.burns),
            bleeds: Boolean(ability?.bleeds),
            freezes: Boolean(ability?.freezes),
            free: free ? free.kind : null,
            freeName: free?.name || null,
            brace: false,
            isAbility: Boolean(ability),
        };
    };
    const reachFor = (item, extra) => ({ name: item === "poultice" ? "a field poultice" : "a quickening draught",
        kind: "item", item, power: 0, brace: false, isAbility: true, element: null, sprite: null, ...extra });

    // ── A BRACE CANNOT FOLLOW A BRACE ────────────────────────────────────────────────────────────────────
    // THE STALL. A guard banks a shield worth a share of the fighter's max health and eats the next blow
    // whole. So a foe whose brace is bigger than your per-swing damage takes ZERO from you, and its state at
    // the end of the beat is identical to its state at the start — which means the same rule fires again, and
    // again. Nine of the nine open bouts on the night this was found were in that loop; one had run 130 beats
    // and another had its foe sitting on 9 health it could not be finished from. Members could not leave, so
    // it cost them the Arena and the raid as well.
    //
    // Three separate rules select a brace — cornered (§2), no finish (§6) and nothing ready (§11) — and all
    // three are RIGHT to want it. The defect was never which branch chose it; it was that choosing it changed
    // nothing, so whatever chose it once chose it forever. Every stall in the game had that shape, and it
    // used to be hidden by damage that ramped with the round count: the ramp eventually out-grew any brace.
    // That ramp was removed deliberately (fights that punish you for taking your time are not fun), and this
    // is the hole it left.
    //
    // So: a fighter that braced last beat must do something else this beat — swing, drink, anything. It still
    // gets to brace as often as every other beat, which is all any of those three rules actually wants, and
    // your blow always lands on the beat in between. The same rule binds the player (see arena.js), because a
    // brace that only one side can spam is the same stall pointed the other way.
    // ONE limit now, not two. The six-a-bout budget is gone on both sides (Luke's call — see arena.js), so
    // all that binds either fighter is the alternating rule: brace as often as every other beat, never twice
    // running. That is the rule that closes the stall; the budget was a second belt on it.
    const bracedLastBeat = (b.foeBraceBeat || 0) >= b.beat - 1 && (b.foeBraceBeat || 0) > 0;
    const bracesSpent = false;
    const guard = () => {
        b.foeBraceBeat = b.beat;
        b.foeBraces = (b.foeBraces || 0) + 1;
        return { name: "a raised guard", kind: "brace", power: 0, brace: true, isAbility: true,
            element: null, sprite: null, heal: 0 };
    };
    // What it does instead when the brace is unavailable: the hardest thing it can still throw, or a bare
    // swing. Never nothing — a beat where the foe does nothing at all is the stall wearing a different hat.
    const insteadOfGuard = (free) => {
        const pool = kit.filter((a) => !["ward", "riposte"].includes(a.kind));
        const best = pool.length ? pool.reduce((top, a) => ((a.power || 1) > (top.power || 1) ? a : top), pool[0]) : null;
        return swing(best, free || null);
    };
    // ── SHATTERED: DO NOT PICK A GUARD YOU CANNOT RAISE ──────────────────────────────────────────────────
    // Luke: "when i prevent them from guarding 3 times, it shouldn't let them guard. right now it lets them
    // guard and then eats their turn." Exactly right — the picker chose a brace, the engine then found the
    // guard shattered and wasted the beat, so Shatter read as three turns of the opponent standing still
    // rather than three turns of them unable to defend. They come at you instead now.
    const shattered = (b.foeNoGuard || 0) > 0;
    const brace = (free) => (bracedLastBeat || bracesSpent || shattered ? insteadOfGuard(free) : guard());

    // ── 1. IS THERE A KILL HERE? ─────────────────────────────────────────────────────────────────────────
    // Asked FIRST, before anything about its own health. It used to heal the moment it dropped below a third
    // even with the bout already won on the next swing, so a cornered opponent would drink a poultice while
    // you stood on nine health. Measured against your EFFECTIVE health, so a shield you just raised genuinely
    // deters it rather than being invisible.
    const offensive = kit.filter((a) => !["ward", "riposte", "surge"].includes(a.kind));
    const lethal = offensive
        .map((a) => ({ a, dmg: estimateIncoming(b, a) }))
        .filter((x) => x.dmg >= effectiveHp(b))
        .sort((x, y) => y.dmg - x.dmg)[0];
    if (lethal) return swing(lethal.a, null);
    if (estimateIncoming(b, null) >= effectiveHp(b)) return swing(null, null);

    // ── 2. AM I ABOUT TO DIE? ────────────────────────────────────────────────────────────────────────────
    // One beat left and no kill available is the only genuine emergency in the fight, and it has exactly three
    // answers: drink, drain, or cover. It takes whichever is BIGGEST rather than the first that matches —
    // a poultice that returns less than a guard banks is the wrong item to burn.
    const doomed = theyFallIn <= 1 && youFallIn > 1;
    if (doomed) {
        const potHeal = (items.poultice || 0) > 0 ? Math.min(b.foeMaxHp - b.foeHp, b.foeMaxHp * POULTICE_HEAL) : 0;
        // OFF THE CONSTANT, not a copy of its old value. This read `0.30` literally, so when GUARD_SOAK was
        // halved the AI would have gone on valuing a brace at twice what it now buys — guarding in the exact
        // spot where it should have reached for the poultice. The bug would have looked like the AI playing
        // badly rather than like a number that moved without its dependants.
        // Guard stopped being one number for everybody: it is the fighter's class base scaled by their
        // Fortune, resolved at kit time and carried on the bout. Reading a shared constant here would have
        // the AI value a Warden's brace at half what it banks and a Reaver's at double.
        const guardBank = b.foeMaxHp * (b.foe?.guard ?? guardSoakFrom(DEFAULT_GUARD, 0, FP.guardSoak || 0));
        const drainMove = of("drain");
        if (potHeal > 0 && potHeal >= guardBank) return reachFor("poultice", { heal: POULTICE_HEAL });
        if (drainMove && theirFrac > 0.15) return swing(drainMove, null);
        if (potHeal > 0) return reachFor("poultice", { heal: POULTICE_HEAL });
        return brace(null);
    }

    // ── 3. THE SATCHEL ───────────────────────────────────────────────────────────────────────────────────
    // A poultice at full health pours a quarter of itself on the floor, and a poultice while it has YOU on the
    // ropes is a beat it did not spend winning. Both guarded. A draught is only worth a beat when the kit is
    // genuinely locked up — spending it to refresh one ability is how a player wastes theirs.
    if (theirFrac <= POULTICE_AT && (items.poultice || 0) > 0 && !winning) {
        return reachFor("poultice", { heal: POULTICE_HEAL });
    }
    const cooling = all.length - kit.length;
    if ((items.draught || 0) > 0 && cooling >= 2 && !offensive.length) {
        return reachFor("draught", { refresh: true });
    }

    // ── 4. A FREE STANCE IS FREE ─────────────────────────────────────────────────────────────────────────
    // Ward and riposte do not spend the beat, so there is no cost to weigh — only whether the stance will do
    // anything. A ward with the shield already at cap does nothing; a riposte with one already set does
    // nothing; and neither is worth setting on a bout that ends before you get to swing again.
    let free = null;
    if (runway > 1) {
        const rip = of("riposte");
        const ward = of("ward");
        // A riposte pays off the blow you are about to land, so it wants you healthy enough to throw one.
        if (rip && !(b.foeRiposte > 0) && myFrac > 0.2) free = rip;
        else if (ward && (b.foeShield || 0) < b.foeMaxHp * 0.35) free = ward;
    }

    // ── 5. FINISH, IF YOU ARE THE ONE ON THE ROPES ───────────────────────────────────────────────────────
    // A fighter presses while hurt, because trading blows is winning the trade. This sits above the cornered
    // branch on purpose: covering up while you are nearly dead is how a bout gets thrown away.
    if (myFrac <= FINISH_AT) {
        const finisher = of("execute") || of("flurry", "strike", "spell", "gamble");
        if (finisher) return swing(finisher, free);
    }

    // ── 6. CORNERED, AND NO FINISH ───────────────────────────────────────────────────────────────────────
    if (theirFrac <= AI_BRACE_AT && !winning) {
        const dr = of("drain");
        if (dr) return swing(dr, free);
        if (!free) return brace(null);  // nothing to answer with: cover up rather than trade
    }

    // ── 6b. THE MOVES YOU CANNOT LEARN ───────────────────────────────────────────────────────────────────
    // The ten NPC-only kinds (arena-npc.js). Each is gated on the state that makes it worth a beat, for the
    // same reason every other rule here is: an opponent that opens with Bonefeast at full health is not
    // "hard", it is broken in your favour, and a player who beats it learns nothing.
    //
    // Ordered by how decisive the move is, so a fighter with two of them plays the sharper one first.
    {
        // BONEFEAST scales off health already lost, so it is worthless until it is hurt.
        const feast = of("feast");
        if (feast && theirFrac <= 0.55) return swing(feast, free);
        // SECOND WIND clears a burn and a sunder. Only worth a beat if there is something to clear.
        const rally = of("rally");
        if (rally && ((b.bleed?.turns || 0) > 1 || (b.foeSunder || 0) > 0)) return swing(rally, free);
        // BLOOD FRENZY halves their own guard, so it is a gamble taken to CLOSE a fight, not to open one.
        const frenzy = of("frenzy");
        if (frenzy && runway >= 2 && (myFrac <= 0.5 || theirFrac <= 0.45)) return swing(frenzy, free);
        // DEATHKNELL needs its full count to land, and the count is the whole move.
        const doom = of("doom");
        if (doom && runway > DOOM_BEATS) return swing(doom, free);
        // SHATTERGUARD is a weak swing into a bare fighter and a huge one into a raised brace.
        const shatter = of("shatter");
        if (shatter && (b.shield || 0) > b.maxHp * 0.1) return swing(shatter, free);
        // SOULBRAND spends the crit on their NEXT landed blow, so it wants a swing left to spend it on.
        const brand = of("brand");
        if (brand && !b.branded && runway >= 2) return swing(brand, free);
        // WILLBREAKER taxes what you are holding back. Nothing cooling, nothing taxed.
        const siphon = of("siphon");
        if (siphon && Object.keys(b.cd || {}).length >= 2) return swing(siphon, free);
        // DREAD HOWL and HOBBLING CHAIN are attrition: they only pay across several of your turns.
        const howl = of("howl");
        if (howl && !(b.dread > 0) && runway >= 3) return swing(howl, free);
        const snare = of("snare");
        if (snare && !(b.snare > 0) && runway >= 3) return swing(snare, free);
        // GRAVEBIND is aimed at the fighter who is actually bracing. Against someone who never guards it is a
        // wasted beat, and "have they used the shield" is the readable version of that test.
        const bind = of("bind");
        if (bind && !(b.bound > 0) && (b.shield || 0) > 0) return swing(bind, free);
    }

    // ── 7. THINGS THAT ONLY PAY IF THE FIGHT LASTS ───────────────────────────────────────────────────────
    // Every rule here is gated on beats remaining, which is the piece that was missing entirely. A surge with
    // one beat left is three charges it will never spend; a sunder on a bout ending this beat strips a guard
    // nobody will swing into; a rend needs its ticks. It plays them when they have time to be worth something
    // and skips them when they do not, which is the difference between a script and an opponent.
    if (runway >= 2) {
        // A rend on a target that is already burning refreshes three ticks for the price of a beat. Only
        // re-applied when the burn is nearly out, or when its own Kindling makes another stack worth having.
        const rendMove = of("rend");
        const burning = (b.foeBleed?.turns || 0) > 1;
        // The AI used to stop stacking at 3, mirroring a cap that no longer exists — leave it and the SAME kit
        // burns harder in your hands than in theirs, which is the offence/defence split this file exists to
        // prevent. It keeps stacking while the ceiling is still buying something.
        const tickCeiling = Math.max(1, Math.round(b.maxHp * (REND_TICK_CAP + (FP.rendCap || 0))));
        const atCeiling = (b.foeBleed?.dmg || 0) >= tickCeiling;
        if (rendMove && (!burning || !atCeiling)) return swing(rendMove, free);
        // A sunder is worth a beat only if it is not already stripped and there are beats left to swing into it.
        const sunderMove = of("sunder");
        if (sunderMove && !(b.foeSunder > 0) && runway >= 3) return swing(sunderMove, free);
        // A surge wants beats to spend its charges on and is pointless while one is already running.
        const surgeMove = of("surge");
        if (surgeMove && !(b.foeSurge > 0) && runway >= 3) return swing(surgeMove, free);
    }

    // ── 8. VARIANCE IS WHAT YOU TAKE WHEN THE AVERAGE IS LOSING ──────────────────────────────────────────
    // A gamble is a coin: double or nothing. Playing it while ahead throws away a race it is winning; playing
    // it while behind is the only line that has a chance in it. This is the rule that most makes it read as a
    // person — it starts taking swings when it can feel the fight getting away from it.
    if (losing) {
        const g = of("gamble");
        if (g) return swing(g, free);
    }

    // ── 8b. WHEN YOU ARE SIMPLY OUT-TRADING IT, IT STOPS TRADING ─────────────────────────────────────────
    // A guard banks 30% of its health now, which makes covering up a genuine line rather than the thing it
    // does when it has nothing. Losing the race by two clear beats with an empty shield is exactly when a
    // person stops swinging into you and buys a beat back — and because a guard costs its attack, it can
    // never stall: it is trading its damage for yours, at a price it only pays when the trade is good.
    if (losing && theyFallIn + 2 <= youFallIn && !(b.foeShield > 0) && theirFrac < 0.6 && !free) {
        return brace(null);
    }

    // ── 9. EXECUTE WHAT IS ALREADY DYING ─────────────────────────────────────────────────────────────────
    if (myFrac <= 0.45) {
        const ex = of("execute");
        if (ex) return swing(ex, free);
    }

    // ── 10. OTHERWISE, THE BEST THING IT HAS ─────────────────────────────────────────────────────────────
    // If a skill is off cooldown, a person uses it — this used to fire only three rounds in four, so one round
    // in four a defender with a full kit threw a bare punch for no reason. The variety comes from WHICH: a
    // quarter of the time it takes something other than its best, which keeps it unreadable without ever
    // making it play badly. A drain gets a thumb on the scale while hurt, since it is a heal and an attack at
    // the same time, and a flurry gets one against a low guard where small blows land more of themselves.
    const pool = offensive.length ? offensive : kit.filter((a) => a.kind !== "ward" && a.kind !== "riposte");
    if (pool.length) {
        const score = (a) => {
            let v = a.power || 1;
            if (a.kind === "drain" && theirFrac < 0.7) v *= 1.35;
            if (a.kind === "flurry" && (b.me?.armour || 0) < 0.2) v *= 1.2;
            if (a.kind === "execute") v *= myFrac <= 0.45 ? 1.5 : 0.75;
            return v;
        };
        const best = Math.random() < 0.78
            ? pool.reduce((top, a) => (score(a) > score(top) ? a : top), pool[0])
            : pool[Math.floor(Math.random() * pool.length)];
        return swing(best, free);
    }
    if (free) return swing(null, free);

    // ── 11. NOTHING READY ────────────────────────────────────────────────────────────────────────────────
    // Covering up beats a bare swing on a beat where it has nothing better — but only if it owns at least two
    // abilities. A foe with a single skill has it cooling half the time, and letting that guard every other
    // round turned the bottom of the ladder into a wall for the people least able to push through it.
    if (theirFrac <= 0.6 && all.length >= 2 && !winning) return brace(null);
    return swing(null, null);
}
