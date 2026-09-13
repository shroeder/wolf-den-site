import "server-only";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── LOAD A CANNED STATE INSTEAD OF THE DATABASE, IN DEV, FOR ONE REQUEST ─────────────────────────────────────
// These pages hand their state to the client as a prop, rendered on the server — so it cannot be faked at the
// browser the way a client `fetch` can. Which meant the only way to look at a screen in a given state was to
// write that state into Neon on a real member's account: slow, destructive, and done once. Every other state
// went unphotographed, and one of them shipped with its only call-to-action two screens below the fold.
//
//   document.cookie = "wolfden-fixture=captain"      → scripts/fixtures/.live/sailing.captain.json
//   node scripts/sail-states.mjs                     → does it for every state, at two screen sizes
//
// ⚠️ IT CANNOT EXIST IN PRODUCTION. The first line is the guard and it is first on purpose: no cookie is read,
// no path is built and no file is touched when NODE_ENV is production, so the worst a forged cookie can do
// against the live site is nothing. The name is matched against [a-z0-9-] and joined to one fixed directory,
// because a cookie is attacker-controlled input even on a laptop.
export function devFixture(name, which) {
    if (process.env.NODE_ENV === "production") return null;
    if (!which || !/^[a-z0-9-]{1,32}$/.test(which)) return null;
    const file = resolve(process.cwd(), "scripts/fixtures/.live", `${name}.${which}.json`);
    if (!existsSync(file)) {
        console.warn(`[dev-fixture] ${name}.${which}.json is not there — falling back to the real state`);
        return null;
    }
    console.warn(`[dev-fixture] serving ${name}.${which}.json INSTEAD OF the database`);
    try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}
