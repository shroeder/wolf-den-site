// ── THE REFUSED TURN, REPRODUCED ─────────────────────────────────────────────────────────────────────────
//   node scripts/cards-race.mjs
//
// Not a gate (see [[gates-dont-make-them]]) — a bench you can put the bug back on. It reproduces the
// divergence that was refusing turns in the card game and shows why the fix in CardFightClient's accept()
// removes its CAUSE rather than its symptom.
//
// What went wrong, from the run rows rather than from reading: 25 finished runs carry a refusal and 23 of
// them say `illegal_play`, including 29 on the act-three run Kaishiern abandoned on 2026-09-20. The engine is
// pure and seeded and BOTH sides run this same module, so the two can only disagree about the state they
// start a move from — and there is exactly one moment they do.
//
// The end-of-turn flush is sent on a timer and answered while the next turn is already being played. By the
// time the answer lands the player has usually thrown their first card of it: booked into `fightRef`, sitting
// in `pending`, not yet sent. accept() landed the server's state FLAT, which un-played that card on screen
// and refunded its energy — so it was played again, and the server then met the same uid twice. Legal once,
// gone the next. `illegal_play`, and the whole turn is refused.
//
// The fix replays the unsent moves on top of the server's state through this same applyMoves, so the screen
// never rolls backwards and the double-play it was provoking cannot be made.
import { startFight, applyMoves, canPlay } from "../src/lib/marketplace/cards-kit.js";

const fresh = () => startFight({ seed: 12345, hero: { name: "Rig", hp: 80, hpMax: 80 }, foes: null, deck: null });
const noPotions = { potionAt: () => null };

// ── Turn 1: one affordable card, then end the turn. This is the batch that goes to the server. ───────────
const opening = fresh();
const first = opening.hand.find((c) => canPlay(opening, c.uid));
if (!first) { console.log("SKIP: opening hand has nothing playable"); process.exit(0); }
const server = applyMoves(fresh(), [["p", first.uid, 0], ["e"]], noPotions);
if (!server.ok) { console.log("harness broke: turn 1 refused —", server.why); process.exit(1); }
const fromServer = server.state;

// ── Turn 2 is already on screen. The player throws their first card of it; it is queued, not sent. ───────
const X = fromServer.hand.find((c) => canPlay(fromServer, c.uid));
if (!X) { console.log("SKIP: no playable card on turn 2"); process.exit(0); }
const pending = [["p", X.uid, 0]];
console.log(`turn 2 opens with ${fromServer.hand.length} cards, energy ${fromServer.energy}`);
console.log(`player throws ${X.id} (uid ${X.uid}) — queued, not yet sent\n`);

// ── OLD accept(): land the server's state flat, and the card comes back. ─────────────────────────────────
const backInHand = fromServer.hand.some((c) => c.uid === X.uid);
const oldOut = applyMoves(fromServer, [...pending, ["p", X.uid, 0]], noPotions);
console.log("OLD  accept() lands the server state flat");
console.log(`     is ${X.uid} back in the hand on screen?  ${backInHand}   <- the player sees it return`);
console.log(`     server replays [pX, pX] ->  ok=${oldOut.ok}  why=${oldOut.why || "-"}   <- THE REFUSAL\n`);

// ── NEW accept(): replay what the server has not seen yet, then land. ────────────────────────────────────
const replay = applyMoves(fromServer, pending, noPotions);
const landedNew = replay.ok ? replay.state : fromServer;
const stillInHand = landedNew.hand.some((c) => c.uid === X.uid);
const newOut = applyMoves(fromServer, pending, noPotions);
console.log("NEW  accept() replays what the server has not seen yet");
console.log(`     replay took?                          ${replay.ok}`);
console.log(`     is ${X.uid} back in the hand on screen?  ${stillInHand}   <- nothing to re-play`);
console.log(`     server replays [pX]      ->  ok=${newOut.ok}  why=${newOut.why || "-"}\n`);

const pass = oldOut.ok === false && oldOut.why === "illegal_play" && backInHand === true
          && newOut.ok === true && stillInHand === false;
console.log(pass ? "PASS — the bug reproduces, and the fix removes its cause."
                 : "FAIL — the harness did not reproduce the reported shape.");
process.exit(pass ? 0 : 1);
