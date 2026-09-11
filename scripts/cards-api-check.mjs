// ── PLAYING WHOLE RUNS THROUGH THE REAL ENDPOINTS ────────────────────────────────────────────────────────────
// The browser bot drives Chrome, which is the right tool for "does the screen work" and the wrong one for
// "does the server contract hold" — it is slow, it dies in act one, and the deepest rooms in the game are the
// ones it therefore never reaches. This talks to the API directly and plays as fast as the server answers, so
// a boss, an act transition and the Hollow are all reachable in a couple of minutes.
//
// It is not a second implementation of the game. It reads `run.fight` — the SERVER's fight, the only one there
// is now — picks a legal move out of it with the engine, and posts it. Which is exactly what the screen does,
// minus the pictures.
//
//   node scripts/cards-rig.mjs save            (prints SHOT_COOKIE, backs up the real run)
//   SHOT_COOKIE=… node scripts/cards-api-check.mjs --runs 3
//   node scripts/cards-rig.mjs restore
import { canPlay, cardById, incomingTotal, livingFoes } from "../src/lib/marketplace/cards-kit.js";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--url", "http://localhost:3000");
const RUNS = Number(arg("--runs", 3));
const COOKIE = process.env.SHOT_COOKIE;
if (!COOKIE) { console.error("SHOT_COOKIE required — mint one with scripts/cards-rig.mjs save"); process.exit(1); }

let refused = 0;
const post = async (action, extra = {}) => {
    const r = await fetch(`${BASE}/api/marketplace/cards/run`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `wolfden-mkt-buyer-session=${COOKIE}` },
        body: JSON.stringify({ action, ...extra }),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) { refused += 1; console.log(`  ✗ ${action} → ${r.status} ${d?.error}`); }
    return { ok: r.ok, run: d?.run || null, error: d?.error };
};

// ONE MOVE AT A TIME, read off the server's own fight every single time. The first cut of this batched a
// whole turn and kept its own idea of what energy was left, which is a second implementation of the rules and
// it was wrong within one card — the server refused it, correctly. A test that has to model the game to talk
// to the game is testing its own model. Slower per fight and worth it; the real client can batch a turn
// because it runs the actual engine, and this deliberately does not.
const nextMove = (fight) => {
    const playable = (fight.hand || []).filter((c) => canPlay(fight, c.uid));
    if (!playable.length) return ["e"];
    const live = livingFoes(fight);
    // Enough judgement to reach a boss and occasionally beat one: guard when the swing coming in would take
    // more than is left, otherwise hit whatever is closest to dying.
    const incoming = incomingTotal(fight) || 0;
    const spare = (fight.hero?.hp || 0) + (fight.hero?.block || 0);
    const wantBlock = incoming >= spare * 0.6;
    const block = playable.find((c) => cardById(c.id)?.block);
    const hit = playable.find((c) => cardById(c.id)?.damage);
    const card = (wantBlock && block) || hit || playable[0];
    const weakest = live.slice().sort((a, b) => a.hp - b.hp)[0];
    return ["p", card.uid, weakest ? fight.foes.indexOf(weakest) : 0];
};

const deepest = { act: 0, stop: 0, score: 0, bosses: 0 };
for (let r = 0; r < RUNS; r += 1) {
    let { run } = await post("restart");
    let guard = 0;
    while (run && !run.done && guard++ < 1200) {
        if (run.at && run.fight && !run.at.won) {
            const before = run.stop;
            const res = await post("act", { moves: [nextMove(run.fight)] });
            if (!res.ok) break;
            run = res.run;
            if (run.at?.kind === "boss" && run.at?.won && before) deepest.bosses += 1;
            continue;
        }
        // Not in a fight: take whatever the room offers and move on.
        if (run.offers?.length) { run = (await post("pick", { id: run.offers[0] })).run; continue; }
        if (run.bossOffers?.length) { run = (await post("bosspick", { id: run.bossOffers[0] })).run; continue; }
        if (run.at?.kind === "rest" && !run.at.rested) { run = (await post("rest")).run; continue; }
        if (run.at?.kind === "treasure" && !run.at.opened) { run = (await post("open")).run; continue; }
        if (run.at) { run = (await post("leave")).run; continue; }
        // On the map: walk to the first room that is open to us.
        const from = (run.trail || []).length ? run.trail[run.trail.length - 1] : null;
        const rows = run.map?.nodes || [];
        const next = rows.find((n) => n.row === (from ? from.row + 1 : 0));
        if (!next) break;
        const step = await post("enter", { row: next.row, lane: next.lane });
        if (!step.ok) {
            // Reachability is the server's call — try every lane on that row before giving up.
            const lanes = rows.filter((n) => n.row === next.row);
            let moved = null;
            for (const l of lanes) { const t = await post("enter", { row: l.row, lane: l.lane }); if (t.ok) { moved = t.run; break; } }
            if (!moved) break;
            run = moved; continue;
        }
        run = step.run;
    }
    if (run) {
        deepest.act = Math.max(deepest.act, run.act || 1);
        deepest.stop = Math.max(deepest.stop, run.stop || 0);
        console.log(`run ${r + 1}: ${run.done || "stalled"} — act ${run.act} stop ${run.stop}, refused on run: ${run.refused || 0}`);
    }
}
console.log(`\ndeepest: act ${deepest.act}, stop ${deepest.stop}, bosses killed ${deepest.bosses}`);
console.log(`moves the server refused: ${refused}`);
