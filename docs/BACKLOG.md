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
