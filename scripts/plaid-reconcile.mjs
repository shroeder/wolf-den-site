// ── RECONCILE THE LEDGER AGAINST WHAT THE BANK ACTUALLY HAS ──────────────────────────────────────────────────
// Luke: "You have access to my bank via plaid right? I dont understand why you cant figure out whats real and not"
//
// He was right, and the shape-guessing this replaces was never necessary. Plaid answers the question outright:
//
//   • /transactions/get returns only what EXISTS NOW. A pending transaction that has since posted is GONE from
//     the response — replaced by a new transaction carrying a new id.
//   • That replacement row carries `pending_transaction_id`, naming the row it replaced.
//
// So for a ledger row carrying a Plaid id there are exactly three possibilities, and no judgement in any:
//
//   LIVE     the id is still in Plaid's response       → real money. Keep it.
//   PENDING  the id appears as some live row's            → the pending half of a charge we also hold posted.
//            pending_transaction_id                        Merge it into that row and delete it.
//   UNKNOWN  Plaid has never heard of it               → outside the pulled window, a removed transaction, or
//                                                         a hand-typed row. Surface it; never guess.
//
// ⚠️ THE POSTED ROW WINS, NOT THE BETTER-LOOKING ONE. The shape-based pass kept whichever description was
// longer, which for the June rows would have kept "Southern Hobby Distribution" dated 06-03 over the truncated
// "SOUTHERN HOBBY DISTRIBUT" dated 06-08 — the nicer name on the WRONG DATE, for a charge the bank posted on
// the 8th. The bank's posted row is the fact; a fuller name from the pending half is merged onto it.
//
// Measured on the real books: this bank puts 271 of 285 transactions through a pending stage, which is why the
// expense total had grown so far past reality.
//
//   node scripts/plaid-reconcile.mjs                 dry run, prints every decision
//   node scripts/plaid-reconcile.mjs --apply         write it, logging each delete to ledger_merge_log
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

const pick = (f, k) => readFileSync(f, "utf8").split(/\r?\n/).find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim();
const AENV = "C:/Users/Luke/Projects/accounting_app/.env";
const LP = "C:/Users/Luke/Projects/accounting_app/local.properties";
process.env.DATABASE_URL ||= pick(AENV, "DATABASE_URL");
process.env.INTEGRATION_ENCRYPTION_KEY ||= pick(AENV, "INTEGRATION_ENCRYPTION_KEY");
const CID = process.env.PLAID_CLIENT_ID || pick(LP, "PLAID_CLIENT_ID");
const SEC = process.env.PLAID_SECRET || pick(LP, "PLAID_SECRET");
const ENV = process.env.PLAID_ENV || pick(LP, "PLAID_ENV") || "production";

const APPLY = process.argv.includes("--apply");
// ── ⚠️ THE SHADOW PASS IS OPT-IN, AND STAYS OPT-IN ──────────────────────────────────────────────────
// It is the one rule here that is NOT idempotent. The pending rule compares against ids Plaid states
// outright, so re-running it is a no-op once clean. The shadow rule infers from "the bank holds this
// amount once and another row already claims it" — and promoting rows CHANGES which row claims what,
// so a second run proposes a fresh set built on the results of the first.
//
// That surfaced immediately: after the first apply it offered nine more rows worth $5,814.89,
// including a 10-20 row named as a shadow of "the 10-20 row". Neither $190.54 row even carried an
// external_id, so the keeper it matched was a row holding a DIFFERENT amount that happened to claim
// that transaction's id. The amount-agreement guard below closes that specific hole, but a rule whose
// proposals depend on its own previous run must never delete financial rows unattended.
const SHADOW = process.argv.includes("--shadow");
const START = process.argv.find((a) => a.startsWith("--start="))?.slice(8) || "2026-04-01";
const END = process.argv.find((a) => a.startsWith("--end="))?.slice(6) || new Date().toISOString().slice(0, 10);

const { db } = await import("@/lib/db.js");
const { getDecryptedCredential } = await import("@/lib/admin-app/integrations.js");
const { mergeEntry } = await import("@/lib/ledger/dupes.js");

const storeId = (await db.queryOne(`SELECT store_id FROM store_integrations WHERE provider='plaid' LIMIT 1`))?.store_id;
const token = (await getDecryptedCredential(storeId, "plaid"))?.credential?.access_token;
if (!token) throw new Error("no stored Plaid access_token");

const plaid = async (path, body) => {
    const r = await fetch(`https://${ENV}.plaid.com${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: CID, secret: SEC, access_token: token, ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`${path} ${r.status} ${j.error_code || ""} ${j.error_message || ""}`);
    return j;
};

// ── what the bank has ───────────────────────────────────────────────────────────────────────────────────────
let live = [];
let total = null;
let off = 0;
do {
    const j = await plaid("/transactions/get", { start_date: START, end_date: END, options: { count: 500, offset: off } });
    total = j.total_transactions;
    live = live.concat(j.transactions);
    off += j.transactions.length;
} while (off < total && live.length < 5000);

const liveById = new Map(live.map((t) => [t.transaction_id, t]));
// the id of a pending row  →  the posted row that replaced it
const replacedBy = new Map();
for (const t of live) if (t.pending_transaction_id) replacedBy.set(t.pending_transaction_id, t);
console.log(`Plaid ${START}..${END}: ${live.length} live transactions, ${replacedBy.size} of them replacing a pending row\n`);

// ── what the books have ─────────────────────────────────────────────────────────────────────────────────────
const rows = await db.query(
    `SELECT entry_id, date_ms, type, category, amount, description, payment_method, source,
            COALESCE(external_id, SUBSTRING(notes FROM 'Plaid ID: ([A-Za-z0-9]+)')) pid
       FROM ledger_entry
      WHERE COALESCE(external_id, SUBSTRING(notes FROM 'Plaid ID: ([A-Za-z0-9]+)')) IS NOT NULL
      ORDER BY date_ms`,
);

const byId = new Map(rows.map((r) => [r.pid, r]));
const d = (ms) => new Date(Number(ms)).toISOString().slice(0, 10);
const liveRows = [];
const pendingRows = [];
const unknownRows = [];
for (const r of rows) {
    if (liveById.has(r.pid)) liveRows.push(r);
    else if (replacedBy.has(r.pid)) pendingRows.push(r);
    else unknownRows.push(r);
}

// ── ⚠️ SHADOW COPIES — THE SECOND PHANTOM THAT THE ID RULE CANNOT SEE ───────────────────────────────
// The June rows hold the same charge THREE times: 06-03, 06-06, 06-08. Plaid holds it once (06-08) and
// names 06-06 as its pending half — but it has purged 06-03 entirely, so the id rule clears only one of
// the two phantoms and the books would stay doubled.
//
// This closes it without guessing. A row qualifies only when all three hold:
//   1. Plaid has no record of its id at all, and
//   2. the bank holds exactly ONE transaction of that amount within a week of it, and
//   3. some OTHER ledger row already carries that transaction's id.
// The bank has the charge once, the books have it twice, and the other copy is the one the bank vouches
// for. That is arithmetic, not judgement — and a row failing any of the three stays in UNKNOWN.
const claimed = new Set(rows.map((r) => r.pid));
const shadowRows = [];
const reallyUnknown = [];
for (const r of unknownRows) {
    const amt = Math.abs(Number(r.amount));
    const near = live.filter((t) => Math.abs(Math.abs(t.amount) - amt) < 0.005
        && Math.abs(Date.parse(`${t.date}T12:00:00Z`) - Number(r.date_ms)) <= 7 * 86400000);
    const anchor = near.length === 1 && claimed.has(near[0].transaction_id) ? near[0] : null;
    const keeper = anchor ? byId.get(anchor.transaction_id) : null;
    // ⚠️ THE CLAIMING ROW MUST ITSELF BE FOR THIS AMOUNT. Without this, a row carrying the id of some
    // other transaction satisfies "already claimed" and becomes the keeper for a charge it has nothing
    // to do with — which is how a 10-20 row ended up proposed as a shadow of the 10-20 row.
    const agrees = keeper && Math.abs(Math.abs(Number(keeper.amount)) - amt) < 0.005;
    if (keeper && agrees && keeper.entry_id !== r.entry_id) { shadowRows.push({ drop: r, posted: anchor, keeper }); continue; }

    // ── NOBODY HOLDS THE BANK'S ID, BUT THE BANK STILL NAMES A DATE ─────────────────────────────────
    // The $190.54 and $190.44 pairs ended here: the bank has one of each (posted 10-20 and 10-21), the
    // books have two of each, and NEITHER copy carries the bank's transaction id — so the rule above
    // correctly abstained, having no anchored keeper to prefer.
    //
    // The bank's posted DATE resolves it anyway. When it holds exactly one transaction of this amount
    // and exactly one ledger row sits on that very date, that row is the real one and the others are
    // copies. Still the bank deciding; only the anchor changed from id to date.
    if (near.length === 1) {
        const sameAmount = rows.filter((x) => Math.abs(Math.abs(Number(x.amount)) - amt) < 0.005
            && Math.abs(Date.parse(`${near[0].date}T12:00:00Z`) - Number(x.date_ms)) <= 7 * 86400000);
        const onBankDate = sameAmount.filter((x) => d(x.date_ms) === near[0].date);
        if (sameAmount.length > 1 && onBankDate.length === 1 && onBankDate[0].entry_id !== r.entry_id) {
            shadowRows.push({ drop: r, posted: near[0], keeper: onBankDate[0], byDate: true });
            continue;
        }
    }
    reallyUnknown.push(r);
}

const sum = (list) => list.reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
console.log(`ledger rows carrying a Plaid id: ${rows.length}`);
console.log(`  LIVE     still in Plaid      : ${liveRows.length}`);
console.log(`  PENDING  superseded, phantom : ${pendingRows.length}  $${sum(pendingRows).toFixed(2)}`);
console.log(`  SHADOW   bank disowns the copy: ${shadowRows.length}  $${sum(shadowRows.map((a) => a.drop)).toFixed(2)}`);
console.log(`  UNKNOWN  needs eyes            : ${reallyUnknown.length}  $${sum(reallyUnknown).toFixed(2)}\n`);

// ── the phantoms, each beside the posted row the bank says replaced it ──────────────────────────────────────
console.log("── PHANTOM PENDING ROWS (Plaid names each replacement) ──");
const actions = [];
for (const r of pendingRows.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))) {
    const posted = replacedBy.get(r.pid);
    const keeper = byId.get(posted.transaction_id) || null;
    console.log(
        `  $${Math.abs(Number(r.amount)).toFixed(2).padStart(10)}  ${d(r.date_ms)} "${String(r.description || "(blank)").slice(0, 28)}"`
        + `  ->  posted ${posted.date} "${String(posted.name).slice(0, 24)}"  ${keeper ? "[twin in books]" : "[twin NOT imported]"}`,
    );
    actions.push({ drop: r, posted, keeper });
}

if (shadowRows.length) {
    console.log("\n── SHADOW COPIES (bank holds the charge once; another row carries the bank's id) ──");
    for (const a of shadowRows.sort((x, y) => Math.abs(y.drop.amount) - Math.abs(x.drop.amount))) {
        console.log(`  $${Math.abs(Number(a.drop.amount)).toFixed(2).padStart(10)}  ${d(a.drop.date_ms)} "${String(a.drop.description || "(blank)").slice(0, 28)}"`
            + `  ->  bank has one, on ${a.posted.date}, ${a.byDate ? "and only the" : "already held by the"} ${d(a.keeper.date_ms)} row${a.byDate ? " sits on that date" : ""}`);
        a.kind = "plaid_shadow_copy";
    }
    if (!SHADOW) {
        console.log("  (not applied — pass --shadow to include these; see the note at the top of this file)");
    }
}

const inBooks = actions.filter((a) => a.keeper).concat(SHADOW ? shadowRows : []);
const orphan = actions.filter((a) => !a.keeper);
// ⚠️ A PROMOTION THAT MOVES A DATE MOVES MONEY BETWEEN MONTHS. Mostly Plaid's pending and posted rows
// share a date and this is nil, but it must be stated rather than discovered in a monthly report.
const moved = orphan.filter((a) => d(a.drop.date_ms) !== a.posted.date);
console.log(`\n  ${inBooks.length} phantoms whose posted twin is ALSO in the books -> merge and delete`);
console.log(`     $${sum(inBooks.map((a) => a.drop)).toFixed(2)} of phantom spend`);
console.log(`  ${orphan.length} pending rows whose posted twin was never imported -> keep, adopt the posted id and date`);
console.log(`     of those, ${moved.length} would MOVE DATE${moved.length ? ":" : " (none)"}`);
for (const a of moved) {
    console.log(`       ${d(a.drop.date_ms)} -> ${a.posted.date}  $${Math.abs(Number(a.drop.amount)).toFixed(2)} "${String(a.drop.description || "(blank)").slice(0, 30)}"`);
}

if (reallyUnknown.length) {
    console.log("\n── UNKNOWN (surfaced, never guessed) ──");
    for (const r of reallyUnknown.slice(0, 30)) {
        console.log(`  ${d(r.date_ms)} $${Math.abs(Number(r.amount)).toFixed(2).padStart(9)} src=${String(r.source).padEnd(13)} "${String(r.description || "(blank)").slice(0, 38)}"`);
    }
    if (reallyUnknown.length > 30) console.log(`  … and ${reallyUnknown.length - 30} more`);
}

if (!APPLY) {
    console.log("\nDRY RUN — pass --apply to write.");
    process.exit(0);
}

// ── apply ──────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠️ Every delete is written to ledger_merge_log WITH THE DROPPED ROW'S CONTENTS first, so this is undoable by
// hand. Same reversibility rule the shape-based backfill follows.
let merged = 0;
let adopted = 0;
for (const a of inBooks) {
    const { merged: m, fields } = mergeEntry(
        {
            entry_id: a.keeper.entry_id,
            description: a.keeper.description,
            category: a.keeper.category,
            payment_method: a.keeper.payment_method,
            amount: a.keeper.amount,
            date_ms: a.keeper.date_ms,
        },
        { description: a.drop.description, category: a.drop.category, payment_method: a.drop.payment_method },
    );
    await db.query(
        `INSERT INTO ledger_merge_log (kept_entry_id, merged_from, kind, fields) VALUES ($1,$2,$3,$4::jsonb)`,
        [a.keeper.entry_id, a.drop.entry_id, a.kind || "plaid_pending_posted", JSON.stringify({
            ...fields,
            deleted: { date: d(a.drop.date_ms), amount: a.drop.amount, description: a.drop.description, pid: a.drop.pid },
            reason: a.kind === "plaid_shadow_copy"
                ? `Plaid holds exactly one ${Math.abs(Number(a.drop.amount)).toFixed(2)} transaction in this window (${a.posted.transaction_id}, ${a.posted.date}) and the kept row already carries its id, so this row is a second copy of it.`
                : `Plaid reports transaction ${a.posted.transaction_id} (posted ${a.posted.date}) as the replacement for pending ${a.drop.pid}.`,
            anchoredBy: a.byDate ? "bank posted date" : a.kind === "plaid_shadow_copy" ? "bank transaction id held by the kept row" : "plaid pending_transaction_id",
        })],
    );
    await db.query(
        `UPDATE ledger_entry SET description=$2, category=$3, external_pending_id=$4, updated_at_ms=$5 WHERE entry_id=$1`,
        [a.keeper.entry_id, m.description ?? a.keeper.description, m.category ?? a.keeper.category, a.drop.pid, Date.now()],
    );
    await db.query(`DELETE FROM ledger_entry WHERE entry_id=$1`, [a.drop.entry_id]);
    merged++;
}
for (const a of orphan) {
    // The pending row is all we hold of a charge that HAS posted. Promote it: take the bank's id and date, so
    // the next run sees it as LIVE rather than offering to merge it into nothing.
    await db.query(
        `UPDATE ledger_entry SET external_id=$2, external_pending_id=$3, date_ms=$4, updated_at_ms=$5 WHERE entry_id=$1`,
        [a.drop.entry_id, a.posted.transaction_id, a.drop.pid, Date.parse(`${a.posted.date}T12:00:00Z`), Date.now()],
    );
    adopted++;
}
console.log(`\nAPPLIED: ${merged} phantoms merged away, ${adopted} pending rows promoted to their posted identity.`);
