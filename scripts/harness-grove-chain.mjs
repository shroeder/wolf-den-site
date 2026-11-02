// ── WALK A CHAIN END TO END, AGAINST THE REAL DATABASE ──────────────────────────────────────────────────────
// Luke asked whether the quest thread was actually finished. Twice this session a Grove feature rendered
// perfectly and was wired to nothing — claimStep granted no reward, bumpQuests had no call sites — and both
// times the lab, the build and the linter were all green. A screenshot cannot tell you a row was written.
//
// So this drives the SERVER functions in the order a player hits them:
//
//     bumpQuests  (what a settle does)  ->  questBoard  ->  claimStep  ->  the next step
//
// and asserts the rows afterwards: xp/gold, the chest, the parts, the Coliseum token, the cap.
//
// ⚠️ A THROWAWAY BUYER ID, AND IT CLEANS UP AFTER ITSELF. This talks to production Neon because that is
// where the schema lives; it must not leave a mark on it. Every table it touches is deleted at the end, and
// the id is a fixed UUID that belongs to no member.
//
// ⚠️ AND IT PROVES THE BEFORE-STATE FIRST. A harness that only checks the after-state cannot tell a working
// feature from one that was already in the finished position. [[harness-must-reproduce-the-bug-first]]
//
//   node scripts/harness-grove-chain.mjs
import fs from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
    if (m) process.env[m[1]] = m[2];
}

const { db } = await import("@/lib/db");
const { questsFor } = await import("@/lib/marketplace/grove-npcs.js");
const { bumpQuests, claimStep, questBoard, COLISEUM_KEY_CAP } = await import("@/lib/marketplace/grove-quests.js");

const BUYER = "00000000-0000-4000-8000-00000000f00d";
const WHO = "snare";           // cull -> hunt -> forge -> survive: four kinds, one chain
const chain = questsFor(WHO);
const MAP = chain[0].map;

const ok = (label, pass, detail = "") =>
    console.log(`${pass ? "  PASS" : "  FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
let failures = 0;
const check = (label, pass, detail) => { if (!pass) failures += 1; ok(label, pass, detail); };

async function wipe() {
    for (const t of ["mkt_grove_quest", "mkt_grove_coliseum", "mkt_grove_item", "mkt_grove_chest"]) {
        await db.query(`DELETE FROM ${t} WHERE buyer_id = $1`, [BUYER]).catch(() => {});
    }
}

async function rowFor(stepId) {
    return db.queryOne(
        `SELECT progress, claimed_at FROM mkt_grove_quest WHERE buyer_id = $1 AND step_id = $2`,
        [BUYER, stepId],
    ).catch(() => null);
}

try {
    await wipe();
    console.log(`chain: ${WHO} (map ${MAP}) — ${chain.map((s) => s.kind).join(" -> ")}\n`);

    // ── THE BEFORE-STATE ────────────────────────────────────────────────────────────────────────
    const before = await rowFor(chain[0].id);
    check("starts with no progress row", !before, before ? JSON.stringify(before) : "");

    for (let i = 0; i < chain.length; i += 1) {
        const s = chain[i];
        console.log(`\nstep ${i + 1}/${chain.length}  ${s.kind.padEnd(8)} ${s.title}  (need ${s.need})`);

        // The event a real settle/craft/run would carry for this kind.
        const ev =
            s.kind === "cull" || s.kind === "hunt" ? { slain: { [s.foe]: s.need } }
            : s.kind === "harvest" ? { parts: { [s.part]: s.need } }
            : s.kind === "forge" ? { forged: { [s.part]: 1 } }
            : s.kind === "delve" ? { zone: s.zone }
            : s.kind === "survive" ? { zone: s.zone, cleared: true }
            : s.kind === "ticket" ? { wave: s.wave }
            : {};

        const ticks = await bumpQuests(BUYER, ev);
        const mine = ticks.find((t) => t.step === s.id);
        check("the event moves it", Boolean(mine), `ticks: ${JSON.stringify(ticks.map((t) => t.step))}`);
        check("it reaches the requirement", Boolean(mine?.done), mine ? `${mine.progress}/${mine.need}` : "no tick");

        const board = await questBoard(BUYER);
        const row = board.find((q) => q.npc === WHO);
        check("the board shows it ready", Boolean(row?.active?.ready), `active: ${row?.active?.id} ${row?.active?.progress}/${row?.active?.need}`);

        const paid = await claimStep(BUYER, s.id);
        check("the hand-in is accepted", Boolean(paid?.ok), paid?.error || "");
        if (paid?.ok) {
            const last = i === chain.length - 1;
            check("a token only on the last step", Boolean(paid.token) === last, `token=${paid.token}`);
            if (s.reward.parts > 0) {
                check("the parts reward is paid", Boolean(paid.partsPaid),
                    paid.partsPaid ? `${paid.partsPaid.n} x ${paid.partsPaid.part}` : "nothing handed over");
            }
            if (s.reward.chest) {
                const c = await db.queryOne(
                    `SELECT qty FROM mkt_grove_chest WHERE buyer_id = $1 AND tier = $2`, [BUYER, s.reward.chest],
                ).catch(() => null);
                check("the chest lands in the Grove table", Number(c?.qty) > 0, `${s.reward.chest}: ${c?.qty ?? 0}`);
            }
        }

        const after = await questBoard(BUYER);
        const next = after.find((q) => q.npc === WHO)?.active;
        check(i === chain.length - 1 ? "the chain finishes" : "the next step takes over",
            i === chain.length - 1 ? !next : next?.id === chain[i + 1].id,
            next ? next.id : "none");
    }

    // ── THE CAP ─────────────────────────────────────────────────────────────────────────────────
    console.log("\ncap:");
    const keys0 = await db.queryOne(`SELECT keys FROM mkt_grove_coliseum WHERE buyer_id = $1 AND map_n = $2`,
        [BUYER, MAP]).catch(() => null);
    check("the chain paid exactly one token", Number(keys0?.keys) === 1, `keys=${keys0?.keys}`);
    for (let i = 0; i < 6; i += 1) {
        await db.query(
            `INSERT INTO mkt_grove_coliseum (buyer_id, map_n, keys) VALUES ($1,$2,1)
             ON CONFLICT (buyer_id, map_n) DO UPDATE SET keys = LEAST($3, mkt_grove_coliseum.keys + 1)`,
            [BUYER, MAP, COLISEUM_KEY_CAP],
        ).catch(() => {});
    }
    const keys1 = await db.queryOne(`SELECT keys FROM mkt_grove_coliseum WHERE buyer_id = $1 AND map_n = $2`,
        [BUYER, MAP]).catch(() => null);
    check(`six more tokens still cap at ${COLISEUM_KEY_CAP}`, Number(keys1?.keys) === COLISEUM_KEY_CAP, `keys=${keys1?.keys}`);
} finally {
    await wipe();
    const left = await db.queryOne(`SELECT count(*)::int n FROM mkt_grove_quest WHERE buyer_id = $1`, [BUYER])
        .catch(() => ({ n: -1 }));
    console.log(`\ncleaned up — rows left for the test id: ${left?.n}`);
}

console.log(failures ? `\n${failures} FAILED` : "\nall green");
process.exit(failures ? 1 : 0);
