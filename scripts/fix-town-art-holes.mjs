// ── THE DOORWAYS YOU CAN SEE THE FOREST THROUGH ──────────────────────────────────────────────────────────
//   node --experimental-loader ./scripts/lib/app-loader.mjs scripts/fix-town-art-holes.mjs [--all] [--write]
//
// A die-cut building sprite is drawn on a transparent background, and the model does not distinguish the
// space AROUND the building from the dark inside its doorway. So an arch, an open shopfront or a lit window
// comes back as a HOLE, and in the street the trees and the moon show through it. Luke, looking at the
// plaza: "Some of the building look like shit. Dungeon looks bad."
//
// Measured across the Halloween set, six of thirteen were see-through: delves 6.6% of the image, market
// 4.0%, arena 3.3%, festival 2.2%, docks 1.4%, auction 1.1%.
//
// ⚠️ THIS DOES NOT REDRAW ANYTHING. The art is fine; the alpha is wrong. It downloads what is already
// published, fills the SEALED transparent regions (fill-holes.js — the ones no border pixel can reach, which
// on a building is always an opening), and republishes under a fresh blob path. Costs nothing, and the
// picture Luke has already approved is the picture that stays.
//
// Without --write it only reports. --all covers the everyday buildings too, not just the hw_ set.
import fs from "node:fs";
import sharp from "sharp";
import { neon } from "@neondatabase/serverless";

const env = fs.readFileSync("C:/Users/Luke/Projects/accounting_app/.env", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// ⚠️ THE ENV GOES IN BEFORE @vercel/blob IS IMPORTED. A static import is hoisted above every statement in
// this file and the blob client reads BLOB_READ_WRITE_TOKEN as it initialises — so importing it at the top
// gets a client that never saw the token, falls back to OIDC, and dies with "OIDC is enabled for this
// project, but not for the development environment", which is a confusing way to say the token was missing.
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("no BLOB_READ_WRITE_TOKEN in accounting_app/.env");
const { put } = await import("@vercel/blob");
const sql = neon(process.env.DATABASE_URL);
const { fillHolesBuffer } = await import("@/lib/marketplace/fill-holes.js");

const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");

// Only things drawn as die-cut sprites. A scene layer (sky, cobbles, depth bands) is opaque by design and
// has no transparent region at all, sealed or otherwise.
const SCENE = new Set(["background", "sky", "cobble", "hw_cobble", "hw_depth1", "hw_depth2", "hw_depth3", "hw_mid", "hw_fg", "tavern_interior"]);

const sealed = async (buf) => {
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, A = (x, y) => data[(y * W + x) * 4 + 3];
    const seen = new Uint8Array(W * H); const st = [];
    for (let x = 0; x < W; x++) st.push([x, 0], [x, H - 1]);
    for (let y = 0; y < H; y++) st.push([0, y], [W - 1, y]);
    while (st.length) { const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= W || y >= H) continue; const k = y * W + x; if (seen[k]) continue; if (A(x, y) > 24) continue; seen[k] = 1; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
    let n = 0; for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] < 24 && !seen[i]) n++;
    return { n, pct: (100 * n) / (W * H) };
};

const rows = await sql`SELECT art_key, url FROM mkt_town_art WHERE url IS NOT NULL AND url <> '' ORDER BY art_key`;
const targets = rows.filter((r) => !SCENE.has(r.art_key) && (ALL || r.art_key.startsWith("hw_bld_")));
console.log(`${targets.length} sprites to check${WRITE ? "" : "  (dry run — pass --write to publish)"}\n`);

let fixed = 0;
for (const r of targets) {
    const buf = Buffer.from(await (await fetch(r.url)).arrayBuffer());
    const before = await sealed(buf);
    if (before.pct < 0.05) { console.log(`  ok    ${r.art_key.padEnd(18)} ${before.pct.toFixed(2)}%`); continue; }
    const filledPng = await fillHolesBuffer(buf, "#0d1020");
    const after = await sealed(filledPng);
    if (!WRITE) {
        console.log(`  HOLE  ${r.art_key.padEnd(18)} ${before.pct.toFixed(2)}%  ->  ${after.pct.toFixed(2)}%  (${before.n} px)`);
        fixed++;
        continue;
    }
    const webp = await sharp(filledPng).webp({ quality: 92 }).toBuffer();
    const blob = await put(`marketplace/town/${Date.now()}-${Math.round(Math.random() * 1e6)}.webp`, webp, {
        // ⚠️ THE TOKEN IS PASSED, NOT INHERITED. Left to read the environment the client finds the project has
        // OIDC enabled, prefers it, and fails with "OIDC is enabled for this project, but not for the
        // development environment" even though BLOB_READ_WRITE_TOKEN is sitting right there. Handing it over
        // explicitly is the only thing that makes a local script able to publish.
        access: "public", contentType: "image/webp", cacheControlMaxAge: 31536000,
        token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    await sql`UPDATE mkt_town_art SET url = ${blob.url}, updated_at = NOW() WHERE art_key = ${r.art_key}`;
    console.log(`  FIXED ${r.art_key.padEnd(18)} ${before.pct.toFixed(2)}%  ->  ${after.pct.toFixed(2)}%   ${blob.url.slice(-24)}`);
    fixed++;
}
console.log(`\n${fixed} ${WRITE ? "republished" : "would be fixed"}`);
