import "server-only";

// ── CLASSIFYING THE BANK FEED, SO NOBODY HAS TO DO IT BY HAND ──────────────────────────────────────────────
// Luke: "I dont want to deal with data correction. I had you build me screens for every aspect of my
// business, ledger including, so that we could answer these meta level questions accurately."
//
// He is right, and the shape of the ledger says why this is solvable in code. Provenance splits cleanly:
//
//   • 420 HAND rows   — what a thing WAS. Every single Inventory, Software, Supplies and Fixtures row is
//                       hand-entered. These already carry a category and need no help.
//   • 309 PLAID rows  — what left the BANK. These arrive with a merchant string and no category, which is
//                       why 173 of them sat in "Other" and why $32k looked like a hole in the books.
//
// A merchant string is a category. `AUTOMATIC DEBIT RENT:WOLFF` is rent every time; Southern Hobby is a
// card distributor every time. So the rules below read the bank's own text and file the row. No prompting,
// no screen, no homework.
//
// ⚠️ THE HARD PART IS NOT NAMING THE CATEGORY, IT IS KNOWING WHAT MUST NOT BE CHARGED. Merchandise profit
// already nets cost of goods, card fees and consignor payouts, so a classifier that cheerfully files
// Southern Hobby as a cost would charge the shop twice for the same cards and invent a loss. Every rule
// therefore carries `cost: false` when the money is real but already accounted for elsewhere, or is not a
// cost at all (sales tax is the customers' money; an ATM withdrawal is cash moving to the drawer).

/** A row's provenance. Plaid writes its id into notes; nothing else does. */
export const isPlaidRow = (e) => String(e?.notes || "").includes("Plaid ID");

const t = (e) => `${e?.description || ""} ${e?.notes || ""}`.toLowerCase();

// ⚠️ CHECKED BEFORE A ROW'S OWN CATEGORY, and the only rules that are. A hand-entered row's category is
// normally the better answer because Luke typed it — but "Taxes" is ambiguous in a way that matters: it
// holds both the shop's real tax cost (payroll deposits, workers comp) and sales tax REMITTED, which is
// money collected from customers and handed to the state. Only the payee separates them, and filing the
// remittance as a cost overstated the year by $3,581.07.
const PRE_RULES = [
    { re: /dept of reven|department of revenue|mn rev pay|sales tax/, bucket: "Sales tax remitted", cost: false,
      why: "collected from customers and passed through — never the shop's money" },
    // Both of these carry category "Taxes" too, and both are REAL costs — but a screen that wants to show
    // "payroll tax" and "workers comp" as their own lines gets $0.00 for each if the category wins, because
    // they are indistinguishable from the sales-tax remittance sitting beside them.
    { re: /internal revenue service|\birs\b/, bucket: "Payroll tax", cost: true },
    { re: /department of labor|dept of labor|labor & industry|labor and industry/, bucket: "Workers comp", cost: true },
];

// bucket  — what the report calls it
// cost    — does it belong on the operating-cost side of break-even?
// why     — printed next to a `cost: false` rule so the exclusion is never mysterious
const RULES = [
    // ── Money that is real but ALREADY counted, or never a cost ───────────────────────────────────────────
    { re: /southern hobby|gamestop|pokemon (box|company)|distribut/, bucket: "Inventory & stock", cost: false,
      why: "stock purchase — charged as cost of goods when it sells" },
    { re: /consign|venmo/, bucket: "Consignor payouts", cost: false,
      why: "the consignor's money — profit only counts the shop's commission" },
    { re: /dept of reven|department of revenue|sales tax/, bucket: "Sales tax remitted", cost: false,
      why: "collected from customers and passed through — not the shop's money" },
    { re: /atm ?\/? ?trans|atm withdrawal/, bucket: "Cash to the drawer", cost: false,
      why: "cash moving to the till, not spend" },
    { re: /square inc sq\b|square inc sq2|^square inc/, bucket: "Square fees & settlement", cost: false,
      why: "card fees are already netted out of merchandise profit" },
    { re: /visa provisioning|service charge/, bucket: "Bank charges", cost: true },

    // ── Real operating cost ───────────────────────────────────────────────────────────────────────────────
    { re: /square inc payroll|payroll/, bucket: "Wages", cost: true },
    { re: /internal revenue service|\birs\b/, bucket: "Payroll tax", cost: true },
    { re: /department of labor|dept of labor|labor & industry|labor and industry/, bucket: "Workers comp", cost: true },
    { re: /rent:wolff|rent:wo|\brent\b/, bucket: "Rent", cost: true },
    { re: /travelers|next insurance|^next\b|insurance/, bucket: "Insurance", cost: true },
    { re: /metronet|comcast|xfinity|internet/, bucket: "Internet", cost: true },
    { re: /vercel|neon|resend|namecheap|easypost|github|squarespace|openai|anthropic|chatgpt|claude|google|microsoft/,
      bucket: "Software & hosting", cost: true },
    { re: /ingstad|radio|advertis|facebook|meta ads/, bucket: "Advertising", cost: true },
    { re: /cvs|dollar general|target|walmart|menards|hardware|office|staples|top loader|sleeve|label/,
      bucket: "Supplies", cost: true },
    { re: /u\.s\. post office|usps|ups|fedex|shipping|postage/, bucket: "Shipping", cost: true },
    { re: /painting|repair|install|plumb|electric/, bucket: "Repairs & services", cost: true },
];

// The ledger's own categories, for hand-entered rows that already know what they are. Same cost/no-cost
// discipline as above.
const BY_CATEGORY = {
    "Inventory": { bucket: "Inventory & stock", cost: false, why: "stock purchase — charged as cost of goods when it sells" },
    "Rent": { bucket: "Rent", cost: true },
    "Software": { bucket: "Software & hosting", cost: true },
    "Supplies": { bucket: "Supplies", cost: true },
    "Fixtures": { bucket: "Fixtures", cost: true },
    "Marketing": { bucket: "Advertising", cost: true },
    "Utilities": { bucket: "Internet", cost: true },
    "Shipping": { bucket: "Shipping", cost: true },
    "Travel": { bucket: "Travel", cost: true },
    "Taxes": { bucket: "Taxes", cost: true },
    "Startup - Legal": { bucket: "Startup", cost: true },
    "Startup - Domain": { bucket: "Startup", cost: true },
    "Fees": { bucket: "Bank charges", cost: true },
};

/**
 * File one spend row.
 *
 * Order matters. A hand-entered row's own category wins, because Luke typed it and he was there. Only
 * when the category is absent or the catch-all "Other" do we fall back to reading the bank's merchant
 * string — which is exactly the population that was sitting uncategorised.
 *
 * Returns `{ bucket, cost, why, rule }`. `rule` is "category" | "payee" | "unidentified" so a screen can
 * show how a number was arrived at rather than asking anyone to trust it.
 */
export function classifySpendRow(e) {
    const text = t(e);
    for (const r of PRE_RULES) {
        if (r.re.test(text)) return { bucket: r.bucket, cost: r.cost, why: r.why, rule: "payee" };
    }
    if (e?.type === "Inventory") {
        return { ...BY_CATEGORY.Inventory, rule: "category" };
    }
    const own = e?.category && e.category !== "Other" ? BY_CATEGORY[e.category] : null;
    if (own) return { ...own, rule: "category" };

    for (const r of RULES) {
        if (r.re.test(text)) {
            return { bucket: r.bucket, cost: r.cost, why: r.why || null, rule: "payee" };
        }
    }

    // ⚠️ NOT a rounding bucket. Plaid sends no merchant for a transfer or a written cheque, so these rows
    // carry a bare amount and nothing else — $9.8k of blank descriptions and $5.1k of cheques, mostly big
    // round numbers that look like stock buys or consignor settlements. Code cannot know, and guessing
    // would quietly move the year's bottom line. They are NOT charged as cost, and the report states the
    // total so the figure carries its own error bar instead of a false precision.
    return { bucket: "Unidentified", cost: false, why: "the bank sent no merchant name — not charged", rule: "unidentified" };
}

/**
 * Reconcile a year's spend rows into buckets.
 *
 * ⚠️ THE CASH PATH IS RECORDED THREE TIMES AND IS ONE EVENT. Luke withdraws cash from business checking
 * and spends it on restocks, and the ledger faithfully records all of it:
 *
 *   1. the bank debit            — a Plaid row, and Plaid sends NO merchant name for an ATM/teller
 *                                  withdrawal, so it arrives as a bare round number
 *   2. the withdrawal itself     — a hand-entered CashFloat row, "Cash Withdrew from Business Checking"
 *   3. what the cash then bought — hand-entered Inventory/Expense rows paid by "Cash On Hand"
 *                                  ($37,043.85 across 91 rows)
 *
 * Only (3) is spend. (1) and (2) are the same dollar moving from the bank to the drawer. An earlier version
 * of this matched Plaid rows against hand-entered Expense/Inventory ONLY, never against CashFloat — so
 * every withdrawal fell through to "Unidentified" and $6,082.50 of cash movement was reported as
 * unexplained spend while the categorised drawer spend sat in the ledger the whole time. Reading the bank
 * feed without the cash moves beside it is how you get that wrong.
 *
 * So: a Plaid debit matching a cash move is filed as drawer movement and NOT charged; a Plaid debit
 * matching a hand-entered expense is the same money recorded twice, and the hand row wins because it
 * carries the better category.
 */
export function reconcileSpend(entries, { windowDays = 6 } = {}) {
    const spend = entries.filter((e) => e.type === "Expense" || e.type === "Inventory");
    const hand = spend.filter((e) => !isPlaidRow(e));
    const plaid = spend.filter(isPlaidRow);
    // Cash moving between the bank and the till. Never spend, but it is what the bank's bare round
    // numbers ARE, so it has to be matchable.
    // Cash and equity moving, not spend: a withdrawal to the till, an owner contribution funding a
    // card purchase, a reimbursement. Each shows up in the bank feed as a bare amount, so each has to
    // be matchable or it masquerades as unexplained cost.
    const MOVE_TYPES = ["CashFloat", "Transfer", "OwnerContribution", "OwnerDraw", "Reimbursement"];
    const cashMoves = entries.filter((e) => MOVE_TYPES.includes(e.type) && !isPlaidRow(e));

    const index = (rows) => {
        const m = new Map();
        for (const r of rows) {
            const k = Math.round(Math.abs(r.amount) * 100);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
        }
        return m;
    };
    const handByAmount = index(hand);
    const cashByAmount = index(cashMoves);

    const nearest = (p, bucketIndex, claimed) => {
        let best = null;
        for (const h of bucketIndex.get(Math.round(Math.abs(p.amount) * 100)) || []) {
            if (claimed.has(h.entryId)) continue;
            const gap = Math.abs(p.date - h.date) / 864e5;
            if (gap <= windowDays && (best == null || gap < best.gap)) best = { gap, row: h };
        }
        return best;
    };

    const claimedHand = new Set();
    const claimedCash = new Set();
    const mirrored = [];
    const drawerMoves = [];
    const counted = [...hand];
    // Biggest first, so a large genuine match is not stolen by a small coincidental one.
    for (const p of [...plaid].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))) {
        const twin = nearest(p, handByAmount, claimedHand);
        if (twin) {
            claimedHand.add(twin.row.entryId);
            mirrored.push({ plaid: p, hand: twin.row });
            continue;
        }
        const cash = nearest(p, cashByAmount, claimedCash);
        if (cash) {
            claimedCash.add(cash.row.entryId);
            drawerMoves.push({ plaid: p, cash: cash.row });
            continue;
        }
        counted.push(p);
    }

    const buckets = new Map();
    let operatingCost = 0;
    const unidentified = { rows: 0, amount: 0 };
    const add = (bucket, cost, why, amount, payee) => {
        const cur = buckets.get(bucket)
            || { bucket, rows: 0, amount: 0, cost, why: why || null, byPayee: new Map() };
        cur.rows += 1;
        cur.amount += amount;
        cur.byPayee.set(payee, (cur.byPayee.get(payee) || 0) + amount);
        buckets.set(bucket, cur);
        if (cost) operatingCost += amount;
    };

    const monthlyRows = [];
    for (const e of counted) {
        const c = classifySpendRow(e);
        const amount = Math.abs(e.amount);
        add(c.bucket, c.cost, c.why, amount, (e.description || "").trim() || "(no merchant name)");
        monthlyRows.push({ date: e.date, amount, bucket: c.bucket, cost: c.cost });
        if (c.rule === "unidentified") {
            unidentified.rows += 1;
            unidentified.amount += amount;
        }
    }
    // Drawer movement gets a visible row so the cash is traceable, but it is never charged.
    for (const m of drawerMoves) {
        add("Cash to the drawer", false,
            "withdrawn from checking to the till — what it bought is recorded separately as cash spend",
            Math.abs(m.plaid.amount), "Cash withdrawal");
    }

    return {
        buckets: [...buckets.values()]
            .map((b) => ({
                ...b,
                payees: [...b.byPayee.entries()].map(([payee, amount]) => ({ payee, amount }))
                    .sort((a, b2) => b2.amount - a.amount).slice(0, 8),
                byPayee: undefined,
            }))
            .sort((a, b) => b.amount - a.amount),
        operatingCost,
        unidentified,
        mirrored: { pairs: mirrored.length, amount: mirrored.reduce((a, m) => a + Math.abs(m.plaid.amount), 0) },
        drawer: { pairs: drawerMoves.length, amount: drawerMoves.reduce((a, m) => a + Math.abs(m.plaid.amount), 0) },
        countedRows: counted.length,
        rows: monthlyRows,
    };
}
