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

## 4. The one insight worth planning around: edits ≠ generations

The style objection to the newer models is about **drawing from nothing** — asked for a creature, they
produce hundreds of individually outlined marks where gpt-image-1 laid down large smooth forms.

`editImage` does not ask them to draw from nothing. It hands over **our own finished art** and asks for one
change, and the input carries the style. [[gpt-image-1-is-the-house-style]] already found this and uses
2.5 for exactly that job today:

> *"2.5's headline feature is 'precise editing and subject preservation' and it is genuinely good at it:
> handed a finished sprite and asked to change ONE thing, it returns the same drawing with the crown
> restored."*

So the migration splits cleanly, and the halves have different risk:

- **`editImage` (2 of the 6 member paths — the hero sprite and the stockade)** can likely go to **2.5**
  with little style risk, because the member's existing sprite is the reference. This is also the path with
  **231 of the 258 failures**, so it is both the most broken and the least risky to move.
- **`generateImage` / scene functions** are the genuine style problem and the one that needs your eye on a
  contact sheet before anything ships.

⚠️ **The hero redraw is not a from-scratch generation at all** — `avatar-sprite.js` imports `editImage` and
nothing else. Worth knowing before choosing a model for "the hero sprite".

---

## 5. What a migration actually touches

1. **One constant, five call sites.** The model chain belongs in `src/lib/marketplace/` where both halves of
   the repo can import it — the scripts' `scripts/lib/draw-image.mjs` already has the logic and the
   precedent is `housePrompt`, which lives in `src` and is imported by the generators.
2. The chain keeps **gpt-image-1 at the head** so the day it is un-retired nothing has to change, and falls
   through only on a missing-model 400. That is already how `gen-pack-bag.mjs` works, on your call:
   *"Use the old model, the new ones are just a fallback."*
3. **Decide per endpoint, not globally** (§4).
4. **Sweep the three `high` call sites** while the files are open (§3).
5. Before December, put 2.x in front of a contact sheet for the generate path. There is no version of this
   where that evaluation does not have to happen.
