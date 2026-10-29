// ── DOES EVERY QUEST ASK FOR SOMETHING THAT EXISTS, ON THE MAP IT IS ASKED ON? ───────────────────────────────
// Luke: "they should be relevant to the map that you're in. And only the map that you're in for that quest."
//
// A chain resolves its targets from the map's own creatures, bosses and parts, so an off-map target is not a
// wrong name — it is an UNFINISHABLE QUEST, and one that looks perfectly reasonable in the data. A map-3 chain
// asking for a map-5 boss sits there forever and reads as a bug in progress tracking rather than in content.
//
// It is also the exact failure a careful reader will think they have found and be wrong about: map one's
// bosses include "everburning" and its parts include "Ash Ember", both of which sound like the Ashen Reach
// and are not. Checking beats squinting.
//
// Not a gate — see the standing note about not adding more of those. Run it when the rosters or the chains
// move, which is the only time it can break.
//
//   node --import ./scripts/lib/register-loader.mjs scripts/grove-npc-audit.mjs
import { npcsOnMap, GROVE_NPCS, COLISEUM_NPCS, NPC_ZONES, COLISEUM_ZONE } from "@/lib/marketplace/grove-npcs.js";
import { GROVE_ZONES, GROVE_PARTS } from "@/lib/marketplace/grove-catalog.js";

const zoneMap = (z) => z.map || Math.ceil(z.n / 12);
let bad = 0;
let steps = 0;

for (let m = 1; m <= 7; m += 1) {
    const zones = GROVE_ZONES.filter((z) => zoneMap(z) === m);
    const foes = new Set(zones.flatMap((z) => (z.enemies || []).map((e) => (typeof e === "object" ? e.id : e))));
    const bosses = new Set(zones.map((z) => z.boss).filter(Boolean));
    const parts = new Set(Object.entries(GROVE_PARTS).filter(([, p]) => Number(p.map) === m).map(([id]) => id));
    const zoneNums = new Set(zones.map((z) => z.n));

    // The Coliseum must never share a zone with a quest-giver: two things to tap in one spot is a fight over
    // the same pixels, and the loser is whichever one the player wanted.
    if ((NPC_ZONES[m] || []).includes(COLISEUM_ZONE[m])) {
        console.log(`  ⚠️ map ${m}: the Coliseum sits in zone ${COLISEUM_ZONE[m]}, where a quest-giver already stands`);
        bad += 1;
    }

    for (const n of npcsOnMap(m)) {
        if (!n.chain.length) { console.log(`  ⚠️ ${n.id}: no chain`); bad += 1; }
        if (n.chain.length < 2 || n.chain.length > 5) {
            console.log(`  ⚠️ ${n.id}: ${n.chain.length} steps — Luke asked for 2 to 5`);
            bad += 1;
        }
        if (n.chain.length && !n.chain[n.chain.length - 1].reward.chest) {
            console.log(`  ⚠️ ${n.id}: last step pays no chest, so the chain has no payoff`);
            bad += 1;
        }
        for (const s of n.chain) {
            steps += 1;
            const miss = (k, ok, what) => { if (s.kind === k && !ok) { console.log(`  ⚠️ ${s.id}: ${k} target "${what}" is not on map ${m}`); bad += 1; } };
            miss("cull", foes.has(s.foe), s.foe);
            miss("hunt", bosses.has(s.foe), s.foe);
            miss("harvest", parts.has(s.part), s.part);
            miss("forge", parts.has(s.part), s.part);
            miss("delve", zoneNums.has(s.zone), s.zone);
            miss("survive", zoneNums.has(s.zone), s.zone);
        }
    }
}

console.log(`${GROVE_NPCS.length} quest NPCs, ${COLISEUM_NPCS.length} marshals, ${steps} steps`);
console.log(bad ? `${bad} PROBLEMS` : "every target belongs to its own map, every chain pays off");
process.exit(bad ? 1 : 0);
