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

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(arg("--runs", 1200));

// ── TWO DIALS, FOR FINDING THE NUMBER RATHER THAN ARGUING ABOUT IT ───────────────────────────────────────────
// --dmgx and --hpx scale every foe's damage and health at RUNTIME, so a hundred candidate balances can be
// measured before one of them is written into the tables. Nothing here changes the game; it changes the copy
// of the game this simulator is playing.
const DMGX = Number(arg("--dmgx", 1));
const POTION_DROP = Number(arg("--potions", 0));
const HPX = Number(arg("--hpx", 1));
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
function fight(seed, party, hp, deck, perks = [], hpMax = m.HERO_HP) {
    let st = m.startFight({
        seed,
        hero: { hp, hpMax },
        deck,
        perks,
        foes: party.map((p) => ({ ...p, script: scriptOf(p.script) })),
    });
    let guard = 0;
    while (!st.over && guard < 600) {
        guard += 1;
        // ⚠️ THE WHOLE PARTY, NOT THE FIRST ONE. `intentDamage(state, i)` is ONE creature's swing and defaults
        // to index 0; `incomingTotal` is the room. Blocking against a third of what is coming and eating the
        // rest is exactly how this simulator concluded the act was unsurvivable — and it is the same mistake
        // a player makes when they read the board wrong, which is precisely why the number in cards-kit exists.
        const incoming = m.incomingTotal(st);
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
        // ── COVER THE WHOLE SWING, NOT A THIRD OF IT ─────────────────────────────────────────────────────
        // The first cut played ONE block card against whatever was coming and then went back to attacking, so
        // against a twenty-point turn it took fifteen on the chin every time and the act read as unsurvivable.
        // Nobody plays like that. A competent hand keeps laying block until the incoming is covered or the
        // cards run out, and only then spends what is left on damage — which is the single biggest difference
        // between a player who finishes an act and one who does not.
        if (incoming >= 5 && st.hero.block < incoming) {
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
    }
    return st;
}

// Every card the reward screen could offer, by tier — the sim takes one after every win, which is what a run
// actually does. It takes the best damage card it is shown, which is what most people do.
const POOL_BY_TIER = [1, 2, 3].map((t) => Object.values(m.POOL || {}).filter((c) => (c.tier || 1) === t).map((c) => c.id));
const offerTier = (row) => (row < 5 ? 0 : row < 10 ? 1 : 2);

function runOnce(seed) {
    const map = buildMap(seed >>> 0);
    let hp = m.HERO_HP;
    let hpMax = m.HERO_HP;
    let deck = [...m.STARTER_DECK];   // and STARTER_PERK, paid after every win below
    // ⚠️ THE SIM HAS TO SPEND THE MONEY, TOO. The first cut walked past every shop and every chest, took no
    // perk off an elite and drank nothing — and then reported that nobody finishes the act. Of course nobody
    // finishes: half the player's power in this game is bought, drunk or burned. A shop's card removal alone
    // is the strongest thing in Spire, and a simulator that skips it is measuring a game with the deck-
    // building taken out.
    let perks = [m.STARTER_PERK];
    let potions = [];
    let embers = 0;
    let removals = 0;
    let at = null;
    let recent = [];
    let roll = seed >>> 0;
    const next = () => { const [r, n] = m.nextRand(roll); roll = n; return r; };
    const log = [];
    for (let step = 0; step < 40; step += 1) {
        const open = reachable(map, at);
        if (!open.length) return { won: true, row: at?.row ?? 0, hp, log, deck: deck.length };
        // Hurt? take the fire. Otherwise anything — the shape of the path is the map's business, not the
        // health total's, and averaging over a thousand maps washes the choice out.
        const pick = (hp / m.HERO_HP < 0.55 && open.find((n) => n.kind === "rest"))
            || open[Math.floor(next() * open.length)];
        at = pick;
        const kind = pick.kind === "unknown" ? resolveUnknown(seed, pick.row) : pick.kind;
        if (kind === "rest") {
            // ── REST OR SMITH, AND A PLAYER PICKS THE ONE THEY NEED ──────────────────────────────────
            // Theirs is one or the other and so is ours. Hurt enough that the next room could end the run?
            // Sit down. Otherwise put the biggest card you own in the coals, because a deck that improves is
            // the only thing that keeps up with an act that gets harder.
            const hurt = hp / hpMax < 0.62;
            const best = deck.map((id, i) => ({ id, i, d: m.cardById(id)?.damage || 0 }))
                .filter((c) => m.canUpgrade(c.id)).sort((a, b) => b.d - a.d)[0];
            if (hurt || !best) hp = Math.min(hpMax, hp + Math.ceil(hpMax * 0.3));
            else deck = deck.map((id, i) => (i === best.i ? m.upgradedId(id) : id));
            continue;
        }
        if (kind === "treasure") {
            embers += 40;
            if (next() < 0.55 && potions.length < m.POTION_SLOTS) potions.push(m.POTION_IDS[Math.floor(next() * m.POTION_IDS.length)]);
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
            const stock = m.buildShop((seed + pick.row) >>> 0, { cardIds: (POOL_BY_TIER[offerTier(pick.row)] || []).slice(0, 3) });
            const buy = stock.filter((x) => x.kind === "card" && x.price <= embers).sort((a, b) => a.price - b.price)[0];
            if (buy) { deck = [...deck, buy.ref]; embers -= buy.price; }
            continue;
        }
        if (kind !== "fight" && kind !== "elite" && kind !== "boss") continue;
        const encSeed = (seed >>> 0) + (pick.row * 31 + pick.lane) * 104729;
        const enc = m.pickEncounter(encSeed, pick.row + 1, kind, recent);
        if (enc?.id) recent = [enc.id, ...recent].slice(0, 2);
        const party = m.buildParty(enc, encSeed)
            .map((f) => (HPX === 1 ? f : { ...f, hp: Math.max(1, Math.round(f.hp * HPX)) }));
        // A tonic before a room you are not walking out of. Crude, and roughly what people do.
        if (hp / hpMax < 0.45 && potions.includes("blood")) {
            potions = potions.filter((x) => x !== "blood");
            hp = Math.min(hpMax, hp + (m.POTIONS.blood?.heal || 12));
        }
        const before = hp;
        const st = fight(encSeed, party, hp, deck, perks, hpMax);
        const partyHp = party.reduce((n, p) => n + p.hp, 0);
        log.push({
            row: pick.row + 1, kind, enc: enc?.id || "?",
            partyHp,
            turns: st.turn, lost: before - Math.max(0, st.hero.hp), dead: st.over === "lose",
            // What the deck actually PUT OUT, per turn: the party's health divided by how long it took to
            // remove it. The one number that says whether a deck is getting stronger as the act goes on.
            dpt: st.turn ? partyHp / st.turn : 0,
            deck: deck.length,
        });
        if (st.over === "lose") return { won: false, row: pick.row + 1, hp: 0, log, deck: deck.length };
        // The starting relic pays here, exactly where the route pays it: after the win, before the reward.
        hp = Math.min(hpMax, st.hero.hp + perks.reduce((n, id) => n + (m.PERKS[id]?.healAfter || 0), 0));
        // ── A WON FIGHT SOMETIMES HANDS YOU A BOTTLE ─────────────────────────────────────────────────
        // Theirs drops a potion off roughly two combats in five, and three slots of them is a real second
        // resource: the thing that gets you through the room you should not have survived. Ours came only
        // out of chests, which is about one a run. POTION_DROP is the dial being tested here.
        if (next() < POTION_DROP && potions.length < m.POTION_SLOTS) {
            potions.push(m.POTION_IDS[Math.floor(next() * m.POTION_IDS.length)]);
        }
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
        if (kind === "boss") return { won: true, row: pick.row + 1, hp, log, deck: deck.length };
        embers += 15;
        // ── THREE ON THE TABLE, AND YOU TAKE THE BEST ONE ───────────────────────────────────────────
        // This took a RANDOM card of the tier, which is not what anybody does and badly understates how fast a
        // deck grows: the reward screen offers three and the whole skill of it is picking. Scored the way a
        // player scores at a glance — what it does, per point of energy it costs — with block worth a little
        // less than damage because a turn spent not dying is a turn the fight got longer.
        const tier = POOL_BY_TIER[offerTier(pick.row)] || POOL_BY_TIER[0];
        if (tier.length) {
            const offer = [0, 1, 2].map(() => tier[Math.floor(next() * tier.length)]);
            const worth = (id) => {
                const c = m.cardById(id) || {};
                const hits = c.hits || 1;
                const raw = (c.damage || 0) * hits * (c.all ? 1.6 : 1) + (c.block || 0) * 0.8
                    + (c.heal || 0) * 0.7 + (c.strength || 0) * 6 + (c.draw || 0) * 4 + (c.energy || 0) * 5
                    + (c.vulnerable || 0) * 2 + (c.weak || 0) * 2;
                return raw / Math.max(1, c.cost || 1);
            };
            deck = [...deck, offer.slice().sort((a, b) => worth(b) - worth(a))[0]];
        }
    }
    return { won: false, row: at?.row ?? 0, hp, log, deck: deck.length };
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
    + `  ·  average death at row ${avg(runs.filter((r) => !r.won), (r) => r.row).toFixed(1)}`);
const byEnc = {};
for (const f of fights) (byEnc[f.enc] ||= []).push(f);
console.log("\n  by encounter        party hp   turns   hp lost   met");
for (const [id, g] of Object.entries(byEnc).sort((a, b) => avg(b[1], (f) => f.turns) - avg(a[1], (f) => f.turns))) {
    console.log(`  ${id.padEnd(16)}  ${avg(g, (f) => f.partyHp).toFixed(0).padStart(8)}   ${avg(g, (f) => f.turns).toFixed(1).padStart(5)}`
        + `   ${avg(g, (f) => f.lost).toFixed(1).padStart(7)}   ${String(g.length).padStart(5)}`);
}

// ── AND WHAT WE ARE AIMING AT ────────────────────────────────────────────────────────────────────────────────
// Their act 1 at ascension 0, off the wiki, for the fights a starter deck actually meets. The column that
// matters is the last one: an opening fight there is over in two or three turns.
if (process.argv.includes("--spire")) {
    console.log(`
  SLAY THE SPIRE, ACT 1 (ascension 0)          total hp   ~turns
    2 Louses                                     20-30      2-3
    Small Slimes (acid S + spike S)              20-26      2-3
    Jaw Worm                                     40-44      3-4
    Cultist                                      48-54      3-4
    Blue Slaver / Red Slaver                     46-50      3-4
    2 Fungi Beasts                               44-56      3-4
    Looter                                       44-48      3-4
    Gremlin Gang (5)                             60-70      4-5
    ELITE  Gremlin Nob                           82-86      5-6
    ELITE  3 Sentries                           114-126     5-6
    ELITE  Lagavulin                            109-111     5-7
    BOSS   Guardian / Hexaghost / Slime Boss    140-250     8-12
  Their hero opens on 80 hp with a ten-card deck that deals about 13 a turn — the same shape as ours.`);
}
