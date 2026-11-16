// ── THE GROVE IS OPEN ────────────────────────────────────────────────────────────────────────────────────────
// The in-game announcement. Luke: "Prep announcement in game."
//
// ⚠️ AND IT DOES NOT EXPLAIN THE MECHANICS. Luke, on the first draft: "It's a little too on the nose
// with explaining the mechanics. You can kind of leave a little room for them to be excited about it
// instead of explaining exactly everything." The first version counted zones per map, broke down the
// three drops per creature and described how the kill bar fills -- a manual, not an announcement. What
// stays is what makes somebody open the door; the rest is in there to be found.
//
// ⚠️ PARAPHRASE ONLY — the standing rule for every member-facing post in this folder. Nothing about how it
// was built, no flag names, no internals, nothing from our conversation. It says what is in the world, where
// the door is, and stops. It says nothing about gating because there is no gating -- the whole unlock ladder
// was removed on 2026-11-16 and every feature is open to every account on day one.
//
// ⚠️ THE ARBITER'S GRAMMAR IS FOUR RULES AND BOLD IS NOT ONE OF THEM. See notice-format.js:
//
//     # Heading        a section head
//     - bullet         a list item
//     /images/x.webp   a bare path ALONE on its line is a picture
//     blank line       ends a paragraph
//
// The first draft of this post was written in markdown and carried **asterisks** through five paragraphs.
// They do not render — they would have gone up in front of the whole Den as literal punctuation. There is no
// bold, no italics and no links; the heading and the picture are the emphasis.
//
// ⚠️ AND THE PICTURES ARE THE GAME'S OWN SPRITES, not the composited PNGs built for the email. Those have the
// email card's colour baked in behind them, which is right for an inbox and wrong on the Den's own chat
// background. In here the transparent webp the game already draws is the correct file.
//
//   node scripts/arbiter-post-grove-open.mjs            # dry run, prints the body
//   node scripts/arbiter-post-grove-open.mjs --apply    # posts it
import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `The Grove is open. Every member can walk in, starting now.

It has been behind a door for months while a handful of you tested it. That door is gone.

/images/grove/boss-bellowmaw.webp

# Seven maps of forest
You walk your hero into it and fight what is in front of you. It is built for a phone and one thumb, and it is the largest thing in the Den by a distance.

The deeper you go the harder it hits — and the better it pays.

/images/grove/armour-legendary_head.webp

# Things in there are wearing gear you do not have
It runs all the way up to mythic. The bosses have the best of it.

/images/grove/chest-barrowed.webp

# It pays into the rest of the game
The forest hands out crafting tools, and those raise what you earn in the farm, the mine, the kitchen, at sea and half a dozen other rooms you already play. Keep going and it starts handing out chests instead.

# The Coliseum
There is a marshal in there with a key, and twelve waves behind it.

Nobody has ever cleared all twelve. The best anyone has managed is eleven. If you are the first, say so.

# Where to find it
- On your hub, as The Grove
- Second in the game menu
- Through the door in town

Go in. Tell me what breaks.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);

// ── ⚠️ CHECK THE PICTURES EXIST BEFORE POSTING, NOT AFTER ───────────────────────────────────────────────────
// A bare path that 404s still parses as an image, so a typo here is a broken picture in the Den's main
// announcement rather than an error anybody sees first.
const { existsSync } = await import("node:fs");
const pics = BODY.split("\n").filter((l) => /^\/images\//.test(l.trim()));
let bad = 0;
for (const pic of pics) {
    const ok = existsSync(`public${pic.trim()}`);
    console.log(`  ${ok ? "✓" : "✗"} ${pic.trim()}`);
    if (!ok) bad += 1;
}
if (bad) { console.log(`\n✗ ${bad} picture(s) do not exist — refusing to post.`); process.exit(1); }

// ⚠️ AND NO MARKDOWN LEFT IN IT. The grammar has no bold; asterisks would go up as punctuation.
if (/\*\*|__/.test(BODY)) { console.log("\n✗ markdown found in the body — the Arbiter's grammar has no bold."); process.exit(1); }

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
