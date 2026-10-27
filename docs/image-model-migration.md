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

## 5. Outside OpenAI

Luke: *"Are there other models we can try outside of open ai"*

⚠️ **Dated knowledge warning.** This section is written from training knowledge with a May 2026 cutoff; it is
now late October. Names, availability and prices in this space change monthly, so treat every specific below
as a lead to verify rather than a fact. The *shapes* of the options are stable; the details are not.

⚠️ **And we hold no key for any of them.** `OPENAI_API_KEY` is the only image credential in
`accounting_app/local.properties`. Anything here needs an account before it can be tried.

### 5.1 The thing that changes the answer: we own a corpus

| | |
|---|---|
| pet level sprites | 852 |
| gear | 501 |
| badges | 294 |
| decorations | 208 |
| town art | 173 |
| dishes | 160 |
| pets | 144 |
| hero sprites | 111 |
| consumables | 51 |
| **total** | **2,494 finished images, all in one hand** |

That is a training set, and an unusually good one: consistent, captioned by the prompts that made them, and
already judged acceptable. Most shops arguing about image models do not have this.

It matters because the problem is not "which model draws nearest our style" — it is that **our style is
currently rented**. It lives in gpt-image-1's hand, which is why a vendor retiring that model restyles the
whole game. Training on our own corpus converts the style from something we rent into something we own, and
a model whose weights we hold cannot be shut down on four days' notice.

### 5.2 The three shapes of option

**A — Another hosted prompt-to-image API.** Swaps one rented hand for another. Fastest to try, solves
nothing structurally.

- **Google Imagen** (Gemini/Vertex) — the nearest peer to what we use, with image editing.
- **Black Forest Labs FLUX** — the Kontext line is purpose-built for image-to-image with reference
  preservation, which is exactly the lever that worked for us. Reachable via BFL directly, fal.ai or
  Replicate, and the weights are obtainable.
- **Recraft** — aimed squarely at flat vector and illustration styles, with style references and
  transparent output. On paper the closest out-of-the-box fit for cel-shaded sprites.
- **Ideogram** — strong on flat graphic work.

**B — Game-asset platforms that train on your art.** Built for this exact job.

- **Scenario** — generate game assets from a model trained on your own library. The most on-the-nose
  description of our situation I know of.
- **Leonardo** — custom model training, game-art oriented.

**C — Train our own LoRA on open weights.** The structural fix.

A LoRA typically wants 20–100 images and we have 2,494 to choose from. Training runs in the tens of dollars
on Replicate or fal; inference afterwards is cents. The output is a file we keep.

⚠️ **This is the only option that removes the recurring risk rather than resetting its clock.** Every hosted
API in group A can retire a model on us exactly as OpenAI just did — 1.5 and mini are already dated
2026-12-01.

### 5.3 Two practical constraints that will decide this faster than style will

- **Transparent backgrounds.** OpenAI returns real alpha, and `editOnce` asks for it explicitly because the
  edits endpoint does not inherit it. FLUX and Stable Diffusion generally do not — they need a background
  removal pass. We have some of that machinery already (`deHalo`, `sprite-cleanup.js`), but it is a real
  cost on a sprite game where everything is a cut-out.
- **Our abstraction is OpenAI-shaped.** `scripts/lib/draw-image.mjs` picks a MODEL, not a PROVIDER, and
  `editOnce` builds an OpenAI multipart form. Trying anything in group B or C means an adapter, not a
  string change — worth knowing before scoping it as an afternoon.

### 5.4 What I would try first, and why

1. **FLUX Kontext via fal or Replicate**, with the same three-image setup that worked here — subject, gear
   art, style sheet. It is the group-A option whose strength is precisely the lever we proved matters, and
   it doubles as the dress rehearsal for group C, because it is the same family we would train a LoRA on.
2. **A LoRA on 60–100 curated hero sprites**, judged against the same contact sheet. If it holds, the style
   stops being a vendor's property.

Recraft is the wildcard worth one afternoon, because flat cel-shaded illustration is its stated speciality
and that is the exact axis every OpenAI model has failed on.

---

## 6. What the contact sheets decided

Luke, on the tuning sheet: *"this is the best hero ive seen yet outside of the retired one"* — the tile
labelled **2 · + proportions, shadow**. And on the new-asset sheet: *"the remaining items prefer the left
side due to its style"* — the left column is **gpt-image-1-mini**.

Two picks, two different models. That is the finding: **there is no single replacement, there is a model per
job.**

| path | model | what it is given |
|---|---|---|
| **hero sprites** | `gpt-image-1.5` | DiceBear avatar + the six-rule tail |
| **items, enemies, bosses, decorations** | `gpt-image-1-mini` | the design sheet + the house prompt |

### 6.1 The tail is the real product, and it belongs in the recipe

The hero he chose was drawn with `extra2` — six rules, in this order, and the order matters because the
first one is the one the model kept breaking:

1. **the no-shadow rule, stated first and with its reason** — a cast shadow ruins a cut-out sprite
2. **proportions** — stocky chibi, head about a third of height
3. **rendering** — flat cel, two or three tone steps, bold dark outline
4. **background** — transparent, nothing but the character
5. **effects** — discrete wisps, no unnamed elemental effects
6. **weapons** — a maul is a hammer, drawn large and readable

⚠️ **Every one of those is a thing gpt-image-1 supplied for free and the prompt never said.** That is why a
model swap restyled the game: the house style was never written down, it was inherited. The tail is the
first time it exists as text, and it belongs in `SPRITE_RULES` — not in `promptExtra`, which is a trial hook.

### 6.2 ⚠️ The hero he picked is the one that ignores his gear

That draw had the avatar and nothing else. The crown, the purple orb shield and the gold maul are
**invented from the item NAMES**. His actual loadout is black with orange fire runes, a teal crystal maul
and a spiral shield — the pass that matched all of that (pass 9, with the gear art attached) is not the one
he chose.

So the choice on the table is a real trade and should be made deliberately rather than discovered later:

- **look** — the ornate, royal, invented version, which reads better as a character
- **truth** — the version that draws what the member is actually wearing, which is what makes gear worth
  equipping

They are not necessarily exclusive: the pass-2 tail has never been run WITH the gear art and the design
sheet. That combination is untested and is the obvious next draw.

### 6.3 ⚠️ And both chosen models die on 2026-12-01

`gpt-image-1.5` and `gpt-image-1-mini` are both on the December shutdown list. This decision is therefore a
**five-week answer, not a migration** — it unblocks members now and buys time, nothing more.

The only option with no end date that drew acceptably is `gpt-image-2.5-sunburst`, which also matched the
real gear best. `gpt-image-2` is permanently out: it refuses transparent backgrounds, and every asset in
this game is a cut-out.

So the plan has two horizons, and conflating them is how December arrives unprepared:

- **now** — ship 1.5 for heroes and 1-mini for objects, with the tail promoted into the recipe
- **before December** — re-run this same comparison on 2.5, with the tail and the sheets already written
  down, so the question is only "does this model obey our rules" rather than "what are our rules"

---

## 7. What a migration actually touches

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
