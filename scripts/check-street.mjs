// ── NOTHING STANDS IN THE FRAME ─────────────────────────────────────────────────────────────────────────────
// Luke, twice: first the Forge jammed into the left edge, then "The Stockade voting is too close to the
// border. I thought we talked about this?"
//
// We had, and my fix was half of one — and then my own check PASSED the half. That is the part worth writing
// down. The first version of this measurement asked "is any object at x <= 5% or x >= 95%", which is a
// percentage of a world whose width changes with how many objects a town has. Rootwood's booth sat at 94% of
// a 2,905px street: 174px of margin, against a sprite that reaches 122px from its centre. Fifty pixels of
// visible street, and the check called it fine.
//
//   npm run check:street
//
// ⚠️ SO THE CRITERION IS PIXELS OF CLEAR STREET, measured against the width of the thing standing there.
// A percentage cannot express "there is room beside it"; a distance can.
import { TOWNS } from "@/lib/marketplace/towns.js";
import { townStreet, layOutStreet, worldWidthFor, PER_SLOT, EDGE_MARGIN } from "@/lib/marketplace/town.js";

// A building sprite is up to 244px wide and is centred on its x, so it reaches this far either side.
const SPRITE_HALF = 122;
// How much street must remain visible beyond it before the frame. Below this it reads as "against the edge".
const WANT_CLEAR = 150;
// Two neighbours closer than this are touching — the other half of the same question.
const WANT_APART = 200;

let bad = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); bad += 1; };

console.log(`street: ${PER_SLOT}px between neighbours, ${EDGE_MARGIN}px of margin at each end`);
console.log(`a sprite reaches ${SPRITE_HALF}px either side, so a margin under ${SPRITE_HALF + WANT_CLEAR}px crowds the frame\n`);

for (const t of TOWNS) {
    const visible = townStreet(t.n).filter((b) => b.gate !== "owner");
    const { objects } = layOutStreet(visible, { townN: t.n, features: t.features, stocks: t.n === 1 });
    const w = worldWidthFor(objects.length);
    const px = (pct) => Math.round((pct / 100) * w);

    const first = objects[0];
    const last = objects[objects.length - 1];
    const clearL = px(first.x) - SPRITE_HALF;
    const clearR = px(100 - last.x) - SPRITE_HALF;

    let worst = Infinity;
    for (let i = 1; i < objects.length; i += 1) {
        const gap = px(objects[i].x - objects[i - 1].x);
        if (gap < worst) worst = gap;
        if (gap < WANT_APART) fail(`town ${t.n}: ${objects[i - 1].id} and ${objects[i].id} are ${gap}px apart`);
    }
    if (clearL < WANT_CLEAR) fail(`town ${t.n}: ${first.id} has only ${clearL}px of street beyond it on the left`);
    if (clearR < WANT_CLEAR) fail(`town ${t.n}: ${last.id} has only ${clearR}px of street beyond it on the right`);

    console.log(`  town ${t.n} ${t.name.padEnd(20)} ${String(objects.length).padStart(2)} objs · world ${String(w).padStart(4)}px`
        + ` · clear ${String(clearL).padStart(4)}/${String(clearR).padStart(4)}px · closest pair ${worst}px`);
}

// The ungated street is the widest one anybody sees today, and it is laid out by the same rule.
const wide = worldWidthFor(16);
if (wide - PER_SLOT * 15 < EDGE_MARGIN * 2 - 1) fail(`the ungated street (16 objects) loses its margin: world ${wide}px`);

console.log(bad
    ? `\ncheck:street — ${bad} problem(s). Something is standing in the frame or on top of its neighbour.`
    : "\ncheck:street — every town has real street beyond its first and last object, and nothing touches.");
process.exit(bad ? 1 : 0);
