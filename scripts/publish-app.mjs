#!/usr/bin/env node

/**
 * Publish a built Android APK so the wolf den app (com.wolfdenledger) can self-update.
 *
 * Flow: read the APK + its AGP output-metadata.json (for versionCode/versionName) -> upload the APK
 * to Vercel Blob -> insert a row into app_release. The app polls GET /api/app/version and offers the
 * newer build. This REPLACES `./gradlew installDebug` for remote deploys: build, then run this.
 *
 * Usage:
 *   node scripts/publish-app.mjs [--apk <path>] [--variant debug|release] [--notes "what changed"]
 *
 * Defaults to the accounting_app debug APK. Requires two secrets (read from env, or from
 * ../accounting_app/.env as a fallback): BLOB_READ_WRITE_TOKEN and DATABASE_URL.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { put } from "@vercel/blob";
import { Pool } from "@neondatabase/serverless";

function parseArgs(argv) {
    const args = { variant: "debug" };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === "--apk") args.apk = argv[++i];
        else if (a === "--variant") args.variant = argv[++i];
        else if (a === "--flavor") args.flavor = argv[++i];
        else if (a === "--app") args.app = argv[++i];
        else if (a === "--notes") args.notes = argv[++i];
    }
    return args;
}

// Pull a secret from process.env, falling back to ../accounting_app/.env (where Luke keeps prod secrets).
function readSecret(name) {
    if (process.env[name]) return process.env[name].trim();
    try {
        const env = readFileSync(path.resolve("../accounting_app/.env"), "utf8");
        const match = env.match(new RegExp(`^${name}=(.+)$`, "m"));
        if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
        /* no .env fallback */
    }
    return null;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    // Two apps share this publisher + the app_release table (keyed by channel):
    //  - ledger (accounting_app): product flavors under apk/<flavor>/<variant>, channel = flavor.
    //  - market (marketplace_app): no flavors, apk/<variant>, channel = "marketplace".
    const isMarket = args.app === "market" || args.app === "marketplace";
    const flavor = args.flavor || (isMarket ? "" : "full");
    const channel = isMarket ? "marketplace" : flavor;
    const blobPrefix = isMarket ? "wolfdenmarket" : `wolfdenledger-${flavor}`;
    const apkDir = isMarket
        ? path.resolve(`../marketplace_app/app/build/outputs/apk/${args.variant}`)
        : path.resolve(`../accounting_app/app/build/outputs/apk/${flavor}/${args.variant}`);
    const metaPath = path.join(apkDir, "output-metadata.json");

    let versionCode;
    let versionName;
    let apkPath = args.apk ? path.resolve(args.apk) : null;

    // AGP writes output-metadata.json next to the APK with the authoritative versionCode/versionName.
    try {
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        const element = meta.elements?.[0] || {};
        versionCode = element.versionCode;
        versionName = element.versionName;
        if (!apkPath && element.outputFile) {
            apkPath = path.join(apkDir, element.outputFile);
        }
    } catch (error) {
        console.error(`Could not read ${metaPath}. Build the app first (./gradlew assemble${cap(args.variant)}).`);
        console.error(error.message);
        process.exit(1);
    }

    if (!apkPath || !Number.isInteger(versionCode) || !versionName) {
        console.error("Missing APK path or versionCode/versionName from metadata.");
        process.exit(1);
    }

    const sizeBytes = statSync(apkPath).size;
    const blobToken = readSecret("BLOB_READ_WRITE_TOKEN");
    const dbUrl = readSecret("DATABASE_URL");

    if (!blobToken) {
        console.error("Missing BLOB_READ_WRITE_TOKEN. Create a Blob store in the Vercel dashboard and");
        console.error("add its token to ../accounting_app/.env or your shell env.");
        process.exit(1);
    }
    if (!dbUrl) {
        console.error("Missing DATABASE_URL (expected in ../accounting_app/.env).");
        process.exit(1);
    }

    console.log(`Publishing ${path.basename(apkPath)}  v${versionName} (code ${versionCode}, ${(sizeBytes / 1e6).toFixed(1)} MB)`);

    console.log(`Channel: ${channel}`);

    // Upload to Blob. addRandomSuffix keeps the URL unguessable for an internal build.
    const fileBuffer = readFileSync(apkPath);
    const blob = await put(`app/${blobPrefix}-${versionCode}.apk`, fileBuffer, {
        access: "public",
        addRandomSuffix: true,
        contentType: "application/vnd.android.package-archive",
        token: blobToken,
    });

    console.log(`Uploaded -> ${blob.url}`);

    const pool = new Pool({ connectionString: dbUrl });
    try {
        await pool.query(
            `INSERT INTO app_release (version_code, version_name, apk_url, notes, size_bytes, channel)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [versionCode, versionName, blob.url, args.notes || null, sizeBytes, channel]
        );
        console.log(`Recorded ${channel} release v${versionName} (code ${versionCode}). The app will offer it on next launch.`);
    } finally {
        await pool.end();
    }
}

function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
