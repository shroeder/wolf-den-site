# The house art style — decisions, and what produced them

Written 2026-10-27, at the end of the gpt-image-1 migration. This is the record of what Luke decided and the
exact inputs behind the two sprites he picked. If you are about to generate art for this game, this file plus
`house-design-sheet.png` and `tail-r2-restrained.txt` are the whole recipe.

## 0. Why this document exists at all

**The house style was never written down.** For two years it was whatever `gpt-image-1` did with a short
prompt. That model's hand *was* the style guide — the flatness, the chibi proportions, the outline weight, the
restraint. When it was deprecated the style had no definition anywhere, which is why the first replacement
attempts looked wrong in ways nobody could name.

So the work was not "pick a model". It was **reverse-engineering a style out of its own output** so it could be
stated in words and references and re-applied to anything.

## 1. The decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Abandon `gpt-image-1`.** | Forced. `shutdown_date: 2026-10-23`, still listed and resolvable, failing in production — 258 failures, 231 of them member hero redraws. |
| 2 | **Skip `1.5` and `1-mini` entirely.** | Both die **2026-12-01**. Luke: *"I'd rather not do this again in 2 months."* Even though `1-mini` measured flattest and cheapest, a five-week runway is not a migration target. |
| 3 | **Go to the 2.x family.** | Only tier with no announced end date. |
| 4 | **Quality stays `medium`. Not negotiable.** | Standing rule. High is 4× and has cost real money twice for nothing. Measured again here: `quality: low` on 1.5 was not flatter, just degraded — **quality is not the style dial.** |
| 5 | **The design sheet is an input, not documentation.** | Luke's idea: *"We could make a design guidelines sheet and pass that in?"* It is the single change that moved detail density when four rounds of prose could not. |
| 6 | **The sheet must cover every asset kind, not just heroes.** | Luke: *"I was hoping our design reference would have all sorts of sprites... Items chests badges bosses enemies gear boats etc."* Rebuilt to 24 assets across 11 kinds. |
| 7 | **The subject's real gear outranks the sheet.** | Luke's check: *"Is it honoring those items looks and descriptions or honoring the sheet more?"* The sheet governs **how it is drawn**; the equipped items govern **what is drawn**. Verified on a live member — `2.5-sunburst` drew their bow, `1-mini` drew a hammer. |
| 8 | **Shortlist to `2.5-flare` vs `2.5-sunburst`, tune the prompt against both.** | Luke: *"try between the two models, and repeat our attempts to isolate the right combination of prompt, using the image sheet for its reference."* |

## 2. The measurement

Density is **distinct colour count**, not edge density. Edge density was the first metric and it was **wrong** —
it penalised bigger, bolder figures, which is backwards for a style whose whole character is boldness. It nearly
caused the winning result to be thrown out.

`gpt-image-1`'s retired sprite — the yardstick — measures **12,190 distinct colours.**

## 3. What prose could and could not fix

| Attempt | Result |
|---|---|
| Proportions, outline, "no cast shadow" | **Worked.** Chibi came back, shadows stopped. These are *structural* and models obey them. |
| "Keep it simple", "use large shapes", "few large shapes read better than many small" | **Failed.** Four separate rounds on 1.5 all landed ~29% edge density against the target's 22%. Adjectives moved it by 0.2 points. |
| Reference images (the design sheet) | **Worked** where adjectives did not. |
| **Countable limits** | **Worked, decisively.** See below. |

### The breakthrough: count things, don't describe them

Round 1 on both 2.5 models produced fur collars, feathered pauldrons, a dragon emblem on the cape, gold
panelling and scattered gems — **none of which anything asked for.** The prompt said "simple". The model heard
"heroic".

Round 2 replaced every adjective with an arithmetic constraint:

- two or three large shapes per limb, not a stack of plates
- **at most three gems on the entire figure**
- gold is a **thin edge** only — never a filled panel, never trim on trim
- a named ban-list: fur, ruffs, crests, heraldry, filigree, studs, chains, tassels, cape motifs
- the cape is **one flat colour**
- *"If you are deciding whether to add a detail, DO NOT ADD IT."*

| | round 1 | round 2 |
|---|---|---|
| `2.5-flare` | 15,149 | **10,786** |
| `2.5-sunburst` | 14,321 | **11,189** |

**A model cannot count "simple". It can count three.** This generalises to every asset path in the game.

### Repeatability — three draws each, identical tail

| | draws | mean | spread | vs 12,190 target |
|---|---|---|---|---|
| `2.5-flare` | 10,786 / 12,321 / 10,329 | 11,145 | 1,992 | **−1,045** |
| `2.5-sunburst` | 11,189 / 12,832 / 13,407 | 12,476 | 2,218 | **+286** |

Spread is near-identical, so consistency does not separate them. Sunburst lands on the house number; flare runs
flatter than house.

## 4. What Luke picked

He chose **two**, and that matters — they bracket a range rather than naming one point.

### A — `tail-r1-ornate.txt` · 14,321 colours
The round-1 tail. Dragon emblem on the cape, feathered pauldrons, lion-head belt, heavy gold. **Richer than
house.** Luke liked it anyway.

### B — `tail-r2-restrained.txt` · 11,189 colours
The round-2 tail with the countable limits. Clean silhouette, flat cape, three gems, gold as edging only.
**Essentially on house.**

Both are `gpt-image-2.5-sunburst`. Neither is `flare`.

**The read:** the ceiling is higher than the old style assumed. R1 overshoots house density by 18% and still
looks right to the person who owns the game — so the countable limits are a **floor that guarantees
readability**, not a cap that must never be exceeded. Use R2 as the default for anything that must read small
(heroes at 100px, inventory icons, map markers). R1's licence is available for things that are shown large and
are meant to feel special.

## 5. The recipe

```
model       gpt-image-2.5-sunburst
quality     medium            ← never anything else
size        1024x1024
endpoint    /v1/images/edits
background  transparent
image[0]    the subject (avatar, or gear art for an item)
image[1]    docs/art/house-design-sheet.png
prompt      <subject description> + tail-r2-restrained.txt
```

`image[1]` is explicitly framed in the tail as **a style guide, not a subject** — without that sentence the
model draws things off the sheet into the picture.

## 6. Cost

`2.5-sunburst` at medium, 1024: **~$0.0485 per draw.** The whole evaluation — every model, every round,
every repeatability draw — came to well under $2.

## 7. Still open

- Promote the chosen tail from the admin route's `promptExtra` into `SPRITE_RULES` in `avatar-sprite.js`.
- Point the five call sites in `openai-image.js` at a shared model constant.
- Three `quality: "high"` call sites remain and must come down: `pet-sprite.js:56,218,224`,
  `boss-admin.js:131`, `openai-image.js:333` (default).
- `logGeneration` runs *after* `storeImage`, so a draw that bills but fails to store leaves **no ledger row**.
- Local scripts bypass `ai-trace` entirely, so script-driven draws are invisible to the cost ledger.
