# Backlog

Things found, measured, and deliberately not fixed yet. Each one carries the evidence so picking it up doesn't
mean re-deriving the problem.

---

## 1. Recipe acquisition is ~2x too fast, and concentrated in the wrong places

**Measured against real 7-day activity volumes (2026-08-01):**

| source | events/wk | rate | recipes/wk |
|---|---|---|---|
| chests | 745 | 6.0% | **44.7** |
| harvest | 945 | 4.0% | **37.8** |
| spin | 397 | 5.0% | 19.9 |
| salvage | 503 | 2.0% | 10.1 |
| fishing | 329 | 3.0% | 9.9 |
| digs | 169 | 3.5% | 5.9 |
| daily deal | 28 | 15.0% | 4.2 |
| forge | 75 | 3.0% | 2.3 |
| pet bond | 51 | 3.0% | 1.5 |

**~136 recipes/week across ~46 active members = ~3 per member per week. The whole 64-recipe book in ~22 weeks**
for an *average* member, never mind a grinder.

**The real problem isn't the total, it's the shape.** Chests + harvest are 60% of all drops — the two
highest-volume actions in the game sit at the top of the table. The sources that were the whole point of
spreading acquisition (forge, digs, pet bonding, deals) contribute single digits. Functionally this replaced
"recipes come from farming" with "recipes come from farming and chests".

**Fix:** roughly halve `chest_*` and `harvest` in `RECIPE_SOURCES` (cooking.js), raise the low-volume
interesting sources, and re-run the table above to confirm. The tier BANDS are fine and should stay — a wooden
chest still can't yield a Legendary, so the top tiers are correctly gated regardless of rate.

---

## 2. Pet level art: `faceRight` and `deHalo` are skipped on the edit path

`generatePetSpriteLevel` now edits from the Lv1 sprite. The text-generation branch passes
`faceRight: true, deHalo: true`; the edit branch passes neither.

**Consequences:**
- The die-cut halo cleanup every other sprite gets doesn't run — visible as a grey rim on Lv3 and a yellow rim
  on Lv4 of the Hearth Cat preview.
- Nothing enforces right-facing any more, so an edit that turns the creature ships facing the wrong way.

**Fix:** run `deHaloBuffer` and the facing check on the edit result before `storeImage`, or move both into
`editImage` so every caller gets them.

**Also worth doing:** anchoring on Lv1 makes it a single point of failure — a weak base evolves into five weak
sprites with no signal. Generate Lv1, eyeball it, then evolve.

---

## 3. Onboarding is not a checklist

`ONBOARDING_TASKS` has **two** entries: turn on notifications, enable location. That's a permissions prompt
with a gold reward. Nothing about the farm, boat, kitchen, forge, town, boss, pets or trading.

Luke remembers a richer first-time list (link Discord, sign in at an event, use Looking For). Either it predates
this code or it lives somewhere else — worth finding before rebuilding.

**Intent:** a first-week ramp that introduces each system AND ties real life to the game — the first taste of
being rewarded for being a good customer.

---

## 4. Viewing another member's recipe book

Browsing a member should show their recipe collection the way the Kitchen shows yours: which they have, which
they don't, how far along they are.

---

## 5. XP is still ~7% off, not enough

Duels (700→450 daily), waves (25→12) and harvest player share (40%→28%) are trimmed, but the long tail is
large and members still level fast.

Going further means one of two things, both of which are judgement calls:
- **Touch boss strikes** — the core loop, so it changes how the main activity feels.
- **Steepen the level curve** (`50*(L-1)*L` in xp.js) — cleaner, but it would **demote every existing member**,
  which needs an explicit decision and probably an announcement.
