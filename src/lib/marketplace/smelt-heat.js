// ── THE HEAT ─────────────────────────────────────────────────────────────────────────────────────────────────
// Where the furnace's bands live, shared by the bar you watch and the server that grades your pour. They were
// written twice — 0.42 / 0.68 / 0.88 in the client and again in mining.js — which meant the "PERFECT" you were
// reading off the bar was only coincidentally the PERFECT you were paid for.
//
// Deliberately a DIFFERENT hand from the swing: that one is a moving marker you catch, this one is a rising bar
// you have to let run. The good window sits near the top, so holding for it risks cooking the batch.
//
// `heat` is 0 (cold) upward; past 1.0 it's burning, and the client lets it run to 1.2 before pouring for you.
export const HEAT_BANDS = [
    { key: "cold", label: "Too cold", short: "Too cold", max: 0.42, mult: 0.7, blurb: "Half of it never melted." },
    { key: "warm", label: "Warm", short: "Warm", max: 0.68, mult: 1.0, blurb: "It ran, eventually." },
    { key: "hot", label: "Hot", short: "Hot", max: 0.88, mult: 1.35, blurb: "A clean, bright pour." },
    { key: "perfect", label: "PERFECT POUR", short: "PERFECT", max: 1.0, mult: 1.8, blurb: "Ran like water. Not a scrap wasted." },
    { key: "burnt", label: "Burnt", short: "BURNING", max: 99, mult: 0.55, blurb: "You cooked it. Some of that is slag now." },
];

export const heatBand = (h) => HEAT_BANDS.find((b) => h <= b.max) || HEAT_BANDS[HEAT_BANDS.length - 1];

// Where the runaway point sits, and therefore what 100% of the drawn bar means. The client pours for you here.
export const HEAT_MAX = 1.2;

// The good zones, as percentages of the drawn bar — so the lit band IS the band you're graded against.
export const heatZone = (key) => {
    const i = HEAT_BANDS.findIndex((b) => b.key === key);
    const from = i > 0 ? HEAT_BANDS[i - 1].max : 0;
    const to = Math.min(HEAT_BANDS[i].max, HEAT_MAX);
    return { left: (from / HEAT_MAX) * 100, width: ((to - from) / HEAT_MAX) * 100 };
};

// ── THE PHASES ───────────────────────────────────────────────────────────────────────────────────────────────
// A smelt is THREE pours, not one, and each is faster than the last. One pour was a single easy tap that
// decided a whole stack; three that tighten is a hand you can lose late, which is how every other minigame
// here works — the kitchen speeds up per step and the mine's bar tightens per swing.
export const SMELT_PHASES = 3;
export const PHASE_LABELS = ["Charge", "Melt", "Pour"];
// How long the bar takes to run from cold to burnt, per phase. The window to hit PERFECT is a fixed slice of
// that, so a shorter rise is a strictly narrower target.
export const PHASE_RISE_MS = [2600, 1900, 1350];
