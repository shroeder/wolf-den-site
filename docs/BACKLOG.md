# Backlog

Things found, measured, and deliberately not fixed yet. Each one carries the evidence so picking it up doesn't
mean re-deriving the problem.

---

## 1. Pet sprite regeneration — PAUSED BY OWNER

The art *pipeline* is fixed (see CHANGELOG: `editImage` now applies `deHalo`/`faceRight`, and prompts are
future-proofed), but **no sprites have been regenerated**. Last measured cost for the most recent 20 pets was
~$6.70. The Hearth Cat preview looked right but was never confirmed.

Also worth doing when this resumes: anchoring every level on Lv1 makes the base a single point of failure — a
weak Lv1 evolves into five weak sprites with no signal. Generate Lv1, eyeball it, *then* evolve.

---

## 2. Two open decisions

- **Raffle pool breadth.** Fortune tickets now enter the draw for anyone holding fortune, not just people who
  fought — which is exactly what the pets card promises ("Free weekly-boss raffle entries each day"). That
  includes dormant accounts. Gating it to members who logged in during the boss week is a one-line change if
  the flood is unwanted.
- **48 creation credits with no ledger origin.** The creation ledger's first row (Jul 27 13:07) postdates the
  first purchase (Jul 25 14:38), so early grants have no recorded source. A Jul-27 opening-balance backfill was
  offered and never approved.

---

## 3. Known-but-unowned

- **Eric D's double-submit** — two identical "Beachside Hut" drafts at 20:17 on 07-30. Flagged, never
  investigated. Probably a double-tap with no guard on the start button.
- **`mkt_creation_purchase` holds $55.00 but Eric's $25 arrived as a `purchase_credit` ledger row** — creation
  revenue is tracked in two places and they don't agree.

---

## Pack telemetry and member reports — PINNED 2026-10-28

Luke: full visibility into pack openings (newest first: who, which pool, which card, its image and value) and
per-member dossiers (actions, cards held, orders). **See `docs/pack-telemetry-and-member-reports.md`.**

The headline from the schema audit: **the data is already recorded** — `mkt_pack_open` carries revenue, tax,
cogs and basis per open; `mkt_vault_card` carries the card with its image; `mkt_activity_event` has 678,345
rows of member actions. This is screens and joins, not instrumentation.

⚠️ One decision blocks it: whether reports live in the admin app (consistent with
`admin-screens-belong-in-the-app`) or on owner-gated web, since reading is a different risk class from acting.

⚠️ One thing is genuinely not recorded: **pool alpha over time**. `mkt_pack_pool_state` is state, not history.
Alpha drift is the entire margin risk on the pack ladder and it is currently unobserved — history not written
cannot be recovered.

---

## Virtual rips need their own front door — QUEUED 2026-10-30

Luke, watching people use it: *"The mystery bag screen — it's not apparent that you can rip packs. Everybody
just skips the top thing that lets... that's the entry point for opening them. I think we have competing
screens right now."*

⚠️ **THE ENTRY POINT IS A STRIP AT THE TOP OF A SCREEN ABOUT SOMETHING ELSE, AND PEOPLE SCROLL PAST IT.** That
is the whole report, and it is not a styling note — a feature reachable only through a control nobody
registers is a feature that does not exist for most members.

**The two screens, and which is which:**

- **Mystery Packs** — the shop-facing screen that tells people what is *in* the physical packs on the shelf.
  It had a purpose and may still; Luke's words: *"I just don't know yet if we're going to continue to do
  mystery packs in store."*
- **The rip UI** — opening a virtual pack. Currently bolted onto the top of the screen above.

**The shape he wants:** *"maybe we leave mystery packs alone entirely. And instead, we make a new page, a new
menu item that's like virtual rips or something. And that screen has, it's just the pack rip UI right there.
So you can't miss it at all."*

So: a new menu item and a new page whose entire body is the rip. Mystery Packs is left alone — ⚠️ **do not
"unify" the two**, which is the obvious-looking move and is the opposite of the ask; the point is that one
screen does one thing and the thing is unmissable.

⚠️ A new page needs a door in the SAME commit — [[a-screen-with-no-door-is-not-shipped]], which has already
happened twice.

**Not started.** Luke: *"that would be one of the next things we would work on after we get through the
backlog of other things."* See `docs/virtual-packs-and-the-card-vault.md` for what the rip already does.

---

## Three casino pets nobody can get — FOUND 2026-10-30, DECISION PENDING

`npm run audit:pets` walks all 144 pets against every grant path. Three are stranded:

| pet | rarity | perk |
|---|---|---|
| The Brass Magpie | epic | `prizeChance +0.004` |
| The Jade Tortoise | legendary | `prizeChance +0.006` |
| The Onyx Hare | mythic | `prizeChance +0.01` |

They exist, they are drawn, their perks apply, and **about nine real members already own them** — the
comment above them in `collectibles.js` records why they were written in the first place: the Counter's
ladder granted them by id before they existed in the catalogue, so they were written up "as what the members
were promised, not quietly removed from under them."

The ladder has since moved on. `casino-counter.js` sells eight pets; these three are not among them, and
nothing else in `src/` names them.

**This is a decision, not a bug.** Either they go back on the Counter, or they are retired exclusives that a
few people have and nobody else can earn. Both are defensible; it is Luke's call.

⚠️ **IF THEY GO BACK, IT IS NOT ANNOUNCED.** Rates, dials, pet rungs — [[never-announce-casino-changes]] has
exactly one carve-out and this is not it.
