// What does Plaid actually know about the sales-tax payments?
//
// The LEDGER description for the $704 MN Revenue payment was blank — 8 of the last 20 bank debits are. So
// matching on the ledger's description text can never work. But the ledger description is a SYNCED field, and
// Plaid's raw transaction carries much more: merchant_name, a counterparties array, and a two-level
// personal_finance_category taxonomy that Plaid assigns itself.
//
// If Plaid consistently tags these as a tax payment, the categorisation can be CODED rather than guessed.
// This dumps the raw records so we can see which field is actually reliable.
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const env = readFileSync("../accounting_app/.env", "utf8");
const prop = readFileSync("../accounting_app/local.properties", "utf8");
const pick = (src, k) => (src.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, "m"))?.[1] || "").trim();

const sql = neon(pick(env, "DATABASE_URL"));
const CLIENT_ID = pick(prop, "PLAID_CLIENT_ID");
const SECRET = pick(prop, "PLAID_SECRET");
const PLAID_ENV = pick(prop, "PLAID_ENV") || "production";
const BASE = `https://${PLAID_ENV}.plaid.com`;

// Same scheme as src/lib/admin-app/crypto.js: version:iv:tag:ciphertext, all base64, AES-256-GCM.
const rawKey = pick(env, "INTEGRATION_ENCRYPTION_KEY");
const key = /^[0-9a-fA-F]{64}$/.test(rawKey) ? Buffer.from(rawKey, "hex") : Buffer.from(rawKey, "base64");
function decryptSecret(blob) {
    const [, iv, tag, ct] = String(blob).split(":");
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

const [row] = await sql`
    SELECT credential_encrypted FROM store_integrations WHERE provider = 'plaid' LIMIT 1`;
if (!row) { console.log("no plaid integration row"); process.exit(1); }
const accessToken = JSON.parse(decryptSecret(row.credential_encrypted)).access_token;

async function plaid(path, body) {
    const r = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: CLIENT_ID, secret: SECRET, access_token: accessToken, ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`${path} ${r.status}: ${j.error_code} ${j.error_message}`);
    return j;
}

// Pull everything since the first known tax payment; Plaid pages at 500.
const all = [];
for (let offset = 0; ; offset += 500) {
    const j = await plaid("/transactions/get", {
        start_date: "2026-01-01",
        end_date: new Date().toISOString().slice(0, 10),
        options: { count: 500, offset, include_personal_finance_category: true },
    });
    all.push(...j.transactions);
    if (all.length >= j.total_transactions) break;
}
console.log(`${all.length} Plaid transactions pulled\n`);

const show = (t) => ({
    date: t.date,
    amount: t.amount,
    name: (t.name || "").slice(0, 42),
    merchant: t.merchant_name || "—",
    pfc: `${t.personal_finance_category?.primary || "—"} / ${t.personal_finance_category?.detailed || "—"}`,
    counterparty: (t.counterparties || []).map((c) => `${c.name}[${c.type}]`).join(", ") || "—",
});

console.log("=== THE TWO KNOWN TAX PAYMENTS ($675, $704) ===");
const known = all.filter((t) => [675, 704].includes(Math.abs(t.amount)));
console.table(known.map(show));
if (known.length) console.log("\nfull record of one:\n", JSON.stringify(known.at(-1), null, 2));

console.log("\n=== ANYTHING PLAID ITSELF CALLS A TAX ===");
const taxish = all.filter((t) => {
    const hay = `${t.name} ${t.merchant_name || ""} ${JSON.stringify(t.personal_finance_category || {})} ${JSON.stringify(t.counterparties || [])}`.toLowerCase();
    return /tax|revenue|treasur|dept.*rev|mn dor/.test(hay);
});
console.table(taxish.map(show));

console.log("\n=== how consistent is the naming across ALL debits? ===");
const byName = new Map();
for (const t of all.filter((x) => x.amount > 0)) {
    const k = t.merchant_name || t.name || "(none)";
    byName.set(k, (byName.get(k) || 0) + 1);
}
console.table([...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, n]) => ({ name: name.slice(0, 50), n })));
