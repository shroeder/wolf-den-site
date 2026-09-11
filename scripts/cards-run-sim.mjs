// ── PLAY THE WHOLE RUN, A THOUSAND TIMES ─────────────────────────────────────────────────────────────────────
// cards-sim.mjs answers one question about one fight: does reading the intent pay? This answers the question
// the ACT asks — how long does a fight last, what does it cost, and where does a run end — because that is
// what a health total is actually setting, and a foe's hp cannot be judged one duel at a time.
//
// ⚠️ WHY IT EXISTS. Luke: "our enemies have a lot more health than their enemies right from the get go."
// He is right, and the number that proves it is not the hp on the card, it is the TURN COUNT. Slay the
// Spire's opening fights are two to three turns and cost you ten to twenty health; ours were six to eight
// turns because two Jackals is 86 health against a starter deck that deals about thirteen a turn — and every
// extra turn is another full round of being hit. Long fights are how an act kills you without ever looking
// difficult.
//
// It plays the real rules: the real map, the real encounter pools, the real cards, the real scripts. The only
// thing it invents is the player, and it plays them the way a competent person plays — block when the
// announced swing is worth blocking, otherwise put damage into whatever dies soonest.
//
// Run it before changing a foe's health, a script, or the starter deck:
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/cards-run-sim.mjs
//   ...--runs 2000        more seeds
//   ...--spire            print Slay the Spire's act 1 numbers beside ours
import * as m from "../src/lib/marketplace/cards-kit.js";
import { buildMap, reachable, resolveUnknown } from "../src/lib/marketplace/cards-map.js";
import { applyEventChoice, pickEvent } from "../src/lib/marketplace/cards-events.js";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg("--runs", 1200));

// ── TWO DIALS, FOR FINDING THE NUMBER RATHER THAN ARGUING ABOUT IT ───────────────────────────────────────────
// --dmgx and --hpx scale every foe's damage and health at RUNTIME, so a hundred candidate balances can be
// measured before one of them is written into the tables. Nothing here changes the game; it changes the copy
// of the game this simulator is playing.
const DMGX = Number(arg("--dmgx", 1));
// null unless asked for: the default now comes from the rules through openingRun, so the rung that thins
// the shelf is visible here instead of being papered over by a copy of the base rate.
const POTION_DROP = process.argv.includes("--potions") ? Number(arg("--potions", 40)) : null;
const HPX = Number(arg("--hpx", 1));
// ── AND WHICH RUNG OF THE LADDER ─────────────────────────────────────────────────────────────────────────
// The ladder makes the game itself harder a rung at a time (ASCENSION in cards-kit). A rung that cannot be
// measured is a rung nobody can price, so the simulator climbs too.
const ASC = Number(arg("--asc", 0));
// A third dial, for the question the other two cannot answer: how much damage does a whole act THROW? Walk it
// on a bar nothing can empty and the total that comes back is the act's price, which is the number a hero's
// health and healing have to be set against. --herohp 9999 measures; --herohp 80 tests a candidate bar.
const HERO_HP = Number(arg("--herohp", 0)) || m.HERO_HP;
const scriptOf = (name) => {
    const src = m.FOE_SCRIPTS[name] || m.FOE_SCRIPTS.cur;
    if (DMGX === 1) return src;
    const moves = {};
    for (const [k, mv] of Object.entries(src.moves || {})) {
        moves[k] = { ...mv, ...(mv.damage ? { damage: Math.max(1, Math.round(mv.damage * DMGX)) } : {}) };
    }
    return { ...src, moves };
};
const dmgOf = (c) => m.cardById(c.id)?.damage || 0;
const blockOf = (c) => m.cardById(c.id)?.block || 0;

// ── THE PLAYER ───────────────────────────────────────────────────────────────────────────────────────────────
// Not optimal and not stupid: covers a swing that would cost more than a Defend is worth, then spends the rest
// of the bar on the thing closest to dying. A bot that plays perfectly measures the ceiling; this measures the
// floor a real hand plays on, which is the number a health total should be set against.
// ── ⚠️ TURNS WHERE THE HAND CAN DO NOTHING ───────────────────────────────────────────────────────────────────
// SunflowerJinxx, testing room, with two screenshots: "I had 4 rounds in a row that I couldn't do anything and
// lost the run... I understand them blocking some, but 4 rounds of no or 1 card seems a little broken."
//
// That is a question about the STATUS cards the creatures push into your hand — Dazed, Wound and Burn are
// unplayable by definition and Slimed costs energy to throw away — and it cannot be answered by reading the
// card table, because what matters is how often they ARRIVE together. So the sim counts it: a turn is DEAD if
// the hand is non-empty at the top of the turn and not one card in it can be played with a full energy bar.
//
// A dead turn is not automatically a fault. One in a long fight is the creature's attack landing; four in a
// row is the fight playing itself. The streak histogram is the part worth reading.
// ⚠️ AND THE MEASURE IS "AT MOST ONE", NOT "NONE". The first cut of this counted only turns where NOTHING
// could be played, found six in eight thousand, and would have let me tell her she was wrong. She did not say
// nothing: "4 rounds of no OR 1 card seems a little broken". A turn where the only legal move is one card is
// a turn you watched rather than played, and four of those in a row is the complaint. Both are counted.
const DEAD = { turns: 0, dead: 0, thin: 0, streaks: new Map(), worst: 0, hist: new Map() };
const noteTurn = (st) => {
    if (st.over || !st.hand || !st.hand.length) return;
    DEAD.turns += 1;
    const n = st.hand.filter((c) => m.canPlay(st, c.uid)).length;
    DEAD.hist.set(n, (DEAD.hist.get(n) || 0) + 1);
    if (!n) DEAD.dead += 1;
    if (n > 1) { DEAD.run = 0; return; }
    DEAD.thin += 1;
    DEAD.run = (DEAD.run || 0) + 1;
    DEAD.worst = Math.max(DEAD.worst, DEAD.run);
    DEAD.streaks.set(DEAD.run, (DEAD.streaks.get(DEAD.run) || 0) + 1);
};

function fight(seed, party, hp, deck, perks = [], hpMax = HERO_HP, belt = null, kind = "fight") {
    let st = m.startFight({
        seed,
        asc: ASC,
        kind,
        hero: { hp, hpMax },
        deck,
        perks,
        foes: party.map((p) => ({ ...p, script: scriptOf(p.script) })),
    });
    let guard = 0;
    DEAD.run = 0;
    noteTurn(st);
    while (!st.over && guard < 600) {
        guard += 1;
        // ── AND A PLAYER DRINKS ──────────────────────────────────────────────────────────────────────────
        // A belt that is never opened is a resource the measurement does not have, and the whole reason
        // potions exist in their game is the room you should not have survived. Two rules, which is roughly
        // what anybody does: if this swing kills you, drink the thing that stops it; if you are past the
        // point where the fight is going well, drink the thing that ends it sooner.
        if (belt && belt.length) {
            // ⚠️ READ THE BOTTLE, NOT ITS NAME. This knew four potion ids by heart, and the day the shelf grew
            // from five bottles to eleven the belt filled with things it had never heard of and would not
            // drink — which read as the GAME getting harder (16% of runs finished, then 8%) when all that had
            // happened was that the measuring instrument stopped opening two thirds of its own supplies.
            const incomingNow = m.incomingTotal(st);
            const dying = incomingNow >= st.hero.hp + st.hero.block;
            const worth = (id) => {
                const p = m.POTIONS[id] || {};
                const saves = (p.block || 0) + (p.heal || 0) + Math.round((p.healPct || 0) * (st.hero.hpMax || 70));
                const pushes = (p.damageAll || 0) * Math.max(1, st.foes.filter((f) => f.hp > 0).length)
                    + (p.strength || 0) * 6 + (p.energy || 0) * 5 + (p.draw || 0) * 4
                    + (p.vulnerableAll || 0) * 5 + (p.weakAll || 0) * 4;
                return dying ? saves * 2 + pushes * 0.3 : pushes;
            };
            const best = belt.slice().sort((a, b) => worth(b) - worth(a))[0];
            // Drink to survive, or drink because the fight has stopped going anywhere.
            if (best && worth(best) > 0 && (dying || (guard > 6 && st.hero.hp / hpMax < 0.6))) {
                belt.splice(belt.indexOf(best), 1);
                st = m.drinkPotion(st, best);
                continue;
            }
        }
        // ⚠️ THE WHOLE PARTY, NOT THE FIRST ONE. `intentDamage(state, i)` is ONE creature's swing and
        // defaults to index 0; `incomingTotal` is the room, which is the only figure a turn can be planned
        // against — blocking a third of what is coming and eating the rest is how this simulator once
        // concluded the act was unsurvivable.
        const incoming = m.incomingTotal(st);
        // ── LAY THE POWER DOWN FIRST, WHILE THERE ARE TURNS LEFT TO SPEND IT ─────────────────────────────
        // ⚠️ A POWER HAS NO DAMAGE AND NO BLOCK, so a policy that sorts by those two numbers plays Demon Form
        // last — after the attacks, on the turn it stops being worth anything — or never plays it at all.
        // Their value is entirely in the turns that come AFTER, which is why they are the cards that win long
        // fights, and a simulator that cannot see that would have reported the whole scaling pool as useless.
        const partyLeft = st.foes.reduce((n, f) => n + Math.max(0, f.hp), 0);
        const power = st.hand.filter((c) => m.canPlay(st, c.uid)).find((c) => {
            const k = m.cardById(c.id) || {};
            return (k.strengthEach || k.blockEach || k.energyEach || k.blockKeeps)
                && st.turn <= 4 && partyLeft > 45;
        });
        if (power) { st = m.playCard(st, power.uid).state; continue; }

        // ── KILL IT IF IT CAN BE KILLED ──────────────────────────────────────────────────────────────────
        // The best play in this game is almost always removing a body: it takes a whole creature's damage off
        // every remaining turn at once. A policy that does not look for lethal is measuring a worse player
        // than anyone actually is.
        const alive = st.foes.map((f, i) => ({ f, i })).filter((x) => x.f.hp > 0);
        const playable = st.hand.filter((c) => m.canPlay(st, c.uid));
        const lethal = playable.find((c) => dmgOf(c) && alive.some((x) => x.f.hp <= dmgOf(c) - (x.f.block || 0)));
        if (lethal) {
            const t = alive.filter((x) => x.f.hp <= dmgOf(lethal) - (x.f.block || 0)).sort((a, b) => b.f.hp - a.f.hp)[0];
            st = m.playCard(st, lethal.uid, t.i).state;
            continue;
        }
        // ── BLOCK WHAT MATTERS, RACE THE REST ────────────────────────────────────────────────────────────
        // ⚠️ THIS POLICY HAS BEEN WRONG IN BOTH DIRECTIONS AND THE SECOND WAY WAS THE EXPENSIVE ONE. First it
        // laid ONE block card against a twenty-point turn and ate fifteen; corrected, it laid block until every
        // point of the swing was covered — and that reads as careful play but it is the losing line, because
        // covering fourteen incoming with five-point Blocks costs the entire energy bar and the fight never
        // ends. Five turns of full cover leaks more health than three turns of racing, which is why turtling
        // put 98% of these runs in the ground and why no dial on the monsters could pull them out: the hand was
        // never going to kill anything.
        //
        // What a competent player actually does is spend block only when the swing is big enough to be worth a
        // card, or when they are hurt enough that chip damage is the thing that kills them — and otherwise
        // takes the hit and removes a body, because a dead creature never swings again. One card at a time,
        // re-reading the board after each, so it stops the moment the swing stops being frightening.
        const bare = Math.max(0, incoming - st.hero.block);
        const hurt = st.hero.hp / (st.hero.hpMax || m.HERO_HP) < 0.5;
        const worthACard = bare >= st.hero.hp ? 1 : hurt ? 6 : 11;
        if (bare >= worthACard) {
            const blocker = playable.find((c) => blockOf(c));
            if (blocker) { st = m.playCard(st, blocker.uid).state; continue; }
        }
        const hitter = st.hand.filter((c) => dmgOf(c) && m.canPlay(st, c.uid)).sort((a, b) => dmgOf(b) - dmgOf(a))[0];
        if (hitter) {
            // Closest to dying, but NOT through a wall of armour if there is bare skin on the board: throwing a
            // six-damage card into nine points of block is the commonest way a real hand wastes a turn, and a
            // policy that does it is measuring the game badly rather than measuring a bad player.
            const soft = alive.filter((x) => (x.f.block || 0) < dmgOf(hitter));
            const pickFrom = soft.length ? soft : alive;
            const t = pickFrom.slice().sort((a, b) => a.f.hp - b.f.hp)[0];
            st = m.playCard(st, hitter.uid, t?.i ?? 0).state;
            continue;
        }
        const other = st.hand.find((c) => m.canPlay(st, c.uid));
        if (other) { st = m.playCard(st, other.uid).state; continue; }
        st = m.endTurn(st).state;
        noteTurn(st);
    }
    return st;
}

// Every card the reward screen could offer, by tier — the sim takes one after every win, which is what a run
// actually does. It takes the best damage card it is shown, which is what most people do.
// ── ⚠️ THE POOL A REAL PLAYER SEES IS NOT THE POOL ─────────────────────────────────────────────────────────
// A card is offered only if you OWN ITS PET (see eligibleCards) — that is the whole identity of this deck, and
// it means the pool in cards-kit is a ceiling rather than a hand. Measured against the owner's real
// collection: 20 of 52, and five of sixteen at tier three. Every number this simulator printed before this
// dial existed was for a player who owns every animal in the Den.
//   --cards a,b,c   restrict the offer pool to these ids (what one member can actually be dealt)
const ONLY = (() => { const i = process.argv.indexOf("--cards"); return i > -1 ? new Set(process.argv[i + 1].split(",")) : null; })();
const POOL_BY_TIER = [1, 2, 3].map((t) => Object.values(m.POOL || {})
    .filter((c) => (c.tier || 1) === t && (!ONLY || ONLY.has(c.id))).map((c) => c.id));
// ⚠️ THE REWARD TIER IS THE GAME'S, NOT A GUESS AT IT. This was `row < 5 ? 0 : row < 10 ? 1 : 2` — a
// row-only ladder that ignored the ACT entirely, so a deck walking into the Deep was offered the same
// tier-one commons it saw on the first floor of the Sand, while the real game opens a rung early per act
// (roomFight/tierUp) precisely because a deck that has beaten a boss should see the cards that beat the next
// one. And the game offers everything AT OR BELOW that tier, where this took the tier exactly.
const offersAt = (row, kind, act) => {
    const max = m.stopAt(row + 1, kind, act).offer;
    const pool = Object.values(m.POOL || {}).filter((c) => (c.tier || 1) <= max && (!ONLY || ONLY.has(c.id)));
    return { pool, max };
};
const encSeedFor = (seed, at) => ((seed >>> 0) + (at.row * 31 + at.lane) * 104729) >>> 0;

function runOnce(seed) {
    // ⚠️ A RUN IS THREE ACTS AND THIS ONLY EVER PLAYED THE FIRST. "Runs finished" meant "reached the act-one
    // boss", which is a perfectly good number to tune act one against and tells you NOTHING about the other
    // two — both of which have a full bestiary, their own encounter pools and their own written rooms, none
    // of it ever executed here. A boss now pays its trinket and deals the next sheet, exactly as the route
    // does, and the report says how far a run actually got.
    let act = 1;
    let map = buildMap(seed >>> 0, { asc: ASC });
    // ⚠️ ASK THE RULE FOR THE OPENING STATE. These three lines used to derive it here — a bare HERO_HP, a
    // hand-rolled rung-six branch and a hand-rolled rung-eight deck — which is to say the simulator opened
    // every run on a full bar with a full purse whatever rung it claimed to be climbing. Ladder runs at 10,
    // 15 and 20 came back with IDENTICAL results because four of those rungs only exist in the numbers this
    // file was making up for itself. See openingRun in cards-kit.
    const opening = m.openingRun(ASC);
    let hpMax = opening.hpMax;
    let hp = opening.hp;
    let deck = [...opening.deck];   // and STARTER_PERK, paid after every win below
    // ⚠️ THE SIM HAS TO SPEND THE MONEY, TOO. The first cut walked past every shop and every chest, took no
    // perk off an elite and drank nothing — and then reported that nobody finishes the act. Of course nobody
    // finishes: half the player's power in this game is bought, drunk or burned. A shop's card removal alone
    // is the strongest thing in Spire, and a simulator that skips it is measuring a game with the deck-
    // building taken out.
    let perks = [m.STARTER_PERK];
    let potions = [];
    // ⚠️ THE RULE, NOT A THIRD COPY OF IT. This file used to apply a trinket by hand in two places and
    // between them they knew about maxHp, maxHpDown and embers in different combinations — so a costed perk
    // measured as free in one path and correct in the other. takePerk is a rule now (see cards-kit); the run
    // here is a bag of locals rather than an object, so this is the adapter and nothing more.
    const take = (id) => {
        const box = { perks, hp, hpMax, embers };
        if (!m.takePerk(box, id)) return false;
        perks = box.perks; hp = box.hp; hpMax = box.hpMax; embers = box.embers;
        return true;
    };
    // `--potions` still overrides, because asking "what if bottles were rarer" is what the flag is for; with
    // no flag it is the rung's number rather than a copy of the default.
    let luck = POTION_DROP ?? opening.potionLuck;
    let embers = opening.embers;
    let removals = 0;
    let at = null;
    let recent = [];
    const seenEvents = [];
    const arrived = [];
    let eventFight = null;
    let roll = seed >>> 0;
    const next = () => { const [r, n] = m.nextRand(roll); roll = n; return r; };
    const log = [];
    for (let step = 0; step < 40 * m.ACTS; step += 1) {
        const open = reachable(map, at);
        if (!open.length) return { won: true, act, arrived, row: at?.row ?? 0, hp, log, deck: deck.length };
        // Hurt? take the fire. Otherwise anything — the shape of the path is the map's business, not the
        // health total's, and averaging over a thousand maps washes the choice out.
        const pick = (hp / hpMax < 0.55 && open.find((n) => n.kind === "rest"))
            || open[Math.floor(next() * open.length)];
        at = pick;
        const kind = pick.kind === "unknown" ? resolveUnknown(seed, pick.row) : pick.kind;
        if (kind === "rest") {
            // ── REST OR SMITH, AND A PLAYER PICKS THE ONE THEY NEED ──────────────────────────────────
            // Theirs is one or the other and so is ours. Hurt enough that the next room could end the run?
            // Sit down. Otherwise put the biggest card you own in the coals, because a deck that improves is
            // the only thing that keeps up with an act that gets harder.
            // ⚠️ THE LAST FIRE IS ALWAYS A REST, and this simulator was smithing at it. Their floor 15 is a
            // campfire and floor 16 is the boss, which is not a coincidence — it is the game handing you a
            // full bar for the fight that is about to take half of it. A policy that sharpens there walks
            // into a 209-health boss on 43 health, and 74% of the runs that reached one died at it.
            const lastFire = pick.row >= m.RUN_LENGTH - 1;
            const hurt = hp / hpMax < (lastFire ? 0.9 : 0.62);
            const best = deck.map((id, i) => ({ id, i, d: m.cardById(id)?.damage || 0 }))
                .filter((c) => m.canUpgrade(c.id)).sort((a, b) => b.d - a.d)[0];
            if (hurt || !best) hp = Math.min(hpMax, hp + m.restHeal(hpMax, ASC) + m.perkSum(perks, "restBonus"));
            else deck = deck.map((id, i) => (i === best.i ? m.upgradedId(id) : id));
            continue;
        }
        if (kind === "treasure") {
            // ⚠️ ASKED, NOT REIMPLEMENTED. This used to hand out forty embers and a maybe-potion, written by
            // hand — and when the chest was changed to pay a TRINKET (which is what a treasure floor is FOR)
            // this went on paying pocket money, so every number below was measuring a game nobody plays.
            // grantForRoom is a rule now and lives in cards-kit for exactly this reason.
            const got = m.grantForRoom({ seed, perks, potions }, pick.row, pick.lane, "treasure");
            embers += got.embers || 0;
            if (got.perk) take(got.perk);
            if (got.potion && potions.length < m.beltSize(perks, ASC)) potions.push(got.potion);
            continue;
        }
        if (kind === "merchant") {
            // What a player actually does at a shelf: burn a starter card if the fire is affordable — the
            // single strongest purchase in their game — then buy a card if there is still money for one.
            const cost = m.removalCost(removals);
            const chaff = deck.lastIndexOf("bite");
            if (embers >= cost && chaff > -1 && deck.length > 6) {
                deck = deck.filter((_, i) => i !== chaff); embers -= cost; removals += 1;
            }
            const stock = m.buildShop((seed + pick.row * act) >>> 0,
                { cardIds: offersAt(pick.row, "fight", act).pool.slice(0, 3).map((c) => c.id) });
            const buy = stock.filter((x) => x.kind === "card" && x.price <= embers).sort((a, b) => a.price - b.price)[0];
            if (buy) { deck = [...deck, buy.ref]; embers -= buy.price; }
            continue;
        }
        // ── A ROOM WITH WRITING IN IT ────────────────────────────────────────────────────────────
        // Run through the GAME'S OWN resolver, not a copy of it — the whole value of this simulator is that
        // it plays the rules the browser plays, and an event table scored by a second implementation would
        // measure a game nobody can play. The run object is assembled to the shape the server keeps.
        if (kind === "event") {
            const ev = pickEvent(encSeedFor(seed, pick), act, seenEvents);
            seenEvents.push(ev.id);
            const box = {
                seed, hp, hpMax, embers, deck, perks, potions,
                at: { row: pick.row, lane: pick.lane, kind: "event", event: ev.id },
            };
            // What a player takes: the best thing they can afford that will not kill them. Healing is worth
            // its face, a trinket is worth about a good card, and a choice that costs health it cannot spare
            // is off the table — which is exactly how a person reads these rooms.
            const worth = (c) => {
                const e = c.effect || {};
                const cost = (e.hp || 0) + Math.round((e.hpPct || 0) * hpMax);
                if (c.cost && embers < c.cost) return -1;
                if (hp + Math.min(0, cost) < 12) return -1;
                return (e.maxHp || 0) * 1.6 + Math.max(0, cost) * 1.0 + (e.embers || 0) * 0.14
                    + (e.perk || 0) * 26 + (e.maybePerk || 0) * 22 + (e.potion || 0) * 12
                    + (e.upgrade || 0) * 15 + (e.remove || 0) * 14 + (e.card ? -16 : 0)
                    + (e.fight ? -14 : 0) + (e.wake || 0) * -16 + Math.min(0, cost) * 1.15
                    - (c.cost || 0) * 0.1;
            };
            // A room that can be searched again gets searched again, while it is worth it and while there is
            // health to pay for it — which is the decision Dead Adventurer and the Scrap Ooze are made of.
            const taken = new Set();
            let best = ev.choices.map((c, i) => ({ c, i })).filter((x) => !taken.has(x.i))
                .sort((a, b) => worth(b.c) - worth(a.c))[0];
            let out = applyEventChoice(box, ev, best.i, null);
            let guard = 0;
            while (out.more && guard++ < 4) {
                taken.add(best.i);
                hp = box.hp; hpMax = box.hpMax; embers = box.embers || 0;
                const next = ev.choices.map((c, i) => ({ c, i }))
                    .filter((x) => !taken.has(x.i) && !(box.at.used || []).includes(x.i))
                    .sort((a, b) => worth(b.c) - worth(a.c))[0];
                if (!next || worth(next.c) <= 0) break;
                best = next;
                out = applyEventChoice(box, ev, best.i, null);
            }
            if (out.pending) {
                // Which card: the worst one you own to burn, the biggest hitter to sharpen.
                const card = out.pending === "remove"
                    ? (box.deck.find((id) => m.cardById(id)?.status) || box.deck.find((id) => id === "purr")
                        || box.deck.filter((id) => id === "bite").pop() || box.deck[0])
                    : box.deck.filter((id) => m.canUpgrade(id))
                        .sort((a, b) => (m.cardById(b)?.damage || 0) - (m.cardById(a)?.damage || 0))[0];
                if (card) out = applyEventChoice(box, ev, best.i, card);
            }
            hp = box.hp; hpMax = box.hpMax; embers = box.embers || 0;
            deck = box.deck; perks = box.perks; potions = box.potions || [];
            if (hp <= 0) return { won: false, act, arrived, row: pick.row + 1, hp: 0, log, deck: deck.length };
            // A room that woke something hands itself to the fight below, exactly as the route does.
            if (!out.fight) continue;
            eventFight = box.at.enc;
        }
        if (kind !== "fight" && kind !== "elite" && kind !== "boss" && !eventFight) continue;
        const encSeed = encSeedFor(seed, pick);
        const enc = eventFight
            ? (m.encounterById(eventFight) || m.pickEncounter(encSeed, pick.row + 1, "fight", recent))
            : m.pickEncounter(encSeed, pick.row + 1, kind, recent, act);
        eventFight = null;
        if (enc?.id) recent = [enc.id, ...recent].slice(0, 2);
        const party = m.buildParty(enc, encSeed, { asc: ASC, kind })
            .map((f) => (HPX === 1 ? f : { ...f, hp: Math.max(1, Math.round(f.hp * HPX)) }));
        // A tonic before a room you are not walking out of. Crude, and roughly what people do.
        if (hp / hpMax < 0.45 && potions.includes("blood")) {
            potions = potions.filter((x) => x !== "blood");
            hp = Math.min(hpMax, hp + (m.POTIONS.blood?.heal || 12));
        }
        const before = hp;
        const st = fight(encSeed, party, hp, deck, perks, hpMax, potions, kind);
        const partyHp = party.reduce((n, p) => n + p.hp, 0);
        log.push({
            act, row: pick.row + 1, kind: kind === "event" ? "fight" : kind, enc: enc?.id || "?",
            partyHp,
            turns: st.turn, lost: before - Math.max(0, st.hero.hp), dead: st.over === "lose",
            // What the deck actually PUT OUT, per turn: the party's health divided by how long it took to
            // remove it. The one number that says whether a deck is getting stronger as the act goes on.
            dpt: st.turn ? partyHp / st.turn : 0,
            deck: deck.length,
        });
        if (st.over === "lose") return { won: false, act, arrived, row: pick.row + 1, hp: 0, log, deck: deck.length };
        // The starting relic pays here, exactly where the route pays it: after the win, before the reward.
        const spent = st.hero.hp < hpMax / 2;
        hp = Math.min(hpMax, st.hero.hp + perks.reduce((n, id) => n
            + (m.PERKS[id]?.healAfter || 0) + (spent ? (m.PERKS[id]?.healAfterLow || 0) : 0), 0));
        // ── A WON FIGHT SOMETIMES HANDS YOU A BOTTLE ─────────────────────────────────────────────────
        // Theirs drops a potion off roughly two combats in five, and three slots of them is a real second
        // resource: the thing that gets you through the room you should not have survived. Ours came only
        // out of chests, which is about one a run. POTION_DROP is the dial being tested here.
        // Self-correcting, the way the run row does it: kinder after a dry fight, meaner after a paid one,
        // so the belt cannot stay empty for an act or overflow for one either.
        if (next() * 100 < luck) {
            luck = Math.max(0, luck - 10);
            if (potions.length < m.beltSize(perks, ASC)) potions.push(m.POTION_IDS[Math.floor(next() * m.POTION_IDS.length)]);
        } else luck = Math.min(100, luck + 10);
        // An elite pays a perk for the health it just cost — and Ember Heart raises the bar it is measured against.
        if (kind === "elite") {
            const open = m.PERK_IDS.filter((id) => !perks.includes(id));
            if (open.length) {
                const got = open[Math.floor(next() * open.length)];
                perks = [...perks, got];
                const bump = m.PERKS[got]?.maxHp || 0;
                if (bump) { hpMax += bump; hp += bump; }
            }
        } else embers += 0;
        if (kind === "boss") {
            if (act >= m.ACTS) return { won: true, act, arrived, row: pick.row + 1, hp, log, deck: deck.length };
            // The boss trinket, then the next act's sheet. Their boss relics are the strongest objects in the
            // game and taking one is the whole reward for the act — a simulator that walked past it would
            // measure act two on act one's power.
            const open = m.BOSS_PERK_IDS.filter((id) => !perks.includes(id));
            if (open.length) {
                take(open[Math.floor(next() * open.length)]);
            }
            act += 1;
            arrived.push({ act, hp, hpMax, deck: deck.length, perks: perks.length, potions: potions.length });
            map = buildMap(((seed >>> 0) + act * 7919) >>> 0, { asc: ASC });
            at = null;
            recent = [];
            continue;
        }
        embers += 15;
        // ── THREE ON THE TABLE, AND YOU TAKE THE BEST ONE ───────────────────────────────────────────
        // This took a RANDOM card of the tier, which is not what anybody does and badly understates how fast a
        // deck grows: the reward screen offers three and the whole skill of it is picking. Scored the way a
        // player scores at a glance — what it does, per point of energy it costs — with block worth a little
        // less than damage because a turn spent not dying is a turn the fight got longer.
        const { pool: offerPool, max: offerMax } = offersAt(pick.row, kind, act);
        if (offerPool.length) {
            // Drawn through the game's OWN weighting (drawOffer), not flat — see tierOdds. A simulator that
            // deals rewards differently from the browser is measuring a different game, and this one was.
            const offer = [];
            for (let n = 0; n < 3; n += 1) {
                const [card, nx] = m.drawOffer(offerPool, offerMax, roll);
                roll = nx;
                if (card) offer.push(card.id);
            }
            // Scored the way a player scores at a glance: what it does per point of energy, with the cards
            // whose value is in LATER turns counted for what they compound into rather than for the nothing
            // they do the turn they are played.
            // ⚠️ A DECK IS NOT A PILE OF THE BEST CARDS, and scoring each offer on its own merits builds one.
            // This valued a drawn card at four points, so a one-energy "3 Block, draw 2" outscored a
            // nine-damage Swipe — and over 250 runs the three most-taken cards in the game were cantrips,
            // 36% of every pick. The decks that came out could not kill anything: damage per turn sat flat at
            // 13.5 from the first room to the act-one boss, which took 12.6 turns and 55 of an 85 health bar,
            // and runs walked into the Deep on 41% of the bar. That reads exactly like a game whose cards do
            // not scale, and it was a simulator that could not build a deck.
            //
            // Draw is worth what you can DO with what you draw — three energy is three cards a turn no matter
            // how many are in your hand — and an offer is worth more when the deck is short of what it does.
            const attacks = deck.filter((x) => (m.cardById(x)?.damage || 0) > 0).length;
            const guards = deck.filter((x) => (m.cardById(x)?.block || 0) > 0).length;
            const wantAttack = attacks / Math.max(1, deck.length) < 0.45;
            const wantGuard = guards / Math.max(1, deck.length) < 0.22;
            const worth = (id) => {
                const c = m.cardById(id) || {};
                const hits = c.hits || 1;
                const need = ((c.damage ? (wantAttack ? 1.65 : 1) : 1) * (c.block && !c.damage ? (wantGuard ? 1.4 : 0.75) : 1));
                const raw = need * ((c.damage || 0) * hits * (c.all ? 1.6 : 1) + (c.block || 0) * 0.8
                    + (c.heal || 0) * 0.7 + (c.strength || 0) * 6 + (c.draw || 0) * 2.2 + (c.energy || 0) * 5
                    + (c.vulnerable || 0) * 2 + (c.weak || 0) * 2
                    // A fight runs four turns or so; a power is worth roughly that many payouts.
                    + (c.strengthEach || 0) * 22 + (c.blockEach || 0) * 7 + (c.energyEach || 0) * 18
                    + (c.blockKeeps ? 16 : 0) + (c.strengthMult ? 7 : 0) + (c.damageFromBlock ? 9 : 0)
                    + (c.blockDouble ? 8 : 0) + (c.strengthDouble ? 10 : 0) + (c.thorns || 0) * 2
                    + (c.foeStrength || 0) * 5 - (c.selfHp || 0) * 1.2
                    // ── AND THE WORDS THIS SCORER DID NOT KNOW ──────────────────────────────────────
                    // ⚠️ A CARD THIS CANNOT READ IS A CARD THAT IS NEVER DRAFTED, and the run that proves it
                    // is the one taken right after Poison/Artifact/Regeneration/Intangible landed: Ghostly
                    // Armour scored ZERO here (no damage, no block) and the simulator reported the act-three
                    // clear rate falling. Nothing about the game had got worse — four cards had become
                    // invisible to the thing measuring it. Any new keyword has to be priced HERE on the same
                    // day it is written, or the next balance number is a measurement of this function.
                    //
                    // Poison stacks and ticks down, so N points land about N + (N-1) + … over the fight —
                    // in practice a little over twice its face against anything that lives three turns, and
                    // it goes through Block, which damage does not.
                    + (c.poison || 0) * 2.2 * (c.all ? 1.6 : 1)
                    // A whole enemy turn reduced to 1. Priced against what a mid-act turn actually swings.
                    + (c.intangible || 0) * 12
                    // Worth about what the debuff it eats was worth, and it eats the whole stack.
                    + (c.artifact || 0) * 4
                    // Heals N, then N-1, … — the triangle, at the going rate for healing.
                    + (c.regen || 0) * 1.5 * 0.7
                    + (c.dexterity || 0) * 5 + (c.dexterityEach || 0) * 20);
                return raw / Math.max(1, c.cost || 1);
            };
            const takeIt = offer.slice().sort((a, b) => worth(b) - worth(a))[0];
            globalThis.__taken = globalThis.__taken || {};
            globalThis.__taken[takeIt] = (globalThis.__taken[takeIt] || 0) + 1;
            deck = [...deck, takeIt];
        }
    }
    return { won: false, act, arrived, row: at?.row ?? 0, hp, log, deck: deck.length };
}

const runs = Array.from({ length: RUNS }, (_, i) => runOnce((i + 1) * 2654435761 >>> 0));
const fights = runs.flatMap((r) => r.log);
const band = (row) => (row <= 3 ? "rows 1-3 " : row <= 9 ? "rows 4-9 " : "rows 10-15");
const avg = (xs, f) => (xs.length ? xs.reduce((n, x) => n + f(x), 0) / xs.length : 0);

if (process.argv.includes("--brief")) {
    const wonB = runs.filter((r) => r.won).length;
    const early = fights.filter((f) => f.row <= 3 && f.kind === "fight");
    const mid = fights.filter((f) => f.row > 3 && f.row <= 9 && f.kind === "fight");
    console.log(`  dmgx ${DMGX.toFixed(2)}  hpx ${HPX.toFixed(2)}  |  finished ${((wonB / RUNS) * 100).toFixed(0).padStart(3)}%`
        + `  |  died row ${avg(runs.filter((r) => !r.won), (r) => r.row).toFixed(1)}`
        + `  |  early ${avg(early, (f) => f.turns).toFixed(1)}t ${avg(early, (f) => f.lost).toFixed(0)}hp`
        + `  |  mid ${avg(mid, (f) => f.turns).toFixed(1)}t ${avg(mid, (f) => f.lost).toFixed(0)}hp`);
    process.exit(0);
}
console.log(`\n${RUNS} runs, ${fights.length} fights. Hero ${m.HERO_HP} hp, ${m.STARTER_DECK.length}-card starter, ${m.ENERGY_PER_TURN} energy.\n`);
console.log("                  fights   party hp   turns   hp lost   deaths   deck   dmg/turn");
for (const key of ["rows 1-3 ", "rows 4-9 ", "rows 10-15"]) {
    const g = fights.filter((f) => band(f.row) === key && f.kind === "fight");
    console.log(`  ${key}  ${String(g.length).padStart(6)}   ${avg(g, (f) => f.partyHp).toFixed(0).padStart(8)}`
        + `   ${avg(g, (f) => f.turns).toFixed(1).padStart(5)}   ${avg(g, (f) => f.lost).toFixed(1).padStart(7)}`
        + `   ${String(g.filter((f) => f.dead).length).padStart(6)}   ${avg(g, (f) => f.deck).toFixed(1).padStart(4)}`
        + `   ${avg(g, (f) => f.dpt).toFixed(1).padStart(8)}`);
}
for (const kind of ["elite", "boss"]) {
    const g = fights.filter((f) => f.kind === kind);
    console.log(`  ${kind.padEnd(10)}  ${String(g.length).padStart(6)}   ${avg(g, (f) => f.partyHp).toFixed(0).padStart(8)}`
        + `   ${avg(g, (f) => f.turns).toFixed(1).padStart(5)}   ${avg(g, (f) => f.lost).toFixed(1).padStart(7)}`
        + `   ${String(g.filter((f) => f.dead).length).padStart(6)}`);
}
const won = runs.filter((r) => r.won).length;
console.log(`\n  runs finished: ${won}/${RUNS} (${((won / RUNS) * 100).toFixed(0)}%)`
    + `  ·  average death: act ${avg(runs.filter((r) => !r.won), (r) => r.act).toFixed(1)}`
    + ` row ${avg(runs.filter((r) => !r.won), (r) => r.row).toFixed(1)}`);

// ── HOW FAR A RUN ACTUALLY GETS ──────────────────────────────────────────────────────────────────────────
// One number for "finished" hides the shape of a three-act run entirely: an act nobody reaches and an act
// nobody survives look identical from the top.
// WHAT THE PLAYER ACTUALLY TAKES. A pool of a hundred cards is worth nothing if the scoring only ever reaches
// for the same handful, and a deck that stops getting stronger is usually a deck full of the cheap ones.
const taken = Object.entries(globalThis.__taken || {}).sort((a, b) => b[1] - a[1]);
const totalTaken = taken.reduce((n, [, c]) => n + c, 0);
console.log(`\n  most-taken cards (of ${totalTaken} picks, ${taken.length} distinct)`);
console.log("   " + taken.slice(0, 14).map(([id, n]) => {
    const c = m.cardById(id) || {};
    const what = c.damage ? `${c.damage}d` : c.block ? `${c.block}b` : "util";
    return `${id} ${Math.round((n / totalTaken) * 100)}% ${what}`;
}).join("  ·  "));

console.log(`\n  how far runs get`);
for (let a = 1; a <= m.ACTS; a += 1) {
    const reached = runs.filter((r) => r.act >= a).length;
    const cleared = runs.filter((r) => r.act > a || (r.act === a && r.won)).length;
    const rooms = fights.filter((f) => f.act === a);
    console.log(`  ${m.actName(a).padEnd(11)} reached ${String(reached).padStart(4)}`
        + `   cleared ${String(cleared).padStart(4)}`
        + ` (${reached ? ((cleared / reached) * 100).toFixed(0).padStart(3) : "  -"}% of arrivals)`
        + `   fights ${String(rooms.length).padStart(5)}`
        + `   hp lost ${avg(rooms, (f) => f.lost).toFixed(1).padStart(5)}`
        + `   turns ${avg(rooms, (f) => f.turns).toFixed(1)}`);
    // WHAT A RUN WALKS IN ON. An act nobody survives and an act nobody arrives at in any shape to survive
    // look identical from the top, and the fix for them is not the same fix.
    const came = runs.flatMap((r) => r.arrived || []).filter((x) => x.act === a);
    if (came.length) {
        console.log(`              arrived on ${avg(came, (x) => x.hp).toFixed(0)}/${avg(came, (x) => x.hpMax).toFixed(0)} health`
            + ` (${((avg(came, (x) => x.hp) / avg(came, (x) => x.hpMax)) * 100).toFixed(0)}% of the bar)`
            + `   deck ${avg(came, (x) => x.deck).toFixed(1)}`
            + `   trinkets ${avg(came, (x) => x.perks).toFixed(1)}`
            + `   potions ${avg(came, (x) => x.potions).toFixed(1)}`);
    }
}

// ── AND WHAT THE HAND COULD NOT DO ───────────────────────────────────────────────────────────────────────────
console.log("");
console.log("-- DEAD TURNS (nothing in hand playable at the top of the turn) --");
console.log(`  nothing playable : ${DEAD.dead} of ${DEAD.turns} turns (${(DEAD.dead / Math.max(1, DEAD.turns) * 100).toFixed(2)}%)`);
console.log(`  at most ONE      : ${DEAD.thin} of ${DEAD.turns} turns (${(DEAD.thin / Math.max(1, DEAD.turns) * 100).toFixed(2)}%)`);
console.log(`  longest run of "at most one" in a row: ${DEAD.worst}`);
const hk = [...DEAD.hist.keys()].sort((a, b) => a - b);
console.log("  playable cards at the top of a turn:");
for (const k of hk) console.log(`    ${String(k).padStart(2)} playable: ${String(DEAD.hist.get(k)).padStart(5)}  (${(DEAD.hist.get(k) / DEAD.turns * 100).toFixed(1)}%)`);
const streakKeys = [...DEAD.streaks.keys()].sort((a, b) => a - b);
for (const k of streakKeys) console.log(`    reached ${String(k).padStart(2)} in a row: ${DEAD.streaks.get(k)} times`);
