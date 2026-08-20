// One Arbiter post: where combat stands while it is shut, and the gear screen that was rebuilt in the meantime.
// Guarded on a LIKE of the opening line, so a re-run cannot double-post. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ Why combat is still shut, and what to do while it is.

Somebody asked in here today why both the ring and the Road are closed, and it is a fair thing to want an answer to rather than a padlock.

THE FIGHTS WERE ENDING BEFORE THEY STARTED. Measured against real loadouts — yours, not invented ones — a bout between two well-geared members was settled in about five swings. Two of you could trade blows for a couple of seconds and one of you would be on the floor. Everything that makes a fight worth watching needs ROUNDS to happen in: a critical, a bleed, Lifedrink pulling you back from nothing, a stun landing at the right moment. None of it got a turn. You were not imagining that fights felt like a coin landing rather than a fight.

That has been changed, and changed a long way — a bout now runs many times longer than it did. What it has not been is proven. Lengthening a fight does not just stretch it; it changes which things decide it, and the first thing that gets to decide a long fight is armour, which is exactly the sort of shift that looks fine in one matchup and absurd across fifty. The Road in particular is still being walked rung by rung to check it never gets EASIER as you climb — that rule matters more than any number, and it is not yet true at every rung. So it stays shut until it is.

Two other things settled while it is closed. When the ring reopens it will match you against PEOPLE. The Gauntlet's designed fighters were sharing the same button as the members, which is how you ended up facing the same warlord twice in a row; they belong on the Road, and the Road is a hundred of them with names. And the ring will stop repeating an opponent you have only just fought.

MEANWHILE, YOUR GEAR SCREEN IS A DIFFERENT SCREEN. This is the honest use of a closed ring, and I would go and look at it.

Tap any slot on your character. What you are wearing is pinned at the top as the thing to beat, and everything else you own that fits is listed underneath it, RANKED — each one saying what changes if you put it on, rather than reciting its own stats and leaving the subtraction to you. Minus eight damage, plus five crit chance, and an arrow telling you which way that lands. If nothing you own beats what you have on, nothing gets marked, and that is the answer too.

There is a chooser in there as well: tell it which stats you actually care about and the ranking rearranges itself around them. A build that lives on Crit Chance and one that lives on Vitality are not looking for the same piece, and the screen had no way of knowing which of you it was talking to.

Your bag also stopped showing you the nine things you are already wearing. They are drawn at the top of the screen; there was no reason for them to be in the list of things you are choosing between as well.

TWO SMALLER ONES. At the Forge, choosing a forged line to reforge opened a confirmation you could not see — so the stat sat there refusing to change while the only visible button on the card was the one that enhances the piece instead. If you have been wondering why reforging did nothing, that is why, and it works now. A piece's OWN stat is also no longer offered: a sword's Damage, a shield's Block, armour's Armour. Those were rollable, and rolling one away could never be undone, because nothing in the pool could ever put it back.

And chests open in bulk now — a whole tier, or the entire shelf, with one summary at the end instead of thirty celebrations to tap through.

I will tell you the day the ring opens. It will not be a quiet one.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%Why combat is still shut%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body) VALUES (${ARBITER}, ${BODY})`;
console.log("\nposted to the plaza.");
