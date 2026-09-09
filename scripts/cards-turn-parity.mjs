// ── THE TWO WAYS A TURN CAN END MUST AGREE ───────────────────────────────────────────────────────────────
// The card game ends a turn twice over. `endTurn` is ATOMIC and the simulator walks it; the screen drives
// the clock itself so it can put a beat between each creature's swing, and walks the four steps —
// heroEndTurn, startFoeTurn, foeAct per foe, finishFoeTurn — by hand.
//
// ⚠️ THIS SCRIPT EXISTS BECAUSE THEY SILENTLY DISAGREED FOR MONTHS. Metallicize was paid inside endTurn,
// ahead of its call to startFoeTurn, and when the turn was split into steps only the LOOPS were extracted.
// The screen therefore stepped straight over it, and every blockEach source in the game — two cards and nine
// trinkets and bottles — paid the simulator and paid the player nothing. It measured perfectly and did not
// exist. The comment above the split even claimed "no possibility of the two disagreeing", which was true of
// the code it named and false of the code beside it.
//
// A comment cannot hold that invariant. This can: run both paths over the same states and compare the whole
// result. Deliberately NOT an npm gate — it is a thing to run when you touch the turn, like arena-report.
//
// Run:  node --experimental-loader ./scripts/lib/app-loader.mjs scripts/cards-turn-parity.mjs
import {
    startFight, playCard, endTurn, heroEndTurn, startFoeTurn, foeAct, finishFoeTurn,
} from "../src/lib/marketplace/cards-kit.js";

// The stepped path, exactly as CardFightClient walks it. If that component changes, change this with it.
const stepped = (state) => {
    const mine = heroEndTurn(state);
    let cur = startFoeTurn(mine.state).state;
    const events = [...mine.events];
    for (let i = 0; i < cur.foes.length; i += 1) {
        const step = foeAct(cur, i);
        cur = step.state;
        events.push(...step.events);
        if (cur.over) break;
    }
    const done = finishFoeTurn(cur);
    return { state: done.state, events: [...events, ...done.events] };
};

// Everything a turn can carry that either path might forget. Each case seeds a fight, forces a card or a
// status onto the hero, and ends the turn both ways.
const CASES = [
    { name: "plain turn", deck: ["bite", "bite", "hop", "hop", "peck", "scuttle"] },
    { name: "Metallicize (blockEach)", deck: ["metallicize", "bite", "hop", "peck", "swipe", "scuttle"], play: "metallicize" },
    { name: "a curse that ticks (Doubt)", deck: ["bite", "hop", "peck", "swipe", "scuttle", "doubt"] },
    { name: "The Hollow (hpPerHand)", deck: ["bite", "hop", "peck", "swipe", "scuttle", "hollow"] },
    { name: "Ethereal junk (Clumsy)", deck: ["bite", "hop", "peck", "swipe", "scuttle", "clumsy"] },
    { name: "poisoned hero", deck: ["bite", "hop", "peck", "swipe", "scuttle", "bite"], hero: { poison: 4 } },
    { name: "regenerating hero", deck: ["bite", "hop", "peck", "swipe", "scuttle", "bite"], hero: { regen: 3, hp: 40 } },
    { name: "intangible hero", deck: ["bite", "hop", "peck", "swipe", "scuttle", "bite"], hero: { intangible: 2 } },
    { name: "frail + weak hero", deck: ["bite", "hop", "peck", "swipe", "scuttle", "bite"], hero: { frail: 2, weak: 2 } },
    { name: "a crowd", deck: ["bite", "hop", "peck", "swipe", "scuttle", "bite"], enc: "three_louse" },
];

const clone = (o) => JSON.parse(JSON.stringify(o));
// Events carry no ordering guarantee between the two walks beyond the hero's own block landing first, so
// they are compared as a sorted multiset. The STATE is compared exactly — that is the part a player feels.
const bag = (evs) => evs.map((e) => `${e.type}:${e.on ?? ""}:${e.key ?? ""}:${e.amount ?? ""}`).sort().join("|");

let failed = 0;
for (const c of CASES) {
    for (const seed of [3, 11, 29]) {
        let f = startFight({ seed, hero: { hp: 60, hpMax: 80, ...(c.hero || {}) }, deck: c.deck, perks: [] });
        if (c.play) {
            const card = f.draw.find((x) => x.id === c.play) || f.hand.find((x) => x.id === c.play);
            if (card) {
                f = { ...f, hand: [card, ...f.hand.filter((x) => x.uid !== card.uid)],
                    draw: f.draw.filter((x) => x.uid !== card.uid), energy: 3 };
                f = playCard(f, card.uid, 0).state;
            }
        }
        const a = endTurn(clone(f));
        const b = stepped(clone(f));
        const same = JSON.stringify(a.state) === JSON.stringify(b.state);
        const sameEvents = bag(a.events) === bag(b.events);
        if (!same || !sameEvents) {
            failed += 1;
            console.log(`!! ${c.name} (seed ${seed}) — ${!same ? "STATE differs" : "events differ"}`);
            if (!same) {
                console.log(`   atomic  hp ${a.state.hero.hp} block ${a.state.hero.block || 0}`);
                console.log(`   stepped hp ${b.state.hero.hp} block ${b.state.hero.block || 0}`);
            }
        }
    }
}
console.log(failed
    ? `\ncards-turn-parity — ${failed} disagreement(s). A line has landed in one path and not the other.`
    : `cards-turn-parity — ${CASES.length} cases x 3 seeds: both ways of ending a turn agree exactly.`);
process.exit(failed ? 1 : 0);
