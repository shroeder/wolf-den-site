// ── PUTTING THE REAL NOUNS INTO A QUEST STEP ─────────────────────────────────────────────────────────────────
// Luke: "Let's remove all dialogue and systems its simply just the quest display."
//
// This file is what is LEFT of grove-npc-dialogue.js. That module carried 71 steps' worth of authored
// conversation — a greeting, the problem, the ask, a nudge, a send-off and a payoff for every step, plus
// GREET/SPENT/SENDOFF per giver — and the card metered it out one typed line at a time. All of it is gone.
// A quest is a display now: who wants it, what it is, where, how far along, and a button.
//
// ⚠️ THE TEMPLATING SURVIVES BECAUSE THE TITLES STILL NEED IT. "Make Noise in {zone_name}" is a step title,
// not dialogue, and a title that ships its own braces to the screen is the bug Luke caught by eye. So the
// filler stays, the prose does not.
//
// ⚠️ AND IT TAKES ITS NOUNS FROM THE CALLER. This module has no imports on purpose: grove-quests.js already
// holds the catalogue and resolves foe, part and zone names, so adding a lookup here would be a second
// place that decides what a creature is called.

const ORDINAL_WORD = ["", "first", "second", "third", "fourth", "fifth", "sixth",
    "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : w);
const nth = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    const t = v % 100;
    if (t >= 11 && t <= 13) return `${v}th`;
    return `${v}${["th", "st", "nd", "rd"][v % 10] || "th"}`;
};

/**
 * Fill a step's authored string with what the step actually points at.
 *
 * ⚠️ {zone_name} IS THE ONE THAT MATTERS. Luke, on a step that named a room by number: "I don't understand
 * what go to the sixth chamber means." Nothing in the game calls a zone by an index — the atlas, the zone
 * strip and the quest log's travel buttons all say The Spore Hall. The ordinal tokens are kept only for
 * the handful of titles that read better as a word, and a step must never name a ROOM with one.
 */
export function fill(text, step, names = {}) {
    if (!text) return text;
    const localZone = step.kind === "delve"
        ? step.need
        : step.zone ? ((step.zone - 1) % 12) + 1 : null;
    return String(text)
        .replaceAll("{zone_name}", names.zone || "there")
        .replaceAll("{n}", String(step.need ?? ""))
        .replaceAll("{foe}", names.foe || "it")
        .replaceAll("{part}", names.part || "the stuff")
        .replaceAll("{Ord_zone}", localZone ? cap(ORDINAL_WORD[localZone] || nth(localZone)) : "")
        .replaceAll("{ord_zone}", localZone ? (ORDINAL_WORD[localZone] || nth(localZone)) : "")
        .replaceAll("{nth_zone}", localZone ? nth(localZone) : "")
        .replaceAll("{n_zone}", String(localZone ?? ""))
        .replaceAll("{wave}", String(step.wave ?? step.need ?? ""));
}
