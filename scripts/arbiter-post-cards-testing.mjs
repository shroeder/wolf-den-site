// ── THE CARD GAME OPENS TO THE TESTERS ───────────────────────────────────────────────────────────────────────
// Luke: "post a quick message in the tester channel as the arbiter telling them its a new feature and they are
// invited to test it out. log their bugs there... we need to set expectations that it doesnt give any rewards
// right now. but will on release."
//
// PARAPHRASE, ALWAYS. Nothing in here quotes our conversation or names anything internal — see the standing
// rule on member-facing writing. Short paragraphs with air between them, which is the only format the Arbiter
// has ever used.
//
//   node scripts/arbiter-post-cards-testing.mjs           dry run, prints it
//   node scripts/arbiter-post-cards-testing.mjs --apply    posts it
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ The door to the card game is open, and you are the first ones through it.

It is a deck, a map and a fight — you walk a floor of rooms, pick a card after every win, and the deck you build is the run. Your own pets are the cards. The things that try to stop you are the fighters off the Long Road.

**It is not finished, and that is the invitation.** Rough edges are the point: if something reads wrong, sits in the wrong place, or does nothing when you press it, that is exactly what I want to hear about.

**Say it in here.** This room is for it, and you can attach a picture to a message now — a screenshot of the thing going wrong is worth more than any description of it, so use it. What screen you were on, what you pressed, what happened instead.

**And the part I want to be straight about: it pays nothing right now.** No gold, no XP, no chests, no bounties. A run costs you nothing and gives you nothing, on purpose — the balance is not settled and I would rather owe you than pay you the wrong amount.

That changes when it opens to the Den. It will pay properly then, and the people who broke it first will not have wasted their time.

Go and lose a run. Tell me how.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`SELECT 1 FROM mkt_town_chat WHERE buyer_id = ${ARBITER}::uuid
   AND channel = 'testing' AND body LIKE '%door to the card game is open%' LIMIT 1`;
if (dupe.length) { console.log("already posted."); process.exit(0); }
await sql`INSERT INTO mkt_town_chat (buyer_id, body, channel) VALUES (${ARBITER}::uuid, ${BODY}, 'testing')`;
console.log("posted to the testing room.");
