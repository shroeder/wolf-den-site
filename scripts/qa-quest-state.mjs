// ── PUT A QUEST INTO ANY STATE, SO THE BROWSER RIGS CAN VISIT ALL OF THEM ───────────────────────────────────
// Luke: "Why not intensively test and iterate without me."
//
// The retrigger shipped because the only check was one happy path. The states that were never visited are
// where the defects were — and reaching them by playing would take hours, so this writes them directly.
//
//   node scripts/qa-quest-state.mjs town  reset|offer|active|ready|allclaimed
//   node scripts/qa-quest-state.mjs grove <npcId> reset|offer|active|ready|spent [steps]
//
// ⚠️ .mjs, NOT .cjs, AND THAT IS NOT A STYLE CHOICE. As a .cjs file this broke `npm run lint:undef` for the
// whole repo: eslint-config-next's config objects do not match a .cjs extension, so the react-hooks plugin
// was never registered for it while the gate's own config object applies that rule to every file. The gate
// died on a config error — which reads exactly like a broken gate rather than a stray file.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);
const ID = "6857d67e-3dd0-46b6-aad7-b91699155ff6";   // The Wolf Den (Luke)

const TOWN_ACT = 2;                                   // Deepdelve
const TOWN_RUNGS = ["a2_trip", "a2_ore", "a2_smelt", "a2_enhance", "a2_salvage"];

async function town(mode) {
    await sql.query(`DELETE FROM mkt_act_accept WHERE buyer_id=$1 AND act_n=$2`, [ID, TOWN_ACT]);
    await sql.query(`DELETE FROM mkt_act_quest  WHERE buyer_id=$1 AND act_n=$2`, [ID, TOWN_ACT]);
    if (mode === "reset" || mode === "offer") return "offered";
    if (mode === "active" || mode === "ready") {
        // ⚠️ "ready" BACK-DATES THE ACCEPTANCE rather than faking progress. Progress is counted from the
        // event log since accepted_at, so moving the window back far enough lets the member's REAL history
        // satisfy the rung — which exercises the same code path a finished quest does, instead of a
        // hand-written number the production path would never produce.
        const when = mode === "ready" ? "NOW() - INTERVAL '5 years'" : "NOW()";
        await sql.query(
            `INSERT INTO mkt_act_accept (buyer_id, quest_key, act_n, accepted_at)
             VALUES ($1,$2,$3, ${when}) ON CONFLICT DO NOTHING`, [ID, TOWN_RUNGS[0], TOWN_ACT]);
        return mode;
    }
    if (mode === "allclaimed") {
        for (const k of TOWN_RUNGS) {
            await sql.query(`INSERT INTO mkt_act_accept (buyer_id, quest_key, act_n) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [ID, k, TOWN_ACT]);
            await sql.query(`INSERT INTO mkt_act_quest  (buyer_id, quest_key, act_n) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [ID, k, TOWN_ACT]);
        }
        return "all claimed";
    }
    throw new Error(`unknown town mode ${mode}`);
}

async function grove(npcId, mode, steps) {
    await sql.query(`DELETE FROM mkt_grove_quest WHERE buyer_id=$1 AND npc_id=$2`, [ID, npcId]);
    if (mode === "reset" || mode === "offer") return "offered";
    const first = `${npcId}_1`;
    if (mode === "active") {
        await sql.query(
            `INSERT INTO mkt_grove_quest (buyer_id, step_id, npc_id, map_n, progress) VALUES ($1,$2,$3,$4,1)
             ON CONFLICT DO NOTHING`, [ID, first, npcId, 1]);
        return "active (1 progress)";
    }
    if (mode === "ready") {
        // Every writer caps progress at `need`, so a large number reads as finished without needing to know it.
        await sql.query(
            `INSERT INTO mkt_grove_quest (buyer_id, step_id, npc_id, map_n, progress) VALUES ($1,$2,$3,$4,99999)
             ON CONFLICT (buyer_id, step_id) DO UPDATE SET progress = 99999`, [ID, first, npcId, 1]);
        return "ready";
    }
    if (mode === "spent") {
        const n = Number(steps || 3);
        for (let i = 1; i <= n; i += 1) {
            await sql.query(
                `INSERT INTO mkt_grove_quest (buyer_id, step_id, npc_id, map_n, progress, claimed_at)
                 VALUES ($1,$2,$3,$4,99999,NOW())
                 ON CONFLICT (buyer_id, step_id) DO UPDATE SET claimed_at = NOW()`,
                [ID, `${npcId}_${i}`, npcId, 1]);
        }
        return `spent (${n} steps claimed)`;
    }
    throw new Error(`unknown grove mode ${mode}`);
}

const [, , which, a, b, c] = process.argv;
const out = which === "town" ? await town(a) : await grove(a, b, c);
console.log(`state: ${which} -> ${out}`);
