import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";

// ── WHO IS PAID, AND FOR WHICH DEFECT ────────────────────────────────────────────────────────────────
// Three separate faults, and the split does not depend on guessing an order. GrayKitsune reported the
// gun cap and nobody else did; Sunflower Jinxx reported the missing target map and the currency
// wording and nobody else did either. One payment per DEFECT, to the first person who named it.
//
// ⚠️ ONE THING FOR LUKE: GrayKitsune raised the sea battle on Discord, which is not in this database,
// so his message cannot be ordered against Sunflower Jinxx's 05:25 in the bugs channel. If his came
// first he is owed a second 500 for the target map as well. Added, never taken back — see the mine
// double-tap precedent.
const FEES = [
    ["0afc1091-38a8-4a03-ac20-15dc86f5b9c4", 500, "fleet guns past the ninth could not be targeted"],
    ["eaf1da90-eefc-4852-af7b-c988430cb77e", 500, "new fleet hulls had no targetable hull or sails"],
    ["eaf1da90-eefc-4852-af7b-c988430cb77e", 500, "casino wins reported in chips, token purse never sent"],
];

const BODY = `⚖️ Three found between the new ships and the casino floor. All three fixed, all three paid.

${B}1787231004681-977654.webp
# GrayKitsune — 500 gold
**"It reads that ship has ten cannons and I can only target and take out eight."** You counted right. The ships past the old flagship carry far more guns than anything before them — the thing at the bottom of the ladder has twenty-two — and the deck they were being drawn on only had room for nine. Every barrel past the ninth still fired at you every round, and there was no way to shoot back at it.

They are drawn in tiers now, the way a ship of the line actually carries them: eight to a deck, stacked down her side. The number you can count is the number she has.

Two more things about the battery turned out to be wrong on the way to that, and are fixed with it. Her outermost guns were being drawn off the end of the ship and out over open water, because the spread was measured against the picture instead of against the hull. And any hull whose guns had been positioned by hand quietly lost whatever was left of its battery.

${B}1788760849195-584304.webp
# Sunflower Jinxx — 1,000 gold
**"All its guns are gone. No hull or canvas to select. What do I do?"** Nothing — that was the honest answer, and it is the same fault seen from the other end.

All twenty-five of the new ships went out without the map that says which part of her is timber and which is canvas. Her sails and her hull were never targets at all. So once you had taken her last gun there was genuinely nothing left on the board to aim at, and the only thing that could still reach her timber was a Reckoning, which picks its own mark and never asks you. Every ship in the fleet has that map now — sails, hull and every gun, on all forty.

**And the floor was naming the wrong currency at you.** You were right that a bingo win read as chips. Bingo and the blackjack table were both handing the screen your token count and labelling it chips, and neither was sending your token purse at all — which is exactly why it looked correct only after a reload. Ten more readouts across the floor still had the word "chips" printed under a win, the paytable among them, and that one managed to name two different currencies and get both of them wrong.

Chips are what a machine takes. Tokens are what it pays. Every screen says so now.

Nothing was ever actually paid in the wrong thing — the books are clean and every win since the split has been tokens. It was only ever the telling.

ValkyrieSylve raised the same on keno and the vault, and Eric D worked out that a reload showed the truth, which is the observation that made it findable. On the record.

—

GrayKitsune, on seafaring, asked three times now and owed a straight answer: that is a ceiling, not a fault. Dig stamina is whole extra holes rather than a percentage, so your whole menagerie together is worth four more digs a trip and then stops. The cap is written into the perk's own wording. Collecting further seafaring pets past that point does nothing for stamina — and you are right that it does not look like it should.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.length} = ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run — pass --apply to post and pay"); process.exit(0); }

const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Three found between the new ships%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
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
