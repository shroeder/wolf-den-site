import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";
const GRAY = "0afc1091-38a8-4a03-ac20-15dc86f5b9c4";

// Four defects, four root causes, one reporter -- nobody else raised any of them. One payment per DEFECT,
// which is the same rule that paid SoullessShiitake 1,000 for two faults under a single complaint.
const FEES = [
    [GRAY, 500, "final act drawn on a fifteen-row sheet, boss off screen"],
    [GRAY, 500, "two edges drawn out of the room before the boss"],
    [GRAY, 500, "card pool gated on grants, not on level-unlocked pets"],
    [GRAY, 500, "foe intent silent on strengthDown, intangible and junk"],
];

const BODY = `⚖️ Four more out of this room, all yours, all fixed.

${B}1787231004681-977654.webp
# GrayKitsune — 2,000 gold

**"I'm stuck, theres nothing left for me to do and it didn't end the run."** You were not stuck. The boss was straight above your head, off the top of the screen.

The last act is a short corridor on purpose — a fire, a shelf, the pair at the door, and the thing behind it — but the sheet it was being drawn on was still cut for a full fifteen-room act. Your four rooms were squashed into the bottom sixth of it, the boss was pinned to the very top twelve empty rows up, and the view opens on the row you are standing in. There was nothing to tap because the only thing left to tap was off the page. The sheet is as tall as the act is now.

**"The area before suggested not facing the boss but then forced it anyway."** Same screen, different fault, and you read it exactly right. Two separate lines were being drawn out of that room: one by the part that draws every route on the map, one by the part that knows where the boss disc actually sits. Those two agree on a centred sheet and disagree on one that has been slid across to sit straight — and yours was slid, so one of the two lines was pointing at open air. There has only ever been one way out of that room. Now only one line says so.

**"There seems to be a few others I own that its asking me to obtain, like Fawn."** This one was worth a great deal more than the fawn.

The game was holding two different ideas of what owning a pet means: the record of pets you were HANDED, and the fuller truth that plenty of them are yours because of your account level and were never handed to you at all. Your card portraits were drawn from one of those and your card POOL was gated on the other. That is how Chick could turn up at level five while Fawn was told you had never met it.

Seventeen pets were being kept off your reward screens — your bunny, frog, chick, kitten, fox kit and wolf pup, and your owl, bear cub, raven, serpent, fawn, bat, tiger cub, seahorse, eagle, lion cub and gorilla. Eighteen cards. And it was happening to every one of you: between thirteen and nineteen pets each, for all four people who have been in this room.

**"Frail doesn't say anything about lowering my strength by 1."** It does not, and it never has — Frail makes the Block you gain smaller, and its own note says so if you tap it. But you were right that something took a Strength off you.

Siphon Soul takes a Strength AND lays two Frail. The creature's intent drew only the Frail and said only the Frail, so the missing Strength had nothing to blame but the one mark you could see. It has its own mark now and the note says it out loud — and worth knowing: a stolen Strength is gone for the rest of the fight, where Weak and Frail wear off.

Two more moves were being just as quiet. A creature about to turn Intangible showed an empty intent, which is the worst turn in the game to spend your biggest attack on. And anything shuffling junk into your deck was described to you as "Wait, and watch you."

—

On the Strength stack: your instinct was close, but not for the reason you guessed. A level five pet does **not** hit harder. A level one Bear and a level five Bear deal exactly the same damage, deliberately — the day a card's numbers depend on how long you have owned the animal is the day no fight can be balanced and no run can be handed to anybody else.

What levelling a pet buys is that its card turns up MORE OFTEN, and at the top it turns up already sharpened. So three sharpened Strength cards and a Rally is a real engine, and you built it properly rather than finding a hole. Whether that engine is too strong for act three is a fair question and a different kind of question — it is written down, not answered tonight.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.length} = ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run — pass --apply to post and pay"); process.exit(0); }

const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Four more out of this room%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }

for (const [id, amount, what] of FEES) {
    const already = await sql`SELECT 1 FROM mkt_coin_event WHERE buyer_id = ${id}::uuid
        AND reason = 'bug_bounty' AND meta->>'what' = ${what} LIMIT 1`;
    if (already.length) { console.log("  already paid:", what.slice(0, 50)); continue; }
    const r = await sql`UPDATE mkt_buyer SET gold = gold + ${amount} WHERE id = ${id}::uuid RETURNING gold, display_name`;
    await sql`INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, meta)
              VALUES (${id}::uuid, ${amount}, ${r[0].gold}, 'bug_bounty', ${JSON.stringify({ what })}::jsonb)`;
    console.log(`  paid ${amount} to ${r[0].display_name} -> ${r[0].gold}`);
}

await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'testing')`;
console.log("\nposted to the testing channel.");
