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

Every number below is from `inventory_feed`, in stock, quantity > 0, **consigned excluded** (§7).

| category | lines | units | mean (EV) | **median** | max | stock value |
|---|---|---|---|---|---|---|
| Pokémon Single Card | 876 | 910 | $14.75 | **$6.00** | $290 | $13,104 |
| Magic Single Card | 181 | 198 | $13.23 | **$8.00** | $136 | $2,454 |
| Yu-Gi-Oh Single | 51 | 51 | $9.61 | **$4.00** | $157 | $490 |

⚠️ **`Bulk Cards` is not a candidate and is not in this table.** Luke: *"That is an outlier, it's a catch
all category in Square with no bearing on the mystery feature."* It is two undifferentiated SKUs — `Magic
Bulk` and `Pokemon Bulk`, 25¢ each — with no per-card identity to reveal, no per-card value and nothing the
pack machine can act on. The catch-all stays a catch-all.

For comparison, **the bags as they stand today**: 76 packs, mean $17.50, **median $4.00**, max $258, price
$25.

⚠️ **The mean is nearly three times the median on the shelf, and that is the entire design problem.** A pool
priced off its average pays its typical puller a small fraction of what they paid, because the average is
being held up by a tail they will almost never hit. It is also exactly how the bags already behave, so this
is not a new sin — but the bags earn it with a $258 top end inside a 76-card pool a member can read in full
on the board. A 910-unit shelf is not readable, and "the average card is $15" would be a true sentence that
mis-sells the product.

---

## 2. A pool is a **category**

**Decided (Luke, 2026-10-27): one pack per category, no price bands.**

I argued for cutting each category into value bands, because within a band the mean and the median converge
and the headline skew disappears. Luke's call is one pack per category, and the numbers say he is right that
it does not need the extra machinery:

| pool | units | lines | EV | **price** | median | median as a share of price | margin vs recorded cost |
|---|---|---|---|---|---|---|---|
| Pokémon Singles | 910 | 876 | $14.75 | **$15** | $6.00 | 40% | 44% |
| Magic Singles | 198 | 181 | $13.23 | **$15** | $8.00 | 53% | 45% |
| Yu-Gi-Oh Singles | 51 | 51 | $9.61 | **$10** | $4.00 | 40% | not costed |

**The bags you are selling today are $25 against a $4 median — 16%.** An unbanded Pokémon pack is 40% and
Magic is 53%, so both are two to three times kinder than the product already on the shelf, at a 44–45%
margin against what we actually paid. The band argument was about making a good number better, not about
rescuing a bad one.

Two consequences worth keeping in view rather than fixing now:

- **Pokémon and Magic both price at $15** off different EVs ($14.75 and $13.23), because the $5 rounding
  collapses them. That reads well — two games, same price, pick your game — and it is luck rather than
  design, so it will not survive the shelf moving.
- The tail is still a tail. A $290 card sits in a 910-unit Pokémon pool, which is 2.2% of pool value and
  entirely healthy. Yu-Gi-Oh is a different story — see §3.

---

## 3. "Enough of" — and the one pool that fails

With whole categories as pools, unit depth stops being the interesting test: 910 and 198 units are plenty,
and the pool refills every time we buy a collection. What still bites is **concentration** — one card
carrying the pool's value:

| pool | units | biggest card | share of pool value | verdict |
|---|---|---|---|---|
| Pokémon Singles | 910 | $290 | 2.2% | healthy |
| Magic Singles | 198 | $136 | 5.5% | healthy |
| Yu-Gi-Oh Singles | 51 | **$157** | **32.0%** | ⚠️ |

⚠️ **A third of the Yu-Gi-Oh pool's value is one Ancient Fairy Dragon.** Its EV of $9.61 is only above $5
because that card is in it — take it out and the remaining 50 cards average $6.66. So the pack is priced at
$10 on the strength of a single card, and the first member to pull it leaves a materially worse product
behind at the same price until the nightly recompute catches up. It is also the only pool with **no cost
records at all**, so there is nothing to check the margin against.

Proposed rule: **a pool opens only while no single line exceeds 15% of its value.** Pokémon and Magic pass
comfortably and would have to change a great deal to stop passing; Yu-Gi-Oh fails today and would open by
itself once there is more of it, or once that one card sells at the counter.

A pool that fails **closes itself** and says "back soon" rather than erroring — the same treatment
`priceTrusted` already gets, for the same reason.

---

## 4. Pricing

### 4.1 The rule

**Decided: `price = ceil(EV / 5) * 5`, where EV is the mean market value of the pool as it stands.**

Against today's shelf that is Pokémon $15, Magic $15, Yu-Gi-Oh $10, at a 44–45% margin against what the
cards actually cost us where we have a record (578 of 1,140 single lines carry one; across them we paid
**46% of list** — not the 60% trade rate, because what we pay and what we trade at are different numbers).

⚠️ **The $5 boundary is a cliff, and it is worth knowing where the pools sit on it.** Pokémon at EV $14.75
is fifteen cents under the line: a modest shift in the shelf's mix pushes it to $20, a 33% price rise with
no announcement attached to it. Magic at $13.23 has $1.77 of headroom. The rule is simple and sayable, which
is why it was chosen — but a pool sitting just under a boundary will cross it eventually, and the screen
must not quietly reprice mid-session. See §4.2.

### 4.2 Where EV comes from, and when

EV is computed from the **live pool**, on a schedule, and stored on the pool row — never computed at open
time. A price that moves between the screen quoting it and the member tapping it is exactly the bug
`priceTrusted` exists to prevent, and §7 of the parent doc is explicit that the member is charged what they
were shown.

⚠️ **And a price CHANGE needs a floor on how often it can happen.** Recompute nightly, but hold a new price
for at least a week — a pack that was $15 on Tuesday and $20 on Wednesday because two expensive cards came
in is a pack somebody screenshots, and the explanation ("the average went up") is true and will not help.

---

## 5. The platform

### 5.1 A pool registry, in code

Pools are **definitions**, not content: a handful of objects with a key, a brand, a category and a gate.
They belong in code beside `COUNTER_STORE` and `CHANGELOG`, for the reason written over the latter — *"a CMS
for a dozen paragraphs a month is a database call pretending to be a feature"*.

```js
export const PACK_POOLS = [
    { key: "bags",   brand: "Wolf Den Mystery Bag", channel: "bagged",                                  public: true },
    { key: "pkmn",   brand: "Pokémon Singles",      channel: "shelf", category: "Pokemon Single Card" },
    { key: "mtg",    brand: "Magic Singles",        channel: "shelf", category: "Magic Single Card"   },
    // Yu-Gi-Oh is defined but closed on concentration — see §3. It opens itself when the shelf allows.
    { key: "ygo",    brand: "Yu-Gi-Oh Singles",     channel: "shelf", category: "Yu-Gi-Oh Single"     },
];
```

⚠️ **A pool carries no price and no card list.** Both are derived: the price from the nightly EV recompute
(§4.2), membership live from the category. A copied list of card ids would be a second source of truth about
what is on the shelf, and it is wrong the moment the register sells one.

⚠️ **There is no `band` field, and leaving the door open for one would be a mistake.** Bands were considered
and rejected (§2); a vestigial range sitting unused in the registry is the kind of thing that gets filled in
later by somebody who assumes it was meant to be used.

⚠️ **`category` means Square's `reporting_category`, not `category_id`.** This house has already been bitten:
`category_id` stores nothing that reaches a sale, and a pool keyed off it would match nothing while looking
perfectly correct in the diff.

### 5.2 What `mkt_pack_open` needs

One column: `pool` (text, default `'bags'`). Everything downstream — the reveal, the vault, the sell-back,
the trade ledger, the telemetry — already keys off the open row and does not care which pool it came from.
Backfilling existing rows to `'bags'` is the whole migration.

### 5.3 What inherits for free

This is the part that makes the work worth doing, and it is most of the feature:

- the **reveal** (`PackOpenClient`) — already takes its pool, price and card from props
- **sell-back at 60%** — `buyBackCents` is one function and four callers (§5 of the parent)
- the **Card Vault**, shipping, collection, the 7-day hold
- the **trade ledger** posting — a buy-back is already a `trade` row at rate 60
- **telemetry and the pull queue** — both read `mkt_pack_open`
- the **casino vendor** — he becomes a vendor with a *shelf* of packs rather than one button

The UI work is therefore mostly **choosing** a pack rather than opening one: a picker, and a brand on the
bag. See §8.

---

## 6. What is genuinely different from a bag, and must be built

### 6.1 ⚠️ The race with the register is much worse

A bag is a sealed object in a tub that nobody sells by mistake. **A shelf single is in a binder in a case and
is for sale right now, at the counter, to somebody standing in the shop.** §1.2 of the parent doc solved the
bag race with a reservation key; the same mechanism works here, but the window is wider and the loss is
worse — the member has already seen the card.

The honest sequence is: **claim in Square first, reveal second.** Decrement the variation by 1 as part of the
open, and only then show the card. If the decrement fails because the register won, the member is refunded
before anything is revealed, and has seen nothing.

### 6.2 ⚠️ Decrement, never delete

The bag path **deletes** the packed variation — correct there, because a sealed bag is a one-off SKU. A shelf
single is a real catalogue line with history, a cost record and possibly more copies. Deleting it would
destroy the COGS of every past sale of that card (this has happened: `square-deleted-items-cost-loss`).

The code already has the branch — `if (claimed.channel === "bagged" && claimed.packed_variation_id)` — and
the shelf side of it is currently *nothing*. That nothing has to become a `-1` inventory adjustment.

⚠️ And it must adjust **exactly once**: itemised Square orders decrement themselves, and a second adjustment
on our side reads as theft in the counts (`square-decrements-twice`).

### 6.3 The pull task is a different job

"Open the bag in the tub and re-shelve the card" becomes "**find this card in the case**". That is slower,
needs the card's set, number and condition in the task, and fails more often. The `not_found` path — which
refunds the member in full and is the only detector that the shelf has drifted from the table — stops being
an edge case and becomes a normal weekly event.

### 6.4 Condition is part of the product

Shelf singles carry condition in the name (`NM`, `LP`). The bags mostly do not. A member who pulls an LP card
at a NM price has a legitimate complaint, so either condition is **shown on the reveal** (it already is —
`subtitle`) or pools are built per condition. Showing it is cheaper and more honest.

---

## 7. ⚠️ Consignment is excluded, and it is not close

Four of the deepest categories on the shelf are **consignors**, not products: `Eric D` (209 units), `Pedro
Painting` (96), `Josh comics` (91), `Justin's cards` (84) — all 100% `consigned`. Selling a consigned card
through a pack would owe that consignor their payout on a sale we priced as a pack, and the two numbers have
nothing to do with each other.

**Every pool query filters `NOT consigned`.** This is a correctness rule, not a policy preference, and it
should live in the pool membership function where it cannot be forgotten — not in each caller.

---

## 8. Branding

Each pool is a pack with a name, a colour and a bag. The existing art is one black foil bag with a gold
crescent; per-pool branding means **one bag sprite per pool**, which is real money and a real decision
(~$0.06 each at medium, so the cost is not the images — it is choosing them).

Cheapest path that still reads as different products: **one bag silhouette, recoloured per pool, with the
game's own mark on it.** The reveal already takes `--tier-glow` and `--tier-edge` as custom properties, so a
pool palette costs nothing to apply.

The pack **picker** is new UI: a shelf of bags with a name, a price and "what's in it" on each. The existing
"see what's inside" sheet generalises directly.

---

## 9. The gate

A **second flag**, `SHELF_PACKS_PUBLIC`, and a second `shelfPacksOpenFor(buyerId)` beside the existing pair.

⚠️ **It must not reuse `VAULT_PUBLIC`, which is now `true`.** Reusing it would open the shelf packs to
everybody the moment they are deployed, and the bags cannot be put back behind a gate to prevent that —
Luke: *"We won't regress and owner gate the mystery packs."* Two features, two switches, and the parent doc's
§16.2 enumeration repeated for the new doors.

The shelf pools carry `public: false` in the registry so the gate is a **property of the pool**, not a
condition remembered at each call site. That is what makes "the bags are public and the shelf is not" a
single readable fact.

---

## 10. Questions for Luke

Answered already, recorded here so they stay answered: **no bands, one pack per category** (§2);
**price = EV rounded up to $5** (§4.1); **bulk is out of scope** (§1).

1. **Does Yu-Gi-Oh ship at launch?** One card is 32% of that pool's value and the pack is priced on it
   (§3). I would hold Yu-Gi-Oh until the concentration drops — which makes launch **two** pools, Pokémon
   and Magic, both at $15. Hold it, or ship all three and accept that one?

2. **Who pulls the card, and how fast?** A single lives in a binder in a case, not sealed in a tub, so it
   is a slower find and it can be sold at the register first. Same-day job, or does it ride the existing
   queue with no deadline the way the bags do?

3. **Do shelf cards go in the same Card Vault?** I have assumed yes — same vault, same shipping, same
   seven-day hold, same sell-back at 60%. The alternative is a separate shelf, which I would not build.

4. **What are they called?** "Pokémon Singles" and "Magic Singles" are placeholders and the names are the
   branding. Two bags to draw at roughly $0.06 each, so the cost is choosing them rather than drawing them.

5. **Does the $290 Pokémon card stay in the pool?** It is only 2.2% of pool value so it passes every test,
   and a real chase card is most of what makes a pack worth opening twice. But it is a $290 card going out
   for $15, and that is a decision rather than a calculation.

---

## 11. Build order (if the above survives)

1. `pool` column on `mkt_pack_open`, backfilled to `'bags'`; the registry; `shelfPacksOpenFor`.
2. Pool membership + EV from `inventory_feed`, consigned excluded, nightly price recompute.
3. The shelf branch of the open path: claim → **decrement** → reveal, with the refund-before-reveal rule.
4. The pull task carrying set, number and condition; `not_found` as a normal path.
5. The picker UI and one recoloured bag per pool.
6. Owner-gated end-to-end test on one pool — ⚠️ which spends real money and takes a real card off the shelf,
   exactly as §16.4 says. There is no dry run that is also a true test.
