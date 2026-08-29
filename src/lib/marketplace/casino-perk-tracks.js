// ── THE FOUR PERMANENT STAT TRACKS AT THE COUNTER ────────────────────────────────────────────────────────────
// Pure, and separate from casino-perks.js because that file imports `server-only`: the arena's opponent
// builder spends chips for a rung the way a member does, and importing the table through the db-bound module
// dragged db.js into a client bundle and failed the build outright.
//
// casino-perks.js re-exports these, so nothing that already read them changed.
import { STAT_META } from "@/lib/marketplace/items.js";

//
// The art keeps its old filenames: they are the same four drawings, and renaming four webps to rename four
// labels is a migration for nothing.
const TRACK_ART = { might: "whetstone", vitality: "constitution", tenacity: "bulwark", ferocity: "bloodrush" };
export const STAT_TRACKS = ["might", "vitality", "tenacity", "ferocity"].map((stat) => ({
    perk: stat,
    stat,
    art: `/images/casino/perks/${TRACK_ART[stat]}.webp`,
    name: STAT_META[stat].label,
    blurb: STAT_META[stat].desc,
    per: 1,
}));
