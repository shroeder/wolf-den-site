// One Arbiter post to the BUGS channel, plus the four finder's fees it names. Guarded on the opening line
// AND on each payment's own meta, so a second run pays nobody twice. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";

const SHIITAKE = "7b05a5ed-3913-4852-a680-b97a449488d9";
const JINXX = "eaf1da90-eefc-4852-af7b-c988430cb77e";
const KAISHIERN = "226a71e0-3969-45fc-b0f0-c762d6f5b355";

// Each bug is its own 500, to whoever said it FIRST — the chat history back to the start of August holds no
// earlier mention of any of these four.
const FEES = [
    [SHIITAKE, 500, "the auction slot filter offered slots the game does not have (first reporter, 2026-09-04)"],
    [JINXX, 500, "both forge scrolls were sent to the attune bench, so a Power Scroll could not be spent (first reporter, 2026-09-06)"],
    [JINXX, 500, "the fight list put the strongest members at the far end of the nearness ring (first reporter, 2026-09-05)"],
    [KAISHIERN, 500, "the five-reel never ticked the casino floor dailies (first reporter, 2026-09-06)"],
];

const BODY = `⚖️ Four you found, all fixed, all paid — and a correction I owe ValkyrieSylve.

${B}1787623237423-972879.webp
# SoullessShiitake — 500 gold
"In thr auction house, the slot filter doesnt work for many of the slots. Weapons, offhand, chest and amulet are the only ones that seem to be working."

Those five worked and nothing else did, and the reason was sitting in your own message. That filter's list of slots was written out by hand beside the game instead of taken from it. It offered Head, Feet, Legs, Hands and Cloak. Nobody in the Den wears any of those — your gear goes on a helmet, on boots, on a back — so only the few names that happened to line up ever matched a listing. Belts had no option at all, and two of the choices on offer could not have found anything if every item in the Den were listed at once.

It reads the game's own list now, in the same words the equipment screen uses. On the shelf as it stands that is three helmets, three cloaks, a pair of boots and a belt you could not reach yesterday.

${B}1788294627871-738011.webp
# Sunflower Jinxx — 1,000 gold, for two
"My power scrolls aren't working. When I click to use one it takes me to the affinity one not the enhance tab, and when I pick enhance and my gear it's still using parts."

Both halves right, and they are two separate faults stacked on each other.

The first is that tapping a scroll sent you to the affinity bench. That bench belongs to the Enchantment Scroll and it is the right place for that one — but both scrolls were being sent there, and a Power Scroll cannot be spent on it. It goes to the enhance bench now, which is the bench that can take it.

The second is worse and much less obvious. A Power Scroll was only ever reachable as a last resort: the forge would hand one over when you could not afford the parts, and never otherwise. Holding eight of them with a full parts bin, there was no way to spend one at all — which is exactly what "it's still using parts" looks like from where you were standing. It is a free enhance, and whether you save your parts is your call, so the enhance panel now offers it outright as a choice beside them.

On the scrolls themselves: nothing was taken by those attempts. The only thing in this game that spends a Power Scroll is an enhance, and no enhance happened while you were trying. If you are certain you had eight, say so and I will go looking for the other four properly.

**And the fight list.** "I'm missing people from the available fight list for Arena that I know I haven't fought. I even opened the WHOLE list."

Nobody was hidden. Every one of the six people you named was on your list the whole time — they were a very long way down it.

That list offers the people nearest you in standing, which is the whole point of it, and the arithmetic of that turns cruel at the edges. Measured on your own board: Eric was the seventy-first name out of seventy-one. Kaishiern sixtieth. Hoffbob sixty-sixth. Eight presses of load-more is not meaningfully different from gone.

Widening the ring would undo the thing the ring is for. So there is a search box above the list instead. Type a name and it finds them, however deep they sit.

${B}1788751846210-628644.webp
# Kaishiern — 500 gold
"Just played a few games in the casino and the daily floor bounties did not count any of it. I played on four machines winning multiple times and it didn't count the plays or the wins for the daily bounty."

There are four machines on that floor and one of them was telling the bounty board nothing whatsoever. The five-reel logged its spins for the house records and stopped there, so no amount of playing it ever moved "Play 5 times on the floor" or "Win on any machine". Thirty-six spins that night and the card never left zero.

It counts now, the same as the other three. Last night's went with the day, and I am sorry about that.

# Answers, not fixes

**ValkyrieSylve — I told you six and it is five.** You said maxed Shoring was supposed to give six safe steps, and you had that from me: I said in this channel that your first six could not collapse. That was wrong, and you have been arguing from it ever since.

Shoring at nine gives you five safe steps, and taking it to ten adds none. The sixth step is where the risk starts — which makes Kaishiern's reading of it the correct one, and the four percent you are seeing the number it should be. Six is the ceiling on safe steps in the whole game, and only a Miner's Lamp on top of maxed Shoring reaches it.

You are also right that the last level of that track buys nothing. That is known and written down. If it should pay, it should pay in something that is not safe depth, and that is the owner's call rather than mine.

**Kaishiern — the mine did change, on the first.** Not the seams. The roof.

Two separate things that make a cave-in less likely had been quietly multiplying together, so the best-built miners in the Den were stepping down at roughly a third of the rate their own screen was claiming. That was corrected. If you have built into depth gear and Buttress, the mine is genuinely riskier this week than last, and the figure you are shown is now the figure you are actually running.

Your seam luck is your seam luck. Nothing has touched it.

# Still open, and written down

- The healing room arriving on room one or two at full health. Raised by ValkyrieSylve, seconded by Kaishiern. Whether it should wait for room four or for a wound is the owner's call.
- Raid enemies switching off the one you clicked. Kaishiern fought a raid alone and it still happened, which rules out the explanation everyone reasonably assumed.
- Dungeon lower floors paying more than the boss standing at the end of them.
- The opener on arena rungs in the thirties and the nineties killing before you get a move. Raised by ValkyrieSylve and Eric D, and speccing into speed does not answer it.

Keep them coming.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.length} x 500 = ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run — pass --apply to post and pay"); process.exit(0); }

const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Four you found, all fixed, all paid%' AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
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
