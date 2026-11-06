# Selling surplus consumables — what is safe and what the numbers have to be

## ⛔ PARKED — 2026-11-05. Do not build this.

Eric, the same day it was written up: *"Let's put a pin in this for right now. We're not going to release
anything for this just yet. It was just an idea I was throwing out."* **Nothing ships from this document
until Eric raises it again.** It is kept because the measurements in §3.1 and §3.6 were paid for with a read
of the live ledger and are worth more than the proposal they were gathered for — the finding that
`consumable` is already 32.1% of all XP in the Den applies to any future XP reward, not just this one.

**And §9 is the thing to pick up first when it does come back**, because it is what Eric asked for on the
way out and because the obvious way to build it is wrong.

Rate and cap set from a read of the live ledger on 2026-11-05 — see §3.1 and §3.6, and
`scripts/audit-xp-per-day.mjs`, which is read-only and reproduces every figure in this document.

> *"Is there a way in the Wolf Den game that we can make it so that you can sell excess items like the
> adrenaline vial, the storm crystal, just like excess items like that? Can we have a way of, or is there a
> way that we can implement a system where you can sell excess ones without breaking the economy?"*

Short answer: **yes, and the safe version does not pay gold.** The two items Eric named are not a random
pair — they are the only two cheap items in the one effect family the game puts a hard ceiling on, and once
you see that, the fix gets small enough to prove correct instead of arguing about.

---

## 1. "Excess" is a cap problem, not a storage problem

`consumables.js:344`:

```js
export const MAX_POTION_STRIKES = 8;
```

Eight extra boss strikes a day, and — per the comment above it — **a cap on the POTION contribution only**.
Gear, pets, signatures and set capstones add on top, "because those are things a member built rather than
things they stockpiled." Four Second Winds fills the whole potion allowance.

That is the only effect family in the game with a daily ceiling, and `stackNote()` (`consumables.js:633`)
says so item by item for everything else:

| effect family | what a second one does | can it be surplus? |
|---|---|---|
| `strikes` | adds up, **max 8/day from potions** | **yes** |
| `damage` | adds `hours` to the clock, never raises the multiplier | **yes, see §1.2** |
| `xp` | "each one pays its own XP" | no |
| `pet_xp` | "each one feeds its own XP to the pet" | no |
| `spin_token` | "tokens add to your pile. Nothing is lost by holding them" | no |
| `sail_lure` / `sail_merchant` | "charges add up… banks several" | no |
| one-shots and targeted relics | no stack to describe | no |

So the surplus list is closed and it is eight items long.

### 1.1 The `strikes` family

| id | name | effect | list price |
|---|---|---|---|
| `pot_adrenaline` | Adrenaline Vial | +2 strikes | 1,200 |
| `stone_storm` | Storm Crystal | +3 strikes | 2,000 |
| `pot_secondwind` | Second Wind | +5 strikes | 3,200 |
| `candy_caramel_apple` | Caramel Apple | +3 strikes | drop-only |

Eric named the two cheapest. That is not a coincidence — they are the two you buy most of and the two the
wheel and the chests hand out most often, against an allowance four Second Winds already fills.

### 1.2 The `damage` family is surplus too, for a different reason

`boss.js:45` — `BOSS_MULT_CAP = 20`, and the multiplier product is clipped **before** the potion is
considered. The note at `consumables.js:172` records what that cost: ValkyrieSylve's gear stack alone is
~9.5, so her Bottled Fury (×3) paid exactly what a Berserker's Brew (×2) paid, and she filed it as a bug.
It was not a bug, it was a ceiling nobody could see.

| id | name | effect | list price |
|---|---|---|---|
| `stone_ember` | Ember Stone | ×2 for 12h | 3,500 |
| `pot_berserker` | Berserker's Brew | ×2 for 24h | 4,000 |
| `pot_fury` | Bottled Fury | ×3 for 6h | 6,500 |
| `candy_sour_worm` | Sour Worm | ×2 for 12h | drop-only |

For anyone near the cap these are interchangeable, which is the same thing as having too many.

⚠️ **`hw_whetstone` is NOT in this list and must never be added to it.** It is `effect.type: "edge"` and it
raises the base of the swing, *outside* `Math.min(BOSS_MULT_CAP, …)` — see the note at
`consumables.js:177`. It is the one damage consumable that still does something for a member the ceiling is
already deciding, so it is the last thing a late-game player has surplus of. Letting it be melted would
offer the melt button to precisely the item it is wrong for.

### 1.3 There is a precedent for this exact complaint

GrayKitsune asked for something to do with cooking output "that otherwise just piles up"
(`consumables.js:199`). The answer was not a sell button — it was making the dishes feedable, so the pile
became a thing you wanted. That is the shape being proposed here.

---

## 2. The constraint any gold price has to satisfy

If we do pay gold, the number that breaks the economy is **the buy floor**, not the sell rate on its own.

| route | price as a fraction of list | how often |
|---|---|---|
| `shelfPrice()` with `HAGGLE_MAX = 0.4` (`shop-coupon.js:33`) | **0.60** | unlimited, forever |
| the same, plus a login coupon | lower still | one buy per coupon |
| featured daily deal, `FEATURED_DISCOUNT = 0.5` (`daily-deals.js:39`) | 0.50 | one per deal per day |
| …with the eye power's extra `× 0.5` (`daily-deals.js:108`) | **0.25** | one per deal per day |

So the inequality is:

> **sell rate < 0.25 × list**, or the featured deal is a gold printer.
> **sell rate < 0.60 × list**, or the ordinary shop is an *infinite* gold printer.

A 20% rate clears both with five points of margin. Anything at or above 25% is a loop on day one.

### 2.1 And a buyback is a MINT, not a transfer

`gold-rate.js` draws the distinction the whole file exists for:

| kind | what it is | may it be rated? |
|---|---|---|
| **MINT** | the game invents gold and hands it over | yes — `GOLD_MINT_RATE = 0.4` |
| **TRANSFER** | gold moves between two members | **no** — halving it destroys the seller's half |
| **RETURN** | gold the member already had, coming back | **no** — that is theft dressed as a nerf |

A sell-to-the-shop button is a MINT. It needs a `MINT_REASONS` entry in the same commit, or it pays full
rate forever and is only ever found as an outlier on the coin-economy screen — which is that file's entire
argument. A member-to-member sale is a TRANSFER and inflates nothing.

### 2.2 Where the meter actually sits

From `gold-rate.js`'s own measurements:

| window | minted | burned | net | sink |
|---|---|---|---|---|
| 30 days | 7,593,504 | 7,150,941 | **+442,563** | 94.2% |
| 7 days | 2,084,881 | 2,105,717 | −20,836 | 101.0% |
| 3 days | 898,955 | 914,685 | −15,730 | 101.7% |
| 1 day | 235,541 | 269,212 | −33,671 | 114.3% |

Burn is already running at or above mint. There is no headroom for a new faucet and there is no headroom to
lose a sink either — which rules out more than it sounds like, as §5 and §6 show.

---

## 3. Recommended — the Apothecary's bench: melt surplus into flat XP

**One function call, no new currency, and it does not touch the gold meter in either direction.**

```js
// Melt one surplus consumable. XP only, flat, no gold — see the three reasons below.
// Its own action, not the existing `consumable` one, so the XP screen can separate melts from uses.
await awardXp(buyerId, "consumable_melt", {
    points: meltXp(id),          // min(475, round(list / 150) * 25) — §3.2
    gold: 0,                     // no mint, so §2 never applies
    flat: true,                  // no Happy Hour, no Town prosperity
    dailyCap: MELT_DAILY_CAP,    // 5 — launch-cliff control, §3.5
    meta: { id, n },
});
```

Three properties, each already load-bearing somewhere else in the codebase:

1. **`gold: 0`** — `xp.js:164` is explicit that a caller may pass an explicit gold amount, and that trades
   pass `gold: 0` "so we don't hand out spendable currency for a payout we already paid the customer for."
   `salvageItem()` already does exactly this: `awardXp(buyerId, "craft_salvage", { points: xp, gold: 0 })`.
   No mint, no `MINT_REASONS` entry needed, nothing on the gold meter. §2 stops applying.
2. **`flat: true`** — no Happy Hour, no Town prosperity, no hangout buff. This is the rule
   `scroll_wisdom` already carries on its own card, written there because SoullessShiitake burned about
   sixteen tomes during a Happy Hour expecting double. Without it the bench becomes a multiplier
   arbitrage the moment a 4× lands.
3. **XP has no ceiling** — so the output of the bench can never itself become the next thing that piles up.
   And it is what a member at the strike cap actually wants: the cap is reached by late-game players, and
   XP is the one reward that still moves for them.

### 3.1 ⚠️ What the ledger says, and the one number that should change the design

Measured 2026-11-05 by `scripts/audit-xp-per-day.mjs` (read-only; it writes nothing). **Thirty days of
`mkt_xp_event` — 5,800,450 XP over 117,803 events:**

| source | XP in 30 days | share | events | avg per event |
|---|---|---|---|---|
| **`consumable`** | **1,595,100** | **32.1%** | 1,297 | **1,230** |
| `delve_run` | 599,052 | 12.1% | 2,610 | 230 |
| `pet_income` | 520,249 | 10.5% | 3,119 | 167 |
| `spin_reward` | 368,000 | 7.4% | 302 | 1,219 |
| `craft_combine` | 317,162 | 6.4% | 34,505 | 9 |
| `arena_win` | 275,314 | 5.5% | 3,981 | 69 |
| `sail_fish` | 274,614 | 5.5% | 4,265 | 64 |
| `cooking` | 236,555 | 4.8% | 5,443 | 43 |
| `boss_attack` | 157,291 | 3.2% | 4,633 | 34 |
| `harvest` | 157,008 | 3.2% | 12,027 | 13 |

⚠️ **XP out of a bottle is ALREADY the largest source of XP in the game — a third of all of it**, from only
1,297 events averaging **1,230 XP each**. That is the Codex and the Black Almanac doing the work, and it is
the single most important fact for this feature: a melt is not opening a new faucet, it is adding to the
biggest one that already exists. **Which is the strongest possible argument for Eric's 500 ceiling** — a
475 XP melt is **2.6× smaller than the average XP consumable already pays**, so it slots in underneath the
existing bottle economy rather than on top of it.

**What a day of play is worth,** per member per *active* day (days they actually earned something):

| window | member-days | p25 | **median** | p75 | p90 | mean | max |
|---|---|---|---|---|---|---|---|
| 30 days | 1,162 across 206 members | 33 | **1,457** | 6,590 | 14,205 | 4,992 | 78,235 |
| 7 days | 266 | — | **1,817** | — | 13,174 | — | — |

### 3.2 The rate: a ceiling and a divisor, each doing what the other cannot

```js
export const MELT_XP_CEILING = 475;   // strictly under a Tome of Wisdom's 500 — see below
export const meltXp = (id) => Math.min(MELT_XP_CEILING, Math.round(meltPrice(id) / 150) * 25);
```

**The ceiling is Eric's rule, 2026-11-05:** *"any item that would get sold for XP at any rate stays below a
Tome of Wisdom, which gives out 500 XP each time. So no excess item that gets sold should ever eclipse that
500 XP."* 475 rather than 500 because he said *below* and *never eclipse* — and 475 is the nearest step on
the 25-snap, so the formula and the rule agree instead of needing a special case at the boundary.

The divisor is `list ÷ 6`, snapped to 25s so every number on a card is round — one expression, no per-item
table to maintain.

| id | list | **XP on melt** | share of a level, median holder (L15) | held in stashes today |
|---|---|---|---|---|
| `pot_adrenaline` | 1,200 | **200** | 13% | **1,269** (43 members) |
| `stone_storm` | 2,000 | **325** | 22% | 757 (29) |
| `candy_caramel_apple` | *inherits `stone_storm`* | **325** | 22% | 209 (22) |
| `pot_secondwind` | 3,200 | **475** *(ceiling)* | 32% | 658 (26) |
| `stone_ember` | 3,500 | **475** *(ceiling)* | 32% | 452 (28) |
| `candy_sour_worm` | *inherits `stone_ember`* | **475** *(ceiling)* | 32% | 256 (27) |
| `pot_berserker` | 4,000 | **475** *(ceiling)* | 32% | 252 (30) |
| `pot_fury` | 6,500 | **475** *(ceiling)* | 32% | 42 (3) |

**Drop-only items inherit the list price of the buyable item with the identical effect.** That removes the
one genuinely unsolvable problem with any sell system: a drop-only item has no honest price, and inventing
one turns a relic into currency. A Caramel Apple is `strikes: 3` and so is a Storm Crystal, so it is worth
what a Storm Crystal is worth. **An item with no priced twin is simply not meltable.**

### 3.3 ⚠️ The ceiling flattens the top five items, and the stash data says that is fine

Five of the eight clamp to 475, so a Bottled Fury (6,500 gold) melts for exactly what a Second Wind (3,200)
does. That is a real cost and it had to be checked rather than waved through, because a member noticing
their most valuable spare pays the same as a cheaper one is a complaint waiting to happen.

**It affects a quarter of the actual inventory.** Of the 3,895 meltable potions in stashes right now, the
two items *below* the ceiling — Adrenaline Vial and Storm Crystal, the two Eric named — are **2,235 of
them, 57%**. `pot_fury`, the worst-compressed, is **42 units across 3 members**.

The alternative is a bigger divisor so fewer items clip, and it costs the cheap end — which is where the
volume is:

| divisor | vial | storm | 2nd wind | ember | berserker | fury | items at ceiling |
|---|---|---|---|---|---|---|---|
| **÷ 6** *(recommended)* | **200** | **325** | 475 | 475 | 475 | 475 | 5 |
| ÷ 8 | 150 | 250 | 400 | 450 | 475 | 475 | 2 |
| ÷ 9 | 125 | 225 | 350 | 400 | 450 | 475 | 1 |
| ÷ 10 *(first draft)* | 125 | 200 | 325 | 350 | 400 | 475 | 1 |

`÷ 6` is the pick because the ceiling has already taken the top of the range off the table, so the divisor's
only remaining job is setting the price of the two highest-volume spares. Buying strict ordering at the top
means paying for it at the bottom, on 57% of the inventory, to tidy a rank nobody can see from inside the
game.

### 3.4 Why the ceiling makes the arbitrage proof almost trivial

Two walls bound any rate, and both scale with list price (§2) — so a single divisor settles all eight items.

**Wall 1, the repeatable one.** Buy at the haggle floor, melt, keep the XP. That has to be worse per XP than
simply buying a haggled Tome of Wisdom (900 gold ÷ 500 XP = 1.80 gold/XP):

```
0.60 × list / meltXp  >  1.80     →     meltXp  <  list / 3.0
```

**Wall 2, the day-capped one.** The same attack through a featured daily deal with the eye power
(0.25 × list), against that same deal's Ancient Codex at 0.63 gold/XP:

```
0.25 × list / meltXp  >  0.63     →     meltXp  <  list / 2.52
```

**And here is what the ceiling buys for free.** Rearranging wall 2: an arbitrage needs
`meltXp > 0.397 × list`. With `meltXp` capped at 475 that requires **`list < 1,196 gold`** — and the
cheapest meltable item is the Adrenaline Vial at **1,200**. So the ceiling alone puts the entire set out of
reach of wall 2, with the vial four gold inside the margin.

That margin is too thin to rest on, which is exactly why the divisor still matters: at `÷ 6` the vial pays
200 against its own wall-1 limit of 400, a 2× margin. **The ceiling covers the expensive items, the divisor
covers the cheap ones, and neither can do the other's job.**

Every item clears both walls with room:

| id | melt XP | wall 1 (`list / 3`) | wall 2 (`list / 2.52`) |
|---|---|---|---|
| `pot_adrenaline` | 200 | 400 ✓ | 476 ✓ |
| `stone_storm` | 325 | 667 ✓ | 794 ✓ |
| `pot_secondwind` | 475 | 1,067 ✓ | 1,270 ✓ |
| `stone_ember` | 475 | 1,167 ✓ | 1,389 ✓ |
| `pot_berserker` | 475 | 1,333 ✓ | 1,587 ✓ |
| `pot_fury` | 475 | 2,167 ✓ | 2,579 ✓ |

**The invariant for the test**, two assertions over the whole meltable set:

```js
meltXp(id) < 500                      // Eric's rule, as code rather than as a comment
meltXp(id) < meltPrice(id) / 3        // wall 1, the binding arbitrage bound
```

A clamp can only ever lower a value, so the ceiling can never *open* an arbitrage — it is monotone-safe, and
a future price rise is caught by the second assertion rather than by somebody noticing.

### 3.5 ⚠️ The melt pays more XP than using the item does, and that is not a bug

An Adrenaline Vial grants +2 strikes, and a swing is `boss_attack: 30` — measured at an **actual average of
34** across 4,633 real swings, so the table figure is the live one. Using it earns ~68 XP; melting it pays
200.

| item | XP if used (strikes × 34 measured) | XP if melted | ratio |
|---|---|---|---|
| `pot_adrenaline` | 68 | 200 | 2.9× |
| `stone_storm` | 102 | 325 | 3.2× |
| `pot_secondwind` | 170 | 475 | 2.8× |

Real in *pure XP* terms, harmless in practice, because a swing is not worth only its XP. Per the strike
handler in `boss.js` (~line 1549), one strike also pays a raffle ticket — "the heaviest ticket in the
table" — plus a `surpriseChest` roll, candy during an event, a Prospector gold proc, and the damage itself
toward the kill (`boss_participated` 30, `boss_won` 150, and the boss rewards). Anybody who can still use a
strike gains more by swinging.

The deeper reason is a true fact about these items rather than a fudge: **strike potions are poor XP and
good damage.** The shop sells XP at ~3 gold/XP (a Tome) and sells strikes at 600 gold each (a vial), so a
vial was never an XP purchase. The melt is denominated in the item's **gold** value, not its XP output,
because what you give up by melting is a tradeable asset, not an XP stream.

**If that still reads wrong, there is a clean fix:** gate the melt on the cap. `memberBonusStrikes(buyerId)`
already returns today's total, clamped to `MAX_POTION_STRIKES`, so the button can be offered only for the
portion genuinely over the ceiling. Then "XP if used" is literally zero, the inversion cannot exist at any
rate, and the rate could go right up to the wall. Cost: one extra read and one condition. Left out of the
recommendation only because surplus is something a member notices in their stash, not at the moment they cap
out — a button that comes and goes with the time of day is harder to explain than a flat rate.

### 3.6 The daily cap, now that the backlog has actually been counted

`awardXp` already takes `dailyCap` — "at most this many awards of this action per user per day"
(`xp.js:125`), a count of awards rather than a point budget. Used once today, by `purchase_flat` with
`dailyCap: 1`. So this needs no new machinery.

**What is actually sitting in stashes:** 3,895 meltable potions, held by **59 members**. And the
distribution is the whole story:

| | spare potions held |
|---|---|
| median holder | **4** |
| mean | 66 |
| p90 | 146 |
| **biggest single hoard** | **866** |

**Who those holders are,** by lifetime XP — not the median *member*, who has 1,006 XP total, because most
accounts played briefly and stopped. These are the engaged core:

| | lifetime XP | level | cost of that level |
|---|---|---|---|
| p25 holder | 2,024 | 6 | 600 |
| **median holder** | **11,522** | **15** | **1,500** |
| p75 holder | 247,234 | 42 | 22,680 |
| biggest | 2,103,254 | 81 | 64,800 |

**The curve does most of the balancing by itself.** A 475 melt is 32% of a level for the median holder at
L15 and **2% of a level** for the p75 holder at L42 — and the big hoards sit at the top, where they are
proportionally trivial. The median holder has four potions, which is about two-thirds of one level in total.

**So the cap is for one shape of problem: a big hoard on a low-level account.** Melting the whole 3,895-unit
backlog at once would be **1,356,250 XP — 23% of a Den-wide month** (5,800,450), concentrated in a handful
of accounts.

**`dailyCap: 5`.** Five melts a day is **invisible to more than half the holders** — the median holder's
four spares clear in a single day — and it caps the worst case at **2,375 XP a day**, about 1.6× a median
active day. The 866-potion hoard becomes a **174-day** trickle instead of a leaderboard event. Reviewable
once the backlog has drained; steady state needs no cap at all, because §3.4 proves XP can never be bought
more cheaply by melting, so the only potions a melt converts are ones the game gave away out of a faucet
that is already tuned.

### 3.7 The no-arbitrage proof, at the recommended rate

| route | gold | XP | gold/XP |
|---|---|---|---|
| Ancient Codex, featured deal + eye — the cheapest XP in the game | 1,250 | 2,000 | **0.63** |
| Tome of Wisdom, haggled 40% — the cheapest *repeatable* XP | 900 | 500 | **1.80** |
| Ancient Codex at list | 5,000 | 2,000 | 2.50 |
| Tome of Wisdom at list | 1,500 | 500 | 3.00 |
| **melt a vial bought at the daily-deal floor** | 300 | 200 | **1.50** |
| **melt a vial bought haggled 40%** | 720 | 200 | **3.60** |

The repeatable route is **2.0× worse** than the cheapest repeatable shelf, and the once-a-day route is
**2.4× worse** than the deal it would have to beat. There is no rate of play that makes melting a cheaper
way to buy XP than buying XP.

### 3.8 What it costs to build

| piece | where |
|---|---|
| `MELT_XP_CEILING = 475`, `MELT_DAILY_CAP = 5`, `meltXp()`, the twin table | `consumables.js`, next to `stackNote()` |
| `meltConsumable(buyerId, id, n)` — guarded `UPDATE … count = count - $n WHERE count >= $n RETURNING count`, then `awardXp` | `consumables.js` |
| a `POST { action: "melt" }` branch | `src/app/api/marketplace/consumables/route.js` |
| a "Melt — N XP" button on meltable stacks only | `src/components/ConsumablesClient.js` |
| an `XP_ACTION` label for `consumable_melt` | `xp-economy.js`, so melts stay separable from the 32% that `consumable` already is |
| bulk melt | `BULK_USE_CAP = 25` exists, but `MELT_DAILY_CAP` is 5 — the melt confirm has to read the cap, not the bulk constant |
| the two §3.4 assertions as a test | new |

Decrement **before** the award, guarded, and read the count off the `RETURNING` row — the same ordering
`market.js` documents at length, since `neon()`'s HTTP driver has no `BEGIN`/`ROLLBACK` and a read-then-write
does not hold under two taps.

## 4. Also worth doing — turn-ins, which cost no currency at all

A Quartermaster daily or a town hunt that **wants** 2 Storm Crystals and pays XP, pet XP or forge parts. No
gold, no new currency, and it makes the surplus *wanted* rather than merely disposable — which is what
actually fixed the cooking pile in §1.3.

Three quest families already exist and `town-hunts.js:18` is explicit that they must not be merged:
`town-quests.js` (plaza dailies), `acts.js` (the one-way act ladder), `town-hunts.js` (repeatable, rewards
leaving the plaza). A consumable turn-in is the Quartermaster's: it rewards playing in the plaza. Nothing in
the game consumes a consumable as a quest objective today, so this is greenfield either way.

---

## 5. Considered and not recommended — forge parts

The obvious move, and it is weaker than it looks.

`salvageItem()` → `addParts(buyerId, tier, n)` → `mkt_salvage_part` already exists, and parts are a closed
currency with **no gold price anywhere**: the counter's parts bundles were deliberately cut
(`casino-counter.js:56` — "a SECOND, worse route to a thing another feature already hands out"), leaving
gear salvage and farm encounters as the only faucets and the Forge as the only sink. So the economics are
clean.

The problem is the ladder. `COMBINE_COST = 5`, five rungs, so the tier ramp in Cinder Scrap units is
1 / 5 / 25 / 125 / **625**. A safe payout for a 1,200-gold potion is one or two tier-1 Cinder Scrap — and a
member at the strike cap is a late-game member whose Forge wants **Emberheart Shard**, 625 Cinder Scrap away.
`enhanceCost` is 6 parts at the item's own rarity tier for the first level, rising to 8 per level: one
enhancement on a mythic piece is 3,750 Cinder Scrap equivalent.

So the honest version of this option pays the people with the surplus in a currency they cannot use, which
is `buyback.js`'s own lesson in a different coat — `BUYBACK_MIN_CENTS` exists because "sixty cents does not
read as a transaction, it reads as being brushed off." Paying mid-tier parts instead would fix the feel and
would need a gold→parts rate argued from scratch. XP needs no such argument.

---

## 6. Considered and not recommended yet — consumables on the Market

This is what GrayKitsune asked for (`market.js:12`, alongside Sunflower Jinxx's original request), and
`market.js` has everything structurally: the escrow-first listing order, `MAX_OPEN_PER_SELLER = 12`, the
`locked-content.js` filter that already keeps deep-water fish off the screens of members who have not
unlocked them. A sale is a TRANSFER, so it inflates nothing.

Three things have to be solved first, and none of them is small:

1. **It eats a sink.** The market takes **no cut** — `buyFromMarket` pays the seller `paidCost` exactly. The
   gold shop is one of the Den's biggest burns, and §2.2 shows burn already at 94–101% of mint. Members
   selling Adrenaline Vials at 400 where the shop charges 1,200 does not inflate the supply; it removes the
   thing that was draining it. Needs a listing floor (no lower than ~60% of list, the haggle floor) **and** a
   tax that is burned rather than transferred.
2. **Event gating leaks.** Candy, the All Hallows' relics and `hw_ticket` are reachable only through a
   Hallowe'en chest, which cannot be granted while `HALLOWEEN_PUBLIC` is false. A tradeable Soul Cake is a
   second door through that gate. `locked-content.js` is the right mechanism; it has to be wired up
   deliberately.
3. **Drop-only relics stop being rare.** `consumables.js` says it twice in its own words — "the shop is
   where rare things go to stop being rare", and `delve_second_descent` is `price: null` because "a daily
   reset you can buy is not a daily limit." A player market is a shop. Soulbound items (`prismatic_stone`)
   are already flagged in the catalog and must be excluded by that flag, not by a hand-maintained list.

Worth building if Luke wants a player market as a feature in its own right. It is the wrong shape for "I
have too many Storm Crystals."

---

## 7. Exclusions, and the one landmine to avoid

**Meltable is a two-condition allow-list, derived, never hand-maintained:**

```js
// Only the two families with a ceiling, and only when there is a priced twin to inherit from.
const CAPPED = new Set(["strikes", "damage"]);
const meltable = (id) =>
    CAPPED.has(CONSUMABLES[id]?.effect?.type)
    && !CONSUMABLES[id]?.soulbound
    && meltPrice(id) != null;        // list price, or a priced twin's, or null
```

| excluded | why |
|---|---|
| `hw_whetstone` | `edge`, outside `BOSS_MULT_CAP` — the one the ceiling does *not* make redundant (§1.2) |
| `prismatic_stone` | `soulbound: true`, already flagged in the catalog |
| `hw_ticket` | no `effect` at all — it is spent by the gachapon, and `useConsumable` refuses it by name |
| everything `xp` / `pet_xp` / `spin_token` / `sail_*` / `farm_*` | banks without a ceiling, so never surplus — §1 |
| drop-only relics, forge scrolls, `delve_second_descent`, `treat_ambrosia` | no priced twin, and pricing them makes rare things buyable |
| dishes (`DISH_IDS`) | already solved — a dish is pet food (§1.3) |

⚠️ **And the landmine `consumables.js` warns about twice: do not ship a card with an effect no code
consumes.** The file calls it "the Den's commonest bug by a distance" — an effect printed on a card that
nothing handles is a picture of a sweet. A "Melt — 200 XP" button that does not decrement, or decrements
without awarding, is the same defect wearing the opposite face. The guarded decrement and the `awardXp` land
in one function or neither lands.

---

## 8. Open questions for Luke

1. **Bulk melt, or one at a time?** `BULK_USE_CAP = 25` and `canBulkUse()` already exist for the strike and
   damage families, so "melt all but 4" is nearly free. Forty confirms is the actual cost of the Forge
   (`crafting.js`'s own note on bulk salvage), and this would repeat it.
2. **Is `÷ 6` the right generosity, given the ceiling?** §3.3 has the ladder. With `MELT_XP_CEILING = 475`
   doing the work at the top, the divisor only really prices the Adrenaline Vial and the Storm Crystal —
   57% of the actual inventory. `÷ 6` pays those 200 and 325; `÷ 9` would pay 125 and 225 and buy strict
   rank ordering at the top in exchange. One line in one place either way.
3. **Gate the melt on the strike cap, or keep a flat rate?** §3.4 — gating dissolves the
   melt-pays-more-than-using inversion completely and would let the rate go to the wall, at the cost of a
   button that comes and goes with the day's cap. Flat is recommended; this is the call most worth
   disagreeing with.
4. **Is `dailyCap: 5` the right throttle?** §3.6 — five is invisible to the median holder (who has four
   spares) and turns the one 866-potion hoard into a 174-day trickle. The lever is there if the backlog
   drains faster or slower than expected; it is a constant, not a design.
5. **Should the bench raise the cap instead?** An alternative nobody asked for: let surplus potions push
   past `MAX_POTION_STRIKES` at a steep conversion. Deliberately not proposed — eight is called
   "deliberately generous" in its own comment, and the cap exists to stop stockpiles substituting for the
   things members build.

---

## 9. ⏭️ NEXT TIME: a per-ITEM daily limit, not a per-action one

Eric, parking the idea: *"Something to look into next time I bring this up is to maybe put a daily limit on
how many of each item people will get to sell each day."*

That is a different cap from the one in §3.6 and it is worth being precise about the difference, because the
two look identical in a sentence and only one of them is free:

| | what it bounds | §3.6's answer |
|---|---|---|
| **per-action** | *total* melts a day, whatever the item | `dailyCap: 5` — already built |
| **per-item** | melts *of each item* a day | **not possible with `dailyCap`** |

### 9.1 ⚠️ `awardXp`'s `dailyCap` cannot do this, and the reason is in the SQL

The guard is one statement (`xp.js:184`), and its count is keyed on the **action alone**:

```sql
INSERT INTO mkt_xp_event (buyer_id, action, points, dedupe_key, meta)
SELECT $1, $2, $3, $4, $5
 WHERE (SELECT COUNT(*) FROM mkt_xp_event
          WHERE buyer_id = $1 AND action = $2
            AND created_at::date = (NOW() AT TIME ZONE 'utc')::date) < $6
RETURNING id
```

The item id lives in `meta`, which the `WHERE` never looks at. So `dailyCap: 3` on `consumable_melt` means
three melts of *anything*, not three of each.

**⚠️ And do not solve it with a read-then-write.** "Count today's melts of this id, then award if under the
limit" is two statements, and `neon()`'s HTTP driver has no `BEGIN`/`ROLLBACK` — so two taps race it and
both pass. That single-statement `INSERT … SELECT … WHERE` shape *is* the concurrency control, which is the
same lesson `market.js` spells out at length for listings. Any per-item cap has to stay inside one
statement.

### 9.2 Two ways that keep the atomicity, and the trade between them

**A — one action per item** (`consumable_melt:pot_adrenaline`). Gets the existing guard for free with no
change to `awardXp` at all. Costs: the action namespace stops being a closed set, and `xp-economy.js` grows
from one row to eight on the XP screen — which is noise on a screen whose whole job is showing where XP
comes from, and §3.1 is the argument for keeping that screen readable.

**B — extend the guard to count on `meta`**, e.g. an optional `dailyCapKey` that adds
`AND meta->>'id' = $7` to the subquery. Keeps one action, one row on the XP screen, and the same atomic
shape. Costs: a change to `awardXp`, which every feature in the game calls — so it has to be additive and
default to today's behaviour when the new argument is absent.

**B is the better shape** and it is a small, contained change. Worth building the narrow version rather than
reaching for A because A is zero-diff.

### 9.3 ⚠️ The landmine either way: `dailyCap` resets on a UTC day, and nothing else in the game does

Look again at the guard above — `(NOW() AT TIME ZONE 'utc')::date`. **51 files under
`src/lib/marketplace/` compute their day boundary in `America/Chicago`** (the arena's free respec, the
dungeon run counters, the daily deals, the feature dailies, every `*_today` column). `dailyCap` is the
outlier.

So a melt limit riding on `dailyCap` would reset at **midnight UTC — 6pm or 7pm Central**, hours before
every other daily in the game. The symptom is not a crash; it is "my melts came back in the evening but my
dungeon runs didn't", reported weeks later, exactly like the sailing-notification cadence bug in
`CLAUDE.md`'s family-B list. Whichever of A or B gets built, **the day expression has to move to
`America/Chicago` to match the other fifty-one**, and that is a change to shared code used by
`purchase_flat` today — so it needs checking against that one caller rather than being assumed harmless.
