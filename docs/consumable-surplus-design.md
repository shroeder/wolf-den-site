# Selling surplus consumables — what is safe and what the numbers have to be

Captured 2026-11-05 from Eric, **to build after review**. Nothing started.

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
    points: meltXp(id),          // round(list / 150) * 25 — §3.2
    gold: 0,                     // no mint, so §2 never applies
    flat: true,                  // no Happy Hour, no Town prosperity
    dailyCap: MELT_DAILY_CAP,    // 10 — launch-cliff control, §3.5
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

### 3.1 What a level actually costs, which is the thing "reasonable" has to be measured against

Computed from `xp-curve.js`'s own table rather than the old closed form:

| level | cumulative XP to reach | **cost of that one level** |
|---|---|---|
| 5 | 1,000 | 500 |
| 10 | 4,500 | 1,000 |
| 15 | 10,500 | 1,500 |
| 20 | 19,000 | 2,000 |
| 21 | 21,000 | 2,520 |
| 25 | 34,600 | 5,000 |
| 30 | 67,200 | 9,000 |
| 40 | 203,400 | 20,000 |
| 50 | 467,600 | 35,000 |

⚠️ **And `xp-curve.js` says where the Den actually is:** `CURVE_KNEE` was set to 20 because "the whole Den
sits at or below it apart from two members at 21 and the owner." So for essentially every member a level
costs **1,000–2,520 XP**, not tens of thousands. Any melt rate has to be judged against that, and it is why
the first draft's `list ÷ 10` needed checking rather than shipping.

For scale, the rest of the XP table (`xp.js:54`):

| action | XP | how often |
|---|---|---|
| `daily_active` | 3 | once a day |
| `boss_attack` | **30** | every swing, bounded by the strike cap |
| `profile_complete` | 25 | once, ever |
| `discord_link` | 50 | once, ever |
| `first_purchase` | 100 | once, ever |
| `boss_won` | 150 | once per boss, raffle winner |
| Tome of Wisdom (1,500 gold) | **500** | unlimited |
| Ancient Codex (5,000 gold) | **2,000** | unlimited |

### 3.2 The rate: `round(list / 150) × 25`

That is `list ÷ 6`, snapped to the nearest 25 so every number on a card is a round one — one expression, no
per-item table to maintain:

| id | list | **XP on melt** | share of a level at L20 |
|---|---|---|---|
| `pot_adrenaline` | 1,200 | **200** | 10% |
| `stone_storm` | 2,000 | **325** | 16% |
| `pot_secondwind` | 3,200 | **525** | 26% |
| `stone_ember` | 3,500 | **575** | 29% |
| `pot_berserker` | 4,000 | **675** | 34% |
| `pot_fury` | 6,500 | **1,075** | 54% |
| `candy_caramel_apple` | *inherits `stone_storm`* | **325** | 16% |
| `candy_sour_worm` | *inherits `stone_ember`* | **575** | 29% |

**Drop-only items inherit the list price of the buyable item with the identical effect.** That removes the
one genuinely unsolvable problem with any sell system: a drop-only item has no honest price, and inventing
one turns a relic into currency. A Caramel Apple is `strikes: 3` and so is a Storm Crystal, so it is worth
what a Storm Crystal is worth — nothing invented, nothing argued about. **An item with no priced twin is
simply not meltable.**

### 3.3 Why `÷ 6` and not `÷ 10` or `÷ 3`

There are two hard walls, and both scale with list price, so the constraint is a single divisor rather than a
per-item check.

**Wall 1 — the repeatable one, and the binding one.** Buy at the haggle floor, melt, keep the XP. That has
to be worse per XP than simply buying a haggled Tome of Wisdom (900 gold ÷ 500 XP = 1.80 gold/XP):

```
0.60 × list / meltXp  >  1.80     →     meltXp  <  list / 3.0
```

**Wall 2 — the day-capped one.** The same attack through a featured daily deal with the eye power
(0.25 × list), against that same deal's Ancient Codex at 0.63 gold/XP:

```
0.25 × list / meltXp  >  0.63     →     meltXp  <  list / 2.52
```

So `list ÷ 3` is the wall. The ladder:

| divisor | vial | Second Wind | Bottled Fury | margin vs the wall | Second Wind as a share of an L20 level |
|---|---|---|---|---|---|
| ÷ 10 *(first draft)* | 120 | 320 | 650 | 3.3× | 16% |
| **÷ 6** *(recommended)* | **200** | **525** | **1,075** | **2.0×** | **26%** |
| ÷ 5 | 240 | 640 | 1,300 | 1.67× | 32% |
| ÷ 4 | 300 | 800 | 1,625 | 1.33× | 40% |
| ÷ 3 | 400 | 1,067 | 2,167 | 1.0× — **at the wall** | 53% |

`÷ 6` roughly doubles the first draft, keeps a clean **2× safety margin** so a future discount change cannot
quietly cross the wall, and lands a melted Second Wind at about a quarter of a level — which reads as worth
doing without reading as a shortcut.

**The one-line invariant for the test:** for every meltable id, `meltXp(id) < list(id) / 3`. Assert it
across the whole set and no future price edit can open the loop silently.

### 3.4 ⚠️ The melt pays more XP than using the item does, and that is not a bug

Worth stating plainly because it looks wrong on the card. An Adrenaline Vial grants +2 strikes, and a swing
is `boss_attack: 30` — so **using** it earns 60 XP, while melting it pays 200.

| item | XP if used (strikes × 30) | XP if melted | ratio |
|---|---|---|---|
| `pot_adrenaline` | 60 | 200 | 3.3× |
| `stone_storm` | 90 | 325 | 3.6× |
| `pot_secondwind` | 150 | 525 | 3.5× |

That inversion is real in *pure XP* terms and harmless in practice, because a swing is not worth only its
XP. Per the strike handler in `boss.js` (~line 1549), one strike also pays a raffle ticket — "the heaviest
ticket in the table" — plus a `surpriseChest` roll, candy during an event, a Prospector gold proc, and the
damage itself toward the kill (`boss_participated` 30, `boss_won` 150, and the boss rewards). Anybody who
can still use a strike gains more by swinging.

The deeper reason is a true fact about these items rather than a fudge: **strike potions are poor XP and
good damage.** The shop sells XP at ~3 gold/XP (a Tome) and sells strikes at 600 gold each (a vial), so a
vial was never an XP purchase. The melt is denominated in the item's **gold** value, not its XP output,
because what you give up by melting is a tradeable asset, not an XP stream.

**If that still reads wrong, there is a clean fix:** gate the melt on the cap.
`memberBonusStrikes(buyerId)` already returns today's total, clamped to `MAX_POTION_STRIKES`, so the button
can be offered only for the portion genuinely over the ceiling. Then "XP if used" is literally zero, the
inversion cannot exist at any rate, and the rate could go right up to the wall. Cost: one extra read and
one condition. Left out of the recommendation only because surplus is something a member notices in their
stash, not at the moment they cap out — a button that appears and disappears by time of day is harder to
explain than a flat rate.

### 3.5 The daily cap is for the launch cliff, not the steady state

`awardXp` already takes `dailyCap` — "at most this many awards of this action per user per day"
(`xp.js:125`), a count of awards rather than a point budget. Used once today, by `purchase_flat` with
`dailyCap: 1`.

**Steady state does not need a cap.** §3.3 proves XP can never be bought more cheaply by melting, so the
only potions a melt can convert are ones the game gave away — drops, the wheel, chests — which is a faucet
that is already tuned. Melting does not create a new faucet, it drains an existing one.

**Day one does need a cap.** Members have been accumulating spares for months with nowhere to put them. The
first tap of this feature on a stash of forty potions is several levels at once, and that is a one-time
cliff, not an ongoing rate.

So: **`dailyCap: 10`**, justified as cliff control and reviewable once the backlog has drained. At `÷ 6`
that is roughly 2,000–5,000 XP a day for someone actively working through a hoard — one to two levels at
L20, falling away fast as they climb — and after the first week nobody reaches it.

### 3.6 The no-arbitrage proof, at the recommended rate

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
### 3.7 What it costs to build

| piece | where |
|---|---|
| `MELTABLE` set + `meltXp()` + the twin table | `consumables.js`, next to `stackNote()` |
| `meltConsumable(buyerId, id, n)` — guarded `UPDATE … count = count - $n WHERE count >= $n RETURNING count`, then `awardXp` | `consumables.js` |
| a `POST { action: "melt" }` branch | `src/app/api/marketplace/consumables/route.js` |
| a "Melt — N XP" button on meltable stacks only | `src/components/ConsumablesClient.js` |
| bulk melt | `BULK_USE_CAP = 25` already exists; reuse the cap and the confirm |
| `MELT_DAILY_CAP = 10` passed as `dailyCap` | `consumables.js` (§3.5) |
| an `XP_ACTION` label for the new action | `xp-economy.js`, so the melt is separable on the XP screen |
| the §3.3 invariant as a test | new |

Decrement **before** the award, guarded, and read the count off the `RETURNING` row — the same ordering
`market.js` documents at length, since `neon()`'s HTTP driver has no `BEGIN`/`ROLLBACK` and a read-then-write
does not hold under two taps.

---

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
2. **Is `÷ 6` the right generosity?** §3.3 lays out the ladder and the wall at `÷ 3`. `÷ 6` is the pick
   because it holds a 2× margin against a future discount change; `÷ 5` and `÷ 4` are both still safe and
   pay 20% and 50% more. The whole balance of the feature is that one divisor — it is a one-line change in
   one place, so it can move after launch on what the XP screen shows.
3. **Gate the melt on the strike cap, or keep a flat rate?** §3.4 — gating dissolves the
   melt-pays-more-than-using inversion completely and would let the rate go to the wall, at the cost of a
   button that comes and goes with the day's cap. Flat is recommended; this is the call most worth
   disagreeing with.
4. **Worth a read of `mkt_xp_event` before committing to a number?** The one figure not in this document is
   what a median member earns in XP on an ordinary day, which is what would settle `÷ 6` versus `÷ 4`. It is
   a read-only `SELECT` on the analytics table — but it is the live shared database, so say the word rather
   than assume it.
5. **Should the bench raise the cap instead?** An alternative nobody asked for: let surplus potions push
   past `MAX_POTION_STRIKES` at a steep conversion. Deliberately not proposed — eight is called
   "deliberately generous" in its own comment, and the cap exists to stop stockpiles substituting for the
   things members build.
