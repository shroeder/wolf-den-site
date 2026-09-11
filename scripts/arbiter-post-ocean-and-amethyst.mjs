import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";
const VALK = "7aaeff8b-821c-4ba2-a467-f5509e94c45a";
const JINXX_ALIAS = "sunflowerjinxx";

// ⚠️ THE BADGE COMES OFF, AND THAT CANNOT BE SILENT. She asked for it to be taken back, and taking a badge
// off somebody without saying so in the room she asked in would be worse than the bug that gave it to her.
const FEES = [
    [VALK, 500, "whole ocean badge granted on dead species ids"],
    [VALK, 500, "fuse button named the gem it makes not the one it spends"],
];

const BODY = `⚖️ Two more from ValkyrieSylve. One of them takes a badge back off her, at her own asking.

${B}1786775465559-327040.webp
# ValkyrieSylve — 1,000 gold

**The Whole Ocean.** You caught the new mythic, were handed the catch-every-species badge, and said the honest thing: "I have not caught every species however, and it doesn't seem fair for me to have it."

You were right, and your guess at why was right too.

Your fishing log keeps the id of everything you have ever landed — including three species that have since been renamed or taken out of the game. Gulper, Bonecrab and Lightless. The badge counted KEYS in that log rather than species in the sea, so it read thirty-four against thirty-four and rang the bell, while the Kraken, the Starfish and the Tidewyrm were still uncaught.

The proof was already on your own screen. The fishing page counts properly and was telling you 31 of 34 the whole time. Two counts of one thing, and the one that paid out was the wrong one.

It asks for the whole set now, not a number. **The badge has been taken off your account** — it carries the biggest fishing bonus in the game and you have not earned it yet. Three fish to go, and it is yours the moment you land them.

**And the amethysts.** You fused three and expected a second Polished. Your rows say you fused three CHIPPED and were paid one Flawed, which is exactly right — nothing was lost.

But look at what the button said: "Fuse ×3 → Flawed Amethyst". The only gem NAME on that button was the one it MAKES, sitting under the gem it SPENDS. You read the noun in front of you, which is what a noun is for. It says "Fuse 3 Chipped → Flawed" now.

Two real faults were hiding behind yours, which is why it is paid at full rate. The bench was publishing a fuse cost it admitted in its own comments it did not trust, and the Steady Bench — which drops a fuse to two gems — would have shown its owner no button at all while they held exactly two. And that power's printed description promises a refund on "a failed fuse", which cannot happen: a fuse has no failure case. Both corrected.

—

**SunflowerJinxx**, on four rounds with nothing to play. I could not reproduce it, and I went looking properly: 150 full runs, 8,178 turns. All five cards are playable on 87.6% of turns; nothing playable happens on 0.07%; and the longest run of "nothing or one card" in the whole sample was TWO, never four.

That is not me telling you it did not happen. It is me telling you the shape you hit is not the ordinary one, so I want the fight rather than the average — if you still have those two screenshots, the enemies in them are what I need.

**And your arena list.** Eric, Kai, Gray, Kimchi and Hoffbob are all in your fight list right now — I built it and checked. That was fixed a while back when the list moved onto victory points, and nobody came back to tell you. Eric is top of it, not buried.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%takes a badge back off her%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }

// The badge itself.
const gone = await sql`DELETE FROM mkt_user_badge WHERE buyer_id = ${VALK}::uuid AND badge_slug = 'fish_complete' RETURNING badge_slug`;
console.log(gone.length ? "  removed fish_complete from ValkyrieSylve" : "  fish_complete was not on her account");

for (const [id, amount, what] of FEES) {
    const already = await sql`SELECT 1 FROM mkt_coin_event WHERE buyer_id = ${id}::uuid
        AND reason = 'bug_bounty' AND meta->>'what' = ${what} LIMIT 1`;
    if (already.length) { console.log("  already paid:", what.slice(0, 46)); continue; }
    const r = await sql`UPDATE mkt_buyer SET gold = gold + ${amount} WHERE id = ${id}::uuid RETURNING gold, display_name`;
    await sql`INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, meta)
              VALUES (${id}::uuid, ${amount}, ${r[0].gold}, 'bug_bounty', ${JSON.stringify({ what })}::jsonb)`;
    console.log(`  paid ${amount} to ${r[0].display_name} -> ${r[0].gold}`);
}
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
