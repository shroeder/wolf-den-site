# Virtual mystery packs & the Card Vault

Started 2026-10-26. **Nothing is in code yet.** This is the running design document: decisions get written
here as Luke makes them, so a later session starts from the decisions instead of re-deriving them.

The feature in one sentence: **a member with store credit can open a Wolf Den mystery pack on the website,
watch the card come out of the bag, and then either sell it back to us for credit on the spot or keep it in
a Card Vault they can ship, collect, or cash out whenever they want.**

### Decisions already made (Luke, 2026-10-26)

- **V1 draws from the real sealed bags**, with a staff task per open. §1.
- **Later**, the pool becomes **every card in our possession** — not just what is bagged. §1.4.
- **The glow during the rise is colourless** until the flip. §3.1.
- **Sell-back pays 100% of current market value**, in store credit. §5.
- **Pool EV is set during manual procurement of the bags** — not a policy this feature chooses. §9.
- **The pull queue has no deadline**, and the vault says nothing about it — a pulled card just shows as
  theirs. §1.3, §4.
- **A bag that cannot be found refunds the credit in full, no questions.** §1.3.
- **A pickup order can be self-cancelled right up until pickup.** §6.
- **Rarity thresholds stay as first proposed** — no histogram pass first. §3.3.
- **Shipping insurance above ~$200 is paid by the member**, inside the quoted rate. §6.
- **Cards cannot leave the building until 7 days after the member's most recent credit top-up.** §12.
- **Account deletion is refused while the vault holds cards.** §12.
- **No age gate and no special legal apparatus** — this is a card shop doing what card shops do. §12.
- **Square stops at the credit sale.** Pack opens never become Square orders; revenue, COGS and tax live in
  a reporting vein we build. §7.
- **Sales tax is IMPLICIT in the pack price** — backed out, never added on. The Open button debits exactly
  what it says. §7.4.
- **A pack costs what we ACTUALLY paid for the card**, captured at bagging — not the 65% stamp. §7.3.
- **The online sticker stays at the Square price** and the shop absorbs the ~$1.72 of tax. §7.4.
- **Feature-flagged, owner-only to start.** One flag, `vaultOpenFor`, asked at every door. §16.

---

## 0. What already exists (so we build on it, not beside it)

Nearly every moving part of this already has a home in the repo. Reading this section first is what stops
this becoming a parallel system.

| Thing | Where it lives today | What it already does |
|---|---|---|
| The mystery pool | `mystery_bag_cards` (mig 007/016/079), `src/lib/mystery-bags.js` | one active row = one unsold pack, with `square_variation_id` (the source single), `packed_variation_id` (the sealed unit's own Square variation), `variation_sku`, name/set/number/`market_value`/`image_url`, and a `status` of active/reserved/sold/removed |
| The public pool board | `/mystery-bags`, `MysteryBagShowcaseClient` | **already lists every active card in the pool**, plus metrics and recent hits |
| Pack price | `getMysteryBagPriceInfoFromSquare()` | reads the live price off the Square catalog, env-overridable |
| Sale → card assignment | `processQueuedMysteryWebhookEvent()` | Square `order.updated` COMPLETED → match line item to a pack → mark sold → attribute to a member → **delete the packed variation from Square** |
| **Bagging a card** | `createPackedMysteryVariation()` + `LedgerViewModel` | clones a seed variation into a **unique per-bag variation with a printed SKU**, stamps that bag's **own `wolfden_unit_cost` at 65% of the card's market value**, then **decrements the source single**. Every bag is individually costed before it ever sells. |
| Audit trail | `mystery_audit_log`, `mystery_sold_events`, `mystery_sold_assignments` | append-only, idempotency-keyed, `UNIQUE (mystery_card_id)` on assignments |
| Store credit | `mkt_buyer.store_credit_cents` + `mkt_store_credit_event` (mig 181) | `addCredit` / `spendCredit` in `src/lib/marketplace/store-credit.js`; spend is a guarded conditional UPDATE so two concurrent spends cannot overdraw |
| Buying credit | `/marketplace/credit`, `StoreCreditClient.js`, `mkt_credit_purchase` | Square Web Payments SDK, $5–$500, 3.5% online fee, 200 coins per $1 |
| One account | `src/lib/marketplace/shop-bridge.js` | a marketplace login silently creates/attaches a verified shop-customer session, so **"an account" means `mkt_buyer`** and checkout already authorises off it |
| Orders | `shop_orders` (mig 009/011/080/473), `src/lib/shop-orders.js` | `items_json`, `fulfillment_mode` shipping/pickup, `fulfillment_status`, archive, cancel, EasyPost label |
| Orders screens | `/api/admin/shop/orders*`, `shop/ShopOrdersAdminScreen.kt` | the admin + employee app screen this feature's orders must land in |
| Shipping | `src/lib/shipping/easypost.js` | live rates, label purchase |
| COGS | `src/lib/cogs/*` | FIFO over Square orders, plus `nonSaleConsumption` for stock that leaves without a sale |
| Our own cost table | `wolfden_item_cost` (mig 345) | the source of truth for unit cost; Square's native cost is **write-at-create only** |
| Buying cards from people | `trade` + `trade_line` (mig 042), `src/lib/trades/trades.js` | directional lines IN/OUT/CASH/GIFT_CARD, `buy_rate_percent`, `condition`, `square_variation_id` |
| Catalog mirror | `inventory_feed` (mig 033) | name / image / price / quantity / category per variation — the cheap way to ask "does this card already exist in Square?" |
| **Card truth** | `tcg_cards` / `tcg_sets` (mig 020), `jobs/tcg-catalog-sync` | ingested from tcgcsv: **`rarity`**, `number`, `image_url`, and **`market_price` kept current by a cron**. This is the live value source the vault needs, and the real printed rarity. |
| Reveal craft | `components/casino/Gachapon.js`, `GachaPit.js`, `gacha-audio.js` | the house precedent for a committed, physical, audible opening; synthesised audio on the **arena's single shared `AudioContext`** |
| Telemetry | `src/lib/marketplace/activity.js`, `farm-telemetry.js` | `trackActivity`, adoption gauges, per-member drill — the shape every admin telemetry screen here copies |

**Two things that already exist are worth saying out loud, because they change the design:**

1. **The pool is already public, card by card.** `/mystery-bags` lists every active row. So the virtual open
   is a draw *without replacement* from a **known, published list**. That is the transparency Luke wants —
   and it also means the expected value of a pack is a number anyone can compute. See §9.
2. **Every physical pack is already pre-bound to a specific card** (`packed_variation_id`, one sealed bag,
   one SKU, scanned at the register). That is what forces the decision in §1.

---

## 1. The pool: the real bags, with a staff task

**Decided: V1 opens the actual sealed bags.** An online open and a walk-in buying a bag off the counter draw
from the same tub. That is the honest version of the feature — the pack you open on your phone is a real pack
that really exists — and it means the pool, the pricing and the procurement are the ones Luke already runs,
with nothing new to stock.

The cost of that choice is **one physical task per open**, and a race with the register. Both are solvable,
and the second is already most of the way solved by code that exists.

### 1.1 What happens the instant someone opens a pack online

The order of operations is the whole safety argument. Nothing physical is relied upon.

1. **Claim the bag in the database** — a guarded update taking one `active` row to `reserved`. Two
   simultaneous openers cannot take the same bag.
2. **Delete the packed variation from Square, synchronously.** This is the same `deleteSquareCatalogObject`
   call the in-store sale already makes, just earlier in the story. From this moment **the bag cannot be
   scanned at the register** — the SKU is gone and the POS refuses it.
3. Spend the credit, write the open, mark the row `sold`, reveal the card.
4. **Raise a staff task**: *pull bag `MP-0391` from the tub, open it, file the card under the member's name.*

Step 2 works because **every bag carries a printed label with its own SKU** —
`buildPackedMysteryVariationSku` in `SquareTransactionsService.kt`, and `SquareLabelPrinterScreen` already
prints them. Staff can find bag `MP-0391` because it says `MP-0391` on it. If the bags were anonymous this
design would not be viable.

### 1.2 The race with the register, both directions

| Who gets there first | What happens | Safe? |
|---|---|---|
| **Online open wins** | the variation is deleted; the POS scan fails a moment later | ✅ staff hand the customer a different bag. Mildly awkward, never wrong. |
| **Register sale wins** | the webhook marks the card `sold`; the online claim finds no `active` row | ✅ the member is dealt a different bag, or told the pool is empty — and **their credit is untouched, because the claim happens before the spend**. |
| **Dead heat** | the POS scan succeeds in the ~300ms before our delete lands | ⚠️ the only genuinely bad case: two people own one card |

The dead-heat window is small but real, and the system must **detect** it rather than hope. The signal
already exists: an `exactCardId` assignment against a row that is no longer `active` returns zero
assignments. Today that is logged and shrugged at. It needs to become **an alert to staff and to Luke**,
naming the bag and both claimants — the resolution is a human one. Whoever is at the counter gets a
replacement bag and an apology; the online member keeps what they saw.

> This is exactly the shape of thing that "reads as theft long before it reads as a bug". A silent collision
> is a card two people own. Make it loud.

### 1.3 The staff task queue

A real, small queue — not a note. It lives in the admin **and** employee app, because the person who can walk
to the tub is the employee.

- **Open tasks**, oldest first: bag SKU, card name, value, member, when it was opened.
- One action: **Pulled & filed** — optionally confirmed by scanning the bag's own label, which removes the
  whole class of "filed the wrong card" errors for the price of one camera tap.
- **A second action: "can't find it"** — refunds the member's credit **in full, no questions**, marks the row
  `removed` with a reason, and alerts Luke. This is also the **only detector** that a bag has gone missing
  from the tub, which is why it is a first-class button and not an edge case (§15/A6).
- A **push** when a task is raised, so a pull does not sit unnoticed until closing.

**No deadline.** Decided: the queue is a queue, worked when there is time. Nothing marks a task late and
nothing escalates on a clock. That is right while volume is low — and it is safe **only because of the rule
below**, which is what replaces a deadline.

⚠️ **An order on an un-pulled bag must jump the queue.** With no deadline and nothing on the member's screen
(§4), a pickup or shipping order *is* the signal that someone is about to turn up for a card still sealed in
the tub. So creating an order for a vault card whose pull task is still `open` **promotes that task to the
top of the queue and pushes staff immediately**. Without this one rule, "no deadline" becomes a member
standing at the counter while someone digs through a tub.

⚠️ **The member's experience must not depend on the task being done promptly.** They have already seen the
card and it is already theirs. The task is about the physical card catching up, and the only thing it gates
is shipping or collection — handled by the promotion rule above, not by making them wait or explaining
ourselves.

### 1.4 Where this goes next — the whole shelf

Luke's stated direction: **later, the pool becomes every card in our possession**, not just what has been
bagged. That is the bigger feature — the pool becomes the singles inventory itself, pack value is set by rule
rather than by hand-bagging, and there is **no physical task at all** at open time, because the card is
already a loose single in a binder and the pull is just a decrement.

Three things to do now so that future is cheap rather than a rewrite:

- **Never hard-code "a pack is a bag."** The pool query, the claim and the reveal take a *pool row*; what
  physical object sits behind it is one column. `channel` — `'bagged'` (default, today) vs `'shelf'` (later)
  — costs nothing now and is the seam the migration runs through.
- **Make the staff task conditional on that column.** A bagged row raises a task; a shelf row raises none.
  One code path, one branch.
- **Keep the §7 accounting model identical for both.** It already is — see 7.2. That is deliberate, and it
  is what stops the migration touching the books.

---

## 2. The funnel: from a stranger to an open pack

Four states, and the page must be good in all four.

| Visitor | What `/mystery-bags` shows |
|---|---|
| **Logged out** | the full pool board as today, plus the bag, plus a primary CTA: **"Create an account to open packs online."** Secondary: "See what's in the packs." No price gate on looking — the whole pool stays visible. |
| **Logged in, $0 credit** | the bag, the price, and **"Add store credit to open"** → opens the credit sheet inline (not a navigation away; the funnel must not lose them to `/marketplace/credit`) with the pack price pre-selected as the suggested top-up |
| **Logged in, credit < price** | same, but the shortfall is named: "You're $6.50 short — add $10?" |
| **Logged in, credit ≥ price** | the **Open** button, armed, with the balance beside it |

**The credit sheet is the funnel and it must be one screen.** Preset amounts (the existing
`PRESETS_CENTS`), the 3.5% online fee shown honestly, the coins bonus shown as the sweetener, Square card
field, done — and on success it returns to the bag with the balance already ticked up, not to the credit
page. Reuse `StoreCreditClient`'s card capture; do not fork a second Square SDK loader.

**Inspect what's in the packs, any time, from any state.** A "What's in the packs" shelf — the full active
pool, sortable by value, with the top hits given real estate (big art, value, set).  ⚠️ This is the **same
pool a walk-in is buying from**, so it must stay honest as bags sell in store: it reads live, never cached
across a session. This exists in
spirit on the board today; the virtual page needs it as a drawer that opens over the bag so a player can
check and come straight back without losing their place.

---

## 3. The opening — the pinnacle

This is the feature. The rule the Gachapon already set applies here unchanged:

> **The server decides the card at the moment the credit is spent. The animation is theatre over a decided
> result.** Nothing about how the player taps, waits, or drags may touch the outcome.

### 3.1 The choreography

**Phase 0 — the bag, at rest.** The real pack: black matte, gold wolf-in-moon, shot straight on, filling
most of the viewport. It breathes — a slow 6s scale of about 1.5%, and a specular sheen that drifts across
the matte finish, so it is alive without being busy. Below it: the price, the balance, and one button.

> ⚠️ **Asset work.** The only art we have is `public/images/mystery_bag.jpg` — a 4000×3000 phone photo of the
> bag lying on carpet. It needs to be cut out onto transparency, straightened, and exported at two or three
> widths, plus a separate layer for the gold logo so the logo can glow independently of the bag. This is a
> photo edit, not a generation job.

**Phase 1 — commit.** Tap. The button becomes unavailable instantly (double-tap is the first bug this
feature would ship with). The **balance ticks down in place** — digits roll, the number flashes once in
credit-gold, and a coin-drop sound lands. The spend is visible *before* anything else happens, exactly the
way the gachapon takes the token first. If the server call fails, the balance rolls back up and says why.

**Phase 2 — the zip.** The bag's seal opens: the zip strip pulls back left-to-right over ~400ms with a foil
crinkle. Short. This is punctuation, not a scene.

**Phase 3 — the rise.** The card comes **up out of the bag, vertically, slowly** — back of the card facing
us, roughly 1.4–1.8s, eased so it is quickest in the middle and nearly stalls at the top. Light builds
behind it from the bag's mouth. A low filtered sweep rises underneath.

> **The light that builds during the rise is colourless.** It gets brighter, never bluer or golder. The
> moment the glow carries tier information before the flip, the rise becomes a near-miss mechanic — the
> player learns to read it, and every common becomes a small disappointment that the animation *performed* at
> them. No pity progress bars, and no pity anti-progress bars either. Tension comes from the pause at the
> top, which is identical for every card. **Everything after the flip is where the truth lives, and all of
> it is truth.**
>
> **Decided 2026-10-26: colourless.** The alternative — a tier-coloured glow during the rise — is more
> immediately thrilling and is what most pack-opening sims do, at the cost of every common announcing itself
> before the card turns over.

**Phase 4 — the flip.** At the top of the rise the card stalls for ~250ms, then rotates on Y. 450ms, with a
paper-snap at the halfway point where the face takes over.

**Phase 5 — the slam.** The card drops and scales down onto the backdrop — fast, ~220ms, hard ease-in,
overshooting ~4% and settling. On contact, simultaneously:

- a **sub thud** plus a transient crack, weighted by tier
- **screen shake** — 2px for a common, 14px with a slow decay for a mythic
- the backdrop **floods the rarity colour** from the point of impact outward
- a rarity ring/burst leaves the card edge; gold tier and up throws embers that fall and fade
- the card's border and glow settle into the rarity colour

**Phase 6 — the readout.** Under the card, staggered in over ~600ms: **value** (counting up from $0 to the
real number — the single most dopamine-dense element on the screen), then set · number · condition, then the
rarity word. Big hits ($100+, the existing `BIG_HIT_DOLLARS` threshold) get a held fanfare and a line saying
this is going on the board.

**Phase 7 — the choice.** Two buttons, and they must not be symmetrical:

- **Sell back — $42.00** (filled, credit-gold). Tapping it ticks the balance **up**, loudly, with the same
  roll-and-flash as Phase 1 but inverted and bigger.
- **Keep it — add to Vault** (outlined). Tapping it flies the card toward the vault icon and the vault
  counter increments.

Then: **Open another** — which, if credit covers it, returns to Phase 0 with the bag already reseated.

### 3.2 Skipping

Tapping anywhere during Phases 2–5 jumps straight to Phase 6 with the slam intact. **This is required, not
polish** — someone opening their eighth pack should not sit through 3.5 seconds again. The house rule that
animations always play still holds for the *first* open of a session; after that the skip is there and
discoverable (a faint "tap to skip" after the first second).

### 3.3 Rarity tiers

`mystery_bag_cards` has no rarity column of its own, but **`tcg_cards.rarity` does** and is synced nightly.
So the card's *printed* rarity is available and gets shown in the readout — while the thing that drives the
**colour, the shake and the sound is the value tier**, because in a mystery pack what you actually care about
is what it is worth. A $4 Secret Rare should not out-flash an $80 promo.

| Tier | Value | Colour | Slam | Sound |
|---|---|---|---|---|
| Common | < $5 | slate | 2px, dry | soft tap |
| Uncommon | $5 – $14.99 | green | 4px | tap + minor chord |
| Rare | $15 – $39.99 | blue | 7px | thud + chord |
| Epic | $40 – $99.99 | purple | 10px | thud + rising chord + ring |
| Legendary | $100 – $249.99 | gold | 14px | sub + fanfare + embers |
| Mythic | $250 + | prismatic | 14px, long decay | sub + held fanfare + full flood |

**Decided: these stand as written**, without a histogram pass first. Worth knowing what that trades away —
if the tub turns out to be mostly $2–$4 cards, nearly every open lands on the dullest tier in the table, and
the reveal will feel flat for reasons that look like a design failure rather than a threshold. The thresholds
live in `pack-rarity.js` as plain constants, so retuning them later is a one-file change — and
`mkt_pack_open.tier` is stamped at open, so **retuning never rewrites history**.

Colours get defined once, in a `pack-rarity.js` module, and are consumed by the reveal, the vault card
frames, the pool board, and the admin screens. Not copied — imported. (Same discipline as the balance
constants.)

### 3.4 Sound

All of it synthesised through **`components/arena/arena-audio.js`'s existing shared bus** — `subBus()`,
`tone()`, `noise()`, `killBus()`. Chrome allows ~6 `AudioContext`s per document and the casino page can
already have several alive; a new context here would re-earn an expensive lesson. `pack-audio.js` mirrors
`gacha-audio.js` exactly in shape.

Cues: `coinOut` (spend), `zip` (foil), `rise` (filtered sweep), `flip` (paper snap), `slam` (sub + crack),
`tier(n)` (the chord), `coinIn` (sell-back), `fanfare` (big hit). Plus a mute toggle that persists.

### 3.5 Screen sizes

Checked at **375×667 with ~226px of browser chrome**, which leaves about 441px of usable height — the number
that has caught this repo before.

- the bag at rest: max 55% of usable height, so price + balance + button are above the fold without scrolling
- the card after the slam: max 48% of usable height, `object-fit: contain`, so a tall card never crops
- the readout and the two choice buttons must both be visible with the card — if they don't fit, the card
  shrinks, not the buttons
- the percentage-height trap applies: every percentage in this stack needs a real parent box, or it collapses
  silently. Dimension the reveal stage in `dvh`/`px` and check it in the rig
- desktop: the stage is centred at a max width, the backdrop flood fills the viewport, the pool drawer is a
  side panel rather than a sheet

---

## 4. The Card Vault

`/marketplace/vault` (and a prominent entry point from the reveal and from the member nav).

**Header.** Total vault value, card count, and the store-credit balance side by side — the three numbers that
make the vault feel like an account rather than a list.

**Tabs:**

1. **Cards** — the collection. Grid on desktop, two-up on mobile. Each tile: art, rarity frame, name, set ·
   number, condition, **current value**, pulled-on date. Tap → detail sheet with full-size art, value
   history, and three actions.
2. **On order** — cards that have left the vault into a ship/pickup order, with status mirrored from
   `shop_orders.fulfillment_status` and tracking when it exists. **A pickup order can be cancelled here**,
   and the cards come straight back into tab 1.
3. **History** — everything that has happened: opened, sold back, shipped, picked up, cancelled. Append-only,
   with the credit movement on each row. This is the transparency promise made legible.

**Selection and bulk actions.** Long-press / checkbox multi-select, then: *Sell selected* (with the total
named before confirming), *Ship selected*, *Pick up selected*. Bulk selling needs a confirm sheet that shows
card-by-card what is being sold and for how much, because an accidental bulk sell of a vault is the single
worst thing this feature could do to someone.

**Sorting and filtering** — by value, by date pulled, by set, by tier. Never a native `<select>`.

**Empty state** — not a shrug. The bag, the price, and "Open a pack."

---

## 5. Selling back

**The price is the card's current market value, 100%, paid as store credit.** Shown live in the vault, with
the pulled-at value also shown when it differs ("pulled at $38 · worth $42 now").

"Current" has a real source: **`tcg_cards.market_price`**, refreshed by the existing `tcg-catalog-sync` cron.
A vault card therefore needs a `tcg_card_id` link, resolved at pull time (name + set + number, via the
existing matcher) and stored. When no confident match exists, the card falls back to its pulled value and is
flagged in the admin pool view — **never guessed**, for the same reason `link-variation.js` refuses a fuzzy
match: a wrong price here is money out the door and looks exactly like an answer.

> ⚠️ **This is a real economic decision and it should be deliberate, Q4.** Paying 100% of market is far above
> the ~70% counter buy rate. Two things make it defensible: it is paid in **store credit, which comes back to
> us as revenue at full retail**, so it is nearer 70% in real terms; and the house margin on this feature is
> the **pack price minus the pool's expected value** (§9), not the buy-back spread. But if the vault fills
> with cards bought at 100% that then sit on the shelf, that margin is doing all the work alone.
>
> The alternative — pay a published percentage (say 85%) and let keeping the card be the better deal — makes
> the vault more interesting and the books safer, at the cost of the instant "sell it back for exactly what
> it says" clarity Luke described. Locking the value at pull-time instead of live is a third option, but it
> invites adverse selection: members hold winners and dump losers, and we pay yesterday's price for both.

**What happens mechanically when a member sells a card back:**

1. **Credit up, visibly.** `addCredit(buyerId, cents, "vault_sellback", vaultCardId)`. The balance rolls up
   with sound. This is the second-biggest dopamine moment in the feature and it gets the same treatment as
   the pull.
2. **The card returns to Square stock.**
   - If a variation for that exact card **already exists** (match on `square_variation_id` first — we stored
     it when the card entered the pool — then on `inventory_feed` by name + set + number + condition):
     **+1 via a `NONE → IN_STOCK` receive**, the same adjustment `restockInventoryForCancel` already uses.
     (`SOLD → IN_STOCK` is rejected by Square; the existing comment records this.)
   - If it **does not exist**: create it — name, description, image, **reporting category** (Pokémon Single
     Card or the right game's category — and it must be `reporting_category`, because `category_id` alone
     stores nothing that reaches a sale), taxable, price, quantity 1, and **the unit cost inside the create
     payload** via `item_variation_vendor_infos`, because Square's native cost is write-at-create only and
     can never be set afterwards.
3. **Our own cost record.** Write `wolfden_item_cost` with source `vault_buyback` and the amount we actually
   paid. This is the number FIFO and every report will use; the Square-side cost is a courtesy copy.
4. **The trade ledger.** Post a `trade` with one `IN` line (the card, `unit_market` = value,
   `buy_rate_percent` = 100, with `condition`, `set_name`, `card_number`, `square_variation_id`,
   `image_url`) and a credit payout line, `source = 'vault_buyback'`. This puts vault buy-backs through the
   *same* pipe as counter trades, so trade reporting, cost capture, and the consignment hooks all see them
   with no new code.
5. **The vault row** moves to `sold_back`, and the history tab gains a line.

> ⚠️ The read-back rule applies to every Square write here: Square returns 200 for fields it ignores. Nothing
> is marked done until a separate read shows the value stored. `cost_sync` already models exactly this.

---

## 6. Shipping, pickup, and orders

A vault shipment is **an order in `shop_orders`**, not a new order system. `items_json` carries the vault
cards; the order appears on the existing admin and employee orders screens with no new screen to build.

**Shipping.** Address (prefilled from the saved customer profile), live EasyPost rates, pay with **store
credit or card**. The cards move to `on_order` the moment the order is created so they cannot also be sold.

**Decided: above roughly $200 of declared value, the label is bought insured and signature-required, and
the member pays** — folded into the shipping price they are quoted. Around $6 on a $600 card.

⚠️ **This does not work today and needs real code.** `buyShippingLabel` posts only `{ rate: { id } }` —
there is no `insurance` field and no signature option anywhere in `easypost.js`, so **every shop order
currently ships uninsured**. Two changes:

1. `buyShippingLabel` takes a declared value and passes `insurance`, plus the carrier's signature option.
2. ⚠️ **The quote has to include it, because EasyPost does not.** Insurance is charged when the label is
   *bought*, not in the rate — so a rate shown to the member would be short by the insurance amount and we
   would silently eat the difference on exactly the shipments where it is largest. We add the estimate to the
   quoted price ourselves, and reconcile against the real charge after purchase.

**Store pickup.** No shipping cost at all. The order is created, fulfilment mode `pickup`, and the member is
told when it's ready. This should be the cheap, obvious default for local players — it is also the lowest-risk
path for us.

**Cancelling. Decided: a pickup order can be self-cancelled right up until it is picked up** — including
after staff have already pulled and bagged it. The cards go straight back into the vault.

> ⚠️ This differs from how the shop works today: `/api/shop/orders/[id]/request-cancel` only **flags** an
> order for the owner to review. A vault pickup order genuinely can be self-cancelled, because nothing has
> been paid out and nothing has moved.

⚠️ **A cancelled order that was already prepared needs a re-file task.** Choosing "any time before pickup"
means staff can pull four cards, sleeve them, label the bag — and have the order dissolve under them an hour
later. If nothing tells them, those cards sit in a holding bag that the system believes is back in the vault,
which is how physical and digital quietly part company. So: cancelling an order whose
`fulfillment_status` has reached `ready` raises a **re-file task** on the same queue as the pulls (§1.3),
naming the cards and where they were put.

A **shipping** order that has been paid for can only be request-cancelled, as today — a bought EasyPost label
is real money.

**What staff see.** The order on the orders screen names each card, its set/number/condition, and where it
is. Plus a new **Vault Holds** view (§8) so anyone at the counter can answer "is this card spoken for?"

---

## 7. The money: Square stops at the credit sale

**Decided (Luke, 2026-10-26): virtual pack opens do NOT go into Square.** Square reports that a customer
bought store credit, and that is where its involvement in this feature ends. Everything downstream — opens,
pulls, vault holdings, sell-backs — is **a separate reporting vein that we build**.

The earlier draft of this section proposed forcing each open into Square as an order with an `EXTERNAL`
stored-balance tender, so the existing reports would pick it up for free. That is dropped. The reasons the
new line is better:

- **It is where the money actually is.** Cash enters the business exactly once, when credit is bought. A
  pack open moves no money — it redeems a liability. Making Square pretend a payment occurred is dressing a
  liability movement up as a sale.
- **It does not rest on an unverified Square behaviour.** `EXTERNAL` tenders are used nowhere in this repo
  and would have had to be proven before anything else could be built. That dependency is gone.
- **Square stays what it is** — the POS and the catalog, authoritative for the counter and the webstore. The
  vault is a different book, closer to a chip float than to a till.

### 7.1 The boundary, stated once

| Event | Square | Our vein |
|---|---|---|
| Member buys store credit | ✅ the real cash sale, as today (non-taxable "Store Credit" item) | credit liability + |
| Member opens a pack | **the packed variation is deleted** (§1.1) — catalog only, no order, no payment | **revenue, COGS, tax, credit liability −** |
| Member sells a card back | **+1 stock, or the item is created** (§5) | credit liability +, inventory cost in |
| Member ships / collects | an order in `shop_orders`, label bought | vault card leaves |

**The rule in one line: Square owns the catalog and the stock; our vein owns the money.** Anything that
changes physically sellable inventory still touches Square. Nothing about the open does.

### 7.2 What the vein has to book, and from what

All of it is computable from data we already hold — no Square read at open time.

| Figure | Source |
|---|---|
| Revenue | the pack price at open, stamped on `mkt_pack_open.price_cents` |
| COGS | the bag's cost — see 7.3, this is a real decision |
| Sales tax | computed on the pack price at the shop rate — see ⚠️ below |
| Credit spent | `mkt_store_credit_event`, reason `pack_open` |
| Credit paid out | `mkt_store_credit_event`, reason `vault_sellback` |
| Vault liability | sum of `current_value_cents` for every `held` card — **cards we owe people** |
| Inventory returned | the trade ledger rows from §5 |

And the whole thing must **reconcile**, which is the point of building it as a vein rather than a dashboard:

> **credit sold (Square) − credit spent (ours) − credit refunded = credit outstanding (`mkt_buyer`).**

If those four do not tie out to the cent, something is wrong and the screen should say so rather than
rendering a number.

### 7.3 DECIDED: a pack costs what we ACTUALLY paid for the card

**Luke, 2026-10-26: "Actual."** A pack's COGS is **the real cost of the single that went into it**, captured
at bagging time, with the 65% stamp used only where that is genuinely unknown.

**Why the 65% stamp is not it.** The bag carries `wolfden_unit_cost` = 65% of its card's market value,
written at packing. The instinct behind it is sound — the code's own comment says *"a $2-card pack costs
pennies (big margin); a $209 hit-pack costs real money (an expected loss the cheap packs cover)"* — but
65%-of-market is a **valuation, not a purchase**. Nobody ever paid it, and how far it sits from the truth
depends entirely on how the card arrived:

| How the card arrived | Market | Actually paid | 65% stamp | Gap |
|---|---|---|---|---|
| traded in at 70% | $100 | $70 | $65 | $5 — fine |
| bought as a single | $100 | $55 | $65 | $10 — tolerable |
| **pulled from a box we broke** | $100 | **~$8** | $65 | **$57 — not fine** |

The third row is why this matters. A chase card out of a $120 box did not cost $65; the box cost $120 and
most of what came out of it is worthless. Costing it at $65 makes a hit pack read as a disaster when it was
the entire reason for breaking the box.

This repo already has the rule, learned expensively: **Square's entered cost → what we recorded paying →
65% estimate, LAST.** Getting it backwards once turned a 61% margin into fiction. See
[[square-deleted-items-cost-loss]] and [[unit-cost-is-exact-fifo-never-averaged]]. The 65% stamp is the
house's own designated last resort; it was simply being used as the primary.

**How it gets captured — and it must be at BAGGING, not at open.** The app already holds the source
variation when a card is added to a pack. At that moment it asks the same resolver the reports use — FIFO
batch / `wolfden_item_cost` / the trade ledger — and writes the answer onto the pool row:

```
mystery_bag_cards.cost_cents      -- what we actually paid for this card
mystery_bag_cards.cost_basis      -- 'fifo' | 'item_cost' | 'trade_ledger' | 'estimate_65' | 'unknown'
```

By the time a bag sells, the single may be deleted from Square, the trade may be months old, and the FIFO
layer already spent. Bagging is the only moment the answer is certain.

**Both channels report from that one number** — the online vein and the in-store pack sale alike. One cost,
captured once, read everywhere.

⚠️ **Cost coverage is partial, so the basis flag is not optional.** Many singles arrived as trades (cost in
the trade ledger), some carry no recorded cost at all. Every pack margin must carry its basis so the number
can be read with the right confidence, and the admin screen should show what share of a period's packs were
costed on an estimate rather than on a fact.

⚠️ **This changes IN-STORE pack margin too, not only online.** Pack margins Luke has looked at before will
move once this lands. That is the correct direction — the old numbers were derived from a valuation — but it
will look like something broke if nobody is expecting it. **Announce it, and state the before/after.**

### 7.3a ⚠️ ANSWERED: the cost already left at bagging. Do not relieve it again.

Traced 2026-10-26, and it settles how the vein must book COGS.

`decrementInventoryByOne` writes **`IN_STOCK → SOLD` with no Square order attached**. `nonSaleConsumption`
walks those changes looking for an order line to pair each one against, finds none (there was no sale — a
card was being bagged), falls through to the "did our own app do this?" test, which passes on `byName`
(`/wolf\s*den/i` against `a.source.name`), and classifies it as a **trade-out**. That **spends the
single's FIFO cost layer** and writes an `inv-` consumption row, which `isConsumptionRow` marks as *not
money* wherever revenue is reported.

**So at bagging time: the cost leaves inventory and no revenue arrives against it.**

Worked through on a card bought for $40 that books at $100 market:

| When | The books |
|---|---|
| bagged | FIFO spends the **$40** layer. Cost out, no revenue. |
| bag created | stamped `wolfden_unit_cost` = 65% x $100 = **$65** |
| bag sold for $25 | reports read revenue $25 against cost **$65** |

**What the vein must therefore do: the open is a REVENUE event that ATTRIBUTES a cost, not one that spends
one.** Relieving inventory again at open would take the same $40 out twice.

**And it is why §7.3's capture happens at bagging.** The 65% stamp stays on the Square variation for
Square's own reporting; our books stop deriving from it.

> ⚠️ **This is pre-existing and it is not confined to this feature.** Every bag sold at the counter today has
> the same two numbers: the FIFO view relieved $40, the P&L view charges $65. Across a year with a steady
> pool they may largely wash; inside a month they do not reconcile. **That deserves a check against a real
> month before anyone trusts a pack margin — and it is a separate job from this build.** A report is not a
> bug until it has been verified.

### 7.4 Sales tax: IMPLICIT in the pack price

**Decided (Luke, 2026-10-26): the pack price is tax-INCLUSIVE.** Tax is not added on top of an open — it is
backed out of the price the member already paid. *"Any mystery pack bought this way would have to be
accounted for by an implicit sales tax."*

This is the right answer and it protects the single most important property of the reveal: **the Open button
debits exactly what it says.** A $25 pack costs $25 of credit. No add-on, no surprise, no checkout screen
between the member and the bag.

**The arithmetic.** Tax is `price − (price ÷ (1 + rate))`, with the rate read live by
`getShopSalesTaxRate()`. At an illustrative 7.375%:

| | |
|---|---|
| Member pays | **$25.00** of credit |
| Revenue | **$23.28** |
| Sales tax collected | **$1.72** |

Both numbers are stamped on `mkt_pack_open` (`price_cents`, `tax_cents`) and the tax feeds the existing
remittance set-aside — see [[sales-tax-remittance-cashflow]]. Nothing here is deferred: the tax is collected
at the moment of the open, it is simply already inside the price.

**Why not the other readings, recorded so this is not relitigated:**

- *"They already paid for the credit, so it is barter."* Store credit is untaxed **at purchase precisely
  because it is taxed at redemption** — a credit balance is a cash equivalent, not goods, which is why the
  Square item is `is_taxable: false`. The tax was deferred, not skipped. (Barter is also generally taxed at
  fair market value in most states; it is an income-tax concept more than a sales-tax exemption.)
- *"Tax only at fulfilment, since the card stays in our vault."* Genuinely arguable, and it would mean most
  opens never generate tax at all. Rejected in favour of the simpler, more conservative position that matches
  the register.

⚠️ **THE CARD MUST NOT BE TAXED AGAIN WHEN IT LEAVES.** Tax was taken at the open. So a vault shipment or
pickup order passes **`subtotalCents = 0`** to `taxCentsFor` — the merchandise is already settled.
Shipping is still taxable (Minnesota taxes delivery on a taxable sale, which this was), so the taxable base
on a vault order is **the shipping charge alone**. Getting this wrong double-taxes a member on their own
card, which is the kind of error that is noticed and remembered.

**DECIDED: the shop eats the difference. The online sticker stays at the Square price.**

The Square catalog price is pre-tax, so a counter pack rings at $25 + tax = **$26.84** while an online pack
costs **$25.00** flat and earns **$23.28**. Luke, 2026-10-26: *"We would eat that cost."*

So an online pack gives up **$1.72, about 6.9% of the sticker**, against the same pack sold at the counter.
On a pack whose card actually cost $12 that is $11.28 of margin online versus $13.00 in store — roughly
**13% less margin per pack**. At 100 online opens a month it is about **$172**.

What it buys is the one-number promise: the button says $25 and debits $25, with no checkout screen between
the member and the bag.

> ⚠️ **One thing to have seen before it shows up in a report: in V1 the online pack is the one with MORE
> labour, not less.** A counter customer takes the bag and leaves; an online open raises a pull task —
> someone finds the bag, opens it, files the card (§1.3). So the cheaper channel is also the more expensive
> one to serve, until §1.4 removes the task entirely. Worth watching rather than acting on.
>
> **This is reversible at any time and is not a one-way door.** Raising the online sticker to
> `price × (1 + rate)` closes the gap whenever Luke wants. What must never change is the mechanism: the fix
> is always the **sticker price**, never adding tax at the end.

### 7.5 Two things that follow, and will surprise someone later

- **Square's "Mystery Pack" category revenue now only counts in-store sales.** Online opens live in our vein.
  Those two numbers must be **added, never compared** — and the admin screen should say so on its face, or
  somebody reconciling a month will chase a gap that is not a gap.
- **A bag opened online leaves Square as a deleted variation with no sale against it** — which, to Square's
  own inventory valuation, looks like shrinkage. Expected, and harmless as long as it is written down. It is
  written down here.

### 7.6 The rest of the ledger

- **Store credit is a liability, not revenue.** It becomes revenue when it is spent, which is now entirely
  our vein's job to record. **Q8** (verify the ledger already treats it this way end to end) still stands.
- **Sell-backs are inventory purchases paid in credit** — credit liability up, inventory up. The trade-ledger
  route in §5 keeps them visible, and that one does still touch Square because real stock comes back.
- **Shipping paid in credit** is the same shape: our vein books it, Square sees nothing.
- **§1.4 changes nothing here.** When the pool becomes loose singles, the boundary is identical — Square
  decrements the single, our vein books the money.

---

## 8. Admin and employee visibility

### 8.1 Website admin — `/marketplace/admin` → "Virtual Packs"

Built in the shape `farm-telemetry.js` and `activity.js` already established.

**Health strip (the numbers Luke reads first):** opens today / 7d / 30d · revenue from opens · credit spent ·
COGS · **margin by category** · sell-back rate · live vault liability (total current value of every card
sitting in vaults).

**⚠️ The pool guardrail, given its own box.** Live **expected value per pack vs. the pack price**, with the
pool's value histogram beside it. When EV ≥ price, the box goes red and says so in words: *every pack sold
right now loses money.* Because the pool is public and finite and drains from the top, this number moves on
its own as good cards get pulled — it is not a set-and-forget.

**Pool management.** The pool is stocked by bagging cards in the app, as today — this screen does not create
pool rows. It shows composition by tier, flags rows with no `tcg_card_id` (A1), and lets Luke pull a row out.
Removing a row that is `reserved` mid-open must be refused, not silently dropped.

**Activity feed.** Every open, live: member, pack price, card pulled, value, tier, what they chose. The big
hits are the ones worth surfacing on the public board too.

**Per-member drill** (one row per member, expandable): opens, credit bought, credit spent, total pulled
value, sell-back %, cards held, **net position**. Net position is the abuse-detection number — alt farming
has happened here before, and a member who is consistently net-positive across many opens is either lucky or
is telling us the pool is mispriced.

**Funnel.** Viewed the page → registered → bought credit → opened → opened again. This is what says whether
the CTA is working.

### 8.2 Admin & employee app (`accounting_app`)

Both flavours, because the employee is the one on the floor:

- **Vault Holds** — every card currently sitting in a member's vault, searchable by card name and by member.
  Answers "is this one spoken for?" at the counter, which is the question that otherwise gets answered wrong.
- **Vault orders** — surfaced in the existing `ShopOrdersAdminScreen`, with a pull-list view: card, set,
  number, condition, where it's filed. Tick them off as pulled.
- **Pack telemetry** — a read-only mirror of the health strip + the live feed, in `MysteryPackScreens.kt`
  alongside the existing pack tooling.

Admin-only (full flavour): pool management, EV guardrail, per-member net position, margin.

---

## 9. The economics, said plainly

The house margin on this feature is **pack price − expected value of the pool**, and nothing else. The
buy-back is not a margin source (we pay 100%); the shipping is pass-through; the credit is already banked.

Because the pool is published card-by-card, **the expected value is a number any player can compute**, and it
*rises* as commons are pulled and *falls* as hits are pulled. Two consequences:

1. **The pool must be restocked, not drained.** A pool left alone converges on whatever is left, and if the
   hits go first the remaining EV collapses and nobody opens. Target counts per tier, topped up.
2. **A patient player can wait for a favourable pool.** That is the honest cost of full transparency, and the
   defence is simply keeping EV below price at all times — which the admin guardrail in §8.1 is for. There is
   no need to hide anything as long as that invariant holds.

**Settled: the EV is decided during the manual procurement of the bags**, where it always has been. The 65%
cost basis stamped on each bag at packing time is the other half of that same judgement. So nothing in this
feature chooses the margin — it only has to **show** it, which is what the admin box is for: a number to
check, not a lever to pull.

---

## 10. Data model

New tables, following the existing naming:

```sql
-- mig NNN-virtual-packs-and-vault.sql

-- 1. Which channel a pool row belongs to. Default 'shelf' = everything that exists today, unchanged.
-- 'bagged' = a real sealed bag (everything today, and all of V1). 'shelf' = a loose single, for §1.4.
-- The column exists from day one so the later migration is a data change, not a rewrite.
ALTER TABLE mystery_bag_cards
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'bagged',
    ADD COLUMN IF NOT EXISTS condition TEXT,           -- the reveal shows it; the table has no column today
    ADD COLUMN IF NOT EXISTS tcg_card_id BIGINT,       -- link to tcg_cards for live value + printed rarity
    -- §7.3: what we ACTUALLY paid for this card, captured at BAGGING — the only moment it is certain.
    ADD COLUMN IF NOT EXISTS cost_cents INT,
    ADD COLUMN IF NOT EXISTS cost_basis TEXT;          -- fifo | item_cost | trade_ledger | estimate_65 | unknown

-- Guarded the way mig 016 does it — a bare ADD CONSTRAINT fails on a re-run and migrations are SPENT.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mystery_bag_cards_channel_check') THEN
        ALTER TABLE mystery_bag_cards
            ADD CONSTRAINT mystery_bag_cards_channel_check CHECK (channel IN ('bagged', 'shelf'));
    END IF;
END $$;

-- 1b. The staff task raised by an online open of a real bag (§1.3). None is raised for channel='shelf'.
CREATE TABLE IF NOT EXISTS mkt_pack_pull_task (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_open_id    UUID NOT NULL REFERENCES mkt_pack_open(id) ON DELETE CASCADE,
    mystery_card_id UUID NOT NULL REFERENCES mystery_bag_cards(id) ON DELETE RESTRICT,
    bag_sku         TEXT NOT NULL,                     -- what is printed on the bag in the tub
    status          TEXT NOT NULL DEFAULT 'open',      -- open | done
    done_at         TIMESTAMPTZ,
    done_by         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pull_task_open ON mkt_pack_pull_task (created_at) WHERE status = 'open';

-- 2. One row per virtual pack opened. The authoritative record of the pull.
CREATE TABLE IF NOT EXISTS mkt_pack_open (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id          UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    mystery_card_id   UUID NOT NULL REFERENCES mystery_bag_cards(id) ON DELETE RESTRICT,
    price_cents       INT  NOT NULL,                   -- what the pack cost, at open time
    card_value_cents  INT  NOT NULL,                   -- the card's value, at open time
    tier              TEXT NOT NULL,                   -- derived at open so history never re-tiers
    outcome           TEXT NOT NULL DEFAULT 'pending', -- pending | vaulted | sold_back
    idempotency_key   TEXT UNIQUE NOT NULL,
    -- The money figures live HERE, not in Square (§7). Stamped at open so history never re-derives.
    cogs_cents        INT,                             -- copied from mystery_bag_cards.cost_cents (§7.3)
    cogs_basis        TEXT,                            -- copied from .cost_basis, so a margin carries its confidence
    preview           BOOLEAN NOT NULL DEFAULT FALSE,  -- §16.4: an owner/guest test open. Real money, excluded
                                                       -- from engagement telemetry. Stamped AT open, never
                                                       -- re-derived from an id later.
    tax_cents         INT  NOT NULL DEFAULT 0,         -- sales tax owed on this open (§7.4)
    revealed_at       TIMESTAMPTZ,                     -- when the client actually saw it
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pack_open_buyer ON mkt_pack_open (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pack_open_created ON mkt_pack_open (created_at DESC);

-- 3. The vault itself. One row per card a member holds.
CREATE TABLE IF NOT EXISTS mkt_vault_card (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id           UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    pack_open_id       UUID REFERENCES mkt_pack_open(id) ON DELETE SET NULL,
    mystery_card_id    UUID REFERENCES mystery_bag_cards(id) ON DELETE SET NULL,
    square_variation_id TEXT,
    card_name          TEXT NOT NULL,
    set_name           TEXT,
    card_number        TEXT,
    condition          TEXT,
    image_url          TEXT,
    pulled_value_cents INT NOT NULL,
    current_value_cents INT NOT NULL,
    tier               TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'held',   -- held | on_order | shipped | picked_up | sold_back
    order_id           UUID REFERENCES shop_orders(id) ON DELETE SET NULL,
    sold_back_at       TIMESTAMPTZ,
    sold_back_cents    INT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_buyer ON mkt_vault_card (buyer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_held ON mkt_vault_card (square_variation_id) WHERE status = 'held';

-- 4. Append-only vault history (the transparency promise, made queryable).
CREATE TABLE IF NOT EXISTS mkt_vault_event (
    id            BIGSERIAL PRIMARY KEY,
    buyer_id      UUID NOT NULL REFERENCES mkt_buyer(id) ON DELETE CASCADE,
    vault_card_id UUID REFERENCES mkt_vault_card(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,   -- opened | vaulted | sold_back | ordered | cancelled | shipped | picked_up
    credit_delta_cents INT NOT NULL DEFAULT 0,
    meta          JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vault_event_buyer ON mkt_vault_event (buyer_id, created_at DESC);
```

Deliberately **not** new tables: orders (reuse `shop_orders`), credit movement (reuse
`mkt_store_credit_event`), the buy-back (reuse `trade` / `trade_line`), unit cost (reuse
`wolfden_item_cost`), pack audit (reuse `mystery_audit_log`).

---

## 11. API surface

| Route | Does |
|---|---|
| `GET /api/marketplace/packs` | pack price, balance, pool summary + full pool list, whether the member can open |
| `POST /api/marketplace/packs/open` | **the one that matters.** Idempotency-keyed. Claims a bag, deletes its Square variation, spends the credit, books the money in our vein, writes `mkt_pack_open`, returns the card. |
| `POST /api/marketplace/packs/[openId]/choose` | `{ choice: "vault" \| "sell" }` — the post-reveal decision |
| `GET /api/marketplace/vault` | cards, on-order, history, totals |
| `POST /api/marketplace/vault/sell` | sell one or many back; returns the new balance |
| `POST /api/marketplace/vault/order` | create a ship or pickup order from selected cards |
| `POST /api/marketplace/vault/order/[id]/cancel` | self-cancel a pickup order; cards return to the vault |
| `GET /api/admin/packs/telemetry` | the admin screen's single read |
| `POST /api/admin/packs/pool` | add / update / remove online-channel pool rows |

### The open, step by step — ordering matters

1. Validate: signed in, payments enabled, pool non-empty, balance ≥ price, no open already `pending` for
   this member (a stuck pending is resumable, not a second charge).
2. **Claim a bag atomically.** `UPDATE mystery_bag_cards SET status='reserved', reservation_key=$k WHERE
   id = (SELECT id FROM mystery_bag_cards WHERE status='active' ORDER BY random() LIMIT 1 FOR UPDATE SKIP
   LOCKED) AND status='active' RETURNING *`.
   ⚠️ `FOR UPDATE SKIP LOCKED` is only meaningful **inside a transaction**, so this runs in `db.tx` — which
   exists and is real here, because `db.js` uses the `Pool` driver, not the `neon()` HTTP one. It costs a
   `BEGIN`/`COMMIT` pair of round trips; at pack-open volume that is nothing, but do not reach for `db.tx`
   anywhere in this feature that a single guarded `UPDATE ... WHERE status='active'` would do.
2b. **Delete the packed variation from Square — now, before the credit is spent, and `await`ed.** This is
   what takes the bag off the register (§1.1). If it fails, release the claim and stop: a bag we could not
   un-list must not be sold twice.
3. **Spend the credit** — guarded, so it cannot overdraw. If it fails, release the claim and stop.
4. Write `mkt_pack_open` (`outcome = 'pending'`). **From here the result exists and is owed to the member**,
   whatever happens to their browser.
5. Mark the pool row `sold`, write `mystery_sold_events` + `mystery_sold_assignments` + `mystery_audit_log`
   (`source = 'virtual_open'`), and record the hit to `mystery_bag_recent_hits` so it appears on the public
   board.
6. **Book the money in our own vein** (§7): revenue, COGS + its basis, and sales tax, all stamped onto
   `mkt_pack_open`. ⚠️ **No Square order and no Square payment are created.** The only Square call this flow
   makes is the variation delete in 2b, and that is catalog housekeeping, not a sale.
7. Attribute the pull (`mystery_big_hit` badge at $100+, same threshold as in-store) and `trackActivity`.
8. Return the card.

⚠️ With no Square order created, the webhook has nothing of ours to confuse itself with — the
`reference_id` guard below is now belt-and-braces rather than load-bearing. (Historical note: match on prefix
`vpo:`), or it will try to assign a second card to the same order.

---

## 12. Edge cases

**The open**
- Double-tap / double-submit → idempotency key, and the button disables on the first tap.
- Browser closed mid-reveal → the open is already committed. The vault shows an **unopened pull** the member
  can resume; the choice defaults to nothing until they make it.
- Pool empties between page load and tap → a clean "we're out of packs right now", credit untouched. ⚠️ This
  is likelier than it sounds: the shelf drains the same pool, so the board can go from 40 packs to 0 over a
  busy Saturday with nobody online noticing.
- Two members racing for the last bag → `FOR UPDATE SKIP LOCKED`; the loser gets the message above.
- A walk-in buys the bag mid-open → §1.2. The claim precedes the spend, so the member is never charged for a
  bag they did not get.
- Credit spent, roll throws → refund the credit (`reason: "refund"`, same as checkout does on a card
  failure), release the claim.
- Member's balance moves between the check and the spend → the guarded spend fails closed and nothing else
  has happened yet.

**The vault**
- Selling a card already in an order → blocked by `status`, and the UI never offers it.
- Card value changes after the pull → the vault shows both numbers; the sell-back price is whatever is on
  screen at the moment they confirm, quoted back in the confirm sheet.
- Bulk sell mis-tap → confirm sheet with the itemised list and the total.
- Member deletes their account with cards in the vault → **decided: refuse.** Nothing of theirs is destroyed
  by a button press. The message has to be real and actionable: name the cards, name their total value, and
  offer the two ways out — sell them back now, or arrange collection/shipping — with both one tap away from
  the refusal itself.

**Square and stock**
- **Nothing to decrement at open time** — the source single was already decremented when the bag was made
  (§7.2). Do not add a second decrement here; that is the bug that took two units per sale for three days.
- The packed variation is already gone when we try to delete it (the register beat us) → treat as the
  collision case in §1.2, not as an error to swallow.
- A bag in the tub that nobody can find → the "can't find it" action on the staff task (§15/A6).
- A buy-back of a card whose Square item was deleted → `include_deleted_objects: true` on the lookup, as the
  reports already learned to do; otherwise we create a duplicate item and lose the cost history.
- Square write succeeds with a 200 but stores nothing → read-back before marking done, always.

**Money and risk**
- Credit top-up charged back after the cards were pulled → **decided: a 7-day hold before cards can leave
  the building.** In-store chip payments largely shift fraud liability to the issuer; an online credit
  top-up is card-not-present, where the merchant is liable. The hold is what stops a fast path from a
  reversible payment to goods walking out the same afternoon.

  **The rule, kept simple enough to explain in one line:** every vault card carries a `releasable_at`.
  At open time, if the member has any `mkt_credit_purchase` credited within the last 7 days,
  `releasable_at` = that purchase's `credited_at` + 7 days; otherwise `releasable_at` = now. The member is
  told *"ready to ship or collect on the 14th"*, once, on the order screen — **never on the vault card
  itself**, which stays clean (§4).

  ⚠️ It must key off the **credit purchase**, not the open. Keying off the open would penalise a member
  spending credit they topped up months ago, which is most of them.
- Refunding a pack open → there is no honest refund of a revealed card. Policy: opens are final. Say so
  before the first open, once.

**Legal**

**Decided: nothing special. This is a card shop doing what card shops do** — a pack with a random card in it
and a counter that will buy the card back. Luke's call, and a defensible one: it is functionally identical to
a live break, and no age gate or special apparatus is being built.

Two things are worth keeping true anyway, because they cost nothing and they are the facts the position rests
on:

- **Store credit never becomes cash.** It only ever buys things from us. That is what makes the buy-back a
  refund-and-exchange mechanism rather than a payout, and it is the single most load-bearing fact here — so
  it should stay explicit in the credit terms rather than being merely how it happens to work today.
- **The pool stays published, card by card.** Already true (`/mystery-bags`), already the design. Odds that
  anyone can compute are the strongest thing you can say about a randomised product.

> ⚠️ For the record, since this is where a later session will look: pay-to-play + random outcome + prize with
> cash value is the shape that US state lottery and loot-box law tends to be written around, and I have no
> read on where Minnesota draws it. Nothing above is legal advice and I am not a competent source for it.
> Noted, not litigated — if this grows into real money, it is worth twenty minutes of someone qualified.

**Abuse**
- Alt farming has happened here before. Per-member net position on the admin screen (§8.1), plus a daily open
  cap, plus the existing `identitySignals` / IP capture that `shop-item-rules.js` already does.
- Self-exclusion / a self-set spend cap is cheap to build and worth having on day one.

---

## 13. Build order

Each step ends somewhere shippable.

1. **Pool readiness.** The `channel` column; the `tcg_card_id` backfill (A1 — without it the reveal has no
   real set, number or rarity to show); **the `cost_cents` / `cost_basis` capture at bagging plus a backfill
   for bags already made** (§7.3); and the admin pool view, showing what share of the pool is costed on a
   fact rather than an estimate. Nothing player-facing. Proves the data before anything is built on it.
2. **The open, server-side only.** The claim → delete-variation → spend → commit path, and **the reporting
   vein (§7) written at the same time, not after**: revenue, COGS with its basis, and sales tax stamped on
   every open. Proven with a script that opens packs and reconciles credit sold − spent − refunded against
   the outstanding balance. ⚠️ **Sales tax (§7.4) belongs in this step**, not a later one — it is a
   compliance item and a vein that starts out without it will be backfilled under pressure.
3. **The reveal.** Bag asset, the eight phases, `pack-rarity.js`, `pack-audio.js`, both screen sizes. The
   choice buttons wired to the API.
4. **The vault.** Cards tab, detail sheet, sell-back (credit + Square restock + trade ledger + cost write).
5. **Orders.** Ship / pickup / cancel through `shop_orders`; pull-list in the admin + employee app.
6. **Telemetry.** Admin screen, app mirror, funnel, per-member drill.
7. **The funnel polish.** Logged-out CTA, inline credit sheet, the pool drawer.
8. **Announce it.** A feature nobody is told about reads as a feature that is switched off.

⚠️ **Step 0, before any of the above: the gate (§16).** Build it owner-only from the first commit, not as a
retrofit. A flag added after the fact is a flag with doors nobody enumerated.

---

## 14. Decisions and what is left to prove

**All of Luke's calls are made.** Settled 2026-10-26: Q1 real bags + staff task, shelf later (§1) · Q2
colourless glow (§3.1) · Q3 thresholds stand as proposed (§3.3) · Q4 100% of current market (§5) · Q5
insurance over ~$200, member pays (§6) · Q6 pickup self-cancel until picked up (§6) · Q9 EV set during
procurement (§9) · Q10 refuse deletion (§12) · Q11 7-day hold keyed to the credit purchase (§12) · Q12 no
special legal apparatus (§12) · Q13 no deadline, nothing on the vault screen (§1.3) · Q14 can't-find-it
refunds in full (§1.3).

**Also decided 2026-10-26: Square stops at the credit sale.** Opens are not pushed into Square as orders;
everything downstream is a reporting vein we build (§7). That dropped Q7 entirely.

It opened two further questions, **both now settled**: Q15 — a pack costs what we actually paid for the card,
captured at bagging (§7.3) · Q16 — sales tax is implicit in the pack price (§7.4).

**Every decision in this document is made.** The last one, settled 2026-10-26: the online sticker stays at
the Square price and **the shop eats the ~$1.72 of tax** rather than charging more online (§7.4).

What remains is verification work, all of it mine — see the table below.

**The rest is verification work, mine to do:**

| # | To prove | Blocks |
|---|---|---|
| Q8 | Does the ledger treat purchased credit as a **liability** until spent, end to end? (§7.6) | reporting |
| ~~V1~~ | **Measured 2026-10-26 (§17.2): 100% carry the placeholder set, and `tcg_cards` matches only 15%. The fix is a `card_name` PARSER, not a backfill.** | — |
| V2 | Does EasyPost's `insurance` field behave as expected on a bought label, and what does it actually charge? (§6) | shipping |
| ~~V3~~ | **Answered 2026-10-26: yes, the FIFO layer is consumed at bagging** (§7.3a). The open attributes a cost; it must not relieve one. | — |
| V4 | Do an actual month's pack sales reconcile between the FIFO view ($40 relieved) and the P&L view ($65 charged)? **Pre-existing, affects in-store packs too, separate from this build.** (§7.3a) | trusting any pack margin |

---

## 15. Audit — what this design walks into

Read back against the code on 2026-10-26. Six of these are landmines in **existing** functions that this
feature would step on; they are listed first because they are the ones that cost real money or real cards.

### ⚠️ A1 — the pool has no real set, number, or condition to show

This one hits the reveal directly. `buildMysteryPickerUpsertRequest` writes:

```kotlin
set = "Square",
number = shortId,   // last 8 chars of the packed SKU
```

So for every card added through the inventory picker, **`set_name` is the literal string "Square" and
`card_number` is a fragment of a barcode**. There is no `condition` column at all. §3.1's Phase 6 promises the player
"its value, set, number, condition, all the stuff" — and three of those four are currently placeholders.

**The fix is already sitting in the data.** The source variation's SKU is `TCG-<tcgplayerProductId>` (the
picker finds it with `findExistingItemBySku("TCG-$tcgId")`), and **`tcg_cards.id` *is* the tcgplayer product
id**. So one lookup gets the real set name, real collector number, **printed rarity**, a proper image, and
**`market_price` kept current by the nightly cron** — which is also exactly what §5's buy-back valuation
needs.

⚠️ `mystery_bag_cards.variation_sku` stores the **packed** SKU, not the source one, so the link has to be
resolved from `square_variation_id` and then **stored** in the new `tcg_card_id` column. Do it when the card
is bagged, not at open time — an open should never wait on a catalog round trip.

Where no confident match exists, show what we have and flag the row in the admin pool view. Never guess:
`link-variation.js` refuses fuzzy matches for exactly this reason, and a wrong price here is money out the
door wearing the face of an answer.

### ⚠️ A2 — the dead-heat collision is currently silent

Covered in §1.2, repeated here because it is the one that can hand one card to two people. When an
`exactCardId` assignment lands on a row that is no longer `active`, `assignExactCardToSoldEvent` returns zero
assignments and the webhook logs a warning. **That path must raise an alert**, to staff and to Luke, naming
the bag and both claimants. A warning in a log is not a resolution for a physical card.

### ⚠️ A3 — the future model (§1.4) re-arms a catalogue-deleting bug

Not a V1 problem; a V2 landmine worth writing down while it is visible.
`processQueuedMysteryWebhookEvent` ends with:

```js
const variationToDelete = card.packed_variation_id || variationId;
await deleteSquareCatalogObject(variationToDelete);
```

A `channel='shelf'` row has **no `packed_variation_id`**, and `findMysteryBagCardBySquareVariationId` matches
on `square_variation_id` as a documented fallback — so the fallback would resolve to **the card's own source
single and delete it from the catalog**. Deleting Square items is what wiped cost, name and image off every
past sale of 559 variations in August.

**Guard it now, cheaply:** never delete when `packed_variation_id` is null, and never delete for
`channel = 'shelf'`. Both are one-line conditions, and writing them today costs nothing. Separately, the
virtual-open order should carry a `reference_id` prefix the webhook skips — but that guard depends on a field
being set correctly on every order forever, so it is the second line of defence, not the first.

### ⚠️ A4 — the recent-hits board drops cards with no number

```js
if (!card?.name || !card?.set || !card?.number) return null;
```

`recordMysteryBagHitFromCard` returns null and writes nothing. `card_number` has been nullable since mig 079
(sealed packs have no number), so this already silently skips some hits — and a virtual pull of anything
without a number would simply never appear on the board the feature is trying to make exciting. Relax it to
require name + set, or decide online rows must carry a number.

### ⚠️ A5 — `attributeMysteryPull` cannot be reused as-is

It takes a Square `order`, reads `payment.customer_id`, and resolves a buyer from it. The virtual path
**already knows the buyer** — it is the authenticated member. Calling it with a synthetic order would
re-derive, badly, something we were handed.

Extract the half that matters (credit one bag bought, flag `mystery_big_hit` at $100+, re-sync badges) into
a function that takes a `buyerId`, and have the Square path keep its lookup and call into it. One rule, two
entry points — not two copies that drift.

### ⚠️ A6 — a bag that goes missing stays in the pool forever

The database believes a bag exists because a row says so. Bags get lost, damaged, given away at an event, or
taken to a convention. Today nothing reconciles the tub against the table, and an online open can therefore
claim a bag that is **not physically there** — which the member finds out about only after paying.

V1 needs the cheapest possible version of a count: the staff task queue (§1.3) already forces someone to go
and find a specific bag, so **a task that cannot be completed is the detector**. Give the task a second
action — **"can't find it"** — which refunds the member's credit in full, marks the row `removed` with a
reason, and alerts Luke. One button, and the drift becomes visible instead of becoming an argument.

(For §1.4's model the same hole reappears differently: a pool row points at a Square single that can be sold
at the counter. There, the `inventory_feed` reconcile must deactivate any `channel='shelf'` row whose
variation has reached zero.)

### Smaller, still real

- **`shop_orders.catalog_object_id` and `item_name` are `NOT NULL`.** A multi-card vault order has neither
  naturally. Decide the convention now — `catalog_object_id = 'VAULT'`, `item_name = "Vault shipment (4
  cards)"` — rather than letting each caller invent one.
- **Nav fan-out.** A vault badge in `GameNav` is a one-line change that bills a request on every navigation
  by every member forever, and `check:chrome` will reject it. The count rides along on the existing batched
  HUD endpoint or it does not exist.
- **Poll gate.** If anything in the reveal or the vault ticks on a timer and talks to the server, it must be
  gated on `document.visibilityState`, and a POST must compare against what it last sent. `check:polls`
  enforces both. The reveal itself should need no polling at all — the result arrives in the open response.
- **styled-jsx.** Run `npm run check:css` after every edit, and no backticks inside styled-jsx comments. This
  feature is a lot of new CSS.
- **Card images.** `img` `onError` fires before hydration, so a React `onError` handler on a card image can
  miss; the fallback has to survive that. And any re-exported bag art needs a `?v=` bump or people keep the
  old picture.
- **The reveal must not re-tier history.** `mkt_pack_open.tier` and `card_value_cents` are stamped at open.
  If the thresholds in §3.3 are ever retuned, an old pull must still read the way it read on the day.

### What I could not verify, and will not claim

- ~~Square `EXTERNAL` stored-balance tenders.~~ **Moot** — §7 no longer puts opens into Square at all, which
  removes this dependency entirely. Dropped 2026-10-26.
- ~~Whether `decrementInventoryByOne` consumed the single's FIFO layer.~~ **Answered: it does** — §7.3a.
- **The real shape of the pool** — the tier thresholds in §3.3 stand by decision, not by measurement.
- **How many pool rows resolve to a `tcg_card_id`** (A1). If most do not, the reveal readout is a bigger job
  than it looks and step 1 grows.

**All of these belong before any of the reveal is built.**

---

## 16. The gate: owner-only for now

**Decided (Luke, 2026-10-26): feature-flagged, and for now it shows up only for him.**

### 16.1 One flag, one question

The house pattern, copied exactly — `arena.js`'s `ROAD_OPEN` / `roadOpenFor`, and the Hallowe'en note in
`owner.js` about why there must only ever be one:

```js
// src/lib/marketplace/vault-gate.js
export const VAULT_PUBLIC = false;                 // the launch switch. ONE line, ONE place.
export const vaultOpenFor = (buyerId) => VAULT_PUBLIC || canPreview("vault", buyerId);
```

⚠️ **It asks `canPreview("vault", …)`, NOT `isOwner` directly.** `isOwner` is checked in 44 files and decides
casino controls, credit checkout, the role system, creation tokens and pet drops — inviting somebody to test
pack opening must not hand them the shop. `canPreview` is keyed per feature, so adding a tester later
(Littlewolf, a staff member) is one line in `PREVIEW_GUESTS.vault` and revoking it is deleting one line.
Owners pass without being listed.

### 16.2 ⚠️ Every door, enumerated — because this is where it goes wrong

The casino launch removed three owner checks, all correct, and members still could not play: a **fourth**
gate sat inside `spinSlot5` rather than at the door. It worked for exactly one person for twenty minutes.
Door gates and play-path gates get written at different times by different concerns.

So the list is written down now, while the feature is being designed, rather than reconstructed at launch:

| # | Door | Shape |
|---|---|---|
| 1 | `/mystery-bags` — the **Open online** CTA and the reveal surface | hide the surface |
| 2 | `/marketplace/vault` page | redirect |
| 3 | the vault entry in `GameNav` | hide the link |
| 4 | `GET /api/marketplace/packs` | 404 |
| 5 | **`POST /api/marketplace/packs/open`** | **the play path — the one the casino missed** |
| 6 | `POST /api/marketplace/packs/[openId]/choose` | refuse |
| 7 | `GET /api/marketplace/vault` | 404 |
| 8 | `POST /api/marketplace/vault/sell` | refuse |
| 9 | `POST /api/marketplace/vault/order` + `/cancel` | refuse |

⚠️ **Door 1 does NOT gate the existing public board.** `/mystery-bags` is live today and lists the whole
pool; hiding it would be a regression for a feature that has nothing to do with this one. Only the new
*open-online* surface is gated — the board stays exactly as it is.

**Before calling this released,** grep the whole subsystem for all three shapes the house has been bitten
by: `OPEN =`, `*OpenFor`, and a bare `isOwner` inside a play or act path.

### 16.3 ⚠️ The Android half, which has now gone wrong four times in one file

`LedgerApp.kt` registers routes for both flavours but keeps **two hand-maintained drawer lists**. A route in
the NavHost and only one list is a screen that exists, works, and cannot be reached — that is how Luke ended
up counting $571 on an employee phone because the owner build had no Cash Drawer entry.

So when the pull-task queue and the pack telemetry screens are added: **put them in BOTH drawer lists, or
decide out loud that one flavour should not see them.** The decision for this feature:

- **pull-task queue** — both flavours. The employee is the one who can walk to the tub (§1.3).
- **pack telemetry / pool management** — full flavour only.

### 16.4 ⚠️ A preview of THIS feature is not a sandbox

Unlike the Grove or the Forest, an owner-only preview here **consumes real inventory and real money**. Every
test open deletes a real Square variation, marks a real bag `sold`, spends real store credit, and raises a
real pull task for a real bag in the tub. There is no dry-run that is still a true test — the whole point is
the Square and credit side effects.

That is accepted, not a problem to solve. But two consequences follow:

- **Owner opens must be excluded from the telemetry averages** (§8.1). There is house precedent and the
  reason is written in `casino-report.js`: Luke plays the floor to test it, and one owner with a test panel
  outweighs the whole membership. Stamp `mkt_pack_open` with the preview flag at open time so the exclusion
  is a fact about the row, not a guess made later from an id.
- **Owner opens are real sales for the BOOKS.** The revenue, COGS and tax in §7 are genuine — he really did
  take a bag out of stock. Excluded from engagement telemetry, included in the ledger. Those are different
  questions and conflating them would either hide real money or pollute real averages.

### 16.5 Launching

One line: `VAULT_PUBLIC = true`. Everything else already asks the one question.

Then: **announce it.** Fourteen fixes once shipped unannounced and the plaza assumed the feature was off.
A reward with no screen is not shipped, and a feature with no announcement is not launched.

---

## 17. What the real pool actually looks like (measured 2026-10-26)

Read-only queries against prod. This settles V1 and materially changes step 1.

### 17.1 The pool is healthy and the bags are well built

| | |
|---|---|
| Active packs | **79** (76 cards, 3 sealed) |
| Pool value | **$1,374** |
| **EV per pack** | **$17.39** |
| EV ÷ $25 price | **~70%** |
| Sold all-time | 320, averaging **$16.32** pulled, best **$338** |

~70% is squarely where a pack people enjoy opening repeatedly should sit. **The procurement judgement is
already right** — nothing in this feature needs to change it, and §9 stands as written.

### 17.2 ⚠️ A1 confirmed — but the fix is a PARSER, not a backfill

**All 79 active rows carry `set_name = 'Square'`.** 100%, exactly as predicted.

But the real data is not missing — it is **crammed into `card_name`**:

```
Jirachi XYPROMO XY67a NM
M Gardevoir EX (Full Art) RC31/RC32 Ultra Rare NM
Ceruledge ex 147/131 Special Illustration Rare NM
```

Name, set code, collector number, printed rarity and **condition**, all in one string. 55 of 79 end in a
condition suffix (`NM`/`LP`/…).

⚠️ **And this is why the `tcg_cards` route is the wrong one.** Exact-name matching resolves only **12 of 79
(15%)** — precisely because of those appended tokens. Chasing a better fuzzy match would re-earn the lesson
in `link-variation.js`: a wrong card is worse than no card.

**So step 1 changes: build a `card_name` parser, not a `tcg_card_id` backfill.** Cheaper, more reliable, and
it needs no external data. `tcg_cards` stays useful for the vault's *live valuation* (§5), where a
confident match is a bonus rather than a requirement.

⚠️ **24 rows have no condition suffix**, so the readout must degrade gracefully — show what parsed, omit what
did not. Never print "Square" as a set name to a member.

### 17.3 ⚠️ The "actual cost" decision is right, but thin on day one

Only **29 of 79 active packs (37%)** have a known cost in `wolfden_item_cost`. The other 63% would fall back
to the 65% estimate immediately.

That does not change the §7.3 decision — it **vindicates the basis flag**. On day one most pack margins will
read `estimate_65`, and the admin screen must show that share honestly rather than presenting a confident
number. Coverage then climbs on its own, because capture-at-bagging is exactly what fills the gap going
forward.

### 17.4 The tier bands put HALF of all opens on the dullest tier

Against the real distribution, the bands in §3.3 land like this:

| Band (as decided) | Share of opens |
|---|---|
| **common <$5** | **53.2%** |
| uncommon $5–15 | 20.3% |
| rare $15–40 | 16.5% |
| epic $40–100 | 5.1% |
| legendary $100–250 | 3.8% |
| mythic $250+ | 1.3% |

**More than half of every open would be grey slate and a dry tap** — the exact risk flagged when these were
taken on a guess. Re-cut against the measured spread:

| Proposed band | Share |
|---|---|
| common <$3 | 32.9% |
| uncommon $3–8 | 35.4% |
| rare $8–20 | 8.9% |
| epic $20–60 | 16.5% |
| legendary $60–150 | 5.1% |
| mythic $150+ | 1.3% |

A third common, a third uncommon, and **~23% landing rare-or-better** instead of 10%.

> **The pool is bimodal, and that is a compliment to how the bags are built.** Cheap filler and genuine hits,
> with little in between — which is why the middle band is thin no matter where the lines go. It also means
> the reveal's drama is real rather than manufactured: roughly one open in four genuinely is worth sitting
> through the animation for.

**This is Luke's call to re-make or leave.** The bands live in `pack-rarity.js` as constants and
`mkt_pack_open.tier` is stamped at open, so changing them later never rewrites history.

---

## 18. Testing it without spending the shop's stock

Luke, 2026-10-26: *"Store credit is a balance you have full control over as it's just a virtual ledger. And
bags are also effectively just virtual cards delineated by their presence in Square, and source cost linkage.
All of which you should be able to revert back to its not-destroyed state after testing."*

Correct, and now proven. `scripts/vault-harness.mjs` (`npm run harness:vault`).

### 18.1 What Square will and will not give back

Probed against the live catalog on a throwaway object, 2026-10-26 — measured, not assumed:

| | |
|---|---|
| `DELETE /v2/catalog/object/{id}` | ✅ works |
| `batch-retrieve` with `include_deleted_objects` | ✅ **returns the whole object, SKU and all** |
| upsert that id again with `is_deleted: false` | ❌ **400 — "Received request to update nonexistent object"** |
| create a NEW variation with the SAME SKU | ✅ 200, new id |

**A deleted Square id is gone for good.** So restore means **re-creating the variation under its original
SKU**, and that is a true restore of everything that matters: **the SKU is what is printed on the bag**
(`buildPackedMysteryVariationSku`). Staff find bag `MP-0391` because it says `MP-0391` on it; the catalog id
is invisible to the physical world. `card_id` and `variation_sku` never change, because they *are* the SKU.

### 18.2 ⚠️ Two things the restore must carry that are easy to miss

- **`wolfden_unit_cost`, the custom attribute.** This is the cost the COGS resolver actually reads — the
  65%-of-market stamp from §7.3. A rebuild that drops it silently re-creates the bag as a pack that **cost
  nothing**, and the margin on its next sale is fiction. Confirmed restoring correctly: `0.65` on a $1.00
  card, which is also the first live confirmation of the 65% rule.
- **The on-hand count.** A rebuilt variation starts at zero. Without putting the unit back, the pool row
  claims a bag that Square says does not exist.

Native unit cost (`item_variation_vendor_infos`) is **absent on these bags entirely** — the 65% stamp lives
only in the custom attribute. Worth knowing before anyone goes looking for it in Square's own COGS report.

### 18.3 The harness runs the real path

It does not mock the delete, stub the credit spend, or branch the code under test on a flag. **The Square
delete is the step that takes a bag off the register (§1.1)** — the single most important thing to exercise —
so it is broken for real and put back for real.

Restore only ever touches **what the snapshot named**: every row it deletes is one whose id it wrote down
first. It never cleans up "anything that looks like a test". An undo that guesses its own scope is how a
harness eats production data.

```
npm run harness:vault snapshot --bags 1 --buyer <id>    capture bags + balance
npm run harness:vault selftest                          break it and put it back, asserting each field
npm run harness:vault status                            snapshot vs live
npm run harness:vault restore                           undo everything the snapshot named
```

### 18.4 ⚠️ Two bugs the first green run was hiding

Both are the house lesson that a green gate is not evidence, and both were only visible by reading the
output rather than the exit code:

- **"credit restored to $9.00" could not have failed.** The balance was below the pack price, so the spend
  was skipped entirely and the restore restored nothing. The harness now **tops the balance up** so the
  credit half genuinely runs, and records the grant as one of its own events so restore removes it too.
- **"native unit cost ✓" was `undefined === undefined`.** The bag had none and the rebuild had none, so a
  tick appeared where no check existed. Vacuous comparisons now print **SKIP** and are counted separately —
  a check that cannot fail is worse than no check, because it occupies the space where a real one would go.

A third surfaced on the second run: the snapshot's variation id goes **stale** after a restore, because the
rebuild has a new id. Selftest now re-reads the live id before breaking anything, which is what makes it
repeatable.

**Verified end to end, twice in a row:** pool back to 79 active, credit back to $9.00, zero stray ledger
rows, SKU and unit cost preserved across both cycles.

---

## Build log

**Built 2026-10-26, owner-gated behind `VAULT_PUBLIC = false`. Nothing is reachable by a member.**

| Step | Commit | What landed |
|---|---|---|
| 0+1 | `d9012eab` | mig 484 (pool `channel`/`condition`/`cost_cents`/`cost_basis`, `mkt_pack_open`, `mkt_pack_pull_task`, `mkt_vault_card`, `mkt_vault_event`), `vault-gate.js`, `pack-card-name.js` |
| — | `5fdc6e31` | `scripts/vault-harness.mjs` — snapshot / selftest / cycle / adopt / restore |
| 2 | `690cecbf` | `openPack` / `choosePackOutcome`, the three member APIs, `pack-rarity.js` |
| 3 | `3dba9e15` | the reveal: bag cut-out, `pack-audio.js`, `PackOpenClient`, wired into `/mystery-bags` (choreography replaced 2026-10-27, below) |
| 4 | `90b3e661` | `getVault` / `sellVaultCards`, `vault-restock.js`, the vault screen |
| 5 | `3181b62f` | mig 485, vault orders through `shop_orders`, EasyPost insurance, self-cancel + re-file |
| 6 | `f7ffc1f6` | `pack-telemetry.js`, `/marketplace/admin/packs`, the staff pull queue |
| 7 | `4ec0c747` | the Card Vault in the member menu |

### The reveal, rebuilt (2026-10-27)

Step 3's choreography — zip the bag, raise the card out of it, flip, slam — was replaced wholesale after Luke
saw it on a phone: *"it looks awful the card is clearly not inside the bag, there is a white horizontal bar
just floating. I think lets have the bag shake then explode and reveal the card. The card should be big."*

He is right about the cause. The card rose from BEHIND the bag, so on screen it was a rectangle sliding up
past a drawing, and the "seam of light" sold as the pack opening was a 3px white bar hanging in mid-air
attached to nothing. The illusion asked a flat PNG to contain an object, which no flat PNG can do.

**Now: shake (950ms) → burst (420ms) → reveal (560ms) → readout.** A bag that destroys itself never has to
contain anything — it is there, then it is debris, then the card is where it was.

| Piece | Where |
|---|---|
| `rumble` / `burst` / `shimmer`, and `zip`/`rise`/`flip`/`slam` deleted | `src/components/packs/pack-audio.js` |
| phases, `rollDebris()`, `Haptic.chestShake()` + a tier-scaled buzz on the bang | `src/components/packs/PackOpenClient.js` |
| `.pk-flash`, `.pk-shock`, `.pk-debris`/`.pk-shard`/`.pk-spark`, `.pk-rays`, `.pk-sheen`, the takeover | `src/app/globals.css` |
| `packs.open.mythic.json`, `packs.open.common.json` — film it without spending a bag | `scripts/fixtures/` |

**What the identical-shake rule bought, again.** Nothing before the burst may hint at the tier — no colour,
no chord, no longer shake for a better pull — which is the old colourless-glow decision under a new name. It
pays the same dividend: since nothing before the burst depends on the answer, nothing before the burst has to
wait for it, so the request hides inside the shake and the tap is never followed by a dead screen.

**Four things only the film could have found,** all at 375x441 (a 667px iPhone with its chrome showing):

1. **`hidden` in JSX does nothing to an element with a `display` of its own.** The UA sheet's
   `[hidden] { display: none }` loses to `.pk-top { display: flex }`, so the header sat there through the
   whole explosion while the component believed it was gone. Needs the partner rule `.pk-top[hidden]`.
2. **The reveal had to take the screen.** The stage sits under ~90px of site header, and with that in place
   the value landed at y=464 and both buttons at y=540 on a 441px viewport — off-screen, with a card already
   shrunk to pay for it. Fixed/inset-0 from the shake through the readout; `z-index: 950`, above
   `.social-fab`'s 900, which the film caught parked on top of the "Keep it" button.
3. **An absolutely-positioned card contributes nothing to its arena's height,** so a card bigger than the
   arena silently lands on top of the readout. The card's height is now one token, `--card-h`, that the arena
   sizes itself from — the two cannot disagree.
4. **Debris in the bag's own colours is invisible.** Near-black shards with a 50%-opacity gold hairline on a
   `#0C0C0C` panel filmed as sixteen pieces of nothing. A torn edge catching the light is both truer and the
   only version that reads.

**Still to do:** step 8 — announce it, which only happens when `VAULT_PUBLIC` flips. And the Android half of
§16.3: the pull queue and the pack telemetry need adding to **both** drawer lists in `LedgerApp.kt`, or they
are screens that exist, work, and cannot be reached.

### What the build found that the design did not

Every one of these came from running the thing, not from reading it:

- **A 2.4-second dead pause after the tap.** The reveal awaited the server before starting. Fixed by the
  observation that falls out of the colourless-glow rule: nothing before the flip may carry information about
  the result, so nothing before the flip needs to WAIT for it. §3 updated in spirit; the code carries the note.
- **The pack price was chargeable when it was a guess.** The board's fallback chain ends at a hard-coded $25
  and the real Square price is $20. Fine for a board, not for something that debits credit. `packPrice()`
  labels its source and an open refuses on the default.
- **A buy-back overwrote an existing unit cost.** `wolfden_item_cost` holds what we recorded PAYING, and a
  buy-back prices one unit at 100% of market — writing it variation-wide repriced every other copy on the
  shelf. It gap-fills only now. One real row was damaged in testing and has been restored.
- **The vault's bottom sheet rendered off-screen**, because `.reveal > *` leaves a persistent
  `transform: translateY(0)` and a transformed element is a containing block for `position: fixed`.
- **A permission key that does not exist fails CLOSED**, so the pull queue would have been shut to every staff
  account while looking correct in the diff.
- **The admin page gate and the admin API gate are different auth systems.** The screen rendered and sat on
  "Loading…" forever.

---


