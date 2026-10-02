// ── CHANGE A MEMBER'S PUBLIC @HANDLE ─────────────────────────────────────────────────────────────────────────
//   node --import ./scripts/lib/register-loader.mjs scripts/set-member-alias.mjs <current> <new>
//   ... --apply      actually write it; without this it only reports what would happen
//
// There is no admin path for this. /api/admin/member/[id] is read-only, and the only writer is updateProfile()
// in profile.js — which is `server-only` and member-authenticated, so it runs for the member changing their
// OWN handle and nowhere else. A member who wants a rename has to ask Luke, and Luke has to ask for the row.
//
// ⚠️ SO THIS IMPORTS THE REAL RULES RATHER THAN RESTATING THEM. aliasFormatError and isAliasAvailable are the
// same two functions the member-facing path calls; the alias loader resolves "@/" and stubs "server-only" so
// they can run here. Retyping "3-20 chars, letters/numbers/underscore" into this file would be a second copy
// of the rule, free to drift from the one the app enforces — and the drift only shows up as a handle that
// exists in the database and that the app would have refused.
//
// WHAT A HANDLE ACTUALLY IS, because two columns have to move together:
//     alias             the DISPLAY form, case preserved      "WyldStallyn"
//     alias_normalized  lowercase, what uniqueness and every lookup use      "wyldstallyn"
// getPublicProfileByAlias matches on alias_normalized, so writing only `alias` leaves the member reachable at
// their OLD url and invisible at the new one.
import fs from "node:fs";

import { neon } from "@neondatabase/serverless";

import { aliasFormatError, normalizeAlias } from "@/lib/marketplace/profile.js";

const [current, next] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");
if (!current || !next) {
    console.error("usage: set-member-alias.mjs <current-handle> <new-handle> [--apply]");
    process.exit(1);
}

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
const sql = neon(env.match(/^DATABASE_URL=["']?([^"'\r\n]+)/m)[1]);

// ── the member ───────────────────────────────────────────────────────────────────────────────────────────────
const rows = await sql`SELECT id, alias, alias_normalized, display_name, COALESCE(xp, 0) AS xp
                         FROM mkt_buyer WHERE alias_normalized = ${normalizeAlias(current)}`;
if (rows.length !== 1) {
    console.error(`${rows.length} members match "${current}" — refusing to guess.`);
    process.exit(1);
}
const m = rows[0];
console.log(`member    ${m.id}`);
console.log(`          @${m.alias}  ${m.display_name || "(no display name)"}  ${m.xp.toLocaleString()} XP`);

// ── the same two gates the member-facing path applies ────────────────────────────────────────────────────────
const err = aliasFormatError(next);
if (err) { console.error(`\nrefused: ${err}`); process.exit(1); }

const normalized = normalizeAlias(next);
const clash = await sql`SELECT id, alias FROM mkt_buyer WHERE alias_normalized = ${normalized} AND id <> ${m.id}`;
if (clash.length) { console.error(`\nrefused: that handle is taken (@${clash[0].alias}).`); process.exit(1); }

const display = String(next).trim();
console.log(`\nwould set alias            @${m.alias}  ->  @${display}`);
console.log(`           alias_normalized  ${m.alias_normalized}  ->  ${normalized}`);
console.log(`           profile url       /marketplace/u/${m.alias}  ->  /marketplace/u/${display}`);

if (!APPLY) { console.log("\nnothing written — pass --apply."); process.exit(0); }

await sql`UPDATE mkt_buyer SET alias = ${display}, alias_normalized = ${normalized}, updated_at = NOW()
           WHERE id = ${m.id}`;
const [after] = await sql`SELECT alias, alias_normalized FROM mkt_buyer WHERE id = ${m.id}`;
console.log(`\nwritten. alias="${after.alias}" alias_normalized="${after.alias_normalized}"`);
