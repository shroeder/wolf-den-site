# Pack telemetry and member reports — PINNED, not started

> Luke, 2026-10-28: "improved telemetry on pack openings. We want to see all history of pack openings starting
> most recent going backwards. Who opened what pack they bought what card they got its image and value. We
> want to be able to see all members who have participated what actions they took what cards they have. What
> orders they have. You will critically think and make a bunch of professional reports and telemetry tools for
> full visibility. That's a pinned topic for later."

**Pinned. Nothing below is built.** This file exists so picking it up doesn't mean re-deriving what's already
recorded.

---

## The headline: this is a reporting job, not an instrumentation job

The tables already carry almost everything asked for. Nothing needs to start being logged first — which is the
usual reason a request like this turns into a month. What is missing is **screens and joins**.

| what Luke asked for | where it already lives | gap |
|---|---|---|
| who opened a pack | `mkt_pack_open.buyer_id` | — |
| what pack they bought | `mkt_pack_open.pool`, `price_cents` | — |
| what card they got | `mkt_pack_open.mystery_card_id` | — |
| the card's image | `mystery_bag_cards.image_url`, `mkt_vault_card.image_url`, `tcg_cards.image_url` | needs the join |
| its value | `card_value_cents`, `mkt_vault_card.pulled_value_cents` / `current_value_cents` | — |
| most recent going backwards | `created_at`, `revealed_at` | needs paging |
| what actions a member took | `mkt_activity_event` — **678,345 rows**, already everything | needs per-member filter + render |
| what cards they have | `mkt_vault_card` (status, releasable_at, sold_back_at) | — |
| what orders they have | `shop_orders` (+ `vault_order` flag) | — |

Row counts as of 2026-10-28: `mkt_pack_open` 29, `mkt_vault_card` 10, `mkt_vault_event` 79,
`mkt_pack_pull_task` 29, `shop_orders` 28, `mkt_activity_event` 678,345.

**The economics are already stored per open, which is the part that is genuinely hard to reconstruct later:**
`revenue_cents`, `tax_cents`, `cogs_cents`, `cogs_basis`, `buy_back_cents`, `tier`, `outcome`. A margin report
does not need a costing pass — it needs a `GROUP BY`.

---

## ⚠️ The one decision that has to be made first: where these live

[[admin-screens-belong-in-the-app]] is a standing rule — admin screens go in the Android app, because the app
bakes the key and a web page makes Luke paste one. That rule was written about *operational* screens.

These are **reports**, and some of them (a pack-opening history with card images) are things Luke may want to
pull up on a laptop, or show a customer at the counter. So the question is real and is his to answer:

- **A. All in the admin app.** Consistent with the rule. Owner's phone only.
- **B. Reports on the owner-gated web admin, actions in the app.** Reading is not acting — a report that
  changes nothing is a different risk class from a screen that moves stock or money.
- **C. Both, over one API.** The data layer is shared either way; only the renderer differs.

Do not start building until this is answered — it decides the shape of everything else.

---

## The reports worth building

Ordered by what they would have caught. Each one names the thing it makes visible that currently is not.

### 1. The pack ledger — every open, newest first

One row per `mkt_pack_open`, reverse-chronological, paged. Member, pool, price paid, the card with its image
and set/number/condition, pulled value, tier, outcome, and what happened next (vaulted / sold back / shipped /
still a pull task). The literal ask, and the spine everything else hangs off.

⚠️ **It must show opens that produced nothing visible too.** `mkt_pack_open` has an `outcome` column and a
`preview` — a report that silently filters to successful reveals is how you miss a broken pool.

### 2. Per-member dossier

One member, everything: packs opened, cards held in the vault, orders, credit movements
(`mkt_vault_event.credit_delta_cents`), and their activity trail. This is the screen for "a member is asking
about something that happened last Tuesday".

⚠️ `mkt_activity_event` is 678k rows and growing; this must be filtered and paged server-side, never pulled
and filtered in the client.

### 3. Pool economics over time

`mkt_pack_pool_state` stores a snapshot (`alpha`, `ev_cents`, `units`, `lines`, `band_odds`, `top_share_bp`,
`computed_at`) but it is **state, not history** — one row per pool. Realised margin per pool comes from
`mkt_pack_open` instead: price in, cogs out, buy-back out.

⚠️ This is the one place a new table may genuinely be needed, if Luke wants to see how a pool's alpha moved
over time rather than only what it is now. Decide before it matters, because the history that was not written
cannot be recovered. See [[pack-ladder-is-band-plus-curve]] — price is fixed, alpha is derived, and at 100%
sellback the only margin is price − EV, so **alpha drift is the entire risk** and it is currently unobserved.

### 4. The pull queue, aged

`mkt_pack_pull_task` already has `status`, `promoted`, `done_at`, `done_by`. What is missing is **age** — a
task sitting unpulled for a week is the failure mode, and nothing surfaces it. Overlaps with
`docs/vault-shelf-queue.md`; build them together or one will be rewritten.

### 5. Cards the shop owes people

`mkt_vault_card` where `status` is held and `releasable_at` has passed, or where an `order_id` exists but
nothing shipped. This is money owed as goods, and right now it is only visible by reading rows.

---

## Guardrails for whoever builds this

- **Two currencies never net.** See [[casino-reporting-two-currencies]]. Gold and dollars sit in separate
  columns, always.
- **Unit cost is exact FIFO, never averaged** — [[unit-cost-is-exact-fifo-never-averaged]]. `cogs_basis` on
  `mkt_pack_open` records which basis was used; show it, do not recompute it.
- **A rate needs a sample.** [[rate-stats-need-a-sample]]. 29 pack opens is not enough to quote a hit rate;
  print the denominator next to every percentage or the report lies confidently.
- **Report margin BY CATEGORY plus the items** — [[daily-numbers-what-luke-reads]] — not one blended number.
- **One endpoint per layout-mounted component** (`check:chrome`). A telemetry page that mounts in a layout and
  fans out is billed on every navigation by every member, forever.

---

## Not in scope for this pin

Changing how packs are priced, costed, or rolled. This is about **seeing** what already happens. If a report
reveals a pricing problem, that is a separate decision with its own evidence.
