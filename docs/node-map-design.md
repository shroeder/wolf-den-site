# The node map — Luke's vision, collected

Started 2026-10-07. **Nothing is in code.** This is the design being worked out, written down as it is
decided so the next session starts from the decisions instead of re-deriving them.

## The brief, in Luke's words

> "I want to make a more persistent play feature. A map with nodes. You kill enemies. After x enemies it
> unlocks the next area."

> "Each enemy has a loot table. We dont grant gold, I think small amounts of exp are fine. I think they drop
> parts. And then these parts feed either a new or existing system."

## Decided

1. **A map of nodes.** You move across it rather than re-entering a run. Progress is permanent and
   positional — the frontier advances and stays advanced.
2. **Enemies are the verb.** You kill them; they are the unit of progress.
3. **An area unlocks after X enemies.** The gate is a count, not a boss.
4. **Every enemy has its OWN loot table.** Not one global drop table — the thing you are fighting decides
   what it gives, which is what makes a map worth choosing a route across.
5. **NO GOLD.** Settled. Gold has fourteen live faucets and is already balanced against its sinks; a
   persistent kill loop is the one faucet shape in this game with no natural daily cap, so paying gold here
   would be the most dangerous thing the feature could do.
6. **Small XP is fine.** Texture, not payday.
7. **Enemies drop PARTS.** Parts are the payload.
8. **Parts feed a system — new or existing.** ← the open question, see below.

## Open

### Which system the parts feed

This is the live question. Three readings, and they are not equally good:

- **Feed the existing forge line** (Cinder Scrap → Emberheart Shard, 5 tiers). It currently has exactly ONE
  source: mining/smelting. Giving it a second supply makes the map matter to a system that already exists.
  ⚠️ But the forge line is a shared table — doubling supply halves mining's value. See
  `reward-tables-are-shared-objects`.
- **A NEW part line, consumed alongside forge parts.** The forge needs both to do something it cannot do
  today. Makes the forge deeper rather than cheaper, and mining keeps its monopoly on what it mints.
  ← my recommendation.
- **A new system entirely.** Most freedom, most work, and the risk that it ends up as a second forge.

### Not yet decided

- **Seasonal or permanent?** Permanent means every reward is minted once per player, which is far safer
  economically and allows real generosity per area. Seasonal means it can be re-run and re-tuned.
- **What combat?** Reusing arena combat buys depth but drags in the parked balance rework
  (`arena-combat-rework-parked`). Delve-style is simpler and already tuned.
- **Parallel progression or post-dailies time sink?** If it is the thing you do once dailies are done it
  must pay thinly and lean on the area unlocks. If it is parallel it needs its own currency and shop.
- **What an AREA pays**, as distinct from an enemy. A pet is the strongest candidate: the card pool is
  pet-gated, so a pet is also cards you could not draw before — a reward that keeps paying in a system
  already built.

## Rules this has to live inside

Not opinions — these are scars already in the codebase.

- **No chests per enemy.** The chest roll is a CHAIN where the first match wins, so raising one tier
  silently steals from gear. See `chest-chain-compounds`. And never a chest alongside a different reward
  (`rewards-must-be-scoped`).
- **`awardXp` pays gold 1:1 unless you pass `gold: 0`.** On a repeatable caller that is a money printer.
  See `awardxp-gold-tracks-xp-landmine`.
- **Measure any nerf by DAILY TOTAL, not per event** (`economy-nerf-measure-daily-total`).
- **A rarity or tier lookup must fail UPWARD** (`rarity-tables-stop-at-eternal`, `ladder-lookups-must-fail-upward`).
- **PvE is allowed to stop you** (`pve-is-not-an-entitlement`). An area that turns people away is working.
- **No pity progress bars** (`no-pity-progress-bars`).

## The shape I argued for, for the record

Three layers doing three different jobs:

- **per enemy** — small, steady, a material. Texture. Makes the next swing worth taking.
- **per node** — the pacing beat, the "something happened".
- **per area** — the real reward, permanent, one per player. This is where the dopamine is, because the
  unlock Luke already designed IS the reward. Same shape as the Road: flat per rung, exclusives every 25.
