# After the towns: achievements, world currency, and depth per map

Captured 2026-10-28 from Luke, to be built **after** the loot rework and the town rework land. Nothing here
is started. This is the requirements list, with what already exists underneath each one.

---

## 1. The onboarding guide gets retired

> *"We're gonna have to rework the guide. Instead of having the onboarding guide — which is now kind of not
> gonna work all that great because it was meant to be a ramp, but now you don't have access to everything —
> I'd probably maybe do away with that entirely."*

**Why it breaks:** `guide-chapters.js` walks a new member through the whole game, chapter by chapter. Under
the town plan most of that game is locked on day one, so the guide becomes a list of doors that do not open
— the single most discouraging thing a new account could be handed.

**What exists:** `src/lib/marketplace/guide.js`, `guide-chapters.js`, `/marketplace/guide`, and a
`guide_step` / `guide_chapter` gold payout already wired into the coin ledger and the mint reasons.

⚠️ **Retiring it is a deletion with a payout attached.** Those two mint reasons are live earners; removing
the guide without removing them leaves two faucets nothing can reach, and removing them without checking
leaves members who were mid-guide with a dead balance. Check both before deleting either.

---

## 2. Achievements replace it — system by system, beginner → competent

> *"Instead we'll have achievements that are trying to teach you the systems and get you from a beginner to
> knowledgeable to super competent in the system. So the achievements are going to be system based."*

So the ramp stops being a linear chapter list and becomes **per-system ladders** that a player meets when
that system unlocks — which is exactly what the towns do. Town 2 opens the mine; the mine's achievement
ladder is how you learn the mine.

**What exists, and it is most of the machinery:** `mkt_badge` already holds **298 badges, 140 of them with
an `auto_rule` and a threshold** — automatic, measured, tiered achievements in everything but name. The
question to answer first is whether achievements ARE badges with a new flag, or a parallel system. One
system with a filter is almost certainly right; two systems that both say "you did a thing" will drift.

---

## 3. A world currency, and a world shop

> *"Achievements give you a world currency that has a world shop you can buy stuff at."*

- the currency is **earned by achievements**, not by killing
- it is **per world** — the Grove's achievements pay the Grove's currency
- the shop's contents are open (*"it's hard to describe what's going to be in that world shop"*)

⚠️ **This is a new faucet and a new sink in one.** `gold-rate.js` holds `GOLD_MINT_RATE` and an explicit
`MINT_REASONS` set precisely so a new earner cannot be added without the economy noticing. A second currency
sidesteps that machinery entirely — which is fine *if* it is deliberately ring-fenced: a currency that only
buys world-scoped things cannot inflate the gold economy, and a currency that buys gear can.

---

## 4. The rewards feed back into the world they came from

> *"The rewards are going to be world based... like multi-kill, for example, maybe damage against monsters in
> that world."*

The world shop sells things that make **that world** better: multi-kill, damage against its monsters, drop
rate, movement. Not global power.

**Why that matters:** it makes each map its own progression track rather than a corridor to the next one, and
it keeps the Grove's power from leaking into the arena and the boss, where it would re-price everything.

---

## 5. Each world is replayable, with layers

> *"I want each world to be replayable, like it has layers to it... we need to create depth to the systems in
> each world. Depth to just the Grove systems in general, like every map. And not just having it be a
> run-through thing."*

Today a map is cleared once and left behind. The requirement is a reason to go back: layers, mastery, or
difficulty tiers over the same twelve zones.

⚠️ The constraint this lives inside: **the kill requirement is wall-clock bound.** Population is 15–30
refilling every 45 seconds, so a map cannot be re-run faster by being stronger — roughly 40 kills a minute is
the ceiling however much damage you have. Replay value therefore has to come from **what a run pays**, not
from how fast it goes.

---

## 6. Monster Cards: the mastery loop, and the one thing that does go global

> *"That was the idea behind the — what did we end up calling them, emblems or something? They're kind of
> like cards, right? I think we ended up changing them to be called cards."*

**Settled:** both names are live, and that is the problem. The data layer says **emblem** everywhere —
`mkt_grove_emblem`, `GROVE_EMBLEMS`, `emblemChance` — while the panel a player actually reads says
**"Monster Cards"**. Pick one for the UI and leave the data alone, or rename both; what cannot stand is a
design conversation where nobody is sure what the thing is called.

**The loop Luke described:**

```
kill a lot of ONE creature  →  multi-kill  →  multi-drops  →  its card
       →  card levels on how many you have collected (1★ … 6★)
       →  cards give GLOBAL passive buffs to the systems OUTSIDE the Grove
       →  so people farm LOW-LEVEL zones on purpose, for the passives
```

That last line is the point: it gives a finished player a reason to stand in map 1, which is the replay
answer §5 is asking for, and it is already half-built — the six-star breakpoint ladder exists, and two
emblem stats (`crit_rate`, `crit_damage`) already carry `global: true`.

⚠️ **And `global: true` is the whole balance question.** Crit rate and crit damage feeding the arena, the
boss and the raid means the Grove can inflate every other system in the game. The node-map design flagged
this as an open question and it is still open: **a ceiling has to be decided before the card buffs go
global**, not after.

---

## 7. The Grove cannot show you your own gear

> *"Right now the Grove is not doing a good job showing you your gear and your inventory and what you should
> equip and stuff like that."*

With §afc988c5 the Grove now drops gear on every map, which turns a cosmetic gap into a functional one: a
player picks up a sword and has nowhere good to look at it, compare it, or put it on.

Needs, in rough order:

1. **See what dropped** — the piece, its stats, and whether it beats what is worn
2. **Equip from inside the Grove**, without leaving for the inventory screen
3. **Compare** — the single most valuable thing a loot game's UI does
4. **The bag's edge.** Backpack I is 16 slots and food competes with loot for them; a player who cannot pick
   up the good drop because they are full of rootrat parts will read it as the game robbing them
5. **Crafting and enhancing** are equally invisible from in there

---

## The order

1. the loot rework ✅ (`afc988c5`)
2. the town rework + feature gating ← **in progress**
3. then this file, roughly §7 → §2 → §3 → §4 → §6 → §5, because the gear UI is a live gap the loot work just
   widened, and the achievements ladder is what replaces a guide that is about to stop making sense
