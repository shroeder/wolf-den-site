# The node map — Luke's vision, collected

Started 2026-10-07. **Nothing is in code yet** beyond what the build log at the bottom records. This is the
running design document: decisions get written here as Luke makes them, so a later session starts from the
decisions instead of re-deriving them.

---

## 1. The shape

A **permanent** map of nodes. You move across it; progress is positional and does not reset. Each node is a
**zone** with its own background. Kill enemies in a zone; after enough of them the next area unlocks. Each
zone ends with a **boss**.

- **20 maps to start.** Each themed. Reuse existing sprites where they fit the theme; generate new art only
  where nothing fits.
- **Map 1 is a FOREST, with 12 zones.** That is the whole of the first build.
- **Owner-gated** at first.

Difficulty climbs with every node and every map — enemies gain **damage and health** as you go.

---

## 2. Moving and fighting

**Movement.** The hero and the pet walk left and right and **hop up and down between platforms**, so a zone
can be vertical as well as horizontal. The player taps or clicks a spot and the hero **automates** to it.

**Camera.** Trolleys with the hero and looks ahead slightly. Common sense — it must not jostle the player.

**Attacking.** Tap an enemy to attack it; the hero **auto-attacks that enemy until it dies or you tap away**.

**Enemies.** They hop around and wander. Early-map enemies are **fully passive**. Later ones **retaliate when
attacked**. They have varying attacks that fit their theme, and every attack **telegraphs** where it will land.

**Damage model.**
- Your **gear set, account-wide stats and pet passives** dictate damage, attack speed and health.
- Damage is **mitigated by armour**.
- **Life steal** applies to the character.
- Your **pet attacks too**, for damage based on **its level and rarity**.

**Bosses.** Each zone ends with one. A **big health bar across the top of the screen**, a unique body, and
**distinct attack animations that telegraph their target**.

**Death and loot.** A simple **shared death animation**. Loot **spills on the ground** where the enemy fell,
and the player must **walk near it to pick it up**.

---

## 3. Population and respawn

Each zone holds **15–30 enemies**, **fully replenishing every 45 seconds** — busy enough that the play area
never feels empty.

### Rare spawns

Every map has a **rare spawn**: a **crystal enemy themed to that map**. Its chance to appear is **low**. It
carries **its own loot table, worthy of being rare** — gold, some items, unique parts, possibly a chest. Rare
spawns **also drop emblems**.

> Note: the rare spawn is the one place gold appears in this feature. Ordinary enemies never drop it.

---

## 4. What enemies drop

**Every enemy has its own loot table.** Not one global table — what you are fighting decides what it gives,
which is what makes a route across the map worth choosing.

- **No gold** from ordinary enemies.
- **Small XP** is fine.
- **Parts** are the payload. Each enemy has its own parts.
- **Every part a player can get has a use in at least one recipe.** Nothing drops that is not wanted.
- **Emblems** drop by chance (see §7).

### Hyper-rare drops

A separate, very rare tier that scales with how far in you are:

| when | drop |
|---|---|
| early | pet food |
| later | upgrade stone · free enchant · free gear upgrade |
| latest | free plot upgrade · free sail upgrade · and the like |

---

## 5. Crafting — a new system

A **new system**, in **its own area**, with **its own upgrades, badges and set** — and that **set is NOT
wearable**.

**Where you craft:** a **crafting shop with a workbench**, or straight from the **game menu**.

**Recipes reflect their parts**, and their **utility and power reflect the map and the difficulty** they came
from.

### Recipe discovery

You see a recipe **only once you have found every part it needs** — and it is based on **discovery, not
possession**. Find part one, discard or bank it, later find part two: the recipe unlocks anyway.

**The unlock is a moment.** It should be dopamine-inducing, **inspectable**, and carry a **call to action to
craft it**.

### What you can craft

**New tool gear slots — one per system where a tool applies:**

- fishing rod (fishing)
- pickaxe (mining)
- shovel (digging)
- smith's hammer (forge)
- hoe (farm)
- sextant (sailing)
- *(more to come — Luke: "probably other tools im forgetting")*

**Also craftable:**

- decorations for the farm
- **up to 2 additional farm plots**
- **backpack and bank expansions** (see §6)

---

## 6. Inventory and the bank

- **Backpack: 16 unique slots** to start.
- **Bank: up to 64 slots**, located in town.
- An **inventory screen** to see everything collected.

**Expansions are crafted.** Each expansion is **unique and one-time**, numbered with **Roman numerals** (I,
II, III …) to say which one it is, and **each has its own recipe**.

---

## 7. Emblems

Enemies — **including rare spawns** — have a chance to drop their **emblem**. Every emblem you collect
improves a **passive** stat. All emblem bonuses are passive.

**Breakpoints.** An emblem levels on how many you have collected: **1 star after X**, climbing to **6 stars**.
Each star colour is progressively more impressive, and **each higher breakpoint takes far longer to reach**.

**Equipping.** **3 emblem slots to start**; **3 more exist but are locked for now.** You can equip, unequip
and **inspect every emblem** whenever you like.

**What they do** — flat stats, percentage stats, and:

- **increased rarity of items found in this feature**
- **increased chance to spawn a rare mob**
- **emblem drop rate** (itself a passive, on select emblems)
- **movement speed**
- **attack speed**
- **crit rate** and **crit damage** — ⚠️ these two **feed globally to everything**, not just this feature

---

## 8. The stone tablet

A **stone tablet in town** you interact with to see **every part you have unlocked and how many you have
not**. You get **passive bonuses based on how many you have collected**, at **breakpoints that make sense**.

---

## 9. The first build

**One map: the Forest. 12 zones. Owner-gated.**

- Each zone has a **unique enemy type**; **some zones may have 2**.
- Each enemy has **its own parts and its own loot table**.
- Every part has a use in **at least one recipe**.
- Enemies **grow in damage and health** across the 12 zones.
- The forest's **rare spawn is a crystal enemy** fitting the theme.
- Each zone has **its own background**.

---

## 10. Rules this has to live inside

Scars already in the codebase, not opinions.

- **No chests from ordinary enemies.** The chest roll is a CHAIN where the first match wins, so raising one
  tier silently steals from gear (`chest-chain-compounds`). And never a chest alongside a different reward
  (`rewards-must-be-scoped`). The rare spawn's "possible chest" is the deliberate exception and must be
  granted through `addChests`, not by touching the roll.
- **`awardXp` pays gold 1:1 unless passed `gold: 0`.** On a repeatable kill loop that is a money printer
  (`awardxp-gold-tracks-xp-landmine`). Every XP grant here passes `gold: 0`.
- **Nerf by DAILY TOTAL, not per event** (`economy-nerf-measure-daily-total`).
- **Rarity and tier lookups must fail UPWARD** (`rarity-tables-stop-at-eternal`,
  `ladder-lookups-must-fail-upward`).
- **Reward tables are shared objects** — a rolled reward is a ROW of a module table; writing to it decays the
  table (`reward-tables-are-shared-objects`).
- **PvE is allowed to stop you** (`pve-is-not-an-entitlement`).
- **No pity progress bars** (`no-pity-progress-bars`).
- **No emoji in UI** — a sprite or a `react-icons/gi` glyph (`no-emoji-in-ui`).
- **Animations always play** — this game deliberately ignores `prefers-reduced-motion`
  (`animations-always-play`).
- **A new gear SLOT must have distinct art and a distinct slot id** (`worn-sets-need-distinct-slots`).
- **Check existing sprites first** — art lives in four places (`check-existing-sprites-first`).

---

## 11. Open questions

- **Combat engine.** Reuse arena combat (depth, but drags in the parked balance rework,
  `arena-combat-rework-parked`) or delve-style (simpler, already tuned) or purpose-built for a real-time
  scene? The tap-to-attack + telegraphed-attack + platforming description reads as **purpose-built real time**,
  which none of the existing engines are.
- **How the 6 tool slots interact with the existing equipment screen** — new slots on the same doll, or
  their own screen?
- **What the crafting set's badges are for**, given the set is non-wearable.
- **Stat ceilings.** Crit rate/damage feeding globally means this feature can inflate every other system;
  needs a ceiling decided before it ships.
- **Does the 45s full respawn apply per player or per zone globally?** Per player is simpler and avoids a
  shared-world contention problem.

---

## 12. Build log

Nothing shipped yet. Entries get added here as pieces land.
