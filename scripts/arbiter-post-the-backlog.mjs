import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";
const VALK = "7aaeff8b-821c-4ba2-a467-f5509e94c45a";
const SOUL = "cf1a4ec2-0000-0000-0000-000000000000"; // resolved below

// Two of the seven were real. The other five are answered rather than paid, and each one says WHY.
const BODY = `⚖️ The list from the seventh. Seven things were raised that day and nobody came back to any of them — that is on me. Two were real, five have answers, and all seven are below.

${B}1786775465559-327040.webp
# ValkyrieSylve — 500 gold

**"If level 10 shoring still does nothing, can I please have my gold back? 5k for no effect isn't fair."**

You were right, and it was worse than the one level. Shoring pushed the roof one step for every THIRD level — so levels 1, 2, 4, 5, 7, 8 and 10 changed no number in the game at all. Seven of the ten.

The cadence itself was never hidden: the card says "still 5 safe" and the track says "every third level". But level 10 is different from the others, and this is the part that was genuinely wrong — it is the LAST rung. There is no eleventh level for it to be a step toward, so it was a purchase that could never do anything, ever. Four of you own it.

Every level moves the roof by a third of a step now, so every one of them does something. Levels 3, 6 and 9 still land on the whole steps the description promises. On your build, a step down to depth 6 was rolling about 4.9% and now rolls about 3.3%.

Which is also the answer to **the step-6 cave-ins you said felt too frequent** — same day, same cause. They were more frequent than they should have been, and they are not any more.

**Your Power Band.** This one I could not reproduce and I looked properly. Your Power Band is sitting at +6 with a real bonus on it — might, ferocity, vitality, lifesteal, crit power and crit chance — and there is not a single enhanced item anywhere in the Den carrying an empty bonus. If a strike came back and the number did not move, tell me the item and roughly when, and I will pull that attempt apart.

**And the Completionist badge.** Not broken, and I owe you a straighter answer than "it should have triggered". It is not the Pathfinder. It is seven separate one-time steps and you have four of them. The three you are missing are: buy something from the shop, link your Discord, and finish your profile. Nobody could have worked that out from the badge, which said only yes or no.

${B}1787623237423-972879.webp
# SoullessShiitake — 500 gold

**"I clicked something that made my gold merchant disappear and skipped straight to the digs. But it still used my treasure map."**

Real, and already fixed — on the 8th, the day after you reported it. You lost a Treasure Map to a race: the roll that decides whether the merchant appears and the flag that guarantees he does were two separate writes, so a map applied in the gap between them was spent by a roll that had already decided against him. GrayKitsune hit the same thing in August. Both are closed now, and the map only leaves your pack when a merchant actually arrives.

You should have been told that a fortnight ago instead of finding out here.

**The Delver's Kit capstone.** Working, and it is not the one you were expecting. Delver's capstone is **Second Wind** — the first collapse of each day leaves your haul intact. It is insurance against the roof, not a better seam. The one that pays a cracked seam twice is the **Rockbreaker's Rig**, and that is a different four pieces.

**Sorting pets by which minigame they help.** Fair, and written down as a request rather than a fault. Not built yet.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const [soul] = await sql`SELECT id FROM mkt_buyer WHERE display_name='SoullessShiitake'`;
const FEES = [
    [VALK, 500, "shoring levels that moved no number, and the dead tenth"],
    [soul.id, 500, "treasure map spent by a merchant roll that lost the race"],
];
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%The list from the seventh%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
for (const [id, amount, what] of FEES) {
    const already = await sql`SELECT 1 FROM mkt_coin_event WHERE buyer_id = ${id}::uuid
        AND reason = 'bug_bounty' AND meta->>'what' = ${what} LIMIT 1`;
    if (already.length) { console.log("  already paid:", what.slice(0, 44)); continue; }
    const r = await sql`UPDATE mkt_buyer SET gold = gold + ${amount} WHERE id = ${id}::uuid RETURNING gold, display_name`;
    await sql`INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, meta)
              VALUES (${id}::uuid, ${amount}, ${r[0].gold}, 'bug_bounty', ${JSON.stringify({ what })}::jsonb)`;
    console.log(`  paid ${amount} to ${r[0].display_name} -> ${r[0].gold}`);
}
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
