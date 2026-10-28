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

## 3. ⚠️ The blocker: the Grove has no floor

**This is the one thing that must be fixed before any of the rest ships.**

The Grove's difficulty is anchored at the bottom to **Littlewolf — an established member with gear, pets and
badges, doing 1,830 dps.** That was correct when the Grove was the newest room in a game you were already
strong in. The town plan inverts it: the Grove becomes the *first* thing a new account touches, with every
other source of power still locked.

A bare account does **2 dps**. Against the shipped zone 1:

| | health | at 2 dps | at 100 dps |
|---|---|---|---|
| Rootrat (zone 1's only resident) | 290 | 119 seconds | 3 seconds |
| Glutmaw (zone 1 boss) | 9,000 | **61 minutes** | 90 seconds |

The catalogue already carries the evidence, in Luke's own words: *"my son can't get past the first map,
first zone's boss."* That was with an account that had played other systems. A post-launch account will have
less.

**The spec that falls out of it:** a new account needs roughly **100 dps on arrival** and should leave map 1
at **300–400 dps**, entirely from starter kit plus the Grove's own drops. At 400 dps the Heartwood Elder
(27,458 hp) is a 70-second fight, which is a finale rather than a wall.

Three ways to get there, in order of preference:

1. **Starter kit at hero creation** — a weapon and two armour pieces that total ~100 dps and enough health to
   survive a rootrat. Cheapest to build, easiest to tune, and it gives the player something to *replace*,
   which is the whole early loop.
2. **Re-anchor map 1 to a bare account** — rerun `grove:curve` with the low anchor set to a fresh profile
   instead of Littlewolf. Correct, but it moves 84 zones of shipped numbers.
3. Both, which is probably the answer: a small kit, and map 1 re-anchored to it.

Until this is decided, everything below is a plan for a door nobody can walk through.

---

## 4. The seven towns

The biomes do most of the assignment work — each town's ground names the feature it should open.

| # | Town | Opens onto | What it unlocks | ~when |
|---|---|---|---|---|
| 1 | **Rootwood Waystation** | The Grove (forest) | The Grove · bag & equipment · hero screen · daily quests · the Tavern · General Store | day one |
| 2 | **Deepdelve Camp** | The Undercave (cave) | The Mine · the Forge · the Compendium | ~30 min |
| 3 | **Fenhollow** | The Sunken Fen (swamp) | The Farm · pets · the Kitchen | ~2 h |
| 4 | **Saltwrack Landing** | The Coast | The Docks & sailing · fishing · the bounty board | ~4.5 h |
| 5 | **Drowned Quay** | The Drowned Ruins | Dungeons · the Jeweller · sets & collections | ~8.5 h |
| 6 | **Gilded Exchange** | The Gilded Waste (gold) | The Market · Auction House · trades · the Casino · the daily Spin | ~14 h |
| 7 | **Ashfall Bastion** | The Ashen Reach (fire) | **The Arena** · the weekly Boss · ranks · the Trophy Room · enshrinement | ~21 h |

### Town 1 — Rootwood Waystation

*What a hero is, and nothing else.* One road out of town and into the trees. Six buildings, four of them
visibly shuttered with a line saying which map opens them.

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

⚠️ **Pets are the biggest single argument against this schedule.** A pet that fights with you is the best
companion-attachment hook in the game, and two hours is late for it. The alternative is granting a starter
pet in town 1 and opening the *pet systems* (stones, enshrinement, the farm's pet stand) in town 3. Worth
deciding deliberately rather than by omission — see §8.

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

1. **Pets in town 1 or town 3?** A fighting companion two hours in is late for the best attachment hook in
   the game. Starter pet early, pet *systems* in town 3?
2. **Does the Grove gate the SHOP's game features too** — the daily spin is a counter-scan reward in-store.
   If a customer scans a code at the till on day one, does the spin work?
3. **What happens to a town once you pass it?** Fast travel between all unlocked towns, or does the street
   simply accumulate buildings in one place as today?
4. **Card game (Spire):** it is already pet-gated. Town 3 with pets, or town 5 with the dungeons?
5. **Does clearing a map gate on the boss, or on the kill count?** Today the zone unlocks on kills and the
   boss is optional. If the town is a reward, the boss should probably be the key.
6. **The starter kit's shape** — see §3. One weapon and two armour pieces, or a full set the player
   immediately starts replacing?

---

## 10. What to build first

In order, because each one is useless without the one above it:

1. **The floor.** Starter kit, map 1 re-anchored, measured with `grove-reach.mjs` against a zero account.
   Nothing else matters until a new account can kill a rootrat.
2. **`gated_at` and `featureUnlocked()`** — one column, one helper, read by both the menu and the route.
3. **Town 1**, with four visibly locked buildings. One town proves the whole design.
4. **The unlock moment** — clearing a map lights a building. This is the payoff the entire system exists to
   deliver, and it should be the loudest thing in the game.
5. Towns 2–7, which are then content rather than engineering.
