// One Arbiter post to the BUGS channel, plus the two finder's fees it names. Guarded on the opening line AND
// on each payment's own meta, so a second run pays nobody twice. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const GRAY = "0afc1091-38a8-4a03-ac20-15dc86f5b9c4";
const JINXX = "eaf1da90-eefc-4852-af7b-c988430cb77e";

// Each bug is its own 500, to whoever said it FIRST. GrayKitsune raised the gear one at 12:48 on the 8th and
// nothing earlier in the history mentions it. The chest one is Jinxx's: her Primordial is the report the fix
// was measured against, and the tier it was actually wrong on.
const FEES = [
    [GRAY, 500, "high-rarity gear arrived carrying a stat worth one point (first reporter, 2026-09-08)"],
    [JINXX, 500, "the rarest chests paid seeds more often than they paid gear (first reporter, 2026-09-07)"],
];

const BODY = `⚖️ Two found, both fixed, both paid — and GrayKitsune, the short answer to your question is no. The long answer is that you found one anyway.

# GrayKitsune — 500 gold

"Is it a bug if an ascendant piece of gear has no secondary effect? I ask considering all my legendary/mythic items do."

The missing affix on its own is not a bug. Roughly half the pieces at every tier carry one of the rarer lines — a riposte, a lifedrink, pierce, a stun, a haste — and that is as true of legendary as it is of ascendant. A piece without one is a plain-stats piece rather than a broken one.

But something WAS wrong with your plate, and it was not the thing you named.

Exalted Plate is written as Ferocity 36 and Might 19. It was reaching you carrying a line that said Crit Chance 1.

To keep two pieces of the same rarity from being the same piece, the Den shuffles a point or two between an item's stats. When it moved a point into a stat the piece did not already have, it opened a brand new line worth exactly that — one point. Under four real numbers, on the second-rarest tier in the game. That is precisely what "no special ability" looks like from the outside, and you were reading it correctly.

180 pieces across the Den were carrying one of those. Above mythic there are now none. Your plate reads four honest numbers and the point went back where it came from.

# ValkyrieSylve

Your Undying Veil was the same fault wearing a different hat — it was carrying Fortune 1. It carries Fortune 12 now.

No fee on this one, because GrayKitsune said it first by about half a day. It is a confirmed report all the same, and the pair of you between you is what made it findable.

# Sunflower Jinxx — 500 gold

"Primordial chest has blessed me with 2 corn seeds, 2 pumpkin seeds, and a golden apple seed."

That was not bad luck. Seeds are a supply — the thing a chest you open ten of should be handing you — and the chance of them had been allowed to climb with the tier instead of falling. On the rarest chest in the game they had climbed past the gear.

Above eternal a chest cannot pay a seed at all now, and ascendant and eternal draw from a better table than they were. That went in this morning, a little after you posted.

# Still open, and not forgotten

The lower dungeon floors still pay better than the boss standing at the end of them.

The opener on arena rungs in the thirties and the nineties still kills before you get a move. ValkyrieSylve and Eric D both raised it, and speccing into speed is not an answer to it.

Keep them coming.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.length} x 500 = ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run — pass --apply to post and pay"); process.exit(0); }

const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%the short answer to your question is no%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }

for (const [id, amount, what] of FEES) {
    const already = await sql`SELECT 1 FROM mkt_coin_event WHERE buyer_id = ${id}::uuid
        AND reason = 'bug_bounty' AND meta->>'what' = ${what} LIMIT 1`;
    if (already.length) { console.log("  already paid:", what.slice(0, 50)); continue; }
    // No transaction — this driver speaks HTTP. The balance is read back off the update that set it.
    const r = await sql`UPDATE mkt_buyer SET gold = gold + ${amount} WHERE id = ${id}::uuid RETURNING gold, display_name`;
    await sql`INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, meta)
              VALUES (${id}::uuid, ${amount}, ${r[0].gold}, 'bug_bounty', ${JSON.stringify({ what })}::jsonb)`;
    console.log(`  paid ${amount} to ${r[0].display_name} -> ${r[0].gold}`);
}

await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
console.log("\nposted to the bugs channel.");
