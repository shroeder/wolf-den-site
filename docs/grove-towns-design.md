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

1. **Does a new account get a starter kit, or stay at 7 dps?** §3c assumes it stays at 7 and the Grove's
   drops carry the ramp. This changes every number in that table.
2. **Does the gate apply to shop-side game features?** The daily spin is a counter-scan reward in store. If a
   customer scans a code at the till on day one, does it work?
3. **Card game (Spire)** is already pet-gated, and pets are now town 1. Does it come with them, or wait for
   town 5 with the dungeons?
4. **Does the day-one pet fight, and at what power?** With pets in town 1 the companion is now part of the
   floor calculation in §3a, not a separate feature — a pet that contributes real damage changes what the
   on-ramp has to be.

---

## 10. What to build first

In order, because each one is useless without the one above it:

1. **The floor.** The on-ramp segment of §3c — health *and* damage — measured with `grove-reach.mjs` against
   a 7 dps / 60 hp account. Nothing else matters until a new account can kill a rootrat without dying to it.
2. **`gated_at` and `featureUnlocked()`** — one column, one helper, read by both the menu and the route.
3. **Town 1**, with four visibly locked buildings. One town proves the whole design.
4. **The unlock moment** — clearing a map lights a building. This is the payoff the entire system exists to
   deliver, and it should be the loudest thing in the game.
5. Towns 2–7, which are then content rather than engineering.
