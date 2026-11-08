import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ═══════════════════════════════════════════════════════════════════════════
// DONE — the hero model's definition of finished, as a command.
//
// The anim pipeline learned this the hard way and wrote it into its own
// CLAUDE.md: "the definition of done is a command, not a judgement". The
// same applies here and more so, because the thing being judged is a human
// figure and I cannot judge one by eye -- three rounds of this build went
// on a nose that was the right size.
//
//     npm run hero:done
//
// It runs the canon audit, both deformation tests, and the render sheets,
// and tells you plainly whether the figure is shippable. If it has not run
// and passed, the work is not finished and there is nothing to report.
//
// ⚠️ npm CANNOT RUN BLENDER DIRECTLY ON THIS MACHINE. "C:/Program Files/..."
// inside a package.json script is handed to cmd, which splits it at the
// space and reports 'C:/Program' is not recognized -- silently, after
// printing the command it was about to run, so it looks like it worked.
// Every anim:* script in this repo has the same latent bug. Spawning from
// node passes the path as one argument and the problem disappears.
// ═══════════════════════════════════════════════════════════════════════════

const BLENDER = "C:/Program Files/Blender Foundation/Blender 4.4/blender.exe";
// ⚠️ fileURLToPath, NOT .pathname. This repo's directory has a space in
// it, and a file:// URL percent-encodes it -- the raw pathname came out as
// "wolf%20den%20site" and every step reported the script missing.
const HERE = path.dirname(fileURLToPath(import.meta.url));

const STEPS = [
  ["audit", "audit.py", [], /AUDIT_CLEAN/, /AUDIT_FAIL/],
  ["discrimination", "audit.py", ["--", "--selftest"], /every check discriminates/, /cannot detect/],
  ["shoulder", "test_raise.py", [], /TEST_OK/, /Traceback/],
  ["grip", "test_grip.py", [], /GRIP_OK/, /CURLED AWAY|OFF AXIS/],
  ["renders", "body.py", [], /LOOK_OK/, /Traceback/],
];

if (!existsSync(BLENDER)) {
  console.error(`\n  Blender is not at ${BLENDER}\n`);
  process.exit(2);
}

let failed = [];
for (const [label, script, extra, pass, fail] of STEPS) {
  process.stdout.write(`  ${label.padEnd(16)}`);
  const r = spawnSync(BLENDER, ["-b", "--online-mode", "-P",
                                path.join(HERE, script), ...extra],
                      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const ok = pass.test(out) && !fail.test(out);
  console.log(ok ? "ok" : "FAILED");
  if (!ok) {
    failed.push(label);
    const lines = out.split("\n").filter((l) => /\*\*|FAIL|Error|Traceback|BLIND/.test(l));
    for (const l of lines.slice(0, 14)) console.log(`      ${l.trim()}`);
  }
}

console.log("");
if (failed.length) {
  console.log(`  NOT DONE -- ${failed.join(", ")}\n`);
  process.exit(1);
}
console.log("  The figure passes the canon, deforms correctly, and renders.");
console.log("  Send these:");
for (const f of ["body_az34.png", "head_az0.png", "head_az90.png",
                 "hand_az125.png", "foot_az35.png"]) {
  console.log(`    scripts/hero/_look/${f}`);
}
console.log("\n  Now stop. A defect you notice after this goes on a list.\n");
