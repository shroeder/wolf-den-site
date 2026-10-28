# Discover — an experimental, swipeable way to shop

Status: **design only, nothing built.** Luke, 2026-10-27: *"im just not sure yet. Maybe its an experimental
view that isnt the default. That way we can try it out first."*

This is the write-up to react to, plus the questions whose answers change the build.

## 1. What is being proposed

A second way to browse the shop, sitting beside the current one rather than replacing it:

- swipe between items, tap to inspect or buy — the mystery-pack picker's feel, applied to real stock
- it covers **all** shop items while you are in it, not a subset
- it opens by asking what you are into (game, sealed vs singles, price band, a specific set) so it has
  something to order 3,000 items by
- an assistant you can chat with about the store — stock, hours, events

## 2. What already exists, and what that saves

This is less new than it looks. Named so nothing gets rebuilt:

| Need | Already in the repo |
|---|---|
| The swipe deck | `.pk-pick-track` — a CSS scroll-snap carousel, in `PackOpenClient.js` |
| The inspect sheet | The card detail layer built 2026-10-27: photo, price, rarity, sell-back |
| Taste: which games | **`mkt_buyer.game_interests`** — live, set in the profile, `profile.js:319` |
| Taste: which categories | **`product_alert_subscriptions`** (`subscriber_id`, `square_category_id`) |
| Taste: specific cards + budget | **`mkt_want`** — `catalog_product_id`, `max_price`, `quantity` |
| The catalogue | `inventory_feed` — name, price, quantity, category, image, consigned flag |
| Buying | `ShopCartClient.js` and the existing Square order path |
| Per-item view tracking | `ProductViewBeacon.js` |

So the quiz should **read and write the profile fields that already exist** rather than inventing a parallel
taste model. A member who already follows Pokémon Singles in product alerts should not be asked again.

## 3. ⚠️ The part I think is wrong in the obvious version

**Swipe must not buy.** The pack picker can treat a swipe casually because every pack is the same $20 and the
outcome is a surprise either way. The shop is $1 to $500 against a live, single-copy inventory: a mis-swipe
that buys a $258 Jirachi is a refund, a restock, and a conversation. The Tinder reading of this feature — right
to buy, left to skip — is the one shape that should not ship.

Proposed instead:

- **swipe = move on.** Horizontal is navigation and nothing else, with no consequence.
- **tap = inspect.** The detail sheet already built, now with Add to cart.
- **a deliberate button = buy.** Never a gesture.

The thing worth keeping from the pack feel is the *pace* and the *art* — one item at a time, full-bleed photo,
no grid of thumbnails — not the gamble.

**And a left-swipe should still teach it something.** Skipping ten $200 sealed boxes in a row is the clearest
signal in the session about what this person is not shopping for.

## 4. The assistant — registered only, and that is a feature

Luke, 2026-10-27, first: *"Ideally its as accessible as possible but maybe with limits so people cant abuse.
But if they are committed and have are logged in we can probably have a longer leash."* Then: *"Or actually it
should prompt them to register before they can even use it."*

**Those two sit on different halves of this feature, and both are right:**

| | who | why |
|---|---|---|
| **The deck** (browse, inspect, buy) | **fully public** | it IS the shop. It has to be linkable, indexable, and frictionless — a registration wall on browsing is a wall on selling. |
| **The assistant** (chat) | **registered** | it costs money per use, it can be scripted against, and a signed-in turn is attributable to a person. |

So the chat is not a wall on the shop; it is a reason to make an account. Asked at the right moment —
*"sign in and I'll help you find it"* — it converts, and the account it creates feeds `game_interests`,
product alerts, store credit and the vault. A registration prompt on the ONE surface that costs us per use is
the cheapest wall in the building.

### ⚠️ Retrieval is the cost lever, not the message count

Priced off this repo's own table (`ai-ledger.js`, gpt-4o-mini at $0.15/M in, $0.60/M out):

| what we put in the prompt | per turn | 1,600 turns/day | a scripted abuser, 1 hour |
|---|---|---|---|
| system + **20 matched items** + history | **$0.00038** | $0.60/day · ~$18/mo | $13.50 |
| 100 items of context | $0.00075 | $1.20/day · ~$36/mo | $27.00 |
| **the whole catalogue (~3,100 items)** | $0.00945 | $15.12/day · **~$454/mo** | **$340.20** |

**A 25× swing, and message limits do not touch it.** Search `inventory_feed` first, pass the handful of rows
that matched, and the feature is an $18/month line. Stuff the catalogue into the context and the same traffic
is $454. I overstated the risk earlier by calling it unbounded without saying what actually drives it: it is
the context, every time.

### What still has to be true

- Stock answers come **only** from a live `inventory_feed` read passed in as context — never the model's own
  memory, never a cached list older than the page. Being confidently wrong about a $400 box puts somebody in
  the car.
- It never quotes a price it was not handed, and says "I don't know, here's how to ask" rather than guessing.
- Hours and events read from **one** source the shop already edits, not a second copy typed into a prompt.
- Every turn writes a `mkt_ai_generation` row like every other AI call here — and that ledger now prices from
  real usage rather than a token table.
- Per-buyer daily cap, plus a **global daily spend ceiling with a kill switch**. The per-user cap handles the
  honest heavy user; only the global ceiling handles a compromised account.

### ⚠️ One thing that would have bitten us

Had the assistant stayed public, the obvious control is a per-IP rate limit — and **everyone standing in the
shop is on the shop's wifi, which is one IP**. An IP limit would have throttled the whole store first,
precisely where an assistant is most useful: a customer at the case asking whether you have something.
Registration sidesteps this entirely. If any IP limiting is ever added to the public deck, the shop's own
egress IP needs an exemption.

## 5. ⚠️ The quiz is a gate, and gates lose people

Four questions before anybody sees a single card is four chances to leave. What I would build:

- **Skippable from the first frame.** "Just show me everything" is always present.
- **Pre-filled from what we know.** If `game_interests` says Pokémon, that question is answered and shown as
  a confirmation, not a prompt.
- **Answerable later.** The same controls live in the deck as filters, so the quiz is a shortcut, not a toll.
- **Persisted to the profile**, so a second visit never asks again.

The honest version of the quiz is **two** questions — game, and roughly what you spend — because set and
sealed-vs-single are better discovered by what somebody skips than by what they claim.

## 6. Ordering 3,000 items

The deck lives or dies on what it shows third. A first cut that needs no model:

1. matches the stated game and price band
2. in stock, not consigned, has a photo — an item with no photo is unshowable in a full-bleed deck
3. recently arrived outranks long-tail
4. demote whatever the session has already skipped the shape of

Worth knowing: **876 Pokémon singles, 181 Magic, 52 Yu-Gi-Oh**, plus sealed. Big enough that ordering matters,
small enough that nothing fancier than the above is needed to start.

## 7. Rollout

Opt-in, off by default, behind the existing gate pattern (`vault-gate.js` is the model). Three stages:

1. owner only, to look at it on a real phone with real stock
2. a toggle on the normal shop — "Try the new view" — that anybody can turn on and off
3. decide whether it ever becomes the default, with usage to argue from

**It does not replace the current shop at any stage.** The existing browser is the one that works on desktop,
is linkable, is indexed, and is how people actually find a specific card.

## 8. What I would NOT build in v1

- the assistant (ship the deck first; the chat is a separate, riskier feature with its own cost story)
- any purchase that happens on a gesture
- a recommendation model — the ordering above is enough to learn whether the format works at all

## 9. Questions

1. **Does a swipe ever buy, or is buying always a deliberate button?** I argue button-only above.
2. **Cart or instant buy?** The packs spend store credit instantly. The shop has a real cart and a real
   checkout. Does Discover add to that cart, or is it its own fast lane?
3. ~~Members only, or public?~~ **ANSWERED 2026-10-27:** deck public, assistant requires registration. See §4.
4. **Is the assistant in v1, or does the deck ship alone first?**
7. **What does the deck remember for a signed-OUT shopper?** The deck is public, so most of its taste signal
   comes from people we cannot write a profile row for. A session cookie covers one visit; anything longer
   needs the account. Worth deciding whether the registration prompt appears when the deck has learned enough
   to be worth saving — "I've got a read on you, want me to keep it?" — which is a warmer ask than a wall.
5. **What is the source of truth for hours and events** that the assistant should read?
6. **Does the quiz write back to `game_interests`**, i.e. is it the same taste the rest of the site uses?
