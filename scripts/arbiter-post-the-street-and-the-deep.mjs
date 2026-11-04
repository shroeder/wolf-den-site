// ⚠️ TOUCHES THE LIVE DATABASE. Dry run by default. `--pay` moves gold, `--post` writes to the bugs channel.
//
// DRAFTED, NOT SENT, and the payout is deliberately held with it: Eric asked for the post to be reviewed
// before it goes out, and paying ValkyrieSylve now would hand her 1,000 gold with no explanation attached
// for however long the draft sits. `--pay --post` together is one command and lands both at once.
//
// ⚠️ THE HERO SHELF IS NOT IN THIS POST, ON PURPOSE. Eric: "Don't include the payouts for the sprite idea.
// We're just gonna keep that one under the hood for right now." Anamarisa's and Mama G's bounties for it
// were already paid in the previous batch and are not mentioned here. See the flag in the handover: the
// feature itself is already live on the equipment screen, and `meta` rides back to the member in their own
// gold history, so this silence is "we are not announcing it" rather than "nobody can find it".
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const PAY = process.argv.includes("--pay");
const POST = process.argv.includes("--post");
const url = readFileSync("C:/Users/Luke/Projects/wolf-den-eric/.env.local", "utf8")
    .match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const sql = neon(url);

const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const who = await sql`SELECT id, display_name, avatar_sprite_url FROM mkt_buyer
  WHERE display_name IN ('ValkyrieSylve','Sunflower Jinxx','Eric D','Anamarisa','Sphinx','Kaishiern',
                         'SoullessShiitake','GrayKitsune','Mama G','jeffkasper19')`;
const M = Object.fromEntries(who.map((r) => [r.display_name, r]));
const art = (n) => M[n]?.avatar_sprite_url || "";

// ── 500 A HEAD PER REAL DEFECT, WHICH IS THE RATE THE LAST BATCH SET ─────────────────────────────────────────
// ValkyrieSylve gets 1,000 because she found TWO unrelated faults — the street and the paytable — and the
// precedent is per defect, not per member: the backlog batch merged her shoring levels and her cave-ins into
// one payment because they were "same day, same cause", and paid nothing for the two that turned out to be
// working. These two share nothing but the reporter.
//
// Jinxx was paid in the previous batch and is NOT paid again here; the post says so rather than going quiet.
// Eric D reported the street too and is not on this list — staff, and his call anyway.
const FEES = [
    [M["ValkyrieSylve"]?.id, 500, "the street laid out against a width the client did not share"],
    [M["ValkyrieSylve"]?.id, 500, "The Deep's paytable promising free spins from three scattered starfish"],
];

const BODY = `⚖️ **The street is fixed, The Deep's paytable was lying to you, and the wheel owes a few of you an apology.** Three real faults, one of them mine twice over. Everything else raised since the 31st is at the bottom with a straight answer on it.

${art("ValkyrieSylve")}
# ValkyrieSylve — 1,000 gold

**"Town is all sorts of messed up, buildings and NPCs are not in the correct places it would appear."**

Right, and it was not the Hallowe'en event — which is what Eric and I both assumed, because the timing fitted perfectly. It was arithmetic.

Everything standing on that street is placed as a percentage of how wide the street is. The server works out that width from everything out there: the buildings, the Blacksmith, the Merchant, the Auctioneer, the Crier, the Quest Giver, the Stockade and the well — twenty-one things. The page was working it out from the buildings and the well alone, fourteen, using a spacing rule the server stopped using some time ago. So the server was placing people along 6,532 pixels of street and the page was drawing that same street 4,518 pixels wide.

Which means every gap came out at about seven-tenths of what it should be. The designed spacing is 284 pixels and you were seeing 196, while a building is up to 244 wide. They were not squashed together in your imagination. They were overlapping.

The width is sent with the positions now, so there is only one answer to how wide the street is.

**"I hit 3 shooting starfish on 2 separate occasions and the free spins did not trigger the way it says in the layout section."**

Also right, and this one is worse, because you did exactly what the screen told you to.

The paytable said the Starfish "pays from **anywhere**" and then, in the same sentence, "three of them open the free spins". The first half is true. The second half is not true on The Deep — that cabinet wants three starfish **on a payline**, running from reel one. Three scattered across the glass pay you the scatter, which is one times your bet, which is why it felt like nothing happened at all.

The machine itself always knew. So did the reel tease, which walks the paylines on purpose so it can never hold a reel for something that cannot land. The paytable was the last screen still describing every cabinet as if the bonus came from anywhere, and it is the one screen you are entitled to read literally. It now says what The Deep actually wants.

Twice, on a cabinet that goes quiet for twenty spins at a time. Both are paid.

${art("Sunflower Jinxx")}
# Sunflower Jinxx — paid already

**The recipe sliver and the farm decoration wedge**, both telling you that you had won something when you own all 118 recipes and all 18 decorations the wheel can give.

Fixed, and your 500 went out with the last batch — this is here so the list is complete rather than to pay you twice. Both wedges were landing on their "you already have them all" branch, which pays gold instead. It did pay you. It did it with no entry in your gold history, nothing in any report, nothing you could have checked — which is why you had to report it twice to be believed. Both now record the payment where you would look for it.

## Still open, and what each one is waiting on

**The Hallowe'en tickets and candy.** Jinxx: "I still have Halloween tokens for the gatcha that I can't spend now." True, and it is not just her and not just tickets — 45 tickets across fifteen of you, and a lot of candy besides. The machine and the Gourdfather's stall both closed with the event, so both currencies are sitting in pockets with no door. **This one is Luke's call, not mine** — reopen the stall to spend down, convert it, or hold it until next year — and I am not going to decide what your candy is worth on my own. It is in front of him now.

**ValkyrieSylve, no option to spin again after the first machine** — "this has happened almost everyday". Not fixed, and the one I am most unhappy about leaving. I have a suspect: the SPIN button is held while the machine is "in the middle of something", and if any phase ever fails to say it has finished, it stays held forever. That matches "the first machine, then nothing" exactly. I need to catch it happening rather than guess, so if you can tell me which cabinet and roughly when, that closes it.

**Anamarisa and Sphinx, the counter quest** — "spend at the counter" stuck just short with plenty spent. Not reproduced.

**Anamarisa, the Forge daily** — four perfect strikes claimed, 250 gold never arrived. Still open.

**Kaishiern** — unearned pet sprites missing or cut off. **Sphinx** — the Tavern not showing at all; the towns were rebuilt this week and I want to check it against the new street before I answer. **SoullessShiitake** — your own message invisible when you send it from the town screen instead of the chat panel. **Mama G** — the shouldered pose breaking your hammer; a pose has to say where your weapon went or the gear rule silently overrules it, and a hammer is the shape most likely to come out wrong. **GrayKitsune** — the chest corner the perk promises and does not draw. **Jinxx** — filling the bar for 4k, and the 28k you spent trying to film it.

**GrayKitsune, on rolling +fortune from a weapon enhance:** it is rollable, Eric has had it come up, nothing is broken.

None of these are closed and none are forgotten. A bounty goes out when the thing is actually fixed.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
for (const [id, amount, what] of FEES) console.log(`  ${amount}  ${id ? "" : "UNRESOLVED "}${what}`);
const missingArt = ["ValkyrieSylve", "Sunflower Jinxx"].filter((n) => !art(n));
if (missingArt.length) console.log("⚠️ no hero sprite for:", missingArt.join(", "));

if (!PAY && !POST) { console.log("\ndry run — pass --pay --post to pay and announce together"); process.exit(0); }

if (PAY) {
    for (const [id, amount, what] of FEES) {
        if (!id) { console.log("  skipped, no member id:", what.slice(0, 50)); continue; }
        const already = await sql`SELECT 1 FROM mkt_coin_event WHERE buyer_id = ${id}::uuid
            AND reason = 'bug_bounty' AND meta->>'what' = ${what} LIMIT 1`;
        if (already.length) { console.log("  already paid:", what.slice(0, 50)); continue; }
        const r = await sql`UPDATE mkt_buyer SET gold = gold + ${amount} WHERE id = ${id}::uuid
            RETURNING gold, display_name`;
        await sql`INSERT INTO mkt_coin_event (buyer_id, delta, balance_after, reason, meta)
                  VALUES (${id}::uuid, ${amount}, ${r[0].gold}, 'bug_bounty', ${JSON.stringify({ what })}::jsonb)`;
        console.log(`  paid ${amount} to ${r[0].display_name} -> ${r[0].gold}`);
    }
}

if (POST) {
    const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
       AND body LIKE '%The street is fixed, The Deep%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
    if (dupe.length) { console.log("already posted."); process.exit(0); }
    await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
    console.log("\nposted to the bugs channel.");
}
