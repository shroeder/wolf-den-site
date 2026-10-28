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

## 4. ⚠️ The assistant is the risky half

An assistant that answers *"do you have Charizard in stock"* is a support surface, and the failure mode is not
"unhelpful", it is **confidently wrong about stock**, which puts somebody in the car. Non-negotiables:

- It answers stock questions **only** from a live `inventory_feed` read passed in as context — never from the
  model's own memory, and never from a cached list older than the page.
- Hours and events come from **one** source the shop already edits, not a second copy typed into a prompt.
- It says "I don't know, here's how to ask" rather than guessing. A wrong answer about a $400 box is worse
  than no answer.
- It never quotes a price it was not handed.

**Cost is unbounded by default.** Every other AI call in this repo is one draw for one member on a cooldown;
an open chat box on a public shop page is a stranger with a text field. It needs a per-session message cap, a
daily spend ceiling, and the same `mkt_ai_generation` ledger row every other call writes — see
`ai-ledger.js`, and note it now prices from real usage.

**Open question I cannot answer from the repo:** whether this is for logged-in members only. That decides
whether abuse control is "a rate limit per buyer" (easy, we know who they are) or "a rate limit per IP on a
public page" (much harder, and the thing that attracts scrapers).

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
3. **Members only, or public?** Decides abuse control for the assistant and whether taste can be persisted.
4. **Is the assistant in v1, or does the deck ship alone first?**
5. **What is the source of truth for hours and events** that the assistant should read?
6. **Does the quiz write back to `game_interests`**, i.e. is it the same taste the rest of the site uses?
