# Category packs — mystery packs that pull from the shelf

**Status:** design, owner-gated, nothing built. 2026-10-27.
**Parent:** `docs/virtual-packs-and-the-card-vault.md` — this is §1.4 of that doc ("Where this goes next —
the whole shelf"), which already put the `channel` column in `mystery_bag_cards` as the seam this runs
through. Read §5 (selling back), §7 (the money) and §16 (the gate) there first; none of it is restated here.

Luke, 2026-10-27: *"alongside the mystery packs, we have a very similar set of features that let you do the
exact same thing, but pull from the entire store's inventory for a given category… They'll always be mystery
packs, but they'll be branded differently per category… the expected value average is probably going to
dictate what we charge, rounding up to the nearest $5… this will be owner gated. We won't regress and owner
gate the mystery packs."*

---

## 0. What this is in one paragraph

Today a pack opens a **sealed bag in a tub**: 76 of them, hand-built, each one a row in `mystery_bag_cards`.
This takes the same machine and points it at **the shelf** — the singles we already have in Square — so that
"Pokémon Singles" or "Magic Singles" becomes a pack you can open for store credit, with the same reveal, the
same sell-back at 60%, and the same Card Vault behind it. The bags do not change and do not go back behind a
gate. Everything new here is a second channel standing beside them.

---

## 1. The shelf, measured (2026-10-27, prod)

Every number below is from `inventory_feed`, in stock, quantity > 0, **consigned excluded** (§8).

| category | lines | units | mean | **median** | max | stock value |
|---|---|---|---|---|---|---|
| Pokémon Single Card | 876 | 910 | $14.75 | **$6.00** | $290 | $13,104 |
| Magic Single Card | 181 | 198 | $13.23 | **$8.00** | $136 | $2,454 |
| Yu-Gi-Oh Single | 51 | 51 | $9.61 | **$4.00** | $157 | $490 |
| Bulk Cards | 2 | 1,455 | $0.25 | — | — | $364 |

For comparison, **the bags as they stand today**: 76 packs, mean $17.50, **median $4.00**, max $258, price
$25.

⚠️ **The mean is nearly three times the median on the shelf, and that is the entire design problem.** A pool
priced off its average pays its typical puller a small fraction of what they paid, because the average is
being held up by a tail they will almost never hit. It is also exactly how the bags already behave, so this
is not a new sin — but the bags earn it with a $258 top end inside a 76-card pool a member can read in full
on the board. A 910-unit shelf is not readable, and "the average card is $15" would be a true sentence that
mis-sells the product.

---

## 2. The core proposal: a pool is **(category × value band)**, not a category

Cut the same shelf into bands and the skew disappears, because within a band the mean and the median
converge. Pokémon singles, banded:

| band | units | mean (EV) | median | price = ⌈EV/5⌉×5 | margin vs real COGS |
|---|---|---|---|---|---|
| $2–$10 | 539 | $4.21 | $4.00 | **$5** | ~61% |
| $10–$25 | 209 | $14.85 | $14.00 | **$15** | ~54% |
| $25–$60 | 94 | $36.47 | $35.50 | **$40** | ~58% |
| $60+ | 35 | $121.80 | $95.00 | **$125** | ~55% |

Mean and median are within 10% of each other in every band bar the last. **That is the product working**: a
$15 Pokémon pack whose typical card is $14 is a fair-feeling thing to buy twice, where a $15 pack whose
typical card is $6 is a thing you buy once.

Banding also gives the brand ladder for free. The same category becomes several packs at several prices —
a cheap one you open for fun and a chase one you save for — which is what "branded differently per category"
wants anyway, and it is the shape the Counter's chest ladder already proved.

Magic and Yu-Gi-Oh banded the same way:

| pool | units | lines | EV | price |
|---|---|---|---|---|
| Magic $2–$10 | 111 | 94 | $3.96 | $5 |
| Magic $10–$25 | 59 | 59 | $15.32 | **$20** |
| Magic $25+ | 28 | 28 | $39.93 | $40 |
| Yu-Gi-Oh $2–$10 | 42 | 42 | $3.71 | $5 |
| Yu-Gi-Oh $10–$25 | **4** | 4 | $12.50 | — |
| Yu-Gi-Oh $25+ | **5** | 5 | $56.80 | — |

**Yu-Gi-Oh only has a bottom band.** That answers "categories we have enough of" with a number rather than a
feeling — see §3.

---

## 3. "Enough of" — a depth bar, written down

A pool that is too thin fails in three separate ways, and only the first is obvious:

1. It **empties**, and a pack with nothing in it is a dead button.
2. It becomes **readable** — 5 cards means the fourth buyer knows what is left, and a mystery pack whose
   contents are known is a vending machine with worse odds.
3. Its **EV is noise**. The $60+ Pokémon band is 35 units with a mean of $121.80 and a median of $95; one
   $290 card leaving moves the EV by 5%, so the price the pricing rule produces wobbles with the stock.

Proposed bar, to be argued with: **≥ 60 units AND ≥ 40 distinct lines AND no single line > 15% of pool
value.** Run against today's shelf:

| pool | units | lines | biggest line | verdict |
|---|---|---|---|---|
| Pokémon $2–10 | 539 | 508 | 1.6% | **pass** |
| Pokémon $10–25 | 209 | 206 | 1.4% | **pass** |
| Magic $2–10 | 111 | 94 | 6.9% | **pass** |
| Magic $10–25 | **59** | 59 | 2.5% | **fails by one unit** |
| Yu-Gi-Oh $10–25 | 4 | 4 | — | fails |
| Yu-Gi-Oh $25+ | 5 | 5 | — | fails |

⚠️ **Magic $10–25 failing on 59 units against a bar of 60 is the bar admitting it is a guess.** The
concentration test does real work — it is what would catch a pool carried by one expensive card — but the
unit count is a number I picked, and one unit either side of it is not a difference anybody can defend. It
wants your judgement, not my rounding: see question 4.

A pool that drops under the bar **closes itself** and says "back soon" rather than erroring — the same
treatment `priceTrusted` already gets, for the same reason.

---

## 4. Bulk is a different animal

Luke, 2026-10-27: *"Bulk cards should be under their own category, mind making me a bulk category?"*

**The Square category already exists** and holds exactly two lines: `Magic Bulk` (862 units) and
`Pokemon Bulk` (593 units), both listed at $0.25, both costed at **$0.01** in `wolfden_item_cost`. So there
is nothing to create in the catalogue — what has to be built is a pool *shape* that bulk fits, and bulk does
not fit the one in §2.

### 4.1 ⚠️ The sell-back floor pays 400% on a bulk card

This is the blocker, and it is not a tail risk — it is what a rational member does every time.

| card value | sells back for | share of value |
|---|---|---|
| **$0.25 (bulk)** | **$1.00** | **400%** |
| $0.50 | $1.00 | 200% |
| $1.00 | $1.00 | 100% |
| $1.67 | $1.25 | 75% |

`BUYBACK_MIN_CENTS` is $1.00 and it exists for a good reason — *"sixty cents does not read as a transaction,
it reads as being brushed off"* — but it quietly assumes a card worth at least about $1.67. Bulk is worth a
quarter.

Run the arithmetic on a 25-card pack priced by the §5 rule: list value $6.25, price $10, our cost $0.25.
A member pays **$10**, sells the handful back a card at a time, and collects **$25**. We are down $15 on
every pack sold, deterministically, and the cards come back to the shelf so we are not even short of stock.
No cap fixes that; the shape is wrong.

### 4.2 The fix is the unit: a bulk pool's unit is a **handful**, not a card

Everything awkward about bulk comes from trying to treat one 25¢ card as a pull, and all of it dissolves if
the thing you buy, reveal, hold and sell back is **N cards of one game**:

- **The reveal** has nothing to reveal per card — one SKU, no identity, no art, no market value. A handful
  can be revealed as what it is: a count, a game, and a fan of card backs.
- **The vault row** is one row saying "25 Pokémon bulk", not 25 rows.
- **Sell-back prices the handful once**, at 60% of the handful — $3.75 on a $6.25 scoop — and the $1 floor
  applies to the transaction rather than to each card, which closes §4.1 completely.
- **The pull task** is "scoop 25 Pokémon bulk", which is the easiest job in the queue rather than the
  hardest: no hunting a named card in a case, and `not_found` effectively cannot happen.
- **Square** decrements the bulk variation by N in one adjustment.

### 4.3 ⚠️ And the EV pricing rule does not apply to bulk

The §5 rule works because for singles the list price and what we paid are related — 46% across the shelf.
For bulk they are not related at all: list is $0.25, cost is **$0.01**, a 4% ratio. "Price = EV rounded up
to $5" against a 25¢ list just reproduces the counter price, because 25¢ divides into $5 exactly: 20 cards
is $5.00 of list and prices at $5, 40 cards is $10.00 and prices at $10.

That is not wrong — it is counter parity, which is the right answer — but it means **N is the lever and the
price follows**, rather than the price being derived from value. Bulk should be priced the way the counter
prices it and sanity-checked against cost, not run through the EV machine.

### 4.4 So: is it a mystery pack at all?

Honestly, no — and this is the one category where "they'll always be mystery packs" strains. There is no
mystery in a scoop of bulk: the member knows exactly what they are getting, which is *volume*. The appeal of
bulk elsewhere in the hobby is that it is unsorted and might hide a hit, and ours cannot promise that
because it is a single undifferentiated SKU with no per-card identity behind it.

It is a **grab bag**, and it is a perfectly good product — it just sells on quantity rather than on the
opening. Branding it as a mystery pack would be promising a reveal the data cannot deliver, which is the
fastest way to make the real mystery packs look like they are lying too.

---

## 5. Pricing

### 5.1 The rule as asked

`price = ceil(EV / 5) * 5`, where EV is the mean market value of the pool as it stands.

It works, and the margins in §2 are healthy. Two things about it are worth a decision rather than a default.

**⚠️ The $5 boundary is a cliff, and two near-identical pools can land on opposite sides of it.** Pokémon
$10–25 has EV $14.85 → **$15**. Magic $10–25 has EV $15.32 → **$20**. Forty-seven cents of EV difference
becomes a 33% price difference, and the member sees two packs that look the same priced a third apart. The
alternative is to price off a **target margin** and round after: `price = ceil((EV / target) / 5) * 5`. At
target 0.75 both of those become $20 and the relationship is deliberate.

**⚠️ "Rounding up guarantees we make money" is true against market value, but market value is not our cost.**
Of 1,140 single-card lines, **578 carry a real recorded cost** in `wolfden_item_cost`, and across those the
cost is **46% of list** — not the 60% buy rate, because the trade rate and what we actually paid are
different numbers. So the true margin at EV pricing is ~54%, not ~40%. For the other half of the shelf we
have no cost record at all and would be pricing against an assumption. See the question in §11.

### 5.2 Where EV comes from, and when

EV must be computed from the **live pool**, on a schedule, and stored on the pool row — never computed at
open time. A price that moves between the screen quoting it and the member tapping it is the bug
`priceTrusted` exists to prevent, and §7 of the parent doc is explicit that the member is charged what they
were shown.

A price change should also be **announced to nobody and visible to everybody**: recompute nightly, write the
new price, and let the screen read it. A pack whose price moved mid-session is a pack somebody screenshots.

---

## 6. The platform

### 6.1 A pool registry, in code

Pools are **definitions**, not content: a handful of objects with a key, a brand, a category, a band and a
gate. They belong in code beside `COUNTER_STORE` and `CHANGELOG`, for the reason written over the latter —
*"a CMS for a dozen paragraphs a month is a database call pretending to be a feature"*.

```js
export const PACK_POOLS = [
    { key: "bags",       brand: "Wolf Den Mystery Bag", channel: "bagged",                              public: true  },
    { key: "pkmn-base",  brand: "Pokémon Singles",      channel: "shelf", category: "Pokemon Single Card", band: [200, 1000]  },
    { key: "pkmn-chase", brand: "Pokémon Chase",        channel: "shelf", category: "Pokemon Single Card", band: [1000, 2500] },
    { key: "mtg-base",   brand: "Magic Singles",        channel: "shelf", category: "Magic Single Card",   band: [200, 1000]  },
];
```

Membership is **computed live** from the category and band — never a copied list of card ids. A copied list
is a second source of truth about what is on the shelf, and it is wrong the moment the register sells one.

⚠️ **`category` means Square's `reporting_category`, not `category_id`.** This house has already been bitten:
`category_id` stores nothing that reaches a sale, and a pool keyed off it would match nothing while looking
perfectly correct in the diff.

### 6.2 What `mkt_pack_open` needs

One column: `pool` (text, default `'bags'`). Everything downstream — the reveal, the vault, the sell-back,
the trade ledger, the telemetry — already keys off the open row and does not care which pool it came from.
Backfilling existing rows to `'bags'` is the whole migration.

### 6.3 What inherits for free

This is the part that makes the work worth doing, and it is most of the feature:

- the **reveal** (`PackOpenClient`) — already takes its pool, price and card from props
- **sell-back at 60%** — `buyBackCents` is one function and four callers (§5 of the parent)
- the **Card Vault**, shipping, collection, the 7-day hold
- the **trade ledger** posting — a buy-back is already a `trade` row at rate 60
- **telemetry and the pull queue** — both read `mkt_pack_open`
- the **casino vendor** — he becomes a vendor with a *shelf* of packs rather than one button

The UI work is therefore mostly **choosing** a pack rather than opening one: a picker, and a brand on the
bag. See §9.

---

## 7. What is genuinely different from a bag, and must be built

### 7.1 ⚠️ The race with the register is much worse

A bag is a sealed object in a tub that nobody sells by mistake. **A shelf single is in a binder in a case and
is for sale right now, at the counter, to somebody standing in the shop.** §1.2 of the parent doc solved the
bag race with a reservation key; the same mechanism works here, but the window is wider and the loss is
worse — the member has already seen the card.

The honest sequence is: **claim in Square first, reveal second.** Decrement the variation by 1 as part of the
open, and only then show the card. If the decrement fails because the register won, the member is refunded
before anything is revealed, and has seen nothing.

### 7.2 ⚠️ Decrement, never delete

The bag path **deletes** the packed variation — correct there, because a sealed bag is a one-off SKU. A shelf
single is a real catalogue line with history, a cost record and possibly more copies. Deleting it would
destroy the COGS of every past sale of that card (this has happened: `square-deleted-items-cost-loss`).

The code already has the branch — `if (claimed.channel === "bagged" && claimed.packed_variation_id)` — and
the shelf side of it is currently *nothing*. That nothing has to become a `-1` inventory adjustment.

⚠️ And it must adjust **exactly once**: itemised Square orders decrement themselves, and a second adjustment
on our side reads as theft in the counts (`square-decrements-twice`).

### 7.3 The pull task is a different job

"Open the bag in the tub and re-shelve the card" becomes "**find this card in the case**". That is slower,
needs the card's set, number and condition in the task, and fails more often. The `not_found` path — which
refunds the member in full and is the only detector that the shelf has drifted from the table — stops being
an edge case and becomes a normal weekly event.

### 7.4 Condition is part of the product

Shelf singles carry condition in the name (`NM`, `LP`). The bags mostly do not. A member who pulls an LP card
at a NM price has a legitimate complaint, so either condition is **shown on the reveal** (it already is —
`subtitle`) or pools are built per condition. Showing it is cheaper and more honest.

---

## 8. ⚠️ Consignment is excluded, and it is not close

Four of the deepest categories on the shelf are **consignors**, not products: `Eric D` (209 units), `Pedro
Painting` (96), `Josh comics` (91), `Justin's cards` (84) — all 100% `consigned`. Selling a consigned card
through a pack would owe that consignor their payout on a sale we priced as a pack, and the two numbers have
nothing to do with each other.

**Every pool query filters `NOT consigned`.** This is a correctness rule, not a policy preference, and it
should live in the pool membership function where it cannot be forgotten — not in each caller.

---

## 9. Branding

Each pool is a pack with a name, a colour and a bag. The existing art is one black foil bag with a gold
crescent; per-pool branding means **one bag sprite per pool**, which is real money and a real decision
(~$0.06 each at medium, so the cost is not the images — it is choosing them).

Cheapest path that still reads as different products: **one bag silhouette, recoloured per pool, with the
game's own mark on it.** The reveal already takes `--tier-glow` and `--tier-edge` as custom properties, so a
pool palette costs nothing to apply.

The pack **picker** is new UI: a shelf of bags with a name, a price and "what's in it" on each. The existing
"see what's inside" sheet generalises directly.

---

## 10. The gate

A **second flag**, `SHELF_PACKS_PUBLIC`, and a second `shelfPacksOpenFor(buyerId)` beside the existing pair.

⚠️ **It must not reuse `VAULT_PUBLIC`, which is now `true`.** Reusing it would open the shelf packs to
everybody the moment they are deployed, and the bags cannot be put back behind a gate to prevent that —
Luke: *"We won't regress and owner gate the mystery packs."* Two features, two switches, and the parent doc's
§16.2 enumeration repeated for the new doors.

The shelf pools carry `public: false` in the registry so the gate is a **property of the pool**, not a
condition remembered at each call site. That is what makes "the bags are public and the shelf is not" a
single readable fact.

---

## 11. Questions for Luke

1. **Bands — yes?** Everything above hangs on cutting each category into price bands. Without them a
   Pokémon pack is $15 for a typical $6 card. Are the boundaries right — $2–10 / $10–25 / $25–60 / $60+ —
   and do you want all four, or just a cheap one and a chase one to start?

2. **The $5 cliff.** Pokémon $10–25 prices at $15 and Magic $10–25 at $20, on 47¢ of EV difference. Live
   with it, or price off a target margin and round after (both become $20 at a 75% target)?

3. **Price against market, or against what we paid?** Half the shelf has a real cost record and across it we
   paid 46% of list. Pricing off real cost would be exact where we know it and an assumption where we do
   not. Pricing off market is uniform and ignores what the card actually cost us.

4. **Is the depth bar right?** ≥60 units, ≥40 lines, no line over 15% of pool value. That gives Pokémon two
   pools, Magic two, and Yu-Gi-Oh **one** — is a single $5 Yu-Gi-Oh pack worth shipping, or does Yu-Gi-Oh
   wait until there is more of it?

5. **Who pulls the card, and how fast?** A single in a case is a slower find than a bag in a tub, and the
   "can't find it" refund stops being rare. Is that a same-day job, or does it ride the existing queue with
   no deadline like the bags do?

6. **Do shelf cards go in the same Card Vault?** I have assumed yes — same vault, same shipping, same hold.

7. **How many pools at launch, and what are they called?** "Pokémon Singles" and "Pokémon Chase" are
   placeholders. The names are the branding and I would rather use yours.

8. **Bulk: how many cards, at what price?** N is the lever and the price follows (§4.3). 20 cards for $5
   is counter parity. 40 for $10 and 100 for $25 are the same ratio at bigger sizes. One size or a ladder?

9. **Bulk: one pool per game, or one mixed?** There are two SKUs — `Magic Bulk` and `Pokemon Bulk` — so
   "Pokémon Bulk, 20 cards" and "Magic Bulk, 20 cards" is free. A mixed scoop would be a third thing we do
   not stock and would have to be made by hand.

10. **Bulk: does it sell back at all?** §4.2 makes the handful the unit, which closes the 400% hole. The
    other option is simpler: bulk is keep-or-collect only and never trades back, on the grounds that we do
    not buy bulk back one card at a time at the counter either. Which?

11. **Does bulk ship?** Twenty loose cards in an envelope is a different postage and packing job from one
    card in a sleeve, and the vault's shipping quote assumes the latter.

---

## 12. Build order (if the above survives)

1. `pool` column on `mkt_pack_open`, backfilled to `'bags'`; the registry; `shelfPacksOpenFor`.
2. Pool membership + EV from `inventory_feed`, consigned excluded, nightly price recompute.
3. The shelf branch of the open path: claim → **decrement** → reveal, with the refund-before-reveal rule.
4. The pull task carrying set, number and condition; `not_found` as a normal path.
5. The picker UI and one recoloured bag per pool.
6. Owner-gated end-to-end test on one pool — ⚠️ which spends real money and takes a real card off the shelf,
   exactly as §16.4 says. There is no dry run that is also a true test.
