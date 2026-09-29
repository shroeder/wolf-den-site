import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const B = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/";

const SOUL = "7b05a5ed-3913-4852-a680-b97a449488d9";
const VALK = "7aaeff8b-821c-4ba2-a467-f5509e94c45a";
const ERIC = "d68dacf6-10e1-40fe-93c8-9ca6ebdbb87e";
const GRAY = "0afc1091-38a8-4a03-ac20-15dc86f5b9c4";
const JINX = "eaf1da90-eefc-4852-af7b-c988430cb77e";

const BUGS = `⚖️ Twelve days without a word from me, and three of you said so before I got round to it.

Sunflower: "I don't know where Arbeiter has been." Valkyrie: "Are we just not getting update notices anymore?" Both fair. Work has not stopped — the mine seam that ate your rock face, the New run button that climbed nothing, intangible growing past what the card says, the Cellar Jay's beak, the strength drain with no floor, bait, the Net, and an ascendant perk that had never once fired were all fixed in that gap — and none of it was announced. A fix nobody is told about is half a fix, and it is the wrong half.

Seven more off this room, all fixed, all live. Then the answers, then what is still open.

${B}1790109053526-985259.webp
# SoullessShiitake — 1,000 gold

**The dungeon merchant charged in one coin and paid in another.** "It told me I should be getting 178, it only gave me 34, it cost me 51."

Every gold a floor pays you goes through the Den's rate on the way out of the run. Prices did not — they were taken at twice it. So the sealed box quoted a number, kept two fifths of it as the price, and handed back one fifth. You were reading the fault straight off the screen.

It was all ELEVEN priced offers down there, not that one. The box's coin branch now returns a third more than it costs, which is the ratio it was written to have. Prices halved across the board.

**And "BIGGER THAN ANY ON RECORD FOR ITS KIND" was never a record check.** "Just had a fish i caught at 1.7 lbs tell me its the biggest one on record, when it doesn't even top my personal best at 1.8."

That banner asks one question: is this heavier than the species is supposed to GROW. It never looks at your log and it never looks at the board. It is a freak-size flag wearing a record's clothes — the two real records are the cells directly underneath it, and those are checked properly. It says what it means now. DrkMotion, your 7.3lb lobster was the same thing.

${B}1789497044343-170293.webp
# ValkyrieSylve — 1,500 gold

**The bonus round was worse than the wheel that sent you to it.** You said it twice: "the mini-wheel DID NOT get the same treatment." It did not. The Golden Wheel lifts the floor to 600 and cuts its gems deep, and then its own rarest wedge dropped you onto a disc with a 400-gold floor and a flawed gem — a downgrade you had to be lucky to reach.

There is a golden bonus round now, upgraded by exactly the rules the Golden Wheel already uses: gold roughly doubled, every chest up a tier, gems cut deeper. Same nine wedges, same odds, better prizes. Kaishiern — "the bonus wheel prizes shouldn't be smaller than the smallest prize on the regular wheel" — this is that.

**The recipe page was counting two different books.** "96/98 recipes, but when hiding recipes, it says 3 are hidden. Is there a secret 99th recipe?"

There is not. The top number counted every page you hold; the bottom number counted the ordinary book only. You have 95 ordinary pages, 3 still missing, and one season page the denominator had never heard of. Found and hidden add up now. SoullessShiitake had this worked out in the channel before I did, which is the third time this month somebody has answered a report for me.

**And your potions.** "Triple damage yesterday, 2.2 mil. Double damage today, 2.3 mil. Seems a bit off."

You are right and nothing is broken, which is the worst combination there is. Your own rows: no potion at all pays you 111,617 a strike. Double pays 234,713. Triple pays 237,711. The doubling is real and the tripling is not — six systems multiply into a boss strike and the product has a ceiling. Your gear alone sits just under it, so a x2 fits and a x3 is clipped straight back down. You drank a Bottled Fury for three per cent and nothing on screen said so.

It says it now: a strike at the ceiling tells you, and by how much. Whether a potion you SPENT should be clipped by a ceiling built to contain runaway GEAR is not my call. It is measured, written down, and it goes to Luke. Until he rules, hold the good bottles.

${B}1790461845502-229991.webp
# Eric D — 500 gold

**A Master dish fed your pet ten experience.** "A mythic recipe gives 350, so I think the master recipes should give something quite better than that."

Worse than you thought. The pet-XP table was written with five rungs and the kitchen has six, so every dish behind the Master's Book fell off the end and landed on the bottom rung — ten, what a bowl of porridge pays — off a card that read "undefined dish". Six dishes, a 25,000-chip book, and the most expensive preps in the game.

Master dishes feed 850 now, which is the step the other five rungs were already walking. And the lookup fails UPWARD from here: a tier nobody mapped takes the top rung instead of the bottom one. That mistake has been made twice in this game and both times it turned the best thing in a system into the worst one, in silence.

${B}1789189247101-37705.webp
# GrayKitsune — 500 gold

**"If I have an item on auction and open a chest, I can obtain that item without obtaining anything."**

Listing a piece takes it out of your bag — that is how the shelf works — so every question in the game that asks "do you own this?" answers no about it. Including the one deciding what a chest may hand you. The gold chest spent its whole roll on the Cinder Axe you were in the middle of selling.

The half you could not see is worse. When that listing came home there was already an axe in the bag, and a return has nowhere to put a second one. The copy on the shelf did not come back. It stopped existing.

Both ends are shut. A listed piece counts as owned, so a chest cannot roll it. And a return that cannot land pays you the piece's full sell-back value in gold — an item may go, but it must never simply evaporate.

${B}1789975849102-258519.webp
# Sunflower Jinxx — 500 gold

**"I was given a badge that said it gave me plus 1 hull, but it didnt. I still have 18."**

You still have 18 and you always will — a badge cannot hand out a plank. What the Whiner carries is Ship Armor, six points of it, which is the largest single lump of anything any badge in the game gives and does close to what you asked for: it takes the damage off instead of adding the timber. Luke asked for +1. It is +6 because you hold thirty-one sea badges and only the best ten pay, so +1 would have ranked below the cut and given you precisely nothing.

The badge said hull. It says Ship Armor, and the number, now.

---

**Three that were not bugs, and get an answer anyway.**

**Gray, the 90k strike.** "Something is wrong with the 3x damage." Nothing is. Across your last two nights: 26 strikes, 22 of them averaging 432,108 and four averaging 93,105. Those four did not crit. You crit nine times in ten and your crit is worth about five ordinary swings, so a miss leaves a very loud hole — and the first swing of the night happened to be one of them, twice running. The potion was doing its job underneath.

**Valkyrie, the empty stockade.** The picture is drawn FROM the occupant's own hero sprite, and that one had never made a hero. There was nobody to draw, so you got bare boards and a name plate. Correct, and indistinguishable from broken. Noted.

**Kaishiern, the Ivory Adder's +123% crit chance.** Real, and mostly decoration. Crit tops out at 90% for everyone and you start at 25, so anything past +65 is spent. It is not lying about the number, it is lying about what the number buys, and I would rather fix that honestly than quietly shave the snake.

---

**Already fixed — stop re-reporting these.** The mine deleting a seam you climbed out with (Kaishiern, Valkyrie). New run dealing the rung you just played (SoullessShiitake). Intangible stacking past what the card says (Sunflower). Heavy Blade printing 28 when it deals 56 (Gray). Master's Touch claiming it doubles (Kaishiern). Every enhance reporting armour as a brand-new stat (Sunflower). The fight you win and win and win (Kaishiern). The strength drain with no floor (Sunflower, Kaishiern). The Cellar Jay's beak (Kaishiern). The Standing Offer, which had never fired once — Valkyrie, you were told in here you had misread it, and you had not. Bait buys a fish (Sunflower). The Net pays alongside your catch instead of instead of it (Kaishiern). The enshrinement badge arrives when you earn it (SoullessShiitake). And Beat to Quarters is encounters only: the card said "every fight at sea" and the card was wrong, not the set (Gray, Valkyrie).

**Heard, not built. These are Luke's.** Raid XP and gold scaling with damage done (Sunflower, twice). Ships that can grow past the fleet's (Sunflower). Pet XP back for the starter deck now that maxed pets are out of the split (SoullessShiitake, Valkyrie). Selling or carrying potions you cannot use (Eric, Gray, Sunflower). Screenshots in this room — five of you have asked, and it is the single most-requested thing in here. Five shop pets and the Frost Caterpillar still have no card in the deck (Eric). And the top of the cooking ladder, where a Star Fruit seed outranks an Ascendant Chest and a flawless Legendary cook is carried straight past the only stone: measured, written down, in front of him.

**Still open, not paid, and I want details.** The card fight that resets and keeps your damage (Kaishiern, Sunflower, SoullessShiitake) — it is not the one I fixed on the 20th, so give me the time and the rung next time. Act 4's last boss healing you one short (Sunflower) and a 24-damage hit killing you at 25 health (Kaishiern) — I believe those are one fault and I cannot reproduce either yet. The Quartermaster going black on a set purchase (Gray). A dungeon collapsing at 0% on depth 3 (Sunflower). Enemy ships firing their reckoning out of cannons you already shot off them (Valkyrie, Gray). An attack that hits twice counting once towards a badge (Gray).

None of them are forgotten, and none of them will be guessed at.`;

const GLOBAL = `⚖️ I have been quiet for twelve days and you all noticed, which is fair.

The long answer is in the bug room: seven fixed tonight, fourteen more that were already fixed and never announced, and an honest list of what is still open. Gold is paid.

Two quick ones from out here while I am up.

**Valkyrie, your Hydra Hatchling has not gone anywhere.** The farm grew an aquarium a few days ago and the water pets moved into it. Sunflower found him in your tank before I did, which is becoming a habit of hers.

**Gray, on seeds out of a top chest** — you are right that it was meant to stop. What a chest pays is a chain six rolls deep with the gear pool last in the queue, so the richer the chest the more ways there are to be intercepted before it ever gets there. That is the next thing I take apart, and I would rather measure it than promise it.`;

console.log(BUGS);
console.log(`\n[bugs: ${BUGS.length} chars]`);
console.log("\n════════════════════════════\n");
console.log(GLOBAL);
console.log(`\n[global: ${GLOBAL.length} chars]`);

if (!APPLY) { console.log("\ndry run — pass --apply"); process.exit(0); }

const FEES = [
    [SOUL, 1000, "delve merchant prices charged at twice the rate the prize paid; the fishing freak-size banner calling itself a record"],
    [VALK, 1500, "the mini wheel never upgraded with the Golden Wheel; the recipe counter counting two books; the boss damage ceiling eating a potion in silence"],
    [ERIC, 500, "the pet-XP table stopping at tier 5, so a Master dish fed ten"],
    [GRAY, 500, "a chest rolling a piece you had listed, and the listing then having nowhere to come home to"],
    [JINX, 500, "the Whiner badge describing hull and paying Ship Armor"],
];
const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}
   AND body LIKE '%Twelve days without a word%' AND created_at > NOW() - INTERVAL '14 days' LIMIT 1`;
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
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BUGS}, 'bugs')`;
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${GLOBAL}, 'global')`;
console.log("\nposted to #bugs and #global.");
