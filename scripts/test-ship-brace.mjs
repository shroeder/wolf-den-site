// ── DOES "BRACE FOR IT" ACTUALLY STOP ANYTHING? ─────────────────────────────────────────────────────────────
// ValkyrieSylve, in #bugs 2026-11-11: "When bracing for it in a ship battle, it did not actually do anything
// for me."
//
// Reading the code says it works: resolveBrace arms it, resolveVolley and resolveReckoning both spend it, and
// the scene prints "took it all". Reading is how the Coliseum bug survived three passes, so this runs it.
//
// ⚠️ EVERY PIECE OF THIS IS A PURE FUNCTION over a JSON state, which is why no browser and no database are
//    needed — the whole fight is arithmetic and a seeded rng. A rig that needed a signed-in member on a boat
//    would have been a day's work to learn a thing that takes a second.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/test-ship-brace.mjs
import {
    initBattleState, shipProfile, foeProfile, resolveBrace, resolveVolley, resolveReckoning, foeAims,
} from "@/lib/marketplace/ship-battle.js";

let fails = 0;
const check = (ok, msg, extra = "") => {
    console.log(`  ${ok ? "✓" : "✗"} ${msg}${extra ? `  ${extra}` : ""}`);
    if (!ok) fails += 1;
};

// A member at boat 60 — the level the ability unlocks at — against an ordinary foe.
const me = shipProfile({ name: "Me", boatLevel: 60, gunLevel: 8, gunneryLevel: 8, hullLevel: 6, sailLevel: 4 });
const foe = foeProfile({ name: "Her", boatLevel: 60, gunLevel: 8, gunneryLevel: 8, hullLevel: 6, sailLevel: 4 });

console.log(`\ncanBrace at boat 60: ${me.canBrace}`);
check(me.canBrace === true, "the ability is unlocked at boat 60");

// ⚠️ A FIXED RNG, SO A "NOTHING HIT ME" RESULT CANNOT BE LUCK. 0 makes every roll hit: with no brace the
// volley must do damage, and with a brace it must do none. Both halves are the test.
const alwaysHit = () => 0;

function volleyAt(state, braced) {
    let st = JSON.parse(JSON.stringify(state));
    if (braced) {
        const b = resolveBrace(me, foe, st);
        if (!b.ok) return { error: b.error };
        st = b.state;
    }
    // ⚠️ resolveVolley TAKES THE PLAYER FIRST AND FIRES BOTH DECKS ITSELF. The first two versions of this
    // test called it with the profiles swapped and with her own targeting, and measured zero damage
    // UNBRACED -- which reads as "the brace is redundant" and was really the probe never pointing a gun at
    // me. Her orders go in as foeOrders, aimed at the hull, because sails and guns do not cost planks.
    // A control that cannot move the number it watches proves nothing. [[calibrate-at-the-extreme]]
    // ⚠️ AND SHE IS GIVEN ENOUGH PLANKS TO SURVIVE MY BROADSIDE. You always shoot first and fire()
    // returns early once either side is down, so with her real 10 planks my seven guns sank her before she
    // could answer and the "unbraced" control was measuring a round she never fired in. Passing no aims
    // does not help: sanitizeAims fills an empty list with a full broadside.
    st.foe.hp = 999;
    const myAims = st.me.guns.map((_, gun) => ({ gun, zone: "hull", target: null, ammo: "round" }));
    const herAims = st.foe.guns.map((_, gun) => ({ gun, zone: "hull", target: null, ammo: "round" }));
    const before = st.me.hp;
    const res = resolveVolley(me, foe, st, myAims, { rng: alwaysHit, foeOrders: herAims });
    return { lost: before - res.state.me.hp, events: res.events, state: res.state };
}

console.log("\nan ordinary broadside, every ball rolled to hit");
const plain = volleyAt(initBattleState(me, foe), false);
check(plain.lost > 0, "unbraced: her broadside costs me planks", `lost ${plain.lost}`);

const braced = volleyAt(initBattleState(me, foe), true);
check(braced.lost === 0, "braced: her broadside costs me nothing", `lost ${braced.lost}`);
check(
    (braced.events || []).some((e) => e.braced),
    "the volley event is flagged braced, so the scene can say so",
);
check(braced.state && braced.state.me.braced === false, "and the brace is spent, not left armed");

console.log("\nthe Reckoning — the one thing anybody braces FOR");
let st = initBattleState(me, foe);
st.foe.reck = 99;                       // her meter full
const b = resolveBrace(me, foe, st);
check(b.ok, "brace arms before her Reckoning");
const beforeR = b.state.me.hp;
const rck = resolveReckoning(foe, me, b.state, { rng: alwaysHit });
const stateR = rck?.state || rck;
const afterR = (stateR?.me?.hp ?? beforeR);
check(afterR === beforeR, "braced: her Reckoning costs me nothing", `lost ${beforeR - afterR}`);

console.log("\nit is one round only, and only once a fight");
let s2 = initBattleState(me, foe);
s2 = resolveBrace(me, foe, s2).state;
const first = volleyAt({ ...s2 }, false);           // already armed, so this one is absorbed
check(first.lost === 0, "the armed round is absorbed", `lost ${first.lost}`);
const again = resolveBrace(me, foe, first.state);
check(again.ok === false && again.error === "spent", "and it cannot be used twice in one fight");

console.log(fails ? `\n✗ ${fails} failed — the report is real\n` : "\n✓ brace does what the card says, in every path\n");
process.exit(fails ? 1 : 0);
