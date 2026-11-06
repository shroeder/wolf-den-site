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
await awardXp(buyerId, "apothecary_melt", { points: meltXp(id), gold: 0, flat: true });
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

### 3.1 The rate: XP = list ÷ 10

25% of the item's list value, priced at the Ancient Codex's own gold-per-XP (5,000 gold ÷ 2,000 XP = 2.5):

```
meltXp(id) = round(0.25 × list(id) / 2.5) = list(id) / 10
```

| id | list | **XP on melt** |
|---|---|---|
| `pot_adrenaline` | 1,200 | **120** |
| `stone_storm` | 2,000 | **200** |
| `pot_secondwind` | 3,200 | **320** |
| `stone_ember` | 3,500 | **350** |
| `pot_berserker` | 4,000 | **400** |
| `pot_fury` | 6,500 | **650** |
| `candy_caramel_apple` | *inherits `stone_storm`* | **200** |
| `candy_sour_worm` | *inherits `stone_ember`* | **350** |

**Drop-only items inherit the list price of the buyable item with the identical effect.** That is what
removes the one genuinely unsolvable problem with any sell system: a drop-only item has no honest price, and
inventing one turns a relic into currency. A Caramel Apple is `strikes: 3` and so is a Storm Crystal, so it
is worth what a Storm Crystal is worth — nothing invented, nothing argued about. **An item with no priced
twin is simply not meltable.**

### 3.2 The no-arbitrage proof

The only attack is: buy at the floor, melt, keep the XP. So compare gold-per-XP against the cheapest
*direct* gold→XP route in the game.

| route | gold | XP | gold/XP |
|---|---|---|---|
| Ancient Codex, featured deal + eye (the cheapest XP in the game) | 1,250 | 2,000 | **0.63** |
| Ancient Codex at list | 5,000 | 2,000 | 2.50 |
| Tome of Wisdom, haggled 40% | 900 | 500 | 1.80 |
| Tome of Wisdom at list | 1,500 | 500 | 3.00 |
| **melt a vial bought at the daily-deal floor** | 300 | 120 | **2.50** |
| **melt a vial bought haggled 40%** | 720 | 120 | **6.00** |

The repeatable route is **3.3× worse** than simply buying a haggled Tome, and the once-a-day route is **4×
worse** than the deal it would have to beat. There is no rate of play that makes melting a cheaper way to
buy XP than buying XP.

**The one-line invariant for the test:** for every meltable id,
`floor_price(id) / meltXp(id) > 0.63` — i.e. melting is never cheaper per XP than the cheapest shelf. Assert
it across the whole meltable set and a future price change cannot quietly open the loop.

### 3.3 What it costs to build

| piece | where |
|---|---|
| `MELTABLE` set + `meltXp()` + the twin table | `consumables.js`, next to `stackNote()` |
| `meltConsumable(buyerId, id, n)` — guarded `UPDATE … count = count - $n WHERE count >= $n RETURNING count`, then `awardXp` | `consumables.js` |
| a `POST { action: "melt" }` branch | `src/app/api/marketplace/consumables/route.js` |
| a "Melt — N XP" button on meltable stacks only | `src/components/ConsumablesClient.js` |
| bulk melt | `BULK_USE_CAP = 25` already exists; reuse the cap and the confirm |
| the test from §3.2 | new |

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
2. **Is `list ÷ 10` the right generosity?** §3.2 shows the ceiling is far higher than this — up to ~480 XP
   for a vial is still non-arbitrageable, because the cheap routes are day-capped. 120 is the conservative
   pick. The whole balance of the feature is that one divisor.
3. **Should the bench raise the cap instead?** An alternative nobody asked for: let surplus potions push
   past `MAX_POTION_STRIKES` at a steep conversion. Deliberately not proposed — eight is called
   "deliberately generous" in its own comment, and the cap exists to stop stockpiles substituting for the
   things members build.
