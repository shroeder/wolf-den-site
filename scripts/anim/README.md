# Character animation pipeline

Run with Blender headless:

    "C:\Program Files\Blender Foundation\Blender 4.4\blender.exe" -b -P <script>

Both characters land in `/marketplace/model-lab` (owner only), which has a
model switcher, clip buttons and a blend-duration control.

## The hero — a bought body, fitted

| | |
|---|---|
| `assets/hero-base.blend` | **The hero.** Rigged, fitted, stripped, materialled. The only character asset. |
| `freeze-hero.py` | Regenerates that asset from MPFB. **The only script allowed to touch MPFB.** |
| `build-walk.py` | Loads the asset, builds the walk on IK. Generates nothing. |
| `build-brace.py` | The shield guard, on the same rig. |
| `clips.py` | Idle and Impact, keyed against a rig that already exists. |
| `export-all.py` | Bakes IK to bone keys, writes `public/models/hero.glb`. |
| `debug-rig.py` | **Not a gate.** A debugger, for when the body does not match the skeleton. |

## The dragon — a body generated from its own skeleton

The hero's worst day came from a bind mismatch: MPFB fitted its rig to
`base.obj` rather than to the character, so every joint sat a hip-height from
the flesh it drove, and nothing said so. The dragon is built so that failure
is **not expressible** — one joint graph `(J, E)` produces both the mesh (via
the Skin modifier) and the skeleton, so a bone is inside its limb by
construction.

| | |
|---|---|
| `build-dragon.py` | The joint graph, the Skin inflation, and the wing membranes. Geometry only. |
| `rig-dragon.py` | Collapses to one mesh, builds the 109-bone armature from the same graph, computes weights. |
| `anim-dragon.py` | Fly, Idle, Roar. **No rotation sign is typed** — every axis is probed. |
| `export-dragon.py` | Decimates and writes `public/models/dragon.glb`. |
| `_dshot.py` / `_dfilm.py` | Photograph the model, or a few frames of one clip. |
| `_dtrack.py` | Prints where the wingtips actually go, per frame. |

### What the Skin modifier is and is not for

It was the **wrong** tool for a human: the anatomy is fixed and a pre-made rig
has to match it. It is the **right** tool for a creature that genuinely is a
branching tube — neck, body, tail, four legs, two wings.

Three things it will do quietly:

1. **A zero-length edge is not bridged.** Starting a new chain at the same
   coordinates as the previous one's end emits two separate shells. The head
   floated in front of the neck as its own lump. Hence `chain(start=…)`.
2. **It inflates joints that are too close together into a knot.** The torso
   first sat at z=1.0 with a 0.48 radius, leaving the hind leg half a unit to
   fit a forward knee and a backward hock into. It did not error; the leg came
   out a pretzel.
3. **It cannot make a sail.** Every edge becomes a tube, so the wing membrane
   is a separate parametric surface. Do not fill its outline either — the
   silhouette loop spans a unit of height, so the n-gon is wildly non-planar
   and triangulating it gives folded sheet metal with holes. Evaluate panels
   over `(u, v)` instead; then a crease is not expressible either.

### Weights are computed, not solved

Bone-heat is a diffusion solve over the surface. It beats this when it
converges, and it says `failed to find solution for one or more bones` when it
does not — which it will on a membrane that is a separate 0.03-thick shell.
Distance to the bone **segment**, inverse-cubed over the nearest four, has no
failure mode, and with a graph this sparse it is accurate.

## There are no gates here, on purpose

There were three. They were cut the day they were written.

`check-walk.py` ran ten numeric assertions on the motion and went GREEN on a
visibly broken walk for hours — because every assertion measured the
skeleton, and the skeleton was fine. It did not merely fail to help; it
manufactured confidence and argued against what was on screen.

Every real defect in this pipeline — helper geometry in the export, a rig
that missed its own body, a chest lit to look female, a dragon's hind leg tied
in a knot — was found by **opening the lab and looking at it**.

So: fix the bug, do not also build a detector for it.

But there is a difference between a gate and a **reading**, and the dragon
leaned on readings hard. "Too far down" was my verdict on the wingtips three
times running and it never once told me how far; `_dtrack.py` printed −0.79
and the fix took one attempt. A number that answers a question you asked is
worth having. A number that stands between you and the deliverable is not.

## The things that bite

1. **MPFB fits the rig to `base.obj`, not to your character.** Without the
   refit in `freeze-hero.py` every joint sits a hip-height below its limb.
2. **The MASK modifier only hides helper geometry.** `export_apply` must stay
   false (it would flatten the Armature), so the mask has to be applied
   explicitly or the export ships a robe, hair and genitals.
3. **Correct in Blender is not correct in the browser.** The body was right
   and read as female purely from a key light sitting too high.
4. **Amplitudes compound down a chain.** 84° at the wing arm, 48° at the
   forearm and 40° at the hand each sound moderate; stacked over a three-unit
   spar the tip swept about 170° and the downstroke drove both wings through
   the floor.
5. **A rotation applied around the rest pose is not applied around neutral.**
   The dragon's wing rests folded 56° up off its back, so a stroke centred on
   zero only ever flaps the top half of the arc. Base the oscillation on
   level.
6. **Rotation signs mirror per side.** Every hand-typed angle in this project
   has been wrong at least once. Probe the bone, watch where the child
   actually went, keep the axis and sign that did what the animation needs.
