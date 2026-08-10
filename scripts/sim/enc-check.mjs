// Does a monster fight actually behave like a monster fight? Runs both shapes headless.
import { initBattleState, resolveVolley, resolveReckoning, sanitizeAims, RECKONING_AT } from "../../src/lib/marketplace/ship-battle.js";

const me = { name: "me", guns: 6, hp: 12, accuracy: 0.62, rake: 0.1, dmgMult: 1, dmgTaken: 1, gunStats: {}, ammo: { id: "round" } };
const mkFoe = (sys) => ({ name: "foe", guns: 5, hp: 18, accuracy: 0.6, rake: 0.12, dmgMult: 1, dmgTaken: 1, sys });

function run(sys, aimZone) {
    const foe = mkFoe(sys);
    let st = initBattleState(me, foe);
    const seen = new Set();
    let sailsEver = 0, gunsEver = 0, rounds = 0;
    while (!st.over && rounds < 60) {
        const laid = sanitizeAims(st, "me", Array.from({ length: 6 }, (_, g) => ({ gun: g, zone: aimZone })), {
            zonesAllowed: sys === false ? ["hull"] : ["sails", "hull", "guns"],
        });
        laid.forEach((a) => seen.add(a.zone));
        const res = resolveVolley(me, foe, st, laid, {});
        st = res.state; rounds++;
        if (st.foe.sails < 6) sailsEver++;
        if (st.foe.guns.some((g, i) => g < st.foe.gunMax[i])) gunsEver++;
        if (res.over) break;
    }
    return { zonesUsed: [...seen], sailsLost: sailsEver > 0, gunsLost: gunsEver > 0, rounds, foeHp: st.foe.hp };
}

console.log("SHIP,  aiming at sails :", JSON.stringify(run(true, "sails")));
console.log("MONSTER, aiming at sails:", JSON.stringify(run(false, "sails")));
console.log("MONSTER, aiming at guns :", JSON.stringify(run(false, "guns")));

// Reckoning against a monster must only ever hit timber.
{
    const foe = mkFoe(false);
    let st = initBattleState(me, foe);
    st.me.reck = RECKONING_AT;
    const r = resolveReckoning(me, foe, st);
    const zones = new Set((r.events.find((e) => e.type === "volley")?.shots || []).map((x) => x.zone));
    console.log("MONSTER reckoning zones :", [...zones], "| ok:", r.ok, "| dmg dealt:", 18 - r.state.foe.hp);
}
{
    const foe = mkFoe(true);
    let st = initBattleState(me, foe);
    st.me.reck = RECKONING_AT;
    const r = resolveReckoning(me, foe, st);
    const zones = new Set((r.events.find((e) => e.type === "volley")?.shots || []).map((x) => x.zone));
    console.log("SHIP    reckoning zones :", [...zones].sort());
}
