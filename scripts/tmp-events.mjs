import { readFileSync, writeFileSync } from "node:fs";

const p = "src/lib/marketplace/arena.js";
let s = readFileSync(p, "utf8");

// ── A BEAT IS A SEQUENCE, SO PUBLISH IT AS ONE ───────────────────────────────────────────────────────────────
// The builder goes in beside the other pure helpers. It takes the same locals the log line already carries and
// returns them IN THE ORDER THEY HAPPENED, which is the whole point: the client cannot reconstruct an order
// from a bag of fields, so it invented one out of hardcoded delays and got a flash.
const helper = `// ── ONE BEAT, IN THE ORDER IT HAPPENED ───────────────────────────────────────────────────────────────────────
// A beat was published as a BAG of fields — damage, blocked, thorned, riposted, stolen, countered, healed — and
// the screen had to guess a running order out of it, which it did with a table of hardcoded delays: ward at
// 40ms, block at 120, thorns at 200, drink at 240, riposte at 280. Ten things inside half a second, all mounted
// at once, while the fighters animated exactly once for the whole exchange. Luke: "everything post attack
// happens all at once."
//
// The engine already knows the order — it resolved them in it. This just stops throwing that away. Each event
// is { kind, side, n }, where SIDE is the fighter it lands on, and the client plays them one at a time.
//
// A blow with no rider is a single event, so a plain exchange is exactly as fast as it was.
function beatEvents(parts) {
    const out = [];
    const add = (kind, side, n, extra = {}) => {
        if (n == null || n === 0) return;
        out.push({ kind, side, n, ...extra });
    };
    for (const e of parts) {
        if (!e) continue;
        if (e.each && e.each.length > 1) {
            // A flurry is genuinely several blows and reads as one number otherwise.
            for (const n of e.each) out.push(n > 0 ? { kind: e.crit ? "crit" : "hit", side: e.side, n } : { kind: "miss", side: e.side });
            continue;
        }
        add(e.kind, e.side, e.n, e.crit ? { crit: true } : {});
    }
    return out;
}

`;
if (!s.includes("// ── ONE BEAT, IN THE ORDER IT HAPPENED")) {
    const anchor = "// ── LIFEDRINK PAYS IN WHOLE HP";
    if (!s.includes(anchor)) throw new Error("anchor for beatEvents not found");
    s = s.replace(anchor, helper + anchor);
}

// ── YOUR BEAT ────────────────────────────────────────────────────────────────────────────────────────────────
const yourPush = `            hits, healed, turned, kind: ability?.kind || "hit", theirThorns, theyStood, theirSoak,`;
const yourNew = `            // THE RUNNING ORDER of this beat, so the ring can play it as one instead of painting all of it on
            // one frame. Same numbers, arranged in the sequence they were resolved in.
            events: beatEvents([
                { kind: whiffed ? "miss" : (crit ? "crit" : "hit"), side: "them", n: whiffed ? null : dmg, each, crit },
                { kind: "ward", side: "them", n: theirSoak },
                { kind: "drink", side: "you", n: healed },
                { kind: "thorn", side: "you", n: theirThorns },
                { kind: "counter", side: "you", n: theirCounter, crit: theirCounterCrit },
                { kind: "drink", side: "them", n: theirCounterHeal },
                { kind: "riposte", side: "you", n: theirRiposte },
                { kind: "stood", side: "them", n: theyStood ? 1 : null },
            ]),
            hits, healed, turned, kind: ability?.kind || "hit", theirThorns, theyStood, theirSoak,`;
if (!s.includes(yourPush)) throw new Error("your-beat log push not found");
s = s.replace(yourPush, yourNew);

// ── THEIR BEAT ───────────────────────────────────────────────────────────────────────────────────────────────
const theirPush = `            riposted: sent, thorned, stolen, countered, counterCrit,`;
const theirNew = `            // The same running order from the other side of the ring.
            events: beatEvents([
                { kind: foeWhiffed ? "miss" : (foeCrit ? "crit" : "hit"), side: "you", n: foeWhiffed ? null : through, each: foeEach, crit: foeCrit },
                { kind: "block", side: "you", n: blocked },
                { kind: "ward", side: "you", n: soaked },
                { kind: "drink", side: "them", n: foeHealed },
                { kind: "thorn", side: "them", n: thorned },
                { kind: "counter", side: "them", n: countered, crit: counterCrit },
                { kind: "riposte", side: "them", n: sent },
                { kind: "drink", side: "you", n: stolen },
                { kind: "stood", side: "you", n: stood ? 1 : null },
            ]),
            riposted: sent, thorned, stolen, countered, counterCrit,`;
if (!s.includes(theirPush)) throw new Error("their-beat log push not found");
s = s.replace(theirPush, theirNew);

// ── THE TICKS ────────────────────────────────────────────────────────────────────────────────────────────────
// Each already gets its own log line; giving it an event makes it a moment of its own rather than a number that
// shares a frame with the swing that preceded it.
const ticks = [
    [`                b.log.push({ beat: b.beat, who: "you", grade: "burn", damage: tick, kind: "bleed",\n                    text: \`The wound opens again — \${tick}.\`, ability: null });`,
     `                b.log.push({ beat: b.beat, who: "you", grade: "burn", damage: tick, kind: "bleed",\n                    events: [{ kind: "bleed", side: "them", n: tick }],\n                    text: \`The wound opens again — \${tick}.\`, ability: null });`],
];
for (const [from, to] of ticks) {
    if (s.includes(from)) s = s.replace(from, to);
}
writeFileSync(p, s);
console.log("engine publishes beat events");
