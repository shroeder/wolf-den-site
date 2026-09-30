import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";
const GRAY = "0afc1091-38a8-4a03-ac20-15dc86f5b9c4";

const BODY = `⚖️ Two from GrayKitsune, and the second one had been quietly true for months.

${B}1789189247101-37705.webp
# GrayKitsune — 1,000 gold

**The wheel's pick-em was lying to you before you played it.**

"Flip tiles — the first gear you match 3 of is yours to keep." You own all ten Wheelwarden pieces. That sentence was never going to be true for you, and the round then turned around at the end and said every piece was already yours, have a chest. Shown a board of gear and told to keep one, "there is a set here I have not been given" is the only sane reading. You were not confused. It was.

It is not a rare corner either. **Eight of you hold the complete set**, and **44 of the last 100 bonus rounds** paid a duplicate — so for everyone furthest along, the best wedge on the wheel had quietly become a chest with an animation in front of it.

**And what it paid you was worse than the wheel you bought.** The consolation chest was a Gold Chest — the ORDINARY wheel's best. You spin the Golden Wheel, whose own top wedge is a Mythic. Finishing the collection was paying less than an ordinary spin of the wheel you spent twenty thousand chips on. It follows your wheel now.

# So the Golden Wheel has a set of its own

**Fortune's Own.** Ten pieces, epic, and the bonus round boards them instead of the Wheelwarden ones the moment you own the upgraded wheel — whether or not you ever finished the first set.

Aurum Crown · Goldfang Saber · Sunburst Aegis · Gilded Mantle · Midas Pendant · Fortune's Signet · Aurelian Plate · Coinspinner Girdle · Gilded Treads · Jackpot Maul

Three pieces, six and all ten each pay Lucky Spin, and the full set refunds one spin in twelve. Gilded rather than pelt-and-steel, so the two sets sit side by side on a shelf and you can see which is which.

Eight of you start this one tonight, and nobody is ahead.

# And the gem ladder goes all the way now

"I can't combine gems past a certain tier, and the only way to get the ones above it is the wheel." Both true. Fusing stopped at Polished on purpose — the worry was that a Flawless would become arithmetic rather than a find.

Then I counted what is actually in the Den:

**Chipped 215 · Flawed 102 · Polished 60 · Brilliant 21 · Flawless ZERO.**

Nobody has ever held a Flawless. Not one, in the history of the game. Six people own a Brilliant between them and every one of those fell out of a wheel rather than out of anything you could go and do. A ceiling meant to protect the top of the ladder had deleted it, and anyone sitting on a pile of Polished had nowhere to put them.

So it opens, and the PRICE does the work instead:

**Chipped→Flawed 3 · Flawed→Polished 3 · Polished→Brilliant 4 · Brilliant→Flawless 5**

A Flawless is a hundred and eighty Chipped deep. That is a season of picking up everything you walk past, which is what the bottom of that ladder was always for — and if you hold the Steady Bench it is forty-eight, which is the first time that thing has been worth what it costs.

—

**One number went DOWN and you should hear it from me.** Lucky Spin from wheel sets was never capped, and a third wheel set would have taken a full collector to 87% — which is not a lucky spin any more, it is just the spin. It is capped at 60 now. Nobody is at 60 yet; the ceiling is ahead of all of you rather than behind.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply"); process.exit(0); }

const FEES = [[GRAY, 1000, "the wheel pick-em promising gear to a completed set, and its chest being worse than the Golden Wheel's own; plus the gem fuse ceiling"]];
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Fortune%s Own%' AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
for (const [id, amount, what] of FEES) {
    const already = await sql`SELECT 1 FROM mkt_coin_event WHERE buyer_id = ${id}::uuid
        AND reason = 'bug_bounty' AND meta->>'what' = ${what} LIMIT 1`;
    if (already.length) { console.log("  already paid"); continue; }
    const r = await sql`UPDATE mkt_buyer SET gold = gold + ${amount} WHERE id = ${id}::uuid RETURNING gold, display_name`;
    await sql`INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, meta)
              VALUES (${id}::uuid, ${amount}, ${r[0].gold}, 'bug_bounty', ${JSON.stringify({ what })}::jsonb)`;
    console.log(`  paid ${amount} to ${r[0].display_name} -> ${r[0].gold}`);
}
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to #bugs.");
