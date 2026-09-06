// ── THE RIG: BACK UP THE OWNER'S RUN, MINT A SESSION, PUT IT ALL BACK ────────────────────────────────────
// ⚠️ THE CARD GAME IS OWNER-GATED, so anything that looks at it in a browser is looking at LUKE'S REAL RUN and
// his real unlock counters. The bot plays by clicking, which means it walks his rooms, spends his embers and
// earns him cards he did not play for. Both are backed up here and put back afterwards.
//
//   node scripts/cards-rig.mjs save     back up the run row + progress counters, mint a rig session
//   node scripts/cards-rig.mjs session  mint another rig session WITHOUT touching the backup
//   node scripts/cards-rig.mjs fresh    deal a brand new run for the rig to walk
//   node scripts/cards-rig.mjs event    report where the question marks are on this map
//   node scripts/cards-rig.mjs restore  put the run and the counters back, revoke the session
//
// Then:  SHOT_COOKIE=<the token it prints> node scripts/cards-bot.mjs --runs 1 --shots out/
//
// ⚠️ RESTORE WHEN YOU ARE DONE. The counters are what the play-earned cards are keyed to (migration 432), so
// a rig session that is not put back has quietly granted the owner unlocks he did not play for.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import crypto from "node:crypto";

const env = readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const BAK = `${process.env.TEMP}/wolfden-run-backup.json`;
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

// The id comes from the one place that holds it. Everything else in this repo identifies the owner by buyer
// id, and a second copy of that identity typed into a script is one more thing to keep in step.
const { primaryOwnerId } = await import("../src/lib/marketplace/owner.js");
const owner = { id: primaryOwnerId() };

const cmd = process.argv[2];

if (cmd === "save") {
    // ⚠️ A SECOND SAVE MUST NOT EAT THE FIRST ONE. This overwrote the backup file every time it ran, and the
    // third call of a session — made out of habit, to mint a fresh session token — captured the BOT'S dead
    // run and the bot-inflated unlock counters on top of the owner's real finished run. The owner's row was
    // only recoverable because an unrelated snapshot happened to be lying in the scratchpad. Saving is now
    // refused while a backup is already on disk; `restore` is what clears it.
    if (existsSync(BAK)) {
        const held = JSON.parse(readFileSync(BAK, "utf8"));
        console.log("a backup is ALREADY held:", held.run ? `run done=${held.run.state?.done} stop=${held.run.state?.stop}` : "no run");
        console.log("restore it before saving again, or delete", BAK, "if you are certain it is stale.");
        process.exit(1);
    }
    const run = (await sql`SELECT * FROM mkt_cards_run WHERE buyer_id = ${owner.id}::uuid`)[0] || null;
    const prog = (await sql`SELECT * FROM mkt_cards_progress WHERE buyer_id = ${owner.id}::uuid`)[0] || null;
    writeFileSync(BAK, JSON.stringify({ run, prog }, null, 1));
    const token = crypto.randomBytes(32).toString("hex");
    await sql`INSERT INTO mkt_buyer_session (buyer_id, token_hash, device_label, expires_at)
              VALUES (${owner.id}::uuid, ${hash(token)}, 'rig', NOW() + INTERVAL '3 hours')`;
    console.log("backed up:", run ? `run done=${run.state?.done} stop=${run.state?.stop}` : "no run",
        "| progress:", prog ? "yes" : "none");
    console.log("SHOT_COOKIE=" + token);
}

// A session token, on its own — the reason `save` was being called a third time.
if (cmd === "session") {
    const token = crypto.randomBytes(32).toString("hex");
    await sql`INSERT INTO mkt_buyer_session (buyer_id, token_hash, device_label, expires_at)
              VALUES (${owner.id}::uuid, ${hash(token)}, 'rig', NOW() + INTERVAL '3 hours')`;
    console.log("SHOT_COOKIE=" + token);
}

if (cmd === "fresh") {
    await sql`DELETE FROM mkt_cards_run WHERE buyer_id = ${owner.id}::uuid`;
    console.log("run cleared — the next page load deals a new one");
}

// Walk the run to the first question mark on the sheet, so the event screen can be photographed without
// playing six fights to reach one.
if (cmd === "event") {
    const row = (await sql`SELECT state FROM mkt_cards_run WHERE buyer_id = ${owner.id}::uuid`)[0];
    if (!row) throw new Error("no run — load the page once first");
    const state = row.state;
    const un = (state.map?.nodes || []).filter((n) => n.kind === "unknown").sort((a, b) => a.row - b.row);
    if (!un.length) throw new Error("this map has no question marks");
    console.log("question marks at rows:", un.map((n) => `${n.row}:${n.lane}`).join(" "));
    console.log("seed", state.seed, "| act", state.act || 1);
}

// Stand the run in a room, without playing to it — for filming a screen rather than reaching one.
// e.g. node scripts/cards-rig.mjs stand rest
if (cmd === "stand") {
    const kind = process.argv[3] || "rest";
    const row = (await sql`SELECT state FROM mkt_cards_run WHERE buyer_id = ${owner.id}::uuid`)[0];
    if (!row) throw new Error("no run — load the page once first");
    const state = row.state;
    const node = (state.map?.nodes || []).find((n) => n.kind === kind) || { row: 0, lane: 0 };
    state.at = { row: node.row, lane: node.lane, kind, rested: false, opened: null };
    // ⚠️ A SHELF WITH NOTHING ON IT IS A LIE. The route refuses a merchant with no shop object at all
    // (not_in_shop — the shelf is built on the way IN, which standing a run by hand skips), and the first
    // version of this stood one up with EMPTY stock. Photographed on a wide screen that read as a broken
    // two-column layout: a merchant alone on the left and bare planks stretching away to the right. The
    // stall was fine; the rig was handing it nothing to hold. buildShop is pure, so it can be called here.
    if (kind === "merchant") {
        const kit = await import("../src/lib/marketplace/cards-kit.js");
        const pool = Object.values(kit.POOL).filter((c) => c.tier <= 2).slice(0, 24);
        const cardIds = [pool[3]?.id, pool[9]?.id, pool[15]?.id].filter(Boolean);
        const held = new Set(state.perks || []);
        state.shop = {
            stock: kit.buildShop((state.seed >>> 0) + node.row, {
                cardIds, perkIds: kit.PERK_IDS.filter((id) => !held.has(id)),
            }),
            bought: [], removed: false,
        };
    }
    state.stop = node.row + 1;
    state.trail = [...(state.trail || []), { row: node.row, lane: node.lane }];
    state.done = null;
    state.hp = Math.max(1, Math.round(state.hpMax * 0.6));
    await sql.query(`UPDATE mkt_cards_run SET state = $1::jsonb WHERE buyer_id = $2`,
        [JSON.stringify(state), owner.id]);
    console.log(`standing at a ${kind}, row ${node.row}, deck of ${state.deck.length}, hp ${state.hp}/${state.hpMax}`);
}

// Stand the run on a REWARD screen without winning a fight for it. CardFightClient synthesises a won fight
// whenever the run carries offers (see its note on why the row is the authority), so this is all it needs.
// e.g. node scripts/cards-rig.mjs reward whetstone
if (cmd === "reward") {
    const perk = process.argv[3] || null;
    const row = (await sql`SELECT state FROM mkt_cards_run WHERE buyer_id = ${owner.id}::uuid`)[0];
    if (!row) throw new Error("no run — load the page once first");
    const state = row.state;
    const node = (state.map?.nodes || []).find((n) => n.kind === "fight") || { row: 0, lane: 0 };
    state.at = { row: node.row, lane: node.lane, kind: perk ? "elite" : "fight", enc: null };
    state.stop = node.row + 1;
    state.fight = null;
    state.done = null;
    state.offers = ["swipe", "scuttle", "sting"];
    state.gotPerk = perk;
    await sql.query(`UPDATE mkt_cards_run SET state = $1::jsonb WHERE buyer_id = $2`,
        [JSON.stringify(state), owner.id]);
    console.log(`reward screen: 3 cards${perk ? ` and a ${perk}` : ""}`);
}

if (cmd === "restore") {
    if (!existsSync(BAK)) throw new Error("no backup file");
    const { run, prog } = JSON.parse(readFileSync(BAK, "utf8"));
    await sql`DELETE FROM mkt_cards_run WHERE buyer_id = ${owner.id}::uuid`;
    if (run) {
        // WARNING: NAME ONLY COLUMNS THIS TABLE HAS. This insert listed created_at, which mkt_cards_run does
        // not have — so restore DELETED the owner's row and then threw, every single time, and the failure
        // was at the bottom of a stack trace nobody was reading because the command had always "worked".
        // The backup is written from SELECT *, so the columns are whatever the row actually had.
        const cols = Object.keys(run).filter((k) => k !== "buyer_id" && k !== "state");
        const names = ["buyer_id", "state", ...cols].join(", ");
        const marks = ["$1::uuid", "$2::jsonb", ...cols.map((_, i) => `$${i + 3}`)].join(", ");
        await sql.query(`INSERT INTO mkt_cards_run (${names}) VALUES (${marks})`,
            [owner.id, JSON.stringify(run.state), ...cols.map((k) => run[k])]);
    }
    if (prog) {
        await sql`DELETE FROM mkt_cards_progress WHERE buyer_id = ${owner.id}::uuid`;
        const cols = Object.keys(prog).filter((k) => k !== "buyer_id");
        // Counters are plain integers plus a couple of timestamps; put every one back exactly as found.
        for (const c of cols) {
            // WARNING: sql.query, NOT sql(). The neon client only accepts a tagged template unless you call
            // .query — and this was wrapped in a .catch that ate the resulting error, so the counter restore
            // has never once run. A rig that reports success while putting nothing back is worse than no rig.
            await sql.query(`UPDATE mkt_cards_progress SET ${c} = $1 WHERE buyer_id = $2`, [prog[c], owner.id]);
        }
        const has = (await sql`SELECT 1 FROM mkt_cards_progress WHERE buyer_id = ${owner.id}::uuid`)[0];
        if (!has) {
            await sql`INSERT INTO mkt_cards_progress (buyer_id) VALUES (${owner.id}::uuid)`;
            for (const c of cols) {
                await sql.query(`UPDATE mkt_cards_progress SET ${c} = $1 WHERE buyer_id = $2`, [prog[c], owner.id]);
            }
        }
    }
    await sql`UPDATE mkt_buyer_session SET revoked_at = NOW()
              WHERE buyer_id = ${owner.id}::uuid AND device_label = 'rig' AND revoked_at IS NULL`;
    // The backup is consumed, so the next `save` is allowed to take a fresh one.
    unlinkSync(BAK);
    // AND IT SAYS WHAT IT PUT BACK. A restore that reports success without reading the row is how a
    // silently-failing insert survived a whole session.
    const back = (await sql`SELECT state FROM mkt_cards_run WHERE buyer_id = ${owner.id}::uuid`)[0];
    if (run && !back) throw new Error("RESTORE FAILED: the run row is not there. The backup is still on disk.");
    console.log("run restored:", back ? `done=${back.state?.done} stop=${back.state?.stop} deck=${back.state?.deck?.length}` : "(there was no run to restore)");
    console.log("rig sessions revoked, backup cleared");
}
