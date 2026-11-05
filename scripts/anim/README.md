# Hero animation pipeline

Run with Blender headless:

    "C:\Program Files\Blender Foundation\Blender 4.4\blender.exe" -b -P <script>

| | |
|---|---|
| `assets/hero-base.blend` | **The hero.** Rigged, fitted, stripped, materialled. The only character asset. |
| `freeze-hero.py` | Regenerates that asset from MPFB. **The only script allowed to touch MPFB.** |
| `build-walk.py` | Loads the asset, builds the walk on IK. Generates nothing. |
| `export-walk.py` | Bakes IK to bone keys, writes `public/models/hero-walk.glb`. |
| `debug-rig.py` | **Not a gate.** A debugger, for when the body does not match the skeleton. |

## There are no gates here, on purpose

There were three. They were cut the day they were written.

`check-walk.py` ran ten numeric assertions on the motion and went GREEN on a
visibly broken walk for hours — because every assertion measured the
skeleton, and the skeleton was fine. It did not merely fail to help; it
manufactured confidence and argued against what was on screen.
`check-export.py` caught nothing and produced a false positive that was
nearly "fixed" twice.

Every real defect in this pipeline — helper geometry in the export, a rig
that missed its own body, a chest lit to look female — was found by **opening
the lab and looking at it**.

So: fix the bug, do not also build a detector for it. If something is wrong,
reach for `debug-rig.py` and render the deliverable LARGE. Judging a character
from thumbnails in a contact sheet is how most of a day got lost.

## The three things that bite

1. **MPFB fits the rig to `base.obj`, not to your character.** Without the
   refit in `freeze-hero.py` every joint sits a hip-height below its limb.
2. **The MASK modifier only hides helper geometry.** `export_apply` must stay
   false (it would flatten the Armature), so the mask has to be applied
   explicitly or the export ships a robe, hair and genitals.
3. **Correct in Blender is not correct in the browser.** The body was right
   and read as female purely from a key light sitting too high.
