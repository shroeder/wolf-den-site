# The vault shelf queue — pulling and returning the actual cardboard

Captured 2026-10-28 from Luke, **to build later**. Nothing started.

> *"What we don't know is items moving from and to the card vaults. Since they haven't decided to ship yet,
> it won't show up as an order. But we do need to set it aside, otherwise we might accidentally sell it in
> the store… basically like a queue where we need to acknowledge each thing and then click acknowledged once
> we actually do the thing."*

---

## 1. The gap, stated precisely

**The digital side is already right. The physical side has nobody doing it.**

The vault's money and stock are handled — `docs/virtual-packs-and-the-card-vault.md §7.1` is explicit about
where each event lands:

| Event | Square | Our ledger |
|---|---|---|
| a card is bagged | source single **decremented** | bag costed at 65% of market |
| member opens the pack | the packed variation is **deleted** | revenue, COGS, tax, credit |
| member sells the card back | **+1 stock**, or the item is recreated | credit liability + |
| member ships or collects | an order in `shop_orders` | vault card leaves |

So Square's count is correct at every step. What no system touches is **the card itself**, sitting in a
binder or a case on the shop floor. When it lands in somebody's vault, Square says it is gone and the
cardboard is still on display — which is exactly how it gets sold to the next person through the door, and
the Den then owes a card it does not have.

⚠️ **And it is invisible precisely because it is NOT an order.** A member who vaults a card has not asked
for anything to be shipped, so nothing appears in the orders queue the shop already watches. The one case
that needs physical action is the one case that generates no paperwork.

---

## 2. What already exists to build on

Most of the plumbing is there. Named so none of it gets rebuilt:

| Need | Already in the repo |
|---|---|
| The trigger events | **`mkt_vault_event.action`** — live values today: `vaulted`, `sold_back`, `ordered`, `cancelled`, `opened` |
| The card's identity | **`mkt_vault_card`** — `card_name`, `set_name`, `card_number`, `condition`, `image_url`, `square_variation_id`, `tier`, `pulled_value_cents` |
| Card state | `mkt_vault_card.status` — `held`, `on_order`, `sold_back`, `cancelled` |
| Who owns it | `buyer_id`, joinable to `mkt_buyer` for the member's name |
| The app's door | `/api/admin-app/*` and the proxy, with `admin_app_users` + `admin_app_user_permissions` |

**Two of the five actions need a human to move cardboard. The other three do not.**

| action | physical job | queue? |
|---|---|---|
| `vaulted` | **pull the card off the shelf and set it aside** | ✅ yes |
| `sold_back` | **put the card back out on display** | ✅ yes |
| `ordered` | it ships — already in `shop_orders`, already watched | no |
| `cancelled` | nothing moved | no |
| `opened` | the pack opening itself | no |

---

## 3. What to build

A **shelf queue** in the admin/employee app: a list of physical jobs, each acknowledged when actually done.

> ⚠️ **In the APP, not on the web.** The app bakes its own key; a web page would make Luke paste one. That
> rule has bitten before and it applies here — this is a screen staff use standing in the shop with a phone.

### The row

Each row is one card and one verb:

```
┌──────────────────────────────────────────────┐
│ [img]  SET ASIDE                             │
│        Charizard ex · Obsidian Flames 125    │
│        NM · $84 · for @graykitsune           │
│        vaulted 2h ago                        │
│                          [ Done ]  [ Can't ] │
└──────────────────────────────────────────────┘
```

- **SET ASIDE** (from `vaulted`) — the card is somebody's now; get it off the floor
- **BACK ON DISPLAY** (from `sold_back`) — they sold it back; it is sellable stock again

### The two rules that make it a queue rather than a feed

1. **Acknowledged is a state, not a read receipt.** A row leaves the list only when somebody taps Done,
   because the point is that the cardboard moved. Opening the screen must not clear anything.
2. **It is not a notification.** Luke: *"I don't know if I want spam every time somebody moves an item."*
   So: a **badge count** on the app's home, and the list behind it. One push a day for anything older than
   N hours is the most it should ever do, if that.

### "Can't find it"

The case that matters most and is easiest to leave out. If the card is already gone — sold before anyone
pulled it — the staff member needs to say so, and that has to raise something real rather than silently
clear the row. It is the Den owing a member a card, which is a credit decision, not a shelf one.

---

## 4. What it needs underneath

Small. One table and two endpoints.

```sql
mkt_vault_shelf_job (
    id, vault_card_id, action,        -- 'set_aside' | 'return_to_floor'
    created_at,
    done_at, done_by,                 -- which admin_app_user acknowledged
    blocked_at, blocked_reason        -- 'not found' and what happened next
)
```

⚠️ **A job row, not a flag on the card.** A card can go in and out of a vault repeatedly — vaulted, sold
back, vaulted again — and each pass is its own physical job with its own acknowledgement. A boolean on
`mkt_vault_card` would lose the second one, and the history of who moved what is the whole audit trail.

⚠️ **And the job is written where the vault event is written**, in the same function, not by a cron that
scans for new events. Two paths that both mean "a card moved" drift the moment one is edited — the scar
this repo keeps paying for.

---

## 5. Open questions for Luke

1. **Does a vaulted card need a physical location?** "Set aside" is one box today; at a hundred cards it
   needs a slot or a name, or the pull just moves the problem to finding it again.
2. **Who can acknowledge** — owner only, or any employee with a permission? `admin_app_user_permissions`
   already exists to carry it.
3. **How stale is stale?** A `vaulted` card sitting unpulled for a day is the risk window. What should the
   app do at 4 hours, at 24?
4. **Does a sell-back need the card checked before credit is paid?** Today the member gets credit and the
   stock goes back immediately. If the card cannot be found, the Den has already paid for it.

---

## 6. Where this sits

After the Grove work. Luke: *"I don't want to deviate and do it right now. I just want you to collect it as
a reminder for a little bit later."*
