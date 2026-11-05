# Hero animation pipeline

Four scripts and one asset. Run with Blender headless:

    "C:\Program Files\Blender Foundation\Blender 4.4\blender.exe" -b -P <script>

| | |
|---|---|
| `assets/hero-base.blend` | **The hero.** Rigged, fitted, stripped, materialled. The only character asset. |
| `freeze-hero.py` | Regenerates that asset from MPFB. **The only script allowed to touch MPFB.** |
| `rig-diagnostic.py` | Is the skeleton actually inside the body? Run after any freeze. |
| `build-walk.py` | Loads the asset, builds the walk on IK. Generates nothing. |
| `check-walk.py` | Ten assertions on the motion. |
| `export-walk.py` | Bakes IK to bone keys, writes `public/models/hero-walk.glb`. |
| `check-export.py` | Imports the **exported file** and verifies it. |

## Why it is split this way

Every defect this pipeline shipped came from the generation step, and the
build used to re-run it on every export — so the model changed underneath the
animation and each fix had to survive being re-applied.

Generation now happens once. Change an animation and the model cannot move.

A new character is a deliberate act: edit `MACRO` in `freeze-hero.py`, run it,
run `rig-diagnostic.py`, commit the new `.blend`.

## The three things that bite

1. **MPFB fits the rig to `base.obj`, not to your character.** Without the
   refit in `freeze-hero.py` every joint sits a hip-height below its limb.
2. **The MASK modifier only hides helper geometry.** `export_apply` must stay
   false (it would flatten the Armature), so the mask has to be applied
   explicitly or the export ships a robe, hair and genitals.
3. **Verify the exported file, never the scene.** Both of the above were
   invisible from the scene that produced them.
