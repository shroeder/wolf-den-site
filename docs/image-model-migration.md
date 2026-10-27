# Where we generate images, and what the gpt-image-1 shutdown breaks

**Status:** inventory, 2026-10-27. No migration decided. Written so the decision can be made from a list
rather than from memory.

---

## 0. Yes, it is deprecated. The API says so itself

```
GET  /v1/models/gpt-image-1   →  { "id": "gpt-image-1", "shutdown_date": "2026-10-23" }
POST /v1/images/generations   →  400  "The model 'gpt-image-1' does not exist."
```

It still **resolves** and is still **listed** in `/v1/models`, which is why the error reads like a typo in
the model name rather than a retirement. It simply will not draw.

From `mkt_ai_generation`: last success **2026-10-23 16:30**, first failure **2026-10-23 19:00**, and
**258 failures since**, still accruing.

⚠️ **And the two obvious escape hatches are on the clock as well.**

| model | status |
|---|---|
| `gpt-image-1` | **shut down 2026-10-23** |
| `gpt-image-1.5` | shutdown **2026-12-01** |
| `gpt-image-1-mini` | shutdown **2026-12-01** |
| `gpt-image-2`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst` | live, no date |

So 1.5 is a **five-week stay of execution**, not a destination. Whatever happens, something in the 2.x
family has to be evaluated before December — and [[gpt-image-1-is-the-house-style]] is the record of why
that is not a free swap: eleven generations tested, rejected as *"all high detail and noisy, its not the
right style."*

---

## 1. ⚠️ The migration surface is FIVE FUNCTIONS, not a hundred files

Every member-facing image in the game goes through `src/lib/marketplace/openai-image.js`. Sixteen modules
import it; none of them name a model. The whole production migration is these five:

| # | function | line | endpoint | draws |
|---|---|---|---|---|
| 1 | `generateImage` | 282 | `/images/generations` | transparent sprites — the workhorse |
| 2 | `generateSceneImage` | 333 | `/images/generations` | 1536×1024 opaque scenes |
| 3 | `generateOutpaintedSceneImage` | 361 | `/images/generations` | a scene extended sideways in steps |
| 4 | `generateWideSceneImage` | 418 | (calls 2 and 3) | panoramas |
| 5 | `editImage` | 503 | **`/images/edits`** | redraws an image we hand it |

**Point 5 is the strategically important one — see §4.**

---

## 2. Who calls them, and who is bleeding right now

### Member-triggered — live, failing today

| module | via | routes | failures since 10-23 |
|---|---|---|---|
| `avatar-sprite.js` | `editImage` | `marketplace/avatar`, `jobs/avatar-sprites` (cron), `admin/avatar-sprites` | **231** |
| `custom-deco.js` | `generateImage` | `marketplace/farm` | **13** (@graykitsune, @littlewolf) |
| `stockade.js` | `editImage` | `marketplace/stockade` | **2** |
| `pet-sprite.js` | `generateImage` | `marketplace/pet-sprites`, cron | 0 — *not attempted yet* |
| `badge-sprites.js` | `generateImage` | `marketplace/badge-sprites` | 0 — *not attempted yet* |
| `farm-bg.js` | `generateSceneImage` | `marketplace/farm` | 0 — *not attempted yet* |

⚠️ **A zero in that last column means nobody has triggered it since the shutdown, not that it works.** Pet
sprites, badges and farm backgrounds are equally dead and will fail the first time a member asks.

### Admin and cron only

`boss-admin.js` (`generateImage` + `generateSceneImage`, via `jobs/boss-art`) · `boss-trophy.js`
(`editImage`) · `chest-art.js` · `decoration-sprites.js` · `town-art.js` (all three scene functions).

### The scripts — a separate and milder problem

**~105 generators** under `scripts/gen-*.mjs` call the image API directly. Only three route through the
fallback chain (`gen-pack-bag.mjs`, `gen-pack-stall.mjs`, `scripts/lib/draw-image.mjs`).

They are broken, but they fail **loudly, in front of whoever ran them**, and they only run when somebody
runs them. They are a tidy-up, not an outage. The chain they should share already exists.

---

## 3. ⚠️ Three places pass `quality: "high"`, and a migration will walk straight past them

- `pet-sprite.js:56`, `:218`, `:224` — every pet sprite and every pet LEVEL sprite
- `boss-admin.js:131` — boss sprites
- `openai-image.js:333` — `generateSceneImage`'s own **default parameter**, so every scene inherits it

On gpt-image-1 that was 4,160 output tokens — **16.6¢ an image** against 4.2¢ at medium. The standing rule
is that `high` is never used; `scripts/lib/gen-guard.mjs` had the flag deleted outright for exactly this
reason, and these predate that and were never swept.

Whatever model is chosen, these files have to be opened anyway. **Fix the quality while they are open.**

---

## 4. Edits ≠ generations — but ⚠️ ONLY WHEN THE REFERENCE IS OUR OWN ART

**Corrected 2026-10-27.** The first version of this section said the hero sprite was the safest path to
move because `editImage` hands over a reference and the reference carries the style. Luke: *"explicit if we
are passing in an object to reference that is clipping. In this case we are passing in items but not the
hero."* He is right, and the conclusion was backwards.

The general principle holds: handing a model our own finished art and asking for one change is far less
style-exposed than asking it to draw from nothing, and [[gpt-image-1-is-the-house-style]] already relies on
that for the Grove's crown repairs.

**But it only holds if the reference IS our own finished art.** Checking what each `editImage` caller
actually hands over:

| path | reference handed over | is it house art? |
|---|---|---|
| `avatar-sprite.js` — the hero | **a DiceBear `avataaars` render** of the member's avatar config | ❌ **no** |
| `stockade.js` | the member's stored `avatar_sprite_url` | ✅ yes |
| `boss-trophy.js` | the boss's finished sprite, fetched by url | ✅ yes |

⚠️ **THE HERO IS THE ONE THAT IS NOT PROTECTED, AND IT IS THE BIGGEST PATH.** `renderAvatarPng` builds a
flat DiceBear vector cartoon — a different art tradition entirely — and the **gear is not an image at all**:
`getEquippedGearPhrase` returns a *phrase*, which goes into the prompt as words. So the reference carries
the member's **identity** (skin, hair, eyes, clothing colour) and nothing about how the Den draws. The house
style comes entirely from the model's own hand, exactly as in a from-scratch generation.

So the hero sprite is **the most style-exposed path in the whole system, not the least** — and it is 231 of
the 258 failures. Swapping its model without looking at the output will restyle every hero in the Den.

What this does change:

- `stockade.js` and `boss-trophy.js` **are** genuinely low-risk — their references are house art, and they
  are also low-volume and non-member-facing.
- The hero belongs in the **same bucket as `generateImage`**: it needs a contact sheet and your eye before
  anything ships, not a model swap.
- There is a third option for the hero that the others do not have, and it is worth considering precisely
  because the reference is already not house art: **give it a house-art reference.** A finished Den hero
  sprite handed in alongside the DiceBear identity render would make this a real edit and buy back the
  style protection — but that is a change to the recipe, not a migration, and belongs in its own decision.

## 5. What a migration actually touches

1. **One constant, five call sites.** The model chain belongs in `src/lib/marketplace/` where both halves of
   the repo can import it — the scripts' `scripts/lib/draw-image.mjs` already has the logic and the
   precedent is `housePrompt`, which lives in `src` and is imported by the generators.
2. The chain keeps **gpt-image-1 at the head** so the day it is un-retired nothing has to change, and falls
   through only on a missing-model 400. That is already how `gen-pack-bag.mjs` works, on your call:
   *"Use the old model, the new ones are just a fallback."*
3. **Decide per reference, not per endpoint** (§4). Two of the three `editImage` callers hand over house
   art and can move with little risk. The hero does not, and has to be judged on a contact sheet like any
   from-scratch draw.
4. **Sweep the three `high` call sites** while the files are open (§3).
5. Before December, put 2.x in front of a contact sheet for the generate path. There is no version of this
   where that evaluation does not have to happen.
