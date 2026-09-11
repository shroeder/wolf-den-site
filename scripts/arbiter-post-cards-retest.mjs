import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";
const ERIC = "d68dacf6-10e1-40fe-93c8-9ca6ebdbb87e";
const SOUL = "7b05a5ed-3913-4852-a680-b97a449488d9";

const FEES = [[SOUL, 500, "card pets had no signature so both stones were the same"]];

const BODY = `⚖️ Two answers for this room, and a warning about your own act-four verdict.

${B}1787623237423-972879.webp
# SoullessShiitake — 500 gold

**The Chalk Hare's two stones.** "Exactly the same as its darkstone ability, just weaker."

Right, and it was all four of the card pets, not just the Hare. None of them had been given a signature ability, so they all fell back on a default one — and with no real ability for a stone to be ABOUT, both stones came out of that same default with one number scaled down. That is not two choices, it is one choice and a worse copy of it.

All four have their own ability now, and a proper pair: the Lightstone teaches them a second trade, the Darkstone doubles down on what they already do.

${B}1788960649709-188115.webp
# Eric D — the red key

Not a bug, and worth saying plainly. A key costs that ROOM'S prize — the campfire's rest, the chest's contents, the elite's trinket. The card is what winning any fight pays, elite or not, so you keep it.

The button was the problem. "Walk away from what the elite was carrying" reads as everything it had. It now says it takes the trinket and tells you the card is still yours.

—

**And now the warning.** Two things were badly wrong while you were all judging act four, and both are fixed:

**Ghostly Armour never wore off.** One energy, and every hit for the rest of the fight was cut to 1. Permanently. Anyone who drew it was playing a different game.

**The Heart was fighting at a difficulty nobody selected.** Its damage cap and one of its attacks were set to values from the hardest ascension rungs, on runs at rung zero, and its multi-hit was more than twice what it should be. It now hits exactly as hard as it is supposed to.

So every read this room has on the fourth act was taken against a card that trivialised it and a boss that was overtuned — often in the same run. I would not trust any of it, including my own. Fresh runs, please.

Two other things landed with it: crossing a rank now actually SHOWS you what it opened instead of handing it over silently, and a finished run feeds the pets whose cards were in your deck.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%warning about your own act-four verdict%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
for (const [id, amount, what] of FEES) {
    const already = await sql`SELECT 1 FROM mkt_coin_event WHERE buyer_id = ${id}::uuid
        AND reason = 'bug_bounty' AND meta->>'what' = ${what} LIMIT 1`;
    if (already.length) { console.log("  already paid:", what.slice(0, 46)); continue; }
    const r = await sql`UPDATE mkt_buyer SET gold = gold + ${amount} WHERE id = ${id}::uuid RETURNING gold, display_name`;
    await sql`INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, meta)
              VALUES (${id}::uuid, ${amount}, ${r[0].gold}, 'bug_bounty', ${JSON.stringify({ what })}::jsonb)`;
    console.log(`  paid ${amount} to ${r[0].display_name} -> ${r[0].gold}`);
}
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'testing')`;
console.log("\nposted to the testing room.");
