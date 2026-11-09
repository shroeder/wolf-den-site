# The low-poly pipeline

RuneScape-era models: flat-shaded, a few hundred triangles, flat colour out of one palette, no
textures. Blender headless builds them; the lab at `/marketplace/model-lab` (owner only) shows
whatever was built.

**Read `CLAUDE.md` in this folder before working in here.** The short version: done is
`npm run lp:done`, and the unit of work is one asset, delivered.

## The commands

| | |
|---|---|
| `npm run lp:make` | Build every model → `public/models/lp/*.glb` + `manifest.json` |
| `npm run lp:film` | Turntable mp4 + four stills per model, plus the scale line-up |
| `npm run lp:gate` | The style, as assertions on the exported glb |
| `npm run lp:done` | All three, in order, and it prints the files to send |

`MODEL=tree npm run lp:…` does one. Renders land in `_film/` (gitignored).

## The files

| | |
|---|---|
| `style.py` | **The look, as numbers.** Palette, triangle budgets, material ceiling, scale classes. The gate reads this module, so it is the only place the style is defined. |
| `kit.py` | The five shapes everything is built from: `box`, `frustum`, `prism`, `cone`, `wedge`, plus `mirror_x` and `join`. No modifiers, no booleans, no subdivision. |
| `models/*.py` | One file per model. A list of primitives in metres and a `join`. Drop a new file in and it appears everywhere — there is no registry to update. |
| `make.py` | Builds, exports, and **writes the manifest the lab reads**. |
| `harness/shot.py` | Camera and lights. Loads the glb; has no idea how a model is built. |
| `harness/film.py` | The turntable, the four angles, and the line-up. |
| `harness/gate.py` | Six checks, and a self-test that proves they can fail. |
| `harness/video.py` | PNGs → looping mp4. Carried over unchanged; Blender cannot write a GIF. |
| `harness/done.mjs` | make → gate → film → "send these". |

## Adding a model

Write `models/anvil.py` with `NAME`, `LABEL`, `KIND`, `SCALE`, `NOTE` and a `build()` that
returns `kit.join(parts, "Anvil")`. Then `MODEL=anvil npm run lp:done`. The manifest, the lab
and the line-up pick it up with no other edit.

Sizes are in **metres** and the player is 1.85 m. Put the numbers in the file as the bands they
occupy (see `models/player.py`) so a change to one part is checkable against its neighbours by
reading down the page.

## What is deliberately not here

Rigging, skinning, animation, armour, props, a clip mixer, IK. All of it existed, all of it
was deleted on 2026-11-09 and is recoverable at `d43ab304`. The models are static. Animation
comes back when the look is signed off — and when it does, it comes back as a handful of bone
rotations on a sixteen-box figure, not as a 55-bone rig fitted to a bought body.
