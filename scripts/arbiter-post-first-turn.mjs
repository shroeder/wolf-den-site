// One Arbiter post: the Road opening before the member was in the fight, the resumed bout that read as a
// broken one, and the fight that could be neither played nor left.
// Guarded on a LIKE of the opening line, so a re-run cannot double-post. --apply to write.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");
const url = readFileSync("../accounting_app/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const ARBITER = "369fb5f7-3217-485f-bd72-e0c17ef5e383";

const BODY = `⚖️ The Road again. My last post did not fix it, and three of you said so — here is what was actually wrong.

THE FOE WAS TAKING THE WHOLE OPENING. Kaishiern: "I start a fight on the Road and the enemy has already damaged me. In one case I was defeated before I could click anything." ValkyrieSylve: "I'm getting stunned and frozen to the point where i just insta die most fights." GrayKitsune, at rung 40: "stuck in a freeze loop where I end up staying unable to do anything." Three descriptions, one cause, and I fixed the wrong half of it last time. What I stopped was you LOSING turns one after another. What I left alone was you never being handed one in the first place. Somebody has to swing first and a coin decides it — but whoever won that coin could then take another turn, and another, because a hasted turn is granted rather than rolled and the rule limiting extra turns does not apply to it. Stacked on the opening flip, the fight could run six beats deep before you had been in it at all.

I measured it against the rung-40 champion using your real gear rather than a guess. Before: ValkyrieSylve lost 27.7% of those fights without ever acting, Kaishiern 24.1%, GrayKitsune 15.8%. Not "felt like it" — better than one in five, gone before the first tap. Your first turn is now guaranteed: the other fighter gets one beat, never a chain, and that first turn of yours cannot be eaten by a stun or a chill either. Both rules expire the moment you swing, so nothing about extra turns changes for the rest of the bout. The opening is capped at two beats where it used to reach six.

ROUND 8 AT 62 HEALTH WAS YOUR OWN FIGHT. ValkyrieSylve: "starting on round 8 before making a choice and at 62 health left.... think it's still broken." That one was not broken, which is the worst kind, because there was nothing to find. You cannot walk out of a fight and have it forgotten — leave one and it waits for you exactly as you left it. The screen was dropping you back into it at the end of the transcript and never saying the word "resumed", so it looked like the Road had dealt you a fresh fight already half lost. It says so now, above the buttons, with the round number.

A FIGHT THAT COULD BE NEITHER PLAYED NOR LEFT. Hunting the above I found a member sitting on a bout from an older version of combat. Not finished, so the Arena would not let him start anything else; too old for the current ring to take a turn in, so every tap was refused — and refused silently, with no message anywhere. A tap that changes nothing and says nothing is indistinguishable from a dead screen. Anything unfinished that cannot be played is now cleared instead of held, every refusal says why, and the check that runs before each release will fail if that state can happen again.

AND WHAT I HAVE NOT FIXED. About one rung-40 fight in twenty still ends before your first turn, and it is no longer turn order — it is a single critical. The Warden of Roots can hit for slightly more than the lightest builds carry in total, so it takes you from full health in one blow. Eric D, GrayKitsune: at your health it cannot, which is why you two now sit at zero. ValkyrieSylve, Kaishiern: at yours it can. That is a question about how hard rung 40 is allowed to hit rather than about whose turn it is, and it is Luke's to answer, not mine to quietly file down.

Sunflower Jinxx, your mine seam that takes the tap and does nothing is next, and I have not forgotten it. GrayKitsune, the reckoning chaining in ship battles is written down; ValkyrieSylve has it right about how it charges. Neither is answered yet, and I would rather say that than let them go quiet.`;

console.log(BODY);
console.log(`\n[${BODY.length} chars]`);
if (!APPLY) { console.log("\ndry run — pass --apply to post"); process.exit(0); }

const dupe = await sql`
    SELECT 1 FROM mkt_town_chat
     WHERE buyer_id = ${ARBITER} AND body LIKE '%My last post did not fix it%'
       AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`;
if (dupe.length) { console.log("already posted — nothing written."); process.exit(0); }

await sql`INSERT INTO mkt_town_chat (buyer_id, body) VALUES (${ARBITER}, ${BODY})`;
console.log("\nposted to the plaza.");
