# 🛑 THIS PIPELINE HANDS LUKE ART. IT DOES NOT HAND HIM PROBLEMS.

Luke, 2026-11-05: *"I don't want my 3D art pipeline to hand me problems. I want it to hand me art."*

**Handing work back for him to review IS the failure.** Not a style issue — the failure.

This file is inherited, deliberately, from the pipeline this one replaced. On 2026-11-09 Luke
said *"I want to go to ground. Reset it all"* and the MPFB hero, the 109-bone dragon, the clip
mixer, the IK walk and 6,500 lines of Python were deleted (recoverable at `d43ab304`). **The
rules were not reset, because the rules were the part that worked.** What failed was the
ambition: a bought human body with a generated skeleton is a machine for producing bug reports,
and six hours of it produced exactly one.

## The definition of done is a command, not a judgement

    npm run lp:done              # every model
    MODEL=player npm run lp:done # one

It builds the glb, runs the gate, films the deliverable, and prints the files to send. **If it
has not run and passed, the work is not finished and you do not report.** When it is green,
send the video and the line-up, and stop.

## 🛑 The stopping rule

**The unit of work is ONE ASSET, DELIVERED.** When `lp:done` is green, ship it and stop.

A defect you notice after that goes on a list in your reply. **It does not start a new fix.**

This is the actual failure mode, and it is not a knowledge problem — every individual step is
locally justified, which is exactly why nothing stops it. On 2026-11-06 the harness was built
and working within an hour; the next several hours went on curl signs, curl ranges, shaft
seats, grip positions, roll constants and pole weights, each one found by fixing the last. The
session's output was a bug report. That is the thing this file forbids.

## What "art, not problems" does and does not mean

It does **not** mean hide defects. It means:

| | |
|---|---|
| ✅ | Fix it, then show the **fixed artefact** — the video, the render |
| ✅ | The bug is a footnote under the picture, one or two lines |
| ❌ | A list of defects, near-misses and measurements as the deliverable |
| ❌ | Three consecutive replies that are mostly prose about what was wrong |

If your reply has no artefact in it, you have not delivered anything.

## The order

    1. npm run lp:film     LOOK AT IT. The turntable, then the line-up.
    2. (author / fix)      in the model file, in metres
    3. npm run lp:gate     numbers, last — and it self-tests before it judges
    4. npm run lp:done     all three, and it prints what to send

Running 3 before 1 is how the old pipeline shipped a shredded fist through six clips with
every check green. **The first line-up of the new set came back washed white and the gate was
perfectly happy with it** — colour is not something the gate measures, and that is the point:
numbers do not replace looking, they catch what looking cannot.

## 🛑 A number is only evidence if it measures the thing that SHIPS

Burned three times in one day in the old pipeline, and once more on the first run of this one:

- `make.py` writes the glb; `gate.py` and `film.py` **import that glb**. Neither has any
  model-building code in it. There is no way for them to measure a scene the exporter then
  changes, which is what happened twice before.
- The gate's first `FLAT` check read `polygon.use_smooth`. It failed the tree on 6 faces whose
  normals deviate by **0.00°**, and the render was flat. The flag was not the shading. Rewritten
  to measure the angle between each vertex normal and its own face — what three.js shades with —
  the *same run* found the rock genuinely 29° out on 36 faces, a real defect that the flag, the
  render and my own eye had all missed.

**Before trusting a measurement: does it read the exported glb, and does a known-bad control
score worse than a known-good one?** `gate.py` answers the second one out loud on every run —
it pushes four deliberately-broken meshes through its own checks and refuses to judge anything
if they pass. A gate that cannot discriminate is worse than no gate, because it reads as
evidence.

## 🛑 The style is `style.py`, and it is countable

"Very simple" is not an adjective here. It is a triangle budget per kind, a palette, a material
ceiling and a height per scale class — and the gate enforces every one against the glb.

**Tune with countable limits, never adjectives.** If a model looks too detailed, the budget is
wrong and it changes in `style.py`, where every model moves with it. Do not add a colour to
`PALETTE` to make one model work; that is how a flat-colour set stops being a set.

## 🛑 Scale is checked against the player, and the line-up is part of the deliverable

Every model rendered alone fills its own frame and therefore looks correctly sized. `film.py`
always writes `lineup_az*.png` with the whole set on one floor beside the player, even when you
filmed one model — a scale check of one object against nothing is not a check.
