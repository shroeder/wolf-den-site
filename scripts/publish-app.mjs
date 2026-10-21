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

// ⚠️ THE NAMESPACE AND THE NAMED IMPORTS BOTH. The preflight gate below calls fs.existsSync,
// fs.readdirSync, fs.copyFileSync and fs.statSync; with only the named imports those are a ReferenceError
// at the exact moment the gate is supposed to protect a publish. Caught by npm run lint:undef, which the
// build cannot see -- see [[lint-undef-gate]].
import fs, { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { put } from "@vercel/blob";
import { Pool } from "@neondatabase/serverless";

// ── ⚠️ NEVER PUBLISH AN APK THAT IS MISSING A CLASS IT NEEDS ────────────────────────────────────────────────
// 2026-10-20: v1.0.709 shipped without com.google.android.gms.common.R$string and every launch died in
// FirebaseInitProvider.onCreate -- before a single line of our own code ran, so it read as "the app crashes
// on open" with no way in. The ledger was down for a working day.
//
// NOTHING WAS WRONG WITH THE SOURCE. The commit that shipped it touched prompt text, a string constant and
// two conditionals in the add-entry path, none of which runs at startup. The APK was the problem: an
// incremental build under android.nonTransitiveRClass=true dropped the generated per-library R classes, and
// the broken artifact was 100MB with 11 dex files where a clean build is 111MB with 19. Gradle then
// considered that artifact UP-TO-DATE, so rebuilding produced nothing and reinstalling the same bytes could
// never have helped.
//
// Every signal that normally catches a bad build was green: it compiled, it assembled, it installed, and
// its size looked plausible. The only place the fault is visible is inside the dex, which is exactly where
// nobody looks. So this looks -- once, at the one moment the artifact leaves the machine.
//
// It verifies CLASS DEFINITIONS, not string matches. Grepping the raw dex for the class name finds the
// failing REFERENCE and passes a broken APK, which is the first thing that fooled me while debugging this.
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";

// Classes whose absence is silent at build time and fatal at launch. Keep this list short and load-bearing:
// a gate that checks forty things is one somebody disables the first time it is wrong.
const MUST_DEFINE = [
    // Firebase reads its options through this during ContentProvider init, before onCreate.
    "Lcom/google/android/gms/common/R$string;",
    // Our own entry point. If this is missing the APK is damaged in a way nothing else would catch.
    "Lcom/wolfdenledger/MainActivity;",
];

function dexdumpPath() {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
        || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
    const dir = path.join(sdk, "build-tools");
    if (!fs.existsSync(dir)) return null;
    const newest = fs.readdirSync(dir).sort().pop();
    if (!newest) return null;
    const exe = path.join(dir, newest, process.platform === "win32" ? "dexdump.exe" : "dexdump");
    return fs.existsSync(exe) ? exe : null;
}

/** Throw unless every MUST_DEFINE class is actually defined in one of the APK's dex files. */
function verifyApk(apkPath) {
    const dexdump = dexdumpPath();
    if (!dexdump) {
        // ⚠️ LOUD, NOT SILENT. A gate that quietly skips itself when a tool is missing is not a gate -- and
        // the whole point of this one is that the failure it catches is invisible everywhere else.
        throw new Error("cannot verify the APK: dexdump not found in the Android SDK build-tools. "
            + "Install build-tools or set ANDROID_HOME. Refusing to publish unverified.");
    }
    const work = mkdtempSync(path.join(tmpdir(), "apkverify-"));
    try {
        // ⚠️ COPY TO .zip, THEN Expand-Archive. Two Windows quirks, both paid for while writing this:
        // Expand-Archive refuses a .apk extension outright ("only .zip is supported"), and a hand-rolled
        // ZipFile extraction loop fails PART WAY THROUGH without a non-zero exit -- it wrote one dex out of
        // nineteen and reported success, which would have made this gate pass a broken APK for the wrong
        // reason. Slower and boring beats clever and quietly incomplete, for a check that runs once per
        // publish and exists precisely because silent incompleteness shipped an outage.
        const zipCopy = path.join(work, "apk.zip");
        fs.copyFileSync(apkPath, zipCopy);
        execFileSync("powershell", ["-NoProfile", "-Command",
            `Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${work}' -Force`], { stdio: "pipe" });
        const dexes = fs.readdirSync(work).filter((f) => /^classes\d*\.dex$/.test(f));
        if (!dexes.length) throw new Error("no dex files in the APK at all");
        const defined = new Set();
        for (const dex of dexes) {
            const out = execFileSync(dexdump, ["-f", path.join(work, dex)], {
                encoding: "latin1", maxBuffer: 1024 * 1024 * 512,
            });
            for (const m of out.matchAll(/Class descriptor\s*:\s*'([^']+)'/g)) defined.add(m[1]);
        }
        const missing = MUST_DEFINE.filter((c) => !defined.has(c));
        if (missing.length) {
            throw new Error(`REFUSING TO PUBLISH -- this APK is missing ${missing.length} class(es) it needs `
                + `at launch:\n  ${missing.join("\n  ")}\n`
                + `${dexes.length} dex files, ${defined.size} classes defined. This is what shipped as `
                + `v1.0.709 and took the ledger down for a day. Run: ./gradlew clean assembleFullDebug`);
        }
        console.log(`  verified: ${dexes.length} dex files, ${defined.size} classes, all ${MUST_DEFINE.length} required ones defined`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

// ── ⚠️ AND REFUSE A BUILD THAT SUDDENLY GOT SMALLER ─────────────────────────────────────────────────────────
// The class check above only catches classes somebody thought to list. The thing that would have caught the
// v1.0.709 outage with no foresight at all is far dumber: the broken APK was 100.4MB and the release before
// it was 111.3MB. Nearly eleven megabytes of dex went missing and every other signal stayed green.
//
// So the last good release for this channel is the baseline, and a sudden shrink is treated as a damaged
// build until a human says otherwise. This generalises past the MUST_DEFINE list: a future incremental
// build that drops some OTHER library's classes trips this without anybody having predicted which.
//
// ⚠️ A SHRINK CAN ALSO BE LEGITIMATE -- turning on minification, or finally shipping a release variant,
// should make the APK much smaller. That is what --allow-shrink is for. It must be a deliberate word typed
// by a person, because the whole failure mode here is a build quietly losing content.
const SHRINK_TOLERANCE = 0.05;

async function verifySize(pool, channel, sizeBytes, allowShrink) {
    const { rows } = await pool.query(
        "SELECT version_name, size_bytes FROM app_release WHERE channel = $1 AND size_bytes > 0 "
        + "ORDER BY created_at DESC LIMIT 1", [channel],
    );
    const last = rows[0];
    if (!last) { console.log("  size: no previous release on this channel to compare against"); return; }
    const prev = Number(last.size_bytes);
    const drop = (prev - sizeBytes) / prev;
    const pct = (drop * 100).toFixed(1);
    if (drop <= SHRINK_TOLERANCE) {
        console.log(`  size: ${(sizeBytes / 1e6).toFixed(1)}MB vs ${(prev / 1e6).toFixed(1)}MB in ${last.version_name} `
            + `(${drop > 0 ? `-${pct}%` : `+${(-drop * 100).toFixed(1)}%`}) -- fine`);
        return;
    }
    if (allowShrink) {
        console.log(`  size: ${pct}% SMALLER than ${last.version_name} -- allowed by --allow-shrink`);
        return;
    }
    throw new Error(`REFUSING TO PUBLISH -- this APK is ${pct}% smaller than ${last.version_name} `
        + `(${(sizeBytes / 1e6).toFixed(1)}MB vs ${(prev / 1e6).toFixed(1)}MB).\n`
        + `A build that loses content usually still compiles, assembles and installs -- that is exactly how `
        + `v1.0.709 shipped missing eight dex files and took the ledger down for a day.\n`
        + `Run: ./gradlew clean assembleFullDebug   (plain assemble will report UP-TO-DATE and do nothing)\n`
        + `If the shrink is deliberate (minification, a release variant), re-run with --allow-shrink`);
}

/** Is this artifact older than the code it is supposed to contain? */
function warnIfStale(apkPath) {
    // ⚠️ GRADLE WILL TELL YOU A BROKEN ARTIFACT IS UP-TO-DATE. During the v1.0.709 outage
    // `./gradlew assembleFullDebug` did nothing at all and reported success, because Gradle's view of the
    // task was satisfied while the APK itself was missing content. The only thing that regenerated it was
    // `clean`. So publishing an APK older than the newest source file is worth saying out loud.
    try {
        const srcDir = path.resolve("../accounting_app/app/src");
        if (!fs.existsSync(srcDir)) return;
        const apkTime = fs.statSync(apkPath).mtimeMs;
        let newest = 0;
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else newest = Math.max(newest, fs.statSync(full).mtimeMs);
            }
        };
        walk(srcDir);
        if (newest > apkTime) {
            const hrs = ((newest - apkTime) / 3600000).toFixed(1);
            console.log(`  ⚠️  WARNING: this APK is ${hrs}h OLDER than the newest source file. `
                + `Gradle reports UP-TO-DATE even when the artifact is damaged -- run a clean build.`);
        }
    } catch { /* a stale-check that throws must never block a publish */ }
}

function parseArgs(argv) {
    const args = { variant: "debug" };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === "--apk") args.apk = argv[++i];
        else if (a === "--variant") args.variant = argv[++i];
        else if (a === "--flavor") args.flavor = argv[++i];
        else if (a === "--app") args.app = argv[++i];
        else if (a === "--notes") args.notes = argv[++i];
        else if (a === "--allow-shrink") args.allowShrink = true;
        // ⚠️ SO THE GATE ITSELF CAN BE TESTED. Everything up to and including verification runs; nothing
        // is uploaded and no row is written. Without this the only way to exercise the preflight was to
        // actually publish, which is why a ReferenceError inside it survived two commits.
        else if (a === "--dry-run") args.dryRun = true;
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

    // If --apk points inside a flavor directory, that flavor WINS over the default.
    //
    // This bit me: `--apk .../apk/employee/debug/app-employee-debug.apk` with no --flavor uploaded the employee
    // APK, but read its version from apk/full/'s metadata and recorded it on the FULL channel — so owner
    // devices were briefly offered the staff build. --apk chose the file and --flavor chose everything else,
    // and nothing checked that they agreed.
    const fromPath = !isMarket && args.apk
        ? (String(args.apk).split(path.sep).join("/").match(/\/apk\/([^/]+)\//) || [])[1] || null
        : null;
    if (fromPath && args.flavor && fromPath !== args.flavor) {
        console.error(`--apk is a ${fromPath} build but --flavor says ${args.flavor}. Refusing to guess.`);
        process.exit(1);
    }
    const flavor = args.flavor || fromPath || (isMarket ? "" : "full");
    const channel = isMarket ? "marketplace" : flavor;
    const blobPrefix = isMarket ? "wolfdenmarket" : `wolfdenledger-${flavor}`;
    // Metadata comes from beside the APK WE ARE ACTUALLY UPLOADING when one was named — reading it from the
    // default directory is how a 605 employee build got published as full 604.
    const apkDir = args.apk
        ? path.dirname(path.resolve(args.apk))
        : isMarket
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
    // ⚠️ THE LAST MOMENT THIS CAN BE CAUGHT. Everything upstream of here -- compile, assemble,
    // install, file size -- was green for the APK that took the ledger down. See verifyApk.
    verifyApk(apkPath);
    warnIfStale(apkPath);

    // ⚠️ THE SIZE CHECK NEEDS THE DATABASE, SO THE POOL IS OPENED HERE RATHER THAN AFTER THE UPLOAD. Doing
    // it the other way round would mean a damaged APK is already sitting in blob storage by the time it is
    // refused -- and the next thing to read that store would serve it.
    const guardPool = new Pool({ connectionString: dbUrl });
    try {
        await verifySize(guardPool, channel, sizeBytes, Boolean(args.allowShrink));
    } finally {
        await guardPool.end();
    }

    if (args.dryRun) {
        console.log("--dry-run: verification passed, stopping before upload");
        return;
    }

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
