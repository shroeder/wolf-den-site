import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";
const VALK = "7aaeff8b-821c-4ba2-a467-f5509e94c45a";
const ERIC = "d68dacf6-10e1-40fe-93c8-9ca6ebdbb87e";
const GRAY = "0afc1091-38a8-4a03-ac20-15dc86f5b9c4";

// Four of these are fixed and live. The fifth -- the stones paying the same number at two different
// rarities -- is confirmed real and measured, and is NOT fixed, because changing it moves numbers people
// have already spent 4,000 doubloons choosing between. It is paid anyway; finding it is the job.
const FEES = [
    [ERIC, 500, "ghostly armour intangible never expired"],
    [GRAY, 500, "death screen undercounted act four"],
    [VALK, 500, "friends search buried under the friends list"],
    [VALK, 500, "consumable shelf reflowed under the thumb"],
    [VALK, 500, "dolphin lightstone sprite had legs"],
    [VALK, 500, "enshrine stones pay the same at two rarities"],
];

const BODY = `⚖️ Five found, four fixed, one I am not fixing yet and will say why. All six payments are out.

${B}1788960649709-188115.webp
# Eric D — 500 gold

**Ghostly Armour never wore off.**

You read the card and noticed it did not match: "I've yet to see it disappear during a fight, and it drops all battle damage to 1."

It did not disappear because nothing was spending it. The creatures lose a turn of Intangible at the top of theirs. Your side ticked poison and Regeneration and simply never touched it — so one energy, on a tier-2 card, cut every hit of the rest of the fight to 1 damage. For the whole fight. Every fight.

That is the single most broken thing in the game as it stands, and it has been quietly answering the act 4 boss this room has spent two days calling too hard. Play it now and it covers exactly one enemy attack phase, which is what it always said it did.

${B}1787231004681-977654.webp
# GrayKitsune — 500 gold

**The death screen was short an act.**

"The reward screen when I died to act 4 boss says I only cleared 2 acts not 3."

Three is how many acts you must clear to win, and the Hollow is a fourth you have to bring keys to. The score was clamping your position to three — so standing in the fourth act was recorded as standing in the third, and the arithmetic came out one lower again. Two.

Every room you walked in the Hollow went uncounted as well. And winning IN the Hollow now scores four acts rather than three, which it should have from the start: you gave up three rewards for the keys.

${B}1786775465559-327040.webp
# ValkyrieSylve — 2,000 gold, for four

**Search was under your whole friends list.** You said twice that searching looked broken, then worked out yourself why: "Search results are appearing at the bottom of my entire list of friends." It was the third section on the page, under the requests and under every friend you have. It comes first now while you are typing — and the box filters your friends too, which it had never done despite saying "filter members".

**The shelf moved under your thumb.** Spend your last Harvest Charm and that row leaves, everything below slides up, and the next item's Use button is exactly where your thumb already is. That is how the Growth Tonic went. A tap on a different item within half a second of the shelf changing shape is refused now, once, with a line saying why. Tapping the same item as fast as you like still works.

**The Dolphin's Lightstone had legs.** You said one. It had two, with claws, and it was standing on them. Redrawn — both stones.

**And the Dolphin against the Seahorse.** You are right, and it is worse than the three per cent you measured: with a Darkstone those two pets land on exactly the same number. A rare and an epic, identical.

The reason is a ceiling. Both blow past it, so the rarity stops mattering at the moment the stone is spent. It is not those two pets — I went through all 130, and there are 27 places where two different rarities pay the same figure. A common Penguin and an epic Golden Goose is one of them.

I am not changing it tonight. Those numbers are what people read before spending 4,000 doubloons on a stone they cannot take back, and I am not moving them on my own. It is measured, it is written down, and it is the next thing on this pile.

—

${B}1787623237423-972879.webp
**SoullessShiitake** — not a bug, so no bounty, but you were right and it is done: "it isn't very obvious when you don't have anything left to do on your turn." End turn breathes now when nothing in your hand can be played. First run in the room and you found the thing a new player trips on.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]  fees: ${FEES.reduce((n, f) => n + f[1], 0)} gold`);
if (!APPLY) { console.log("\ndry run"); process.exit(0); }
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Ghostly Armour never wore off%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
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
