# The harness

> "I don't want my 3D art pipeline to hand me problems. I want it to hand me
> art." — Luke, 2026-11-05

Everything in here is one of two things: a step I skipped, or a number I
believed without checking. It is an **order of operations**, not advice —
advice did not survive contact with a task (the pickaxe swing took hours and
arrived bad with all of this already written down as prose), and an order of
operations does, because skipping a step is visible.

## The order

```
1.  npm run anim:film          LOOK AT IT. Video first, zoom second.
2.  (author / fix)             in a frame where the defect is not expressible
3.  search.py                  SWEEP the free parameters. Never pick them.
4.  npm run anim:qa            numbers, last — and only probes with a control
```

Running 4 before 1 is how a shredded fist shipped in `hero.glb` through six
clips with every check green.

## 1. `film.py` — the deliverable is the first artefact

```
npm run anim:film                                   # Mine, video + 6 zooms
FILM_CLIP=all FILM_VIDEO=0 FILM_REGIONS=grip npm run anim:film
FILM_CLIP=Idle FILM_FRAMES=1,18,24 FILM_AZ=all npm run anim:film
```

Writes to `scripts/anim/_film/` (gitignored), two kinds of thing for two
different readers:

| | |
|---|---|
| `<Clip>_az34.mp4` | **The deliverable.** Looping, full figure, 24fps. For Luke. |
| `<Clip>/<region>_f##_az##.png` | **The instrument.** Magnified, four angles. For me. |

**An animation is a video.** There was no video step in this pipeline at all
until 2026-11-06, which is why a swing could be wrong for hours while every
still looked plausible. "He's juggling it", "now he's holding it behind his
back", "it looks like an umbrella" — three defects Luke named, none of them
visible in a frame.

**And I cannot read 3D art at composition scale.** A 640px full body puts the
hands at twenty pixels; at that size I called a hand growing out of a man's
abdomen *"both hands on the haft, looks fine"*. Every single time I magnified
I found the truth in seconds — I just never did it unprompted. So the harness
does it unprompted, every run, at four azimuths, because one angle cannot
separate absent geometry from occluded geometry.

Regions are defined in `shot.py` and each one is a defect I missed, not a body
part: `grip`, `hand_l`, `hand_r`, `head`, `shoulders`, `feet`, `body`.

⚠️ **No contact sheets, deliberately.** A tiled sheet is for comparing
options. Every time I judged *correctness* from a 230px cell in an 8-wide
grid I was confidently wrong. One file per look, full size.

⚠️ **It films the EXPORTED scene**, not the authoring one — `export-all.py`
runs first, so IK is baked, constraints are gone and helpers are deleted.
Three defects in a row were invisible from the source scene.

## 2. Author where the defect cannot be expressed

A character on a floor is a **posing** problem: put the thing where you want
it, nothing argues back. A character *holding* something is a **constraint**
problem — the point must reach the ground, the haft must miss the body, both
fists must stay on one shaft, and the arms have a reach limit. Four
relationships that fight.

Hand-solving a constraint system one number at a time is a **stuck state**,
and it sustains itself: every fix satisfies the constraint you are looking at
and breaks one you are not. Luke gave six pieces of correct feedback on the
pickaxe and every one moved the defect somewhere else.

The move that works is to author in a frame where violations are **not
writable**. `key_mine` in `clips.py` is the worked example: reach became a
fraction of arm length (capped), elevation an angle about the shoulder in the
body's own sagittal plane (bounded, so "behind his back" cannot be typed), and
the haft's angle is relative to the *arm*, so it cannot windmill into the
torso. Three of four constraints stopped existing, leaving one equation and
one unknown — how far he bends — for `search.bisect`.

⚠️ **Two failed fixes of the same symptom means the premise is wrong.** The
off hand's target was adjusted six times; the target was never the problem.
The hand was *chasing* the tool instead of being parented to it, which is what
Luke said in his first message.

## 3. `search.py` — a gate says it's wrong, a sweep says what's right

`npm run anim:search` runs its self-test. Pure Python, no bpy.

```python
import search
r = search.refine("roll", 0, 360, lambda d: worst_wrist(d), report=True)
pole = search.Tracked("pole_l", weight=0.01)      # memory across frames
hip  = search.bisect("hip", tip_height, -0.55, 0.0)
```

| | |
|---|---|
| `sweep` / `refine` | score every value, keep the cheapest, **keep the table** |
| `Tracked` | the same, plus a memory of last frame's choice |
| `bisect` | one equation, one unknown — and it **refuses** a bracket with no sign change |
| `discriminates` | does this probe separate known-good from known-bad? |
| `threshold_between` | the honest limit: above every good case, below every bad one |

Every sweep returns its **whole table**, because a winning number with no
neighbours is unfalsifiable — you cannot see whether the minimum is a basin or
a spike on noise. `Result.report()` prints the best few, the worst for
contrast, and shouts if the table is **flat** (that parameter is not connected
to that cost; do not tune it there).

⚠️ **`Tracked` exists for one bug.** Each frame of Mine used to pick its own
minimum-cost elbow pole with no reference to the frame before, so two adjacent
frames could land on opposite sides of the arm and the shoulder snapped
through a half turn between them. That was f12: hands crossing the face, 179°
of upperarm twist, in the middle of a clean lift. A per-frame optimum is not a
trajectory — continuity is part of the cost. The self-test reproduces the flip
and then shows the memory holding one side through it.

⚠️ **Turn Luke's words into a sweep.** Every time he described a defect
physically he was naming a parameter. *"It looks like you've overspun the
pickaxe and it's causing his hands to twist"* → sweep the roll → it was
overspun by 50°, wrists 83 → 52, settled in ninety seconds.

## 4. `qa.py` — numbers, and only ones with a control

⚠️ **A metric you have not validated is not evidence. It is a confident way
to be wrong.** This has cost more time than any bug here:

- a hand-in-torso check that modelled the torso as a cylinder of one global
  radius (the shoulders), so a hand at belly height read as 0.2 *inside*. Two
  rounds of animation were tuned against it and the wrist got **worse**
- the next version read the normal of an **open boundary** and called a hand
  0.085 deep in the chest when it was 0.46 away, overhead and to the side.
  Frames 13–20 were re-posed to satisfy it at a cost of 4° of wrist, then
  reverted
- ten assertions on a walk cycle, all green, all measuring the **skeleton** —
  while the body deformed wrongly because the rig sat 0.8m below the mesh.
  That green was used to argue Luke out of what was on his screen

The fix is not care, it is **discrimination**, run before the metric is
believed once: `search.discriminates` makes the probe pass every case known to
look right and fail every one known to look wrong. A control that is correct
*by construction* exposed a broken probe in one run, after twelve iterations
of trusting it.

And thresholds come from **assets that look right**, never a textbook.
`_wrist.py` said "a wrist does about 70" and passed a clip at 69 that visibly
tears; a clean clip runs 57–60. Linear blend skinning shears long before a
joint reaches its anatomical limit.

`kit.py` holds what each clip is holding. ⚠️ It is **imported, never copied** —
it used to live inside `qa.py`, so everything else that photographed a clip
rendered the wrong loadout by default.

## What this does not have

**Gates.** There were three; they were cut the day they were written. See the
parent `README.md`. `qa.py` survived because it measures the *mesh* and prints
numbers that answer questions, not because a gate is good.

A green gate over a broken deliverable is worse than no gate — it manufactures
confidence and points it the wrong way. On 2026-11-06 `qa.py` said **PASSED —
every clip inside every limit** while the hero's closed fist was shredded in
all six. Step 1 found it in one run.
