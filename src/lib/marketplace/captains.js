// ── HER CAPTAIN, AND THE CHART HE IS CARRYING ────────────────────────────────────────────────────────────────
// Luke: "maybe you can capture captains. and interrogate them like a mini game, and you can get them to
// confess after you get a few of them and depending on the star rating of the captain helps determine the
// quality of the island you sail to."
//
// And then, after the minigame was built and played: "Remove the whole interrogated mini game. It should just
// be a... you capture the captain, and he gives you the treasure map."
//
// So the loop is two steps, not three:
//
//     beat an NPC ship  ->  you take her captain, and he tells you where something is
//
// ⚠️ WHAT WENT, AND WHY IT IS NOT COMING BACK IN PIECES. Dispositions, tactics, the outcome table, the tells,
// the nerve lantern, the will chain, saidFor, interrogate, ransom, release, berths, boarding cost, the
// thirty-minute window and the three-confession chart are ALL gone. Every one of them existed to make asking
// him a decision — and the decision was a wall between beating a ship and sailing to the island it bought you.
// A step that can FAIL in the middle of a loop is a step people stop starting.
//
// What survives is the only part that was ever load-bearing: the captain's STARS grade the chart. That is
// Luke's "depending on the star rating of the captain helps determine the quality of the island", which is now
// the whole feature rather than its reward.
//
// PURE ON PURPOSE, like ship-battle.js and gun-ports.js next door: no database, no imports with side effects.
// captains-store.js is the half that persists it.
//
// ⚠️ OWNER-GATED. See `CAPTAINS_PUBLIC` at the bottom and the note beside it.

import { FLEET, MAX_FLEET_RANK } from "@/lib/marketplace/fleet.js";

// ── HOW MUCH A CAPTAIN IS WORTH ──────────────────────────────────────────────────────────────────────────────
// Stars come off the rung he was commanding, in five bands of eight. They are the only number the player sees
// and the only one that matters: they are the grade of the chart he gives up.
export const MAX_STARS = 5;
export const starsForRank = (rank) => Math.max(1, Math.min(MAX_STARS, Math.ceil(Math.max(1, Number(rank) || 1) / 8)));

// ── THE CHART ────────────────────────────────────────────────────────────────────────────────────────────────
// One captain, one chart, graded on his own stars. It was three confessions saved up and graded on the three
// men who gave them, which is a collection mechanic wearing a treasure map — and Luke's own words on captains
// were "transient, a stepping stone, not collected".
export const chartGrade = (stars) => Math.max(1, Math.min(MAX_STARS, Number(Array.isArray(stars) ? stars[0] : stars) || 1));

// Four bands rather than five numbers: a grade is a thing the player should be able to feel, and "a Sounding"
// versus "a Reckoning" is legible where 4-of-5 is not.
export const CHART_BANDS = [
    { id: "sounding", name: "A Sounding", min: 1, blurb: "A small man agreeing about a small place." },
    { id: "bearing", name: "A Bearing", min: 2, blurb: "Enough to steer by, if the sea is kind." },
    { id: "reckoning", name: "A Reckoning", min: 4, blurb: "A man who commanded something, naming the water he lost it in." },
    { id: "certainty", name: "A Certainty", min: 5, blurb: "Nobody left alive disputes where this is." },
];
export const chartBand = (grade) => [...CHART_BANDS].reverse().find((b) => grade >= b.min) || CHART_BANDS[0];

// ── WHAT HE SAYS WHEN HE SAYS IT ─────────────────────────────────────────────────────────────────────────────
// He hands it over. That is the whole of it, so the line has to carry the moment on its own — and it is the
// one thing left that can make a captain feel like a person rather than a drop. Picked off his stars, because
// a man who commanded a rowboat and a man who commanded a ship of the line do not give up the same way.
const HANDOVER = {
    1: "He gives it up before anyone asks him to, and looks relieved.",
    2: "He tells you, plainly, and asks to be put ashore somewhere with a road.",
    3: "He wants it understood that he is trading, not surrendering. Then he tells you.",
    4: "He is a long time deciding. What he finally says, he says only once.",
    5: "He writes it himself, in a steady hand, and does not look up when you take it.",
};
export const handoverFor = (stars) => HANDOVER[Math.max(1, Math.min(MAX_STARS, Number(stars) || 1))] || HANDOVER[1];

/** The captain's own name, off the ship he was commanding. Authored beside the fleet so the two never drift. */
export function captainFor(rank) {
    const ship = FLEET.find((s) => s.rank === rank) || FLEET[0];
    return { rank, art: ship.art, ship: ship.name, name: CAPTAIN_NAMES[rank] || "Her Captain", stars: starsForRank(rank) };
}

// ── WHO THEY ARE ─────────────────────────────────────────────────────────────────────────────────────────────
// One per rung. Several are already named by their own ship — Vane commands the Sovereign and the Reprisal,
// Salt Meg has a Revenge — and where the ship names nobody, the captain is authored to sound like the thing he
// commands rather than like a fantasy name generator.
export const CAPTAIN_NAMES = {
    1: "Peg Ellory", 2: "Tom Wetpowder", 3: "Sil Crane", 4: "Mother Nettle", 5: "Salt Meg",
    6: "Hollis Tide", 7: "Bitter Aldwyn", 8: "The Widow Wage", 9: "Reef Kallow", 10: "The Tithesman",
    11: "Dowry Kell", 12: "Pale Anselm", 13: "Gunner Roe", 14: "Arrear Bligh", 15: "Admiral Vane",
    16: "Cutter Thorne", 17: "The Assizeman", 18: "Hammerfall Ord", 19: "Assurance Vell", 20: "Commodore Ash",
    21: "Blockade Harrow", 22: "Sixty-Four Voss", 23: "Verdict Iremonger", 24: "Gallowglass Rue", 25: "Admiral Vane",
    26: "The Salt Choir", 27: "Marigold Ames", 28: "Barnacle Court", 29: "The Lamprey", 30: "The Tide Marshal",
    31: "Gravemouth Sull", 32: "The Nine Widows", 33: "Pressgang Odom", 34: "Undertow Vane", 35: "Mother Fathom",
    36: "The Long Reckoning", 37: "Cartographer Regret", 38: "The Unbroken Line", 39: "Hull Seventeen", 40: "The Last Harbour",
};

// ⚠️ OWNER-GATED WHILE IT IS BUILT, AND IT COMES IN A PAIR ────────────────────────────────────────────────────
// Luke: "it would need to be owner gated." Both doors are here so neither can be forgotten: the capture at the
// end of a battle must not fire, and the charted-island option on the helm must not appear — see
// [[feature-gates-come-in-pairs]]. With the brig gone there is no third door left to miss.
//
// ⚠️ AND IT GOES ON THE MASTER LIST. When this launches, flip this one constant and delete the entry from
// [[sailing-test-overrides]]. Nothing else in this feature reads a flag.
export const CAPTAINS_PUBLIC = false;
export const captainsOpenTo = (isOwner) => CAPTAINS_PUBLIC || Boolean(isOwner);

export { MAX_FLEET_RANK };
