# 🛑 THIS PIPELINE HANDS LUKE ART. IT DOES NOT HAND HIM PROBLEMS.

Luke, 2026-11-05: *"I don't want my 3D art pipeline to hand me problems. I want it to hand me art."*

**Handing work back for him to review IS the failure.** Not a style issue — the failure.

This file exists because that sentence lived in a memory note, was read at the start of
2026-11-06, and was violated by noon the same day. Prose did not hold. The rules that held
were the ones enforced by code. So:

## The definition of done is a command, not a judgement

    npm run anim:done            # Mine
    CLIP=all npm run anim:done

It runs the gate, films the deliverable, and prints the files to send. **If it has not run and
passed, the work is not finished and you do not report.** When it is green, you are done: send
the video and stop.

## 🛑 The stopping rule

**The unit of work is ONE ASSET, DELIVERED.** When `anim:done` is green, ship it and stop.

A defect you notice after that goes on a list in your reply. **It does not start a new fix.**

This is the actual failure mode, and it is not a knowledge problem — every individual step is
locally justified, which is exactly why nothing stops it. On 2026-11-06 the harness was built
and working within an hour; the next several hours went on curl signs, curl ranges, shaft
seats, grip positions, roll constants and pole weights, each one found by fixing the last. The
session's output was a bug report. That is the thing this file forbids.

## What "art, not problems" does and does not mean

It does **not** mean hide defects. The shredded fist shipped in all six clips and he needed to
know. It means:

| | |
|---|---|
| ✅ | Fix it, then show the **fixed artefact** — the video, the render |
| ✅ | The bug is a footnote under the picture, one or two lines |
| ❌ | A list of defects, near-misses and measurements as the deliverable |
| ❌ | Three consecutive replies that are mostly prose about what was wrong |

If your reply has no artefact in it, you have not delivered anything.

## The order (harness/README.md has the detail)

    1. npm run anim:film      LOOK AT IT. Video first, zoom second.
    2. (author / fix)         in a frame where the defect is not expressible
    3. search.py              SWEEP the free parameters. Never pick them.
    4. npm run anim:qa        numbers, last — and only probes with a control

Running 4 before 1 is how a shredded fist shipped through six clips with every check green.

## 🛑 A number is only evidence if it measures the thing that SHIPS

Burned three times in one day, twice in the same file:

- `_roll.py` swept a rig with no forearm twist joint and no armour, and its answer was baked
  into `clips.py` as a constant.
- Fixed to build all four stages, it **still** disagreed with `qa.py` by 30° — because
  `export-all.py` bakes five clips before Mine is keyed. Use `harness/_rollq.py`, which runs
  the real exporter.
- A twist metric written in five minutes read 125–179° on poses `qa.py` scores at 60.
  `qa.py` already had a correct one with a comment explaining that exact axis flip.

**Before trusting a measurement: does it run the real exporter, and does a known-good control
score better than a known-bad one in the pose under test?**
