# The Grove, maps 8–12 — what is left, and how to do it

Written 2026-10-19, at the point where the spend was stopped. Everything in this file was a to-do list
rather than a design question: the design for all twelve maps was finished and committed, and what maps 8–12
lacked was art.

> ⚠️ **SUPERSEDED IN PART, 2026-10-30.** Maps 8–12 now have their own spec —
> `docs/grove-maps-8-12-design.html`, draft 3 — and it changes two things this file treats as settled.
> **Three of the five maps are renamed** (8, 10 and 11), and **their recipes are authored rather than
> derived from roles.** The build procedure, the traps and the open questions below are all still correct;
> the map names and the "a new map is twelve materials, not twelve recipes" line are not. Read the spec
> first, then this file for how to actually ship one.

---

## Where it stands

| | state |
|---|---|
| **Design, all 12 maps** | done — 132 zones, 132 creatures, 132 bosses, 132 materials, 11 emblems, 144 tool recipes |
| **Art, maps 1–7** | done — 48 images each (12 backdrops, 12 creatures, 12 bosses, 12 materials) |
| **Art, maps 8–12** | **none** — 240 images for the four core families, about **$9.30** at medium |
| **Art, everything else 8–12** | NPCs, foods, rares, frames, seals, node symbols and 36 redrawn tool rungs — see the spec; **≈$19.24** all in |
| **Tool rungs** | 12 tools × 12 tiers drawn |
| `MAPS_BUILT` | raise it as a map's art lands; everything player-facing reads it |

**$17.38 of art was spent getting to here**, which is the number that stopped the run. Maps 8–12 are the
remaining $9.30 and nothing else — no new mechanics, no new decisions, no code.

---

## The five that are designed and undrawn

| # | Map | What the place is |
|---|---|---|
| # | in `grove-maps.js` today | in draft 3 | what the place is |
|---|---|---|---|
| 8 | The Thunder Steppe | **The Clockwork Deep** | something built this, and it was never told to stop |
| 9 | The Frostmere | **The Frostmere** *(kept)* | black water under white ice |
| 10 | The Glass Peaks | **The Hollow Colossus** | inside a dead titan |
| 11 | The Rotgarden | **The Cloudshelf** | stone that forgot to fall |
| 12 | The Starfall Rim | **The Starfall Rim** *(kept)* | past the last air |

Each is twelve zones, twelve residents, twelve bosses and twelve materials, already written in
`src/lib/marketplace/grove-maps.js` — names, blurbs, loot tables, emblem and tool rung.

⚠️ **The three renames are not free.** Steppe, Glass Peaks and Rotgarden are retired because maps 1, 3 and 4
already cover green, wet and high ground, but the **36 tool sprites for tiers VIII, X and XI were drawn from
those maps' materials** (`tool-pick-t8` is a pickaxe of horn edge, lance shaft and bison hide) and have to be
redrawn. They have never been seen by a player, so this is not repainting shipped art.

---

## How to finish one

```
node scripts/gen-grove-art.mjs --map 8                 # price it: 48 images, $2.27
node scripts/gen-grove-art.mjs --apply --map 8         # draw it
node scripts/gen-grove-art.mjs --apply --map 8 --missing   # or just the gaps, after an interruption
node --import ./scripts/lib/register-loader.mjs scripts/grove-art-sweep.mjs --fix
```

The sweep prints every map's four families and says **READY TO BUILD** when all forty-eight exist. Then:

1. raise `MAPS_BUILT` in `grove-maps.js` to that map's number
2. `npm run check:grove` — it starts demanding that map's art the moment MAPS_BUILT moves
3. `npm run lint:undef && npm run build`
4. commit, deploy

**A map opens as a whole or not at all.** Half a map is twelve zones where six have backdrops: the drawn ones
look finished and the rest look broken.

---

## Things already decided, so nobody re-litigates them

- **A tier is a map.** Tool tier N comes from map N's materials. `TOOL_TIER_CAP = 12` is the only place the
  map count lives.
- **Each tier is remade from the one below it** — tier V needs the tier IV tool in hand.
- **Roles, not recipes — for maps 2–7 only.** A pickaxe is an edge, a haft and a hide; each map names its own
  material for each of the eight roles and the recipes fall out. ⚠️ **Reversed for maps 8–12 by draft 3.**
  Luke: *"the uniqueness I was talking about and the lack of variety was more about crafting… Just be
  thoughtful when making each maps craftables."* Role order picks the FIRST material of each role, so a map
  with two edges and two binds never uses half its own parts list in a tool, and five maps of that produce
  the same twelve objects in new words. Maps 8–12 carry **85 authored craftables** instead — 60 tools, 20
  foods, 5 charms — each with its three materials chosen. `toolRecipesForMap` and `foodRecipesForMap` keep
  serving maps 2–7.
- **Creature i is the resident of zone i, and part i is what that zone is made of.** That is what makes "where
  do I get Dripstone" answerable by looking at the map. Every material is somebody's primary drop.
- **One emblem per map, not per creature.** 132 new passive stat stacks is a second stat system arriving by
  the back door, and stat ceilings are still open in §11 of the node-map doc.
- **Bosses are authored at the depth they stand at** — `scaledFoe` does not touch a boss. Two factors: x1.372
  per map (the hero's own power step) and x3.05 across a map's twelve zones (35 seconds at the first boss
  rising to 80 at the last). A single continuous rate makes map two's last boss easier than map one's.
- **Chart symbols are borrowed by biome.** A cave zone uses the Warren's symbol, a burnt zone the Rotwood's.
  Seventy-two more drawings to give every zone its own, and the symbol's job is to say what KIND of place it
  is — so this is a nice-to-have, not a gap.
- **Ledges, hangs and sits are reused.** Every generated zone names one of map one's ten existing biomes, so
  no slab or decoration art is needed for any of the eleven maps.

---

## The traps that already bit, so they do not bite again

- **An id collision does not error, it wins.** The Rotgarden shipped a `husk` and map one has had a Straw
  Walker with that id since the Grove opened — the later entry silently replaces the earlier one and points
  its art at the wrong thing. `check-grove.mjs` now asserts this for creatures, bosses, materials and zones.
- **The art writer prefixes creature files itself.** A key carrying `foe-` too lands as `foe-foe-*.webp`: the
  file writes, the catalogue 404s, the player gets a broken-image glyph. Nothing throws. `grove-art-sweep.mjs
  --fix` renames them.
- **A boss with no attack list never swings.** `GroveScene` guards on `f.attacks?.length`, so an empty list is
  a health bar standing still while you hit it. Generated bosses take their pattern from the ground they rule.
- **The tablet counts what you can find, not what exists.** Counting all 148 materials turns "16 of 16" into
  "16 of 148" and reads as eleven twelfths of the game missing.

---

## What is NOT in this file, and is still open

These are design questions from `docs/node-map-design.md` §11, unchanged:

- **Stat ceilings** — Grove gear feeds crit globally. Still undecided, and it gates opening the Grove to
  members.
- **How the six tool slots meet the equipment screen** — new slots on the doll, or their own screen.
- **What the crafting set's badges are for.**
- **Respawn: per player or per zone.**
- **A reason to be in the canopy** — the tiers are reachable and populated and nothing up there is worth more
  than the floor.
