#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// THE DEFINITION OF DONE, AS A COMMAND.
//
// Luke, 2026-11-05: "I don't want my 3D art pipeline to hand me problems.
// I want it to hand me art."
//
// That sentence lived in a memory note, was read at the start of 2026-11-06,
// and was violated by noon the same day: the session built the harness in an
// hour and then spent several more producing a bug report. Prose did not
// hold. The rules that held were the ones enforced by code.
//
// So "done" is not a judgement any more. It is this script. It runs the
// gate, films the deliverable, and prints the files to send. If it has not
// run and passed, the work is not finished and you do not report.
//
//     npm run anim:done            # Mine
//     CLIP=all npm run anim:done
// ─────────────────────────────────────────────────────────────────────────
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const BLENDER = "C:/Program Files/Blender Foundation/Blender 4.4/blender.exe";
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const FILM = path.join(ROOT, "scripts", "anim", "_film");
const CLIP = process.env.CLIP || "Mine";

if (!existsSync(BLENDER)) {
  console.error(`\nBlender is not at ${BLENDER}. Nothing can be verified.`);
  process.exit(1);
}

function blender(script, env, label) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
  const r = spawnSync(BLENDER, ["-b", "--online-mode", "-P", script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) {
    console.error(r.error.message);
    return { ok: false, out: "" };
  }
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}` };
}

// ── 1. THE GATE ──────────────────────────────────────────────────────────
const qa = blender("scripts/anim/qa.py", { QA_SHEETS: "1" }, "qa");
const qaLines = qa.out.split(/\r?\n/);
const verdict = qaLines.find((l) => l.startsWith("QA PASSED") || l.startsWith("QA FAILED"));
const passed = Boolean(verdict && verdict.startsWith("QA PASSED"));

if (!passed) {
  console.log(qaLines.filter((l) => /FAIL|QA FAILED|SHEETS|x4 angles/.test(l)).join("\n"));
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOT DONE — the gate failed.

QA_SHEETS wrote magnified four-angle renders of every failing frame to
  ${path.join(ROOT, "scripts", "anim", "_qa")}
LOOK AT THEM before theorising about the cause.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  process.exit(1);
}
console.log(verdict);

// ── 2. THE DELIVERABLE ───────────────────────────────────────────────────
const film = blender("scripts/anim/harness/film.py", { FILM_CLIP: CLIP }, "film");
if (!film.ok) {
  console.log(film.out.split(/\r?\n/).slice(-25).join("\n"));
  console.log("\nNOT DONE — the gate passed but nothing was filmed.");
  process.exit(1);
}
console.log(film.out.split(/\r?\n/).filter((l) => /VIDEO|ZOOM/.test(l)).join("\n"));

const videos = existsSync(FILM)
  ? readdirSync(FILM)
      .filter((f) => f.endsWith(".mp4"))
      .map((f) => path.join(FILM, f))
      .filter((f) => Date.now() - statSync(f).mtimeMs < 30 * 60 * 1000)
  : [];

// ── 3. WHAT TO SEND, AND WHEN TO STOP ────────────────────────────────────
console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DONE — ${verdict.replace("QA PASSED — ", "")}

SEND THESE. A reply with no artefact in it has delivered nothing:
${videos.length ? videos.map((v) => `   ${v}`).join("\n") : "   ⚠️ no video was produced — do not report done"}

🛑 THE UNIT OF WORK IS ONE ASSET, DELIVERED. You are now finished.
   A defect you notice from here goes on a LIST in your reply.
   It does NOT start a new fix. That is how 2026-11-06 turned an hour
   of harness work into a day of bug reports.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
process.exit(videos.length ? 0 : 1);
