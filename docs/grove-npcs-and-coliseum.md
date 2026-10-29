# Grove NPCs and the Coliseum

Two systems, from Luke 2026-10-29. Written before building so the shape can be argued with cheaply.

---

## 1. Map NPCs and quest chains

**Three quest NPCs per map**, standing in three of that map's twelve zones. Seven maps, so 21 NPCs.

### Where they stand

Luke: *"make it non-deterministic... so that it's not like a pattern that the user playing can predict when
they get to the next map."*

⚠️ **Non-deterministic to the PLAYER, fixed in the DATA.** Rolling placement at runtime would move an NPC
mid-quest-chain and strand whoever was walking back to them. So the zones are authored once, per map, chosen
to avoid any readable rhythm — no shared positions between maps, no even spacing, never all three in one half:

| map | zones |
|---|---|
| 1 Rootwood | 2, 5, 9 |
| 2 Undercave | 1, 6, 11 |
| 3 Sunken Fen | 3, 4, 10 |
| 4 Saltwrack | 2, 8, 12 |
| 5 Gilded | 4, 7, 9 |
| 6 Deepdelve | 1, 5, 10 |
| 7 Ashfall | 3, 6, 11 |

No zone index appears in the same slot twice running, and the gaps vary (3/4, 5/5, 1/6, 6/4, 3/2, 4/5, 3/5).

### The chains

- **2–5 quests per NPC**, varying by NPC so no two feel alike. Not every NPC is a five-parter.
- **Non-repeatable.** Finished means finished; the NPC stays standing with idle dialogue rather than
  vanishing, because a door that disappears reads as a bug.
- **Scoped to their own map.** A map-3 quest never asks you to go to map 5 — you would not be able to.

### Quest kinds

Deliberately mixed, so a chain is not four fetch quests with different nouns:

| kind | asks | feels like |
|---|---|---|
| **cull** | kill N of a named creature from this map | ordinary play, with a target |
| **hunt** | kill the map's rare spawn M times | patience and luck |
| **harvest** | collect a specific part that drops in this map | play with a reason to read drops |
| **forge** | craft a named thing at the bench from parts | a reason to visit the bench |
| **delve** | reach zone N of this map | progress you were making anyway, paid |
| **survive** | clear a zone without dying / in one visit | a skill ask, not a time ask |
| **ticket** | clear the Coliseum to wave N | ties the two systems together |

Luke: *"they should be a little bit time consuming"* but explicitly **not** a difficulty wall.

### Rewards

Scaled to the ask, rising along a chain so the last step is the one worth telling someone about. Chains end
in a **chest** (`GROVE_CHESTS`: mossbound → barrowed → warrenspun → heartwrought, by map) or a gear piece;
middle steps pay parts, gold and XP.

⚠️ **Through the existing award paths.** `awardXp` pays gold 1:1 unless told otherwise, and reward tables are
shared objects — a quest writing into a drop row would decay that row for everything else that reads it.

### The tracker

Luke: *"we'll need a quest helper that we can, that they can pull up at their leisure."*

A dock panel listing active chains: who, which zone, what's asked, progress, and what it pays. Also the only
place that says WHERE an NPC is — otherwise three NPCs hidden across twelve zones is a search, not a quest.

---

## 2. The Coliseum

One zone per map holds a Coliseum. A **fourth NPC** stands outside it — thematic, one per map, seven total.

### Getting in

- The outside NPC gives **one free key a day**.
- His own one-time chain pays extra keys, and his asks are about **how far you get inside** ("reach wave 7").

### The run

- Waves of that map's own creatures, **zone 1's roster first, then zone 2's**, up to the boss and some rares.
- A timer — about two minutes — to clear the lot.
- **No special rules.** Luke: *"it's the same as if you were killing them."* Same loot rolls, same multi-kill,
  same everything. The Coliseum is a *shape*, not a separate ruleset.

### Chests on the ground

Performance decides **how many** chests spawn and **what rarity**. They render in the platformer as physical
objects, tap once to pop, loot bursts out.

⚠️ **Same chest sprites and rarities, DIFFERENT loot.** Luke was explicit: these are not the normal chest
tables. They pay parts and gear, weighted by rarity. Reusing the sprite while re-pointing the table is the
easy thing to get wrong — see the warning about shared reward tables above.

---

## Decisions (Luke, 2026-10-29)

1. **Coliseum kills count toward the zone gate, in full.** It is deliberately the fast route through the
   kill requirement — the pressure valve for maps 5–7, which model at 29–80 minutes a node otherwise.
2. **A failed run spends the key but keeps what you earned.** Chests spawn for the waves you did clear, so a
   near-miss is still worth something and people keep trying the harder maps.
3. **Art approved at ~$2.21**, three on a contact sheet first.

## The questions, as asked

1. **Do Coliseum kills count toward the zone-unlock gate?**
   A zone can only produce **40 bodies a minute**. A Coliseum run is twelve rosters plus a boss in two
   minutes, so it beats that ceiling comfortably. If the kills count, the Coliseum becomes the fastest way
   through the kill requirement — which may be exactly the pressure valve maps 5–7 need, since those
   currently model at 29–80 minutes a node. If they do not count, it is purely a loot mode.
   **This is an economy fork, not a detail.**

2. **Does a failed run eat the key?** Keeping it makes failure free and the timer toothless; eating it makes a
   bad run cost a day. A middle option: the key is spent, but you keep the chests you earned up to the wave
   you reached.

3. **Art: ~$2.21** for all 35 sprites at medium (28 NPCs portrait, 7 Coliseum buildings landscape). Three on a
   contact sheet first, as always.
