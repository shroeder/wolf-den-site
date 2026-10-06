// ── ALL HALLOWS' IS OPEN ─────────────────────────────────────────────────────────────────────────────────────
// The event announcement. Luke: "Also announce the event plz."
//
// ⚠️ PARAPHRASE ONLY. This is member-facing: nothing about how it was built, no flag names, no internals, and
// nothing from our conversation. It says what is in the world and where to go and stops.
//
//   node scripts/arbiter-post-halloween-live.mjs            # dry run, prints the body
//   node scripts/arbiter-post-halloween-live.mjs --apply    # posts it
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);

const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";
const GOURD = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/town/gourdfather-1791139277546.webp";
const THRESHER = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/town/1791226924940-988386.webp";
const CANDY = "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/town/1791152156793-140009.webp";

const BODY = `🎃 All Hallows' is open.

The plaza is dressed. So is the farm, the mine, the sea, the arena and the boss ground — walk into any of them and you will see it.

${GOURD}
# The Gourdfather is in the square
He is enormous, he is loud, and he has opinions about pie. He will tell you what trick-or-treating is and then let you get on with it.

There is a pail on every doorstep in town. Walk the street and tap them. Each one gives you candy, each one can only be knocked once, and the doors reset — so the street is worth walking again tomorrow.

${CANDY}
# Candy drops almost everywhere
Fishing, mining, cooking, harvesting, dungeon clears, arena wins, boss strikes, chests, the wheel, raids. If you are already doing it, it is already paying candy.

Four seasonal chests have joined the ladder — Candy Corn, Pumpkin, Skeleton and Ghost. They are not reskins. They roll their own things.

# The Lantern Crypt
A new dungeon, and a real one — its own floors, its own encounters, its own ending. It is not a recoloured crypt you have already walked. Expect it to hit about as hard as the deeper runs you know.

${THRESHER}
# The town raids have changed for the season
The Bandit Raid, the Goblin Swarm, the Frost Pack, the Drowned Crew and the Hollow Court have gone quiet until November. In their place:

**The Husk Tide** — a lot of thin bodies and the easiest raid on the board. If you are new, this is the one to come down for.

**The Candle Wake** — slower, heavier, and it hits back. Bring something that cuts.

**The Thresher** — the size of the Town Hall, carrying a blade, and the whole plaza is needed. It will not come often.

# And the Gachapon
There is a machine on the casino floor now, to the right of the Counter. It takes a ticket, and tickets turn up while you play — strikes, chests, catches, harvests, raids.

What comes out of it includes things that exist nowhere else on this server, and a few that are worth real money in the shop. You can see the whole prize list before you spend anything.

The sea has new things in it. The wheel has a set you can only earn this month. There are decorations for the farm that will not be available again after it closes.

It runs through the season and then it packs up. Go and look at it.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

// ⚠️ The same duplicate guard every Arbiter post carries. These are written by hand and run by hand, and
// running one twice is a double post in front of the whole Den.
const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%All Hallows%is open%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}, ${BODY}, 'announce')`;
console.log("\nposted to the announce channel.");
