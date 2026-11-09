import { readFileSync } from "node:fs";

// ─────────────────────────────────────────────────────────────────────────
// LOCAL SECRETS LIVE NEXT DOOR, IN THE ANDROID PROJECT.
//
// The same place DATABASE_URL and the Square token live -- `vercel env pull`
// masks them, so the repo has long read them from accounting_app/.env. The
// realtime keys went in beside them.
//
// ⚠️ IT ONLY FILLS WHAT IS MISSING. A value already in the environment wins,
//    so running a test against production with an explicitly exported key
//    does what it says rather than being silently overwritten by the local
//    file.
// ─────────────────────────────────────────────────────────────────────────
const ENV_FILE = "C:/Users/Luke/Projects/accounting_app/.env";

export function loadLocalEnv(keys = ["RT_TICKET_PRIVATE_KEY", "RT_TICKET_PUBLIC_KEY"]) {
    let text = "";
    try { text = readFileSync(ENV_FILE, "utf8"); } catch { return; }
    for (const key of keys) {
        if (process.env[key]) continue;
        const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
        if (line) process.env[key] = line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
    }
}
