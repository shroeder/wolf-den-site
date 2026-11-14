// ── THE GROVE LAUNCH EMAIL ───────────────────────────────────────────────────────────────────────────────────
// Luke, 2026-11-14: "I would expect an email. Draft." So it is DRAFTED and it does not send: the default run
// writes the exact HTML that would go out to a file and prints who would receive it. Nothing leaves the
// building without --send.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-launch-email.mjs
//        → renders out/grove-launch-email.html and prints the audience count. Sends nothing.
//
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-launch-email.mjs --send
//        → actually sends, in batches, to every member who has not turned announcements off.
//
// ⚠️ THE AUDIENCE IS THE SAME ONE broadcastAnnouncementEmail USES, and it is not "everybody". A member who
// set `notify_prefs -> email:announce` to false has told us not to do this, and the COALESCE default is TRUE
// so an account that never touched the setting is included. Rows with no email and rows with no alias (a
// shop-only buyer who never made a game account) are excluded — the Grove would mean nothing to them.
//
// ⚠️ AND IT IS CAPPED AT ONE SEND. The duplicate guard is a marker row in mkt_setting, because unlike an
// Arbiter post there is no sent-mail table to look in: re-running this with --send would mail 200+ people a
// second time and there would be nothing on our side showing that it had happened.
import { mkdirSync, writeFileSync } from "node:fs";

import { db } from "@/lib/db";
import { groveLaunchMessage, sendGroveLaunchEmail } from "@/lib/marketplace/email.js";

const SEND = process.argv.includes("--send");
const MARKER = "grove_launch_email_sent";

const rows = await db.query(
    `SELECT email, COALESCE(NULLIF(first_name,''), NULLIF(display_name,''), NULLIF(alias,'')) AS name
       FROM mkt_buyer
      WHERE email IS NOT NULL AND email <> '' AND alias IS NOT NULL
        AND COALESCE((notify_prefs ->> 'email:announce')::boolean, TRUE) IS NOT FALSE
      ORDER BY name`,
).catch(() => []);

console.log(`audience: ${rows.length} members`);

if (!SEND) {
    // Rendered against a real name off the top of the list, so the greeting is not previewed empty.
    const sample = groveLaunchMessage("preview@example.com", { name: rows[0]?.name || "" });
    mkdirSync("out", { recursive: true });
    const out = "out/grove-launch-email.html";
    writeFileSync(out, `<p style="font:600 14px system-ui;color:#555">Subject: ${sample.subject}</p>${sample.html}`);
    console.log(`subject: ${sample.subject}`);
    console.log(`\nwrote ${out} — open it and look at it.`);
    console.log("draft only. pass --send to actually mail it.");
    process.exit(0);
}

const already = await db.queryOne(`SELECT 1 AS x FROM mkt_setting WHERE key = $1`, [MARKER]).catch(() => null);
if (already) { console.log("already sent once — nothing mailed."); process.exit(0); }

let sent = 0;
let failed = 0;
for (const r of rows) {
    try {
        await sendGroveLaunchEmail(r.email, { name: r.name || "" });
        sent += 1;
    } catch {
        // Best-effort, exactly like broadcastAnnouncementEmail: one bad address must not stop the rest.
        failed += 1;
    }
}
await db.query(`INSERT INTO mkt_setting (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    [MARKER, JSON.stringify({ sent, failed })]).catch(() => {});
console.log(`sent ${sent}, failed ${failed}`);
