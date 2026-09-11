// ── DOES THE SERVER SEE THE SAME FIGHT THE PLAYER FOUGHT ──────────────────────────────────────────────────
// The card engine runs in the browser. The run route now replays every claimed win through that same engine
// server-side (verifyWin) and banks the health the REPLAY ends on, so a client can no longer say "I won this
// room at 34". This script is what says that verifier is safe to switch from counting to rejecting -- because
// a verifier that turns away honest players is worse than no verifier at all.
//
// It plays whole fights the way the SCREEN plays them (CardFightClient steps the foe turn by hand so the
// animation can breathe), records the move log exactly as the client records it, and then replays that log
// from a fresh startFight the way the server does. The two must land on the identical state -- same health,
// same block, same foes, same piles.
//
// It carries a parity check alongside, comparing the screen's hand-stepped turn against the engine's atomic
// endTurn on every single turn it plays. That invariant BELONGS to scripts/cards-turn-parity.mjs, which
// exists because the two silently disagreed for months and every blockEach source in the game paid the
// simulator and paid the player nothing. It is repeated here only because it is the one way this replay can
// be wrong without being visible: the server calls endTurn, the player watched the steps.
//
// Deliberately not an npm gate -- run it when you touch a turn, a trinket or the verifier.
//   node scripts/cards-replay-check.mjs 600
import {
    buildParty, canPlay, endTurn, finishFoeTurn, foeAct, heroEndTurn, livingFoes, pickEncounter, playCard,
    applyMoves, startFight, startFoeTurn, STARTER_DECK, PERK_IDS, POTION_IDS, drinkPotion, CARDS,
} from "../src/lib/marketplace/cards-kit.js";

const ROUNDS = Number(process.argv[2] || 400);

// The screen's own loop, lifted verbatim from CardFightClient's endTurn.
function screenEndTurn(fight) {
    const mine = heroEndTurn(fight);
    let cur = startFoeTurn(mine.state).state;
    const plan = [];
    for (let i = 0; i < cur.foes.length; i += 1) {
        const peek = foeAct(cur, i);
        if (!peek.acted) continue;
        plan.push({ i });
        cur = peek.state;
        if (cur.over) break;
    }
    let live = startFoeTurn(heroEndTurn(fight).state).state;
    for (const step of plan) live = foeAct(live, step.i).state;
    return finishFoeTurn(live).state;
}

const shape = (s) => JSON.stringify({
    hp: s?.hero?.hp, block: s?.hero?.block, over: s?.over, turn: s?.turn,
    hero: s?.hero, foes: (s?.foes || []).map((f) => ({ ...f })),
    hand: (s?.hand || []).map((c) => c.uid), draw: (s?.draw || []).length, disc: (s?.discard || []).length,
});

let rng = 12345;
const rand = (n) => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng % n; };

// Real runs carry trinkets, a deck that grew, and a rung. All three change how a fight OPENS and how its
// turns resolve, and all three are exactly where a replay would drift if it were going to.
const kitFor = (seed) => {
    const asc = seed % 5;
    const perks = PERK_IDS.filter((_, i) => (seed >> (i % 16)) % 11 === 0).slice(0, 4);
    const extra = Object.keys(CARDS).filter((_, i) => (seed + i) % 23 === 0).slice(0, 6);
    return { asc, perks, deck: [...STARTER_DECK, ...extra] };
};
const fresh = (seed) => {
    const { asc, perks, deck } = kitFor(seed);
    const enc = pickEncounter(seed, 1 + (seed % 14), "fight", [], 1 + (seed % 3));
    const foes = buildParty(enc, seed, { asc, kind: "fight" });
    return startFight({ seed, asc, kind: "fight", hero: { name: "T", hp: 72, hpMax: 72 }, foes, deck, perks });
};

let parityBad = 0, replayBad = 0, played = 0, wins = 0, drank = 0;
for (let r = 0; r < ROUNDS; r += 1) {
    const seed = (r * 7919 + 13) >>> 0;
    let state = fresh(seed);
    const log = [];
    const belt = [];
    let guard = 0;
    while (!state.over && guard++ < 200) {
        const playable = (state.hand || []).filter((c) => canPlay(state, c.uid));
        if (playable.length && rand(10) < 8) {
            const card = playable[rand(playable.length)];
            const live = livingFoes(state);
            const tgt = live.length ? state.foes.indexOf(live[rand(live.length)]) : 0;
            state = playCard(state, card.uid, tgt).state;
            log.push(["p", card.uid, tgt]);
            played += 1;
        } else if (rand(14) === 0) {
            // A potion, which is the one move that changes the fight without costing a card.
            const id = POTION_IDS[rand(POTION_IDS.length)];
            const next = drinkPotion(state, id);
            if (next !== state) { state = next; log.push(["d", 0]); belt.push(id); drank += 1; }
        } else {
            // 1. PARITY — the screen's stepping against the engine's own endTurn, on the same state.
            const byScreen = screenEndTurn(state);
            const byEngine = endTurn(state).state;
            if (shape(byScreen) !== shape(byEngine)) {
                parityBad += 1;
                if (parityBad === 1) {
                    console.log("PARITY MISMATCH on seed", seed);
                    console.log("  screen:", shape(byScreen).slice(0, 300));
                    console.log("  engine:", shape(byEngine).slice(0, 300));
                }
            }
            state = byScreen;      // the screen is what the player saw, so it is what we carry
            log.push(["e"]);
        }
    }
    if (state.over === "win") wins += 1;

    // 2. FIDELITY — the log, replayed from scratch by the server.
    // The server resolves a slot against the run's belt; here the belt is just the bottles in the order they
    // were drunk, which is the same question answered by the same call.
    let sip = 0;
    const out = applyMoves(fresh(seed), log, { potionAt: () => belt[sip++] || null });
    if (!out.ok) { replayBad += 1; if (replayBad === 1) console.log("MOVES REFUSED on seed", seed, out.why); continue; }
    if (shape(out.state) !== shape(state)) {
        replayBad += 1;
        if (replayBad <= 1) {
            console.log("REPLAY DRIFT on seed", seed);
            console.log("  played:", shape(state).slice(0, 300));
            console.log("  replay:", shape(out.state).slice(0, 300));
        }
    }
}
console.log(`\n${ROUNDS} fights · ${played} cards played · ${wins} won`);
console.log(`parity mismatches: ${parityBad}`);
console.log(`replay failures:   ${replayBad}`);
process.exit(parityBad || replayBad ? 1 : 0);
