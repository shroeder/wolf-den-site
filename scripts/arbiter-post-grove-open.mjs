// ── THE GROVE IS OPEN ────────────────────────────────────────────────────────────────────────────────────────
// The launch announcement. Luke, 2026-11-14: "Sure. We should be official about it. In regards to announcing.
// I would expect an email. Draft. Arbiter announce. Onboarding guide updated." This is the Arbiter half.
//
// ⚠️ PARAPHRASE ONLY — the standing rule for every member-facing post in this folder. Nothing about how it was
// built, no flag names, no internals, nothing from the conversation. It says what is in the world, where the
// door is, and stops. In particular it says NOTHING about gating: GATING_LIVE is still false, no account is
// gated, and announcing a rule nobody is subject to would only frighten people.
//
//   node scripts/arbiter-post-grove-open.mjs            # dry run, prints the body
//   node scripts/arbiter-post-grove-open.mjs --apply    # posts it
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `🌲 **The Grove is open.**

It has been behind a door for months while a handful of you tested it. The door is gone — every member can walk in, starting now.

# What it is
Seven maps of forest, twelve zones each. You move your hero through it in real time and fight what is in front of you. It is built for a phone and one thumb, and it is the largest thing in the Den by a distance.

Zones open by kill count. Clear what is in front of you, take what it drops, walk further in — and the deeper you go the harder it hits and the better it pays.

# The gear is the point
Every creature in the forest has three pieces attached to it: an ordinary one, a rare one and a super-rare one. They run all the way from common up to mythic, and the zone bosses are where the good ones actually come from. Every boss sits on a cooldown rather than a key, so there is always one worth walking back for.

# The kill bar pays crafting tools — and those pay everywhere else
Kills fill a bar that belongs to the map you are on. Fill it and the forest hands you one of twelve crafting tools, one tier better than the one you are holding.

This is the part worth reading twice if you have no interest in a forest crawler: **those tools pay out in the farm, the mine, fishing, cooking, sailing, pets, the jeweller, the dungeons, the arena and the weekly boss.** Twelve rooms you already play. Once all twelve of your tools are current for a map, the bar starts handing you chests instead, and the deeper the map the better they roll.

# The Coliseum
There is a marshal in the forest with a key. Twelve waves, a clock, and a chest on the sand at the end of it. You get a key a day. Nobody has cleared all twelve yet — if you are the first, say so.

# Where to find it
It is on your hub as **The Grove**, second in the game menu, and there is a door to it in town. The Pathfinder has a chapter on it now too, with four steps and a gold chest at the end, so there is a paid reason to take the first walk.

Go in. Tell me what breaks.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

// ⚠️ The same duplicate guard every Arbiter post carries. These are written by hand and run by hand, and
// running one twice is a double post in front of the whole Den.
const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%The Grove is open%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'announce')`;
console.log("\nposted to the announce channel.");
