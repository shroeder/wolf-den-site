# The seven towns — gating the game behind the Grove

Started 2026-10-28. **Nothing is in code yet.** This is the design document for Luke's plan: a town between
every map, each town unlocking a slice of the game, so a new account meets the Den one room at a time instead
of all forty doors at once.

---

## 1. The decisions already made

From Luke, 2026-10-28 — these are settled, not open:

- **A town sits before every map, and reflects the biome of the map it opens onto.** Seven maps are built, so
  seven towns. Town 1 is where a brand-new account starts; town 7 opens onto the Ashen Reach.
- **Towns are how features unlock.** The purpose is the player curve, onboarding, and not showing a feature
  before it is any good — *"when you fight in the arena at level 1, it's a poor experience."*
- **Existing accounts keep everything.** Anyone who has an account when this launches keeps every feature
  regardless of where they are in the Grove. The gating applies to accounts created after launch.
- **A locked feature is VISIBLE and clearly locked**, not hidden. (Luke said both in one breath and then
  corrected to visible; visible is the rule.)
- **The existing town splits.** Today's town has a house per feature. Those houses distribute across the
  seven towns — town 1 keeps only the first few, and each new town brings its own.

### Decided 2026-10-28, answering the open questions

- **Pets open in full in town 1.** Not a starter pet with the systems held back — the whole feature, day one.
  It is the best attachment hook the game has, and it goes where it does the most work.
- **Seven separate streets, with fast travel between unlocked towns.** Each town is its own place with its
  own biome art and its own few buildings, rather than one street that accumulates.
- **Bosses are required to advance.** Luke: *"this was a bug, bosses should be required to move to the next
  stage."* **Already true in the shipped code** — see §3b.
- **The curve gets rethought, not patched.** Luke: *"make the boss way easier, along with many in the forest
  and second maps, and the enemies too."* The measured case is §3a; the proposal is §3c.

---

## 2. What the numbers actually say

Measured, not estimated — `scripts/grove-reach.mjs` walks a real member's fighter profile down the shipped
curve until the fight stops being winnable.

### How far real players get

| player | dps | walls at |
|---|---|---|
| **Janell** — 0 XP, nothing equipped | **2** | **map 1, zone 1** |
| **Anamarisa** — three weeks in | 750 | map 4, zone 9 |
| **Littlewolf** — the curve's low anchor | 1,830 | map 5, zone 10 |
| **Shroeder (you)** | 3,714 | **map 6, zone 9** |
| **Kaishiern** | 10,915 | map 7, zone 12 |
| **Eric D** — the curve's high anchor | 75,780 | clears all seven |

*(A wall is one ordinary wanderer taking over 25s, or a zone boss over 300s. Generous on purpose — this is
looking for the cliff, not the discomfort.)*

**You get to map 6 zone 9**, stopped by the boss at 314 seconds. Seven maps is the right amount of content
for the top of the Den: Eric strolls it, everybody else has somewhere to be.

### How long a map takes

`zoneUnlock(depth)` sets the kills per zone, and the respawn ceiling caps a player at **40 kills a minute**
(30 bodies per 45-second window). That makes the floor times:

| map | kills | floor time | realistic | cumulative |
|---|---|---|---|---|
| 1 Rootwood | 620 | 16 min | ~30 min | ~30 min |
| 2 Undercave | 1,770 | 44 min | ~1.5 h | ~2 h |
| 3 Fen | 3,210 | 80 min | ~2.5 h | ~4.5 h |
| 4 Saltwrack | 4,845 | 2 h | ~4 h | ~8.5 h |
| 5 Drowned | 6,635 | 2.8 h | ~5.5 h | ~14 h |
| 6 Gilded | 8,545 | 3.6 h | ~7 h | ~21 h |
| 7 Ashen | 10,560 | 4.4 h | ~9 h | ~30 h |

**This shape decides the whole design.** Town 2 arrives in half an hour; town 7 is thirty hours in. So the
early towns have to carry most of the game, and the late towns have to hold things a thirty-hour player is
finally ready for. Spreading forty features evenly across seven towns would leave a new member locked out of
the farm for a week.

---

## 3. ⚠️ The blocker: a new account dies to two rats

**This must be fixed before any of the rest ships**, and the first pass understated it.

### 3a. What a new account actually is

Not a guess, and not one unlucky member. Profiling the **forty lowest-XP accounts on the server**, thirty-nine
sit under 50 dps and the overwhelming default is exactly **7 dps and 60 health**. That is what the game hands
somebody at hero creation, and under the town plan it is the whole of what they bring to the Grove.

Against zone 1 **as shipped**:

| | value | at 7 dps / 60 hp |
|---|---|---|
| Rootrat health | 290 | **41 seconds** to kill one |
| Rootrat damage | 34–53 | **dies in 1.4 hits** |
| Glutmaw health | 9,000 | **21 minutes** |
| Glutmaw damage | 70–96 | **dies in 0.7 hits — one-shot** |

So the problem was never only "the boss takes too long". **The first ordinary enemy in the game two-shots a
new player, and the first boss one-shots them.** Damage is the number nobody had looked at: the difficulty
work to date tuned health against veterans, for whom incoming damage is close to irrelevant.

The catalogue already carries the symptom in Luke's own words — *"my son can't get past the first map, first
zone's boss"* — and that was an account that had played the other systems.

### 3b. The boss gate is already closed

Luke: *"this was a bug, bosses should be required to move to the next stage."* **It was a bug, and it is
already fixed.** Littlewolf once reached zone ten having killed no bosses at all; `openTheWay()` is now the
only thing that moves `unlocked_n`, and the boss kill is its only caller. Clearing a zone earns the *right to
fight* its boss; killing the boss is what opens the next zone. Nothing to build.

⚠️ **Which is why §3a is urgent rather than merely bad.** Every zone boss is a hard gate. A boss that
one-shots a new player does not make the Grove difficult — it makes the Grove, and therefore the whole game
behind these towns, impossible to enter.

### 3c. The proposal: an on-ramp segment, not a flatter game

The shipped climb is `hpPerZone 5.04%` and `dmgPerZone 3.25%`, compounding on global depth — a x67.6 span in
enemy health across the 83 steps from map 1 to the end of map 7. Dropping zone 1 to something a new account
can fight *while holding the far end fixed* would need **8.12% per zone**, which makes every mid-game zone
sharply harder and walls today's members earlier than they wall now. That is the wrong trade.

So: **give depths 1–24 their own segment**, rejoining the shipped curve at depth 25. Maps 1 and 2 become the
on-ramp — the two maps Luke named — and **nothing from map 3 onward moves at all**.

| anchor | foe health | boss health |
|---|---|---|
| depth 1, today | 290 | 9,000 |
| **depth 1, proposed** | **30** | **500** |
| depth 25 — unchanged, where the segment rejoins | 944 | 29,292 |

That is +15.5% a zone on wanderers and +18.5% on bosses across the on-ramp. Steep on paper, and the right
shape in practice, because the player's own power climbs fastest exactly here. Assuming roughly +17% a zone
from the Grove's own drops and emblems, **the feel stays flat**:

| depth | foe hp | boss hp | per wanderer | boss fight |
|---|---|---|---|---|
| 1 | 30 | 500 | 4.3 s | 71 s |
| 6 | 62 | 1,168 | 4.0 s | 76 s |
| 12 — end of map 1 | 146 | 3,230 | 3.7 s | 82 s |
| 18 | 345 | 8,936 | 3.4 s | 88 s |
| 24 — end of map 2 | 818 | 24,723 | 3.2 s | 95 s |

**Four seconds a wanderer and a 70–95 second boss, for twenty-four zones.** That is a game, not a wall.

⚠️ **Damage needs the same treatment, separately.** Health decides whether the fight is long; damage decides
whether it is survivable, and at 60 hp a new player can afford roughly **6–8 hits**. That puts the zone-1
wanderer near **5–8 damage** (today 34–53) and the zone-1 boss near **8–12** (today 70–96), scaled across the
same segment.

Two things to settle before this is built:

1. **Does a new account stay at 7 dps, or get a starter kit?** The table assumes it stays at 7 and the Grove's
   own drops carry the entire early ramp. A kit would let the on-ramp start less extreme — but having nothing
   to begin with is also what makes the first drop matter.
2. **The +17%-a-zone player ramp is an assumption, not a measurement.** Every figure in the feel table rests
   on it, so it should be measured off the real drop tables before these numbers are committed.

## 3d. Gear drops — the Grove becomes the loot game

Luke, 2026-10-28: *"Gear drops on enemies throughout the entirety of the Grove. That way there's something to
farm for. So we can improve their loot tables using a bunch of different gear on a curve with random rolls so
that you can get lucky and get good shit."*

This is a bigger change than the floor fix it started as, and a better one: it gives the Grove the thing it
currently lacks, which is a reason to keep killing things after the parts you need have dropped.

### It also mostly solves §3a on its own

A full kit of the **cheapest tier in the game** — Rusty Sword, Wooden Shield, Leather Cap — measured through
the real `swing()`:

| kit | dps | hp | per rootrat | rootrat hits survived | zone-1 boss |
|---|---|---|---|---|---|
| nothing (today's new account) | 2 | 0 | 119 s | **1.4** | 62 min |
| **common, all 9 slots** | **100** | **299** | **2.9 s** | **6.9** | **90 s** |
| rare | 146 | 423 | 2.0 s | 9.7 | 62 s |
| epic | 294 | 399 | 1.0 s | 9.2 | 31 s |
| legendary | 474 | 546 | 0.6 s | 12.6 | 19 s |

**A common kit lands exactly on the 100 dps the floor needs.** So the drastic on-ramp rewrite in §3c may not
be necessary at all — the player climbs to meet the curve instead of the curve coming down to meet them.

⚠️ **One thing gear cannot fix: the first sixty seconds.** They arrive wearing nothing, and at 60 hp a
rootrat still two-shots them before the first drop lands. So the one piece of §3c that stays mandatory is
**enemy DAMAGE in the opening zones** — health can be left alone, damage cannot. Survive first; gear does the
rest.

### Rolled, not drawn from the catalogue

Grove gear should be **generated per drop** — base + rarity + depth + rolled affix values — rather than pulled
from the 652 authored items.

⚠️ **And the game already does this.** `ITEMS` in `items.js` is not what the game hands out: four passes
rewrite every item's stats at import, keyed on rarity tier and slot weight — intrinsics, affix counts, dedupe.
The Grove's roller is that same pipeline with two extra inputs, **depth and a seed**, and a range instead of a
fixed value. This is an extension, not a second stat system.

Three reasons it must not draw from the authored pool:

1. **The catalogue is finite and spoken for.** Those items back the compendium, the sets and the collections.
   A faucet pouring into them floods "collect them all" and decays seven set bonuses at once.
2. **A generated item scales forever.** Maps 8–12 are designed and undrawn; a rolled item just takes a
   higher depth. An authored pool would need 60 new items per map.
3. **The chase needs a range.** You cannot roll well on a fixed stat block.

### What makes a lucky drop lucky

Three independent rolls, so the tail is genuinely rare without any single number being tiny:

- **the base** — which slot and archetype fell
- **the rarity** — the band for that depth, with a small chance to roll one band *up* (the band must fail
  upward; see the rarity-ladder scar)
- **the affix values** — each stat rolls inside a range, so two identical bases differ. A near-perfect roll is
  the thing worth bragging about in global chat

⚠️ **The roll happens on the SERVER.** `grove.js` already settles by re-running the same pure roll from the
session seed — the client may compute the same roll locally so the item appears the instant the body drops,
but what the player *keeps* is what the server computed. A client that can name its own stats is a client
that rolls perfect items.

### ⚠️ The economy collision, which is the real risk

Measured today: **82 pieces of gear enter the Den per day**, 282 a week of it from chests — the dominant
source by a wide margin.

| drop rate | a new player's map 1 (620 kills) | a veteran farming one hour (2,400 kills) |
|---|---|---|
| 5% | 31 pieces | 120 — **1.5× the whole Den's daily income** |
| 2% | 12 pieces (a kit, with dupes) | 48 — 0.6× |
| 1% | 6 pieces | 24 — 0.3× |
| 0.5% | 3 pieces | 12 — 0.1× |

One player, one hour, at 2%, produces most of a day's gear for the entire Den. **So a single flat rate cannot
serve both ends.** The on-ramp wants ~2–3% to kit somebody out inside map 1; the steady state wants ~0.5–1%
or the Grove becomes the only gear source in the game and the chests, the delves, the raid and the auction
all stop mattering.

Three ways to hold that line, and this needs Luke's call:

1. **Two rates** — generous through maps 1–2, lean from map 3 on. Simple, and the on-ramp is a one-time
   stretch per account so it cannot be farmed repeatedly.
2. **Rate falls as rarity rises** — commons stay common at depth, the good bands get rare. Natural, and it is
   how the chest ladder already behaves.
3. **Grove gear is bound** — equippable and salvageable but never auctioned. Contains the faucet completely,
   at the cost of the trading loop Luke built the market for.

My recommendation is **1 + 2**: two rates, with the band rarity thinning as it climbs, and Grove gear fully
tradeable. The chase lives in the *roll*, not the volume — which is also what keeps a lucky drop worth
talking about.

### Two smaller collisions worth naming now

- **The bag.** Backpack I is 16 slots and the design's own tension is that carrying food costs you carrying
  loot. Gear drops compete for the same slots, and a player who cannot pick up the good roll because they are
  full of rootrat parts will feel robbed. The bag expansions may need to arrive earlier, or gear may need to
  stack separately from parts.
- **Salvage.** Commons melt to Cinder Scrap. A veteran farming map 1 at 40 kills a minute is also running a
  Cinder faucet; that is small today, but it is the kind of thing that is small until somebody notices.

---

## 3e. Re-cutting the loot tables, all 84 zones

Luke: *"I like the crafting with all the parts and stuff, but we also want loot to drop."* So parts stay the
backbone exactly as they are, and gear lands **on top** — across the whole Grove, not just the on-ramp.

### What a table looks like today

All 84+ residents share one shape, and `loot` pays **parts only**:

```js
rootrat: { hp: 290, dmg: [34, 53], telegraph: 0,
           emblem: "em_rootrat", emblemChance: 0.0026,      // an independent roll
           rareChance: RARE_CHANCE, rareLoot: { part: … },  // another
           loot: [ { part: "gnawed_root", n: [1,2], w: 70 },
                   { part: "damp_moss",   n: [1,1], w: 30 } ] }   // ← weighted, parts only
```

### ⚠️ Gear is a NEW independent roll, never a row in `loot`

This is the single most important structural decision, and it is not a style preference — it is the chest
chain's scar applied one level down. **`loot` is weighted and sums to a whole.** Put gear in it at `w: 20`
and every gear drop is a part that did *not* drop; tune gear up later and crafting silently gets worse, with
nothing in the diff to say so. The Grove already has two independent rolls sitting beside the weighted
array — `emblemChance` and `rareChance` — and gear is a third:

```js
gearChance: 0.012,              // its own roll. Parts are untouched by it, forever.
gearBias:  "attack_speed",      // see below
```

**Parts keep their exact weights and counts.** Nothing about crafting changes.

### Every enemy already owns a stat — use it

The hook is sitting there unused. Each resident has an **emblem**, and every emblem is one stat:

| enemy | its stat | so its gear rolls toward |
|---|---|---|
| Rootrat | might | raw damage |
| Pale Grub | vitality | health |
| Thornling | attack speed | tempo |
| Bristleback | armour | mitigation |
| Gourdling | life steal | sustain |
| Barrow Hound | crit rate | crits |
| Ash Wraith | crit damage | crit size |
| Warren Mother | emblem find | more emblems |
| Mothlight | rarity find | better rolls |

Weight each enemy's gear toward **its own stat**, and *"farm Thornlings for attack speed"* becomes a true
sentence. That is what gives 84 zones 84 different answers to **why here** — which is the actual request
behind "something to farm for". It needs no new data: the mapping already exists in `GROVE_EMBLEMS`.

### Three dials, tuned independently

| dial | what it controls | tuned for |
|---|---|---|
| `gearChance` | how often gear falls at all | the faucet (§3d) |
| the **rarity band** for that depth | what tier falls | the power curve |
| the **roll range** on each affix | how good this one is | the chase |

Separating these is what lets the top of the Grove drop *rarely but excellently* while the on-ramp drops
*often and modestly*, without either one fighting the other.

### The bands, against where players actually are

Measured dps for a full kit at each tier, beside the Grove depth where a player needs roughly that much:

| tier | full-kit dps | comfortable around |
|---|---|---|
| common | 100 | map 1 |
| rare | 146 | map 1–2 |
| epic | 294 | map 2–3 |
| legendary | 474 | map 3–4 |
| mythic | 343* | map 3–4 |
| ascendant | 918 | map 4–5 |
| eternal | 1,512 | map 5–6 |
| celestial | 2,443 | map 6–7 |
| primordial | 5,036 | map 7+ |

\* mythic reading below legendary is a build-mix artifact of picking the highest stat-total piece per slot,
not a ladder inversion — the authored stat totals climb cleanly (epic 90 → legendary 115 → mythic 143 →
ascendant 167).

Proposed band per map, each with a small chance to roll **one band up** (and the lookup must fail *upward* —
the rarity scar):

| map | drops | a player there has | so the band is |
|---|---|---|---|
| 1 Rootwood | common · rare | nothing → ~100 | the kit itself |
| 2 Undercave | rare · epic | ~150–300 | one step ahead |
| 3 Fen | epic · legendary | ~300–500 | level |
| 4 Saltwrack | legendary · mythic | ~500–900 | level |
| 5 Drowned | mythic · ascendant | ~900–1,800 | level |
| 6 Gilded | ascendant · eternal | ~1,800–3,700 | level |
| 7 Ashen | eternal | ~3,700–10,000 | **stops here** |

### The top tiers: rare, but possible

Luke, asked whether the ladder should stop at eternal: *"No, it's rare, but possible."* So celestial and
primordial **do** drop in the Grove — and the only honest way to say "rare" is to pick how many the Den
should see in a month and solve backwards for the roll. A 6% step-up *feels* rare and produces **thirty
celestials a month**; the number has to be derived, not guessed.

**One mechanism, no special cases.** Every gear drop rolls its depth's band, then has a small chance to step
**up one rung**, and a much smaller chance to step up **two**:

| map | band | one up | two up |
|---|---|---|---|
| 1 Rootwood | common | rare | epic |
| 2 Undercave | rare | epic | legendary |
| 3 Fen | epic | legendary | mythic |
| 4 Saltwrack | legendary | mythic | ascendant |
| 5 Drowned | mythic | ascendant | eternal |
| 6 Gilded | ascendant | eternal | **celestial** |
| 7 Ashen | eternal | **celestial** | **primordial** |

The shallow end is then safe **for free** — two rungs above map 1 is an epic. Nothing has to know which tier
is the precious one, and no map needs a rule of its own. (The band lookup must still fail *upward*: an
unknown tier means newer and rarer, never cheaper.)

### Solving the two rates

The Grove is sized against the chest ladder's own deliberate budget — **5 celestial and 1 primordial a month,
Den-wide** — so it roughly doubles the supply of the top tiers rather than flooding them. At the steady-state
0.8% gear rate, a player at the frontier sees **19 drops an hour**. Modelling six people farming the deep end
three hours a week (≈77 frontier hours, ≈1,486 drops a month):

| | rate | in player terms |
|---|---|---|
| **step up one rung** | **0.34%** | one per ~15 hours of farming |
| **step up two rungs** | **0.067%** | one per ~77 hours of farming |

Which is the shape "rare, but possible" actually describes: a dedicated player turns up a celestial every
couple of weeks and a primordial maybe twice a year.

⚠️ **And it scales with how much the Den plays, which is the thing to watch:**

| farmers | h/week | celestial/mo | primordial/mo |
|---|---|---|---|
| 3 | 2 | 1.7 | 0.3 |
| **6** | **3** | **5.0** | **1.0** ← the model |
| 10 | 4 | 11.1 | 2.2 |
| 20 | 5 | 27.8 | 5.6 |

Twenty people farming five hours a week would put out 28 celestials a month against the chest ladder's five.
**So these two numbers are not set-and-forget** — they are the dial to re-measure once the Grove has real
traffic, by daily total, the way every other faucet in this game gets nerfed. `scripts/grove-tail.mjs`
re-solves them for any target.

### The rate across the curve

Two regimes, for the reason §3d measured — one flat number cannot serve a new player and a veteran at once:

| depth | `gearChance` | why |
|---|---|---|
| map 1–2 (the on-ramp) | **2.5%** | ~15 pieces across map 1 — a kit with dupes. One-time per account. |
| map 3–7 (steady state) | **0.8%** falling to **0.5%** | ~20 an hour at the frontier, against the Den's 82 a day |

The on-ramp cannot be farmed repeatedly — you pass through it once — which is what makes a generous rate
there safe when the same rate would be ruinous at depth.

### What a drop actually is

Generated, never drawn from the 652 authored items (§3d). Rolled **server-side from the session seed**, the
way every other Grove drop already settles — the client computes the same roll locally so the item appears
the instant the body falls, but what the player keeps is what the server computed.

```
base      ← a slot + archetype, from the enemy's table
rarity    ← the depth's band, small chance to step up
stats     ← scaled on DEPTH, weighted toward the enemy's own stat
affixes   ← each line rolls inside a range  ← the chase lives here
```

⚠️ **And the rolled row must be fresh, not a reference.** Reward tables are shared module objects in this
codebase; a roller that writes the rolled values back onto the table row decays the table for every
subsequent kill, server-wide, until the process restarts. Build a new object every time.

### ⚠️ Tradeable collides with rolled, and the collision is structural

Luke: *"Yes, it's tradable"* — *"follows the same trade regulations we have on gear today."* That is the
right instinct and it exposes the one genuine blocker in this design, because **today's gear economy is
type-based, not instance-based.**

Checked against production:

| | what it stores | meaning |
|---|---|---|
| `mkt_user_item` | a per-copy uuid, but `item_id` is a **text catalogue key** | 76 copies of `leather_armor` exist as 76 indistinguishable rows |
| `mkt_auction.item_id` | **text** — `"bone_charm"`, `"scale_mail"` | a listing says *"a scale mail"*, never *"this scale mail"* |
| `mkt_item_enhance` | keyed `(buyer_id, item_id)` | your forge level belongs to the **type**, not the copy |

So two copies of an item are interchangeable **by design**, and the auction, the forge and the compendium
are all built on that assumption. **Random rolls break it at the root**: if a Rootwood Blade can roll
differently each time, "a Rootwood Blade" stops being a thing you can list, enhance, or hand over.

The failure mode is the quiet kind this codebase keeps getting bitten by — nothing errors. Somebody buys the
perfect-roll blade they saw on the auction and receives a different one, and the bug report is *"the auction
gave me the wrong item"* months later.

**Two honest ways out, and this needs Luke:**

**(a) Make gear instance-based.** Rolled stats live on the copy (`mkt_user_item` gains a stat column), and
the auction, trades, the forge and equipping all move from the type key to the instance uuid. This is what
"random rolls" really means and it is the right long-term shape for a loot game.
⚠️ **28 files touch `mkt_user_item`** — the auction, crafting, compendium, collections, chests, delves, the
farm, badges. Changing the identity of gear underneath all of them is the largest structural change this
game has had, and the rarity-ladder scar is the precedent for what happens when a core lookup changes and
its consumers do not follow.

**(b) Quantise the roll into named grades.** Each Grove base ships as a small set of real catalogue entries
— *Rootwood Blade*, *Keen* Rootwood Blade, *Savage* Rootwood Blade — each with its own stat block and its own
`item_id`. The roll picks a grade.
Trade, forge, compendium and collections keep working **completely unchanged**, which is the literal reading
of *"the same trade regulations we have on gear today."* The chase survives — *"I pulled a Pristine one"* is
braggable and legible — at the cost of granularity: five grades rather than a continuous range.

**Recommendation: (b) for the first build, (a) as a later migration if the granularity is missed.** Not
because (a) is wrong — it is the better endgame — but because the loudest rule in this repo is that a change
to a core lookup goes wrong *silently* in the consumers that did not follow it, and gear identity is read in
28 places. (b) delivers the farm, the curve, the bands and the step-up tail with zero blast radius, and
leaves (a) available once the feature has proven it is worth the migration.

### The three scars this is standing on

1. **The chest chain** — first match wins, so a new row steals from its neighbours. Hence gear as an
   independent roll, not a weighted entry.
2. **Reward tables are shared objects** — never write to the row you rolled from.
3. **Rarity lookups must fail upward** — "never heard of this tier" means newer and rarer, never cheaper.

---

## 4. The seven towns

The biomes do most of the assignment work — each town's ground names the feature it should open.

| # | Town | Opens onto | What it unlocks | ~when |
|---|---|---|---|---|
| 1 | **Rootwood Waystation** | The Grove (forest) | The Grove · bag & equipment · hero screen · **pets** · daily quests · the Tavern · General Store | day one |
| 2 | **Deepdelve Camp** | The Undercave (cave) | The Mine · the Forge · the Compendium | ~30 min |
| 3 | **Fenhollow** | The Sunken Fen (swamp) | The Farm · the Kitchen · pet food & stones | ~2 h |
| 4 | **Saltwrack Landing** | The Coast | The Docks & sailing · fishing · the bounty board | ~4.5 h |
| 5 | **Drowned Quay** | The Drowned Ruins | Dungeons · the Jeweller · sets & collections | ~8.5 h |
| 6 | **Gilded Exchange** | The Gilded Waste (gold) | The Market · Auction House · trades · the Casino · the daily Spin | ~14 h |
| 7 | **Ashfall Bastion** | The Ashen Reach (fire) | **The Arena** · the weekly Boss · ranks · the Trophy Room · enshrinement | ~21 h |

### Town 1 — Rootwood Waystation

*What a hero is, and who walks with them.* One road out of town and into the trees. Six buildings, four of
them visibly shuttered with a line saying which map opens them.

**Pets open here in full** — the companion fights beside you from the first zone.

The **Tavern is the deliberate inclusion.** Global chat is where the Den's helpers live — graykitsune wrote a
brand-new player the entire game unprompted last week. Locking a newcomer out of the one room where somebody
would answer them is the opposite of onboarding. It opens on day one, and the Helping Paws do the rest.

**Quests** open here too, as the thing that says what to do next. Three small goals, all of them in the
Grove, all finishable in the first session.

### Town 2 — Deepdelve Camp

*Making things.* The Mine is the obvious cave feature, and the Forge needs the Mine's output to mean
anything — the two have to arrive together or the Forge is a building full of buttons you cannot press.

This is also the first town that **changes how the Grove feels**: a player who comes back from the mine with
materials and enhances a Grove drop has just closed the game's central loop for the first time.

### Town 3 — Fenhollow

*Things that grow.* Farm, Kitchen and **pets** in one town, because they feed each other: the farm grows the
crops, the kitchen cooks them, the dishes level the pet, and the pet fights beside you in the Grove.

**Pets went to town 1** (decided 2026-10-28), so Fenhollow is the farm and the kitchen — the things that
*feed* the pet the player has had since the first zone. That is the better order anyway: the companion
arrives when it is a companion, and the means of growing it arrive when there is food to grow it with.

⚠️ The cost of that call is two progression systems inside the first twenty minutes. The beat sheet in §7 has
to absorb it — the pet should arrive as a **character walking beside you**, not as a second screen of
numbers.

### Town 4 — Saltwrack Landing

*The water.* Sailing is the game's long-form idle loop — send a boat, come back hours later — and it wants a
player who has a reason to come back. Four hours in, they have one. Fishing pairs with it and feeds the
kitchen the player already has.

### Town 5 — Drowned Quay

*Risk, and what you keep.* Dungeons are the first content that can genuinely stop you, which is correct at
eight hours and miserable at twenty minutes. The Jeweller and collections arrive with them because by now the
player owns gear worth socketing and a set worth completing.

### Town 6 — Gilded Exchange

*Other people's money.* Everything player-to-player lands here at once: market, auction, trades. A market is
only a market when the player has something another player wants, and that is not true in hour one — an
empty auction house on day one teaches a new member the feature is dead.

The **Casino and the daily Spin** go here too, for a different reason: both are gold sinks, and a player with
no gold to lose cannot enjoy either.

### Town 7 — Ashfall Bastion

*War.* The Arena is the feature Luke named, and this is the whole point of the design — **twenty-one hours of
getting stronger before the game asks you to fight another member.** The weekly Boss, ranks, the Trophy Room
and enshrinement join it: all four are about comparing yourself to the Den, which is the last thing a new
player should be invited to do.

---

## 5. What is never gated

**The till is always open.** Anything that touches the business stays unlocked from the first second, for
every account, forever:

- the **Shop** and the cart · **Store Credit** · **Mystery Bags** · the **Card Vault** · **Sell Your Cards**
- **Events** and the **Rewards track** — the loyalty programme pays points on a purchase made on day one,
  and a locked rewards page is a locked customer
- **Profile, notifications, inbox, DMs, friends, invite** — identity and talking to people are not features
  to be earned

The game gates game systems. It never gates a way to give the Den money or a way to talk to somebody.

⚠️ **Creations is the one judgement call in this list.** It spends real money per image on an AI call. It is
not commerce — it is a feature that costs *us* — so it belongs behind a gate on cost grounds alone, whatever
the player curve says. Suggest town 5.

---

## 6. The two rules that make it survivable

### Grandfathering

> Any existing account retains the ability to use all features regardless of their progress on the Grove.

**The flag is a date, not a backfill.** One `mkt_buyer` column — `gated_at`, null for every account that
exists at launch — rather than writing an "unlocked everything" row for 200 members and hoping none are
missed. `featureUnlocked(buyer, feature)` returns true immediately when `gated_at` is null.

⚠️ **Feature gates come in pairs.** Every one of these needs the gate on the *route* as well as on the menu
entry — a locked building whose URL still serves the page is not locked, and this codebase has shipped that
mistake before. One helper, read in both places, is the only shape that holds.

### Locked, not hidden

A locked building stands on the street with its lights off, and a locked menu row shows its sprite dimmed
with a lock. Tapping it says **what it is, and which map opens it** — *"The Arena. Opens when you reach the
Ashen Reach."*

That line is doing real work: it is the only advertisement the late game gets. A hidden feature teaches
nothing; a visible locked one is a reason to keep going.

⚠️ And it must be a **sprite, dimmed** — not a padlock glyph. No icons or glyphs in the game.

---

## 7. The first twenty minutes

The beat sheet, because this is the stretch where a new member quits.

| min | what happens | what it teaches |
|---|---|---|
| 0 | Hero created, named, dressed. Starter kit equipped **for** them. | you are somebody |
| 1 | Town 1. One road out, four shuttered buildings with their names on. | there is more |
| 2 | Zone 1. Rootrats, fully passive, ~3 swings each. | tap a thing, it dies |
| 3 | A part drops on the ground. Walk over it. | loot is physical |
| 5 | **20 kills → zone 2 unlocks.** | the loop pays |
| 6 | **Backpack I auto-discovers** — it needs exactly the two parts they now have. Craft it. The bag grows. | parts become power |
| 8 | First emblem. Slot it. A stat visibly moves. | permanent progress |
| 12 | Zone boss. Health bar across the top. ~90 seconds. | a fight, not a chore |
| 20 | **Map 1 cleared → Town 2.** The Mine lights up on the street. | a new room |

The shape to protect: **something changes every two to three minutes for the first twenty.** The Grove
already produces most of these beats — the kill gate, the recipe discovery, the emblem — they just need to be
sequenced so none of them land on top of each other.

**What makes somebody quit here** is not difficulty, it is silence: a stretch where nothing drops, nothing
unlocks and the bag does not change. The 45-second respawn guarantees bodies; the content has to guarantee
the rest.

---

## 8. Mid and late

**Maps 2–4 (hours 1–8) are the game teaching compounding.** Each new town hands over a system that makes the
Grove faster, and the Grove hands over the materials that make the new system work. The mine feeds the forge,
the forge upgrades the gear, the gear clears the fen quicker, the fen feeds the kitchen, the kitchen levels
the pet, the pet fights in the Grove. Every town should close one of those circles — a town that hands over a
system with no loop back into the Grove is a town that stalls.

**Maps 5–7 (hours 8–30) are the game turning outward.** Dungeons introduce content that can beat you; the
exchange introduces other players as a market; the bastion introduces them as opponents. That ordering is
deliberate: *trade with them, then fight them.*

**Past map 7** is where the existing endgame already lives — collections, enshrinement, ascended gear, the
weekly raid. Maps 8–12 are designed and undrawn (`docs/grove-maps-remaining.md`, ~$9.30 of art), and when
they land they bring towns 8–12. Those towns have no features left to hand out, which is fine: they should
hand out **capacity** instead — emblem slots five and six, bank expansions, tool tiers, the things §7 of the
node-map design already specced as locked.

---

## 9. Open questions for Luke

**Answered 2026-10-28:** pets → town 1, in full · passed towns → seven separate streets with fast travel ·
boss or kill count → the boss, and it already works that way.

Still open:

1. ~~Does the Grove's ladder stop at eternal?~~ **No — rare but possible.** Sized at 0.34% / 0.067% step-up
   against the chest ladder's budget; re-measure once the Grove has real traffic.
2. ~~Is Grove gear tradeable?~~ **Yes, under the same rules as gear today** — which forces the next one.
3. **Rolled stats need per-copy identity, and gear today has none.** Instance-based gear (28 files) or
   quantised named grades (zero blast radius)? See the end of §3e. This is now the decision that gates the
   build.
4. ~~Does a new account get a starter kit?~~ **Largely answered by gear drops** — a common kit is exactly the
   100 dps the floor needs, so the question narrows to whether they survive the first sixty seconds before
   anything has dropped.
5. **Does the gate apply to shop-side game features?** The daily spin is a counter-scan reward in store. If a
   customer scans a code at the till on day one, does it work?
6. **Card game (Spire)** is already pet-gated, and pets are now town 1. Does it come with them, or wait for
   town 5 with the dungeons?
7. **Does the day-one pet fight, and at what power?** With pets in town 1 the companion is now part of the
   floor calculation in §3a, not a separate feature — a pet that contributes real damage changes what the
   on-ramp has to be.

---

## 10. What to build first

In order, because each one is useless without the one above it:

1. **The floor, now mostly a damage problem.** §3d shows a common kit reaches the 100 dps target on its own,
   so enemy *health* may be left alone — but enemy **damage** in the opening zones still has to come down, or
   a new player dies before the first piece drops. Measure with `grove-reach.mjs` and `grove-gear-floor.mjs`
   against a 7 dps / 60 hp account.
2. **Gear drops** — the rolled generator, server-side, on the existing stat pipeline, as an independent roll
   beside `emblemChance` so parts are never touched. This is what makes the Grove worth farming and what
   carries the early curve. §3e.
2. **`gated_at` and `featureUnlocked()`** — one column, one helper, read by both the menu and the route.
3. **Town 1**, with four visibly locked buildings. One town proves the whole design.
5. **The unlock moment** — clearing a map lights a building. This is the payoff the entire system exists to
   deliver, and it should be the loudest thing in the game.
6. Towns 2–7, which are then content rather than engineering.
