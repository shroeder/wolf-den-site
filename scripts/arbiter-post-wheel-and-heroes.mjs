// ⚠️ TOUCHES THE LIVE DATABASE. Dry run by default; `--pay` moves gold, `--post` writes to the bugs channel.
// They are SEPARATE flags on purpose -- Eric cleared the payouts and asked for the post to be drafted only, so
// the two halves of what every previous arbiter-post script did in one go have to be runnable apart.
//
// Same shape as scripts/arbiter-post-the-backlog.mjs: idempotency guard per payout on meta->>'what', a dupe
// guard on the post body, and the body printed to stdout first so it can be read before anything lands.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const PAY = process.argv.includes("--pay");
const POST = process.argv.includes("--post");
const url = readFileSync("C:/Users/Luke/Projects/wolf-den-eric/.env.local", "utf8")
    .match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, "");
const sql = neon(url);

const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";

const who = await sql`SELECT id, display_name, avatar_sprite_url FROM mkt_buyer
  WHERE display_name IN ('Sunflower Jinxx','Anamarisa','Mama G','ValkyrieSylve','Kaishiern','Sphinx',
                         'SoullessShiitake','GrayKitsune','Eric D')`;
const M = Object.fromEntries(who.map((r) => [r.display_name, r]));
const art = (n) => M[n]?.avatar_sprite_url || `${B}placeholder.webp`;

// ── WHAT IS PAID, AND WHAT IS ONLY ANSWERED ──────────────────────────────────────────────────────────────────
// 500 a head is the rate the last batch set. Jinxx's two messages are ONE defect -- the recipe wedge and the
// decoration wedge were both the missing logCoin and one helper fixed both -- so she is paid once, not twice.
//
// ⚠️ Anamarisa and Mama G are REQUESTS, not faults, and the convention is that a request is written down
// rather than bountied (see arbiter-post-the-backlog.mjs: "Fair, and written down as a request rather than a
// fault"). Eric cleared paying them anyway because the thing they asked for shipped the same day. Drop these
// two lines to go back to the precedent.
const FEES = [
    [M["Sunflower Jinxx"]?.id, 500, "wheel consolation gold paid with no coin event behind it"],
    [M["Anamarisa"]?.id, 500, "asked for deletable hero drawings, which shipped"],
    [M["Mama G"]?.id, 500, "seconded deletable hero drawings with the gear-clash case"],
];

const BODY = `⚖️ **Two fixed, and the rest of the list with a straight answer on each.** The wheel one is mine twice over: it was paying you and keeping no record that it had, which is the same as not paying you. Everything raised since the 31st is below, including the ones I have not got to yet.

${art("Sunflower Jinxx")}
# Sunflower Jinxx — 500 gold

**"I have every recipe, I just got that sliver on the wheel and it just said I got a new one."** And then the farm decor: **"Just says i got one but I have all of them. I've wasted a few wheel spins now."**

You were right both times, and you own every one of them — all 118 recipes and all 18 decorations the wheel can give out. So both of those wedges were landing on their "you already have them all" branch, which pays gold instead.

It did pay you. It just did it with a bare write to your balance and no ledger entry beside it — no line in your gold history, nothing in the coin report, nothing anywhere you could have checked. A few hundred gold arriving silently in a balance your size, under a card still showing the wedge's name, is indistinguishable from being handed nothing. You reported it twice because there was no way to tell the difference. That is a reporting failure, not a payment one, and it is fixed: both wedges now pay through the same path as every other coin the wheel hands over, and it shows up where you would look for it.

The amounts themselves are untouched and deliberately so — 300 for the book, 400 for the farm.

${art("Anamarisa")}
# Anamarisa — 500 gold

**"Can we get the ability to remove old avatar drawings in the 'my gear' page?"**

Built. There is an ✕ on each hero on your shelf now, and it asks before it does anything.

Two things it will not do. It will not let you delete your last one — with no hero at all the game draws you a fresh one automatically, so emptying the shelf would be a redraw you did not ask for. And deleting the one you are **wearing** is fine: it puts you back in the one you had before rather than refusing, because the hero somebody wants gone is usually the one that just landed on them.

${art("Mama G")}
# Mama G — 500 gold

**"I have had a couple renderings that are glitched that I would get rid of. Some poses don't work with my gear."**

Same fix, and your reason is the one that settled how it behaves — the glitched ones are exactly what it is for.

The **shouldered hammer** is a separate thing and I have not fixed it. A pose has to say where your weapon and shield went or the gear rule overrules it silently, and a hammer is the shape most likely to come out wrong. I need to look at the pose text itself rather than guess.

## Still open, and what each one needs

**The town is wrong since Hallowe'en ended** — Eric and ValkyrieSylve both. Buildings squashed together, NPCs in the wrong places. I think this and Jinxx's **unspendable Hallowe'en gacha tokens** are the same event teardown not finishing cleanly. Looking at that next; it is the biggest one on the list.

**ValkyrieSylve, the casino:** three shooting starfish on The Deep twice with no free spins, and separately no option to spin again after the first machine. The second one you said happens almost every day, which makes it the more serious of the two.

**Anamarisa and Sphinx, the counter quest** — "spend at the counter" stuck just short with plenty spent. Not reproduced yet.

**Anamarisa, the Forge daily** — 4 perfect strikes claimed and 250 gold did not arrive. Still open.

**Kaishiern** — unearned pet sprites missing or cut off. **Sphinx** — the tavern not showing at all. **SoullessShiitake** — your own message invisible when you send it from the town screen instead of the chat panel.

**GrayKitsune, on +fortune from a weapon enhance:** it is rollable. Eric has had it come up. Nothing is broken there.

**GrayKitsune, the chest corner in testing** — the perk says a corner should be shown and none is. Still on the list.

None of the open ones are forgotten and none of them are closed. Bounties go out when each is actually fixed, not now.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
console.log(`\npayouts: ${FEES.filter((f) => f[0]).length} of ${FEES.length} resolved to a member id`);
for (const [id, amount, what] of FEES) console.log(`  ${amount}  ${id ? "" : "UNRESOLVED "}${what}`);

if (!PAY && !POST) { console.log("\ndry run — pass --pay to move gold, --post to write the message"); process.exit(0); }

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
       AND body LIKE '%Two fixed, and the rest of the list%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
    if (dupe.length) { console.log("already posted."); process.exit(0); }
    await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'bugs')`;
    console.log("\nposted to the bugs channel.");
}
