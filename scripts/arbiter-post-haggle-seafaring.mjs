import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";
const GRAY = "0afc1091-38a8-4a03-ac20-15dc86f5b9c4";
const ERIC = "d68dacf6-10e1-40fe-93c8-9ca6ebdbb87e";

// ⚠️ TWO DEFECTS, AND ONE OF THEM I ARGUED WITH HIM ABOUT IN THIS CHANNEL. The seafaring cap was answered
// as "a ceiling, not a fault" on 2026-09-10 and that answer is now wrong -- so the correction is public,
// in the same room, and the bounty is paid as if it had been answered correctly the first time.
const FEES = [
    [GRAY, 500, "seafaring capped at 4 across the whole collection"],
    [GRAY, 500, "town_haggle never applied to the gold shop"],
];

const BODY = `⚖️ Two from GrayKitsune, and on one of them I owe him a correction rather than an answer.

${B}1787231004681-977654.webp
# GrayKitsune — 1,000 gold

**Seafaring.** You raised this three times. The third time I told you it was a deliberate ceiling and not a fault, and that the cap was working as intended.

That was the wrong answer. It WAS a ceiling — four dig stamina across your entire collection, so once you were at four, every further sea pet you obtained added exactly nothing — but it should not have been there, and it is gone now. Every seafaring pet you own counts, in full. The card no longer prints a cap because there is not one.

You told me the Jellyfish moved nothing. It moves something now, and so does every one after it.

**And the thirty per cent.** Also yours, also asked twice, and the honest answer is worse than a clarification: half of that sentence had never been built.

The ability reads "30% off everything the travelling merchant and the gold shop sell". The merchant honoured it. The gold shop had never heard of it — not the gear, not the collection pieces, not the trophies, not the consumables shelf. There was exactly one place in the whole game that knew how to apply that discount and it was the merchant's chest counter.

There is one rule now and both ends of the sentence call it, so they cannot drift apart again. It comes off the price you SEE as well as the price you pay — a discount that only shows up at the till is its own kind of wrong.

You and Eric D are the two people in the Den carrying that ability. It has been doing half its job for as long as you have had it.

—

Both of these were reported clearly, more than once, and one of them was argued with. That is on me and the gold is paid at the full rate for both.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%I owe him a correction rather than an answer%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
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
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
