// ── THE SHAPE CLASSIFIER, PINNED TO THE CASES THAT CAUGHT IT OUT ────────────────────────────────────────────
// `scripts/plaid-reconcile.mjs` is the real deduplicator now — it asks the bank and the bank answers. This
// classifier only runs on rows Plaid cannot see: the May/June sheets-import rows whose transaction ids it has
// purged, where the shape of two descriptions is genuinely all that is left.
//
// Every case below is a bug that shipped, so each one is a line of the rule rather than an illustration:
//
//   PAY FIRST CHECK   "PAY FIRST" was sitting in the bank-noise list, so both sides of the $1,400 pair read as
//                     blank and the rule shrugged. Plaid later confirmed one check, posted 08-07.
//   Southern Hobby    Both sides informative, so "two coincidental invoices" — for the SAME payee at the SAME
//                     amount, where one name was a truncation of the other. $7,200 of phantom spend.
//   CVS               Same payee, same amount, SAME DAY, nine times over. Not a settlement pair; the import
//                     lost the real dates. Merging these would destroy real records, so it must abstain — and
//                     "CVS" is three characters, which the prefix guard's length test alone would have failed.
//   Fixtures          One side names the money, the other is the bank's blank. The ordinary case; keep the words.
//   Kwik Trip         Two different payees that cost the same. Must stay two rows.
//
//   node scripts/test-ledger-dupe-classify.mjs
import { register } from "node:module";

register("./lib/app-loader.mjs", import.meta.url);

const { classifyPair } = await import("@/lib/ledger/backfill-dupes.js");

const D = (s) => Date.parse(`${s}T12:00:00Z`);
const CASES = [
    { a: ["PAY FIRST CHECK", "2026-08-07"], b: ["CHECK", "2026-08-06"], want: "merge",
      why: "a payee beside the bank's bare word for a check" },
    { a: ["Southern Hobby Distribution", "2026-06-03"], b: ["Southern Hobby Distribu", "2026-06-06"], want: "merge",
      why: "same payee, same amount, settlement-shaped gap, one name truncated" },
    { a: ["CVS", "2026-06-30"], b: ["CVS", "2026-06-30"], want: "unsure",
      why: "same payee and amount but SAME DAY — not settlement, so abstain" },
    { a: ["Fixtures Reimbursement", "2026-05-23"], b: ["", "2026-05-23"], want: "merge",
      why: "one side names the money, the other is the bank saying nothing" },
    { a: ["Southern Hobby Distribution", "2026-06-03"], b: ["Kwik Trip", "2026-06-04"], want: "distinct",
      why: "two different payees that happened to cost the same" },
    { a: ["Vercel Inc.", "2026-07-22"], b: ["Vercel Inc.", "2026-07-24"], want: "merge",
      why: "a subscription does not bill twice in a week" },
];

let failed = 0;
for (const c of CASES) {
    const got = classifyPair(
        { description: c.a[0], date_ms: D(c.a[1]) },
        { description: c.b[0], date_ms: D(c.b[1]) },
    );
    const ok = got.verdict === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${got.verdict.padEnd(9)} (want ${c.want.padEnd(9)}) ${c.why}`);
    if (!ok) console.log(`       ${JSON.stringify([c.a[0], c.b[0]])} -> ${got.reason}`);
}
console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed ? 1 : 0);
