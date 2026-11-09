#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// RUN ONE BLENDER SCRIPT, FROM ANY SHELL.
//
// ⚠️ THE NPM SCRIPTS USED TO INVOKE BLENDER BY PATH, AND THAT ONLY WORKED
//    FROM POWERSHELL. "C:/Program Files/..." carries a space, so the
//    package.json entry needed embedded quotes, and whether those survive
//    depends on which shell npm hands the string to. From Git Bash the same
//    `npm run lp:make` that works in a PowerShell terminal dies with
//
//        'C:/Program' is not recognized as an internal or external command
//
//    which reads as a broken Blender install rather than as a quoting
//    accident. `lp:done` never had the problem because it is a node script
//    that spawns Blender with an ARGUMENT ARRAY -- no shell, nothing to
//    quote. So every lp: script goes through here and does the same.
//
//     node scripts/lowpoly/harness/run.mjs <script.py>
// ─────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const BLENDER = "C:/Program Files/Blender Foundation/Blender 4.4/blender.exe";
export const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

export function blender(script, env = {}) {
    if (!existsSync(BLENDER)) {
        console.error(`\nBlender is not at ${BLENDER}. Nothing can be built or verified.`);
        process.exit(1);
    }
    // --online-mode: required for add-ons that check for updates on load, and
    // the glTF exporter is one of them.
    return spawnSync(BLENDER, ["-b", "--online-mode", "-P", script], {
        cwd: ROOT,
        env: { ...process.env, ...env },
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
}

// Run directly (not imported): stream the output and pass the exit code on.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    const script = process.argv[2];
    if (!script) {
        console.error("usage: node scripts/lowpoly/harness/run.mjs <script.py>");
        process.exit(1);
    }
    const r = blender(script);
    if (r.error) {
        console.error(r.error.message);
        process.exit(1);
    }
    // Blender is extremely chatty on stdout; the lines worth reading all start
    // with a word in capitals, and anything that failed is on stderr anyway.
    const out = `${r.stdout || ""}`;
    const keep = out.split(/\r?\n/).filter((l) => /^[A-Z]{3,}|^ {2}\w|^selftest|Error|Traceback/.test(l));
    console.log(keep.length ? keep.join("\n") : out.split(/\r?\n/).slice(-20).join("\n"));
    if (r.stderr && r.status !== 0) console.error(r.stderr.split(/\r?\n/).slice(-20).join("\n"));
    process.exit(r.status ?? 1);
}
