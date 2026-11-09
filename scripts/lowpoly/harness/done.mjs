#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// THE DEFINITION OF DONE, AS A COMMAND.
//
// Luke, 2026-11-05: "I don't want my 3D art pipeline to hand me problems.
// I want it to hand me art."
//
// Carried over from the pipeline this one replaced, unchanged in substance,
// because the rule is the part of that pipeline that was working. It was
// written as prose in a memory note first, read, and violated by noon the
// same day. Prose did not hold. Code did.
//
// So "done" is not a judgement. It is this script: build, gate, film, print
// the files to send. If it has not run and passed, the work is not finished
// and you do not report.
//
//     npm run lp:done              # every model
//     MODEL=player npm run lp:done # one
// ─────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const BLENDER = "C:/Program Files/Blender Foundation/Blender 4.4/blender.exe";
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const FILM = path.join(ROOT, "scripts", "lowpoly", "_film");
const MODEL = process.env.MODEL || "all";

if (!existsSync(BLENDER)) {
  console.error(`\nBlender is not at ${BLENDER}. Nothing can be verified.`);
  process.exit(1);
}

function blender(script, label) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
  const r = spawnSync(BLENDER, ["-b", "--online-mode", "-P", script], {
    cwd: ROOT,
    env: { ...process.env, MODEL },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) {
    console.error(r.error.message);
    return { ok: false, out: "" };
  }
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const show = (out, re) =>
  console.log(out.split(/\r?\n/).filter((l) => re.test(l)).join("\n"));

// ── 1. BUILD ─────────────────────────────────────────────────────────────
// The glb is rebuilt every time, because everything downstream reads the
// glb and a stale one is the oldest trap in this repo: four rounds of a
// previous bug went on inspecting a file that was being written elsewhere.
const made = blender("scripts/lowpoly/make.py", "make");
if (!made.ok) {
  console.log(made.out.split(/\r?\n/).slice(-25).join("\n"));
  console.log("\nNOT DONE — the model did not build.");
  process.exit(1);
}
show(made.out, /^BUILT|^MANIFEST|^DROPPED/);

// ── 2. THE GATE ──────────────────────────────────────────────────────────
const gate = blender("scripts/lowpoly/harness/gate.py", "gate");
const verdict = gate.out.split(/\r?\n/)
  .find((l) => l.startsWith("GATE PASSED") || l.startsWith("GATE FAILED"));
if (!gate.ok || !verdict?.startsWith("GATE PASSED")) {
  show(gate.out, /FAIL|SELFTEST|^ {2}\w|^ {11}/);
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOT DONE — the gate failed.

Each line above names the model, the check, and the measurement. The gate
reads the EXPORTED glb, so a failure is in the thing that ships.
LOOK AT THE RENDER before theorising about the cause:
  ${path.join(FILM, "<model>_az34.png")}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  process.exit(1);
}
console.log(gate.out.split(/\r?\n/).filter((l) => /^ {2}\w|^selftest/.test(l))
  .join("\n"));
console.log(verdict);

// ── 3. THE DELIVERABLE ───────────────────────────────────────────────────
const film = blender("scripts/lowpoly/harness/film.py", "film");
if (!film.ok) {
  console.log(film.out.split(/\r?\n/).slice(-25).join("\n"));
  console.log("\nNOT DONE — the gate passed but nothing was filmed.");
  process.exit(1);
}

const fresh = (f) => Date.now() - statSync(f).mtimeMs < 30 * 60 * 1000;
const films = existsSync(FILM)
  ? readdirSync(FILM)
      .filter((f) => f.endsWith(".mp4") || f.startsWith("lineup_"))
      .map((f) => path.join(FILM, f))
      .filter(fresh)
      .sort()
  : [];

// ── 4. WHAT TO SEND, AND WHEN TO STOP ────────────────────────────────────
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DONE — ${verdict.replace("GATE PASSED — ", "")}

SEND THESE. A reply with no artefact in it has delivered nothing. The
line-up is not optional: it is the only file that shows SCALE, and scale
is the error that every solo render hides.
${films.length ? films.map((v) => `   ${v}`).join("\n") : "   ⚠️ nothing was filmed — do not report done"}

🛑 THE UNIT OF WORK IS ONE ASSET, DELIVERED. You are now finished.
   A defect you notice from here goes on a LIST in your reply.
   It does NOT start a new fix.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
process.exit(films.length ? 0 : 1);
