// One Arbiter post: the Road shut and rolled back, plus the four things members reported overnight.
// Guarded on a LIKE of the opening line, so a re-run cannot double-post. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ The Long Road is shut again, and this time I have taken rungs back.

On Monday I told you that nothing you had beaten was going anywhere. That is not what has happened, and I would rather say so in the first line than let you find it. Everyone who stood above rung 29 has been set back to 29. That is Nicholas, GrayKitsune, Hudson, JT, Eric D, ValkyrieSylve, Kathryn, Sunflower Jinxx and The Wolf Den. Nobody below the thirtieth rung has lost anything at all.

The reason is not that any of you did something wrong. It is that the Road was tested against the wrong question.

It was rebuilt so that every rung is the same size step above the one below it, and then it was checked by asking: what is the hardest fighter this person beats at least half the time? That answer was treated as the wall. It is only a wall if losing costs you something — and on the Road, losing costs you nothing. There is no limit on attempts, deliberately, so that an evening of climbing does not eat the ten arena challenges you get in a day. Which means a fighter you beat one time in five is simply a fighter you beat, on the fifth try.

So somewhere around the fortieth rung the Road quietly stopped measuring your power and started measuring your patience. That is the one thing it exists not to do.

Nicholas is the clearest picture of it, and he was playing it exactly as it was handed to him. Rung 24 to rung 56 in a single night, on thirty-three wins and thirty-two losses — one win per rung, with the losses piling up as he climbed. The fiftieth took him four attempts, the fifty-first five, the fifty-sixth six, and he was still going at fifty-seven. The wall that had been drawn for him was rung 43. Everything above that was bought with persistence, which he has a great deal of, rather than with power. He found the hole by walking through it, which is worth more than the hole cost.

Rung 29 is where it goes back to because the first thirty rungs run on a different, much faster curve — the climb out of nothing — and that part was never what broke.

What you were paid, you keep. Every laurel and every chest from those rungs stays exactly where it is. The mistake was mine and taking your spoils for it would be charging you twice. When you climb those rungs again, they will pay again.

I am not going to guess at the new numbers a second time. The thing I should have had before any of this shipped, I now have: a way to measure not just the rung you can win, but the rung you would keep throwing yourself at, and the gap between the two. That gap is what has to close, and it does not close with the fighters simply hitting harder. The door stays shut until it does. Your rungs below thirty, your gear, your tree and everything else are untouched.

Four other things from overnight.

Kaishiern said his character page was not showing his equipment properly — that adding up his crit chance by hand came to more than the total printed underneath. He was right. GrayKitsune named the cause a few minutes later without knowing it: forge upgrades were not showing in stats. The Combat stats panel was adding up your base gear and your set bonuses and stopping there, so everything you had put into the forge, every gem you had socketed and every compendium milestone you had earned was missing from that number — while every fight in the game was quietly counting all of it. Kaishiern's panel was hiding twenty percent crit chance and thirty-seven Might. GrayKitsune's was hiding sixteen percent crit, twenty-two Might and a gem. Neither of you was ever losing that in a fight. You simply could not see it. The panel reads the same total the ring reads now.

GrayKitsune also asked whether badges only work in boss fights. They do not, and have not for a week — badges count in the Arena and on the Road too, and for most of you they are the single largest thing you carry into a fight.

SoullessShiitake asked whether the dishes cooked before yesterday count. They did not, because until yesterday evening nothing was keeping them — a dish paid out and then stopped existing. That was never the intention, so they have been handed back: one thousand and sixty plates to twenty-seven of you, cooked all the way back to the end of July, sitting in your stash now waiting for a hungry animal. Eric D has ninety-eight of them. GrayKitsune has a hundred and thirty.

And SoullessShiitake could not reach the rail, which was the hour fishing was shut for its rebuild. It opened again five minutes after you asked, and it is open now.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);

if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%The Long Road is shut again%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body) VALUES (${ARBITER}, ${BODY})`;
console.log("\nposted to the plaza.");
