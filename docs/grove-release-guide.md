# Releasing the Grove — the ordered steps, and the gotchas

Started 2026-11-04. **The Grove is not released.** This is the file that says what has to happen, in what
order, on the day it is — and the place to write down anything found between now and then that would bite on
launch day.

Luke: *"a Grove implementation guide when it comes time for us to release the feature. So that we know if
there's any serialized steps that need to be taken on our end in order to properly release the feature, that
we have a place to keep notes and make sure that we capture any gotchas."*

> **Add to this file the moment you find something, not on launch day.** A gotcha discovered in November and
> remembered in January is a gotcha that ships.

---

## 1. The switches

Two constants open the Grove. **A third thing moves with them and is not a constant at all**, which is
exactly why it is easy to miss — see §3.11.

| switch | file | today | what it does |
|---|---|---|---|
| `canPreview("grove")` | `owner.js` | owners + **9** guests | who may enter the Grove at all |
| `GATING_LIVE` | `towns.js` | `false` | whether new signups are stamped `gated_at` |
| the onboarding guide | `guide-chapters.js`, `/marketplace/guide` | live | a chapter-by-chapter ramp through a game that gating locks |

⚠️ **Nothing greps for the third row.** The first two are named constants a launch-day reader will find by
searching; the guide is a whole feature with a gold payout attached, and the only reason it is written down
here is that the doc which held it was deleted on 2026-11-04. Read §3.11 before step 4.

**2026-11-09 — the beta-tester widening.** `PREVIEW_GUESTS.grove` went from 4 guests to 9: the five other
holders of the **Tester role**, which `roles.js` grants off the `bug_hunter` badge (five rewarded bug
reports) and which is also the roster of the private `testing` channel. That is step 2 done *narrowly* — a
soft launch to the people who already report bugs, with `GATING_LIVE` still `false`, which is the safe half
per the order rule below. ⚠️ **It is a snapshot of a moving group:** the badge keeps being earned and
`canPreview` is synchronous with no database access, so the next member to reach five reports must be added
by hand until the Grove opens to everyone.

### ⚠️ The order is not a preference — one order mints unplayable accounts

`GATING_LIVE = true` makes every **new** signup carry a `gated_at` stamp, and a stamped account has its
features gated behind town progress. **The only thing that opens a town is Grove progress.** So if gating
goes live while the Grove is still owner-gated, every account created in that window is locked out of the
farm, the mine, the arena and twenty other rooms **with no way to unlock any of them** — not a degraded
experience, an unplayable account, created silently, one signup at a time.

- **Never** turn on `GATING_LIVE` before the Grove is open.
- Turning the Grove on *without* `GATING_LIVE` is harmless: everyone keeps everything, nothing is gated.
  That is the safe half, and it is a legitimate soft-launch step on its own.

### The grandfather clause needs no work

Every account that exists today has `gated_at = NULL`, and `featureUnlocked` returns `true` for a NULL
forever. **There is no backfill and no flag to flip on existing rows.** Luke's rule — *"existing accounts
keep everything"* — is already implemented by doing nothing. Do not write a migration for this.

---

## 2. Serialized steps

1. **Decide the Grove is content-complete enough.** Maps 8–12 are declared but unbuilt; `mapIsBuilt` keeps
   them out of `GROVE_ZONES`, so shipping with seven is fine and needs no change.
2. **Open the Grove** — widen `canPreview("grove")` from the allow-list to everyone.
   Re-check `src/app/(public)/marketplace/grove/page.js`, which does `if (!groveOpen(buyer.id)) redirect(...)`.
3. **Deploy and watch, with gating still off.** Everyone can play; nobody is gated. This is the window where
   load, the economy and the curve get their first real numbers.
4. **Then flip `GATING_LIVE = true`**, in its own deploy, once step 3 looks right.
5. **Retire the onboarding guide in that same deploy** — see §3.11. It is a third switch, and it is the one
   nobody would think to look for.
6. **Announce.** See [[announce-every-fix-or-it-is-half-a-fix]] — and the standing carve-out that casino
   rates are never announced.

---

## 3. Gotchas found so far

Each of these was discovered during build and would otherwise be rediscovered at 2am on launch day.

### 3.1 The plaza is the City — Grove towns never replace it
Decided 2026-11-04, reversing the original plan. `/marketplace/town` is always the plaza;
`town.js` has `const town = preview || null`. If anyone ever re-introduces a lookup there, the Den gets
sorted into seven streets **by Grove depth** and global chat, raids and the tavern fragment along with it.
Full reasoning: the `plaza-is-the-city` memory. The design doc that carried it was deleted 2026-11-04 —
see §6.

### 3.2 `TOWNS[n].features` is an unlock set, not a street inventory
Two consumers: `featureUnlocked` (what a gated account may use, anywhere) and `townStreet(n)` (what stands
on that street). **Do not trim town 1** to make Rootwood feel like a trailhead — it would gate pets, the bag
and the profile behind Grove depth, against the settled decision that pets open in full at town 1.

### 3.3 Quest progress was never written, for the life of the feature
Fixed 2026-11-03 (`66a9d1e6`). An UNUSED `$3`/`$4` made Postgres refuse the whole UPDATE, and a `.catch()`
swallowed it. **Before launch, run `npm run check:sql`** — it finds this class across every query, and it
found exactly one in 2,230. See [[unused-sql-param-kills-the-statement]].

### 3.4 Existing quest rows are at zero
Nothing backfills the progress that was never stored. On launch, members who already played the Grove in
preview have quest bars at 0 regardless of what they did. **Decide before launch:** leave it (the preview
pool is tiny), or credit it. There is no script for this yet.

### 3.5 Chests, merits and the boss sets are gone — the tables are not
`mkt_grove_chest`, `mkt_grove_armour` and `mkt_grove_player.merits` still hold what four preview players
had (3,704 merits, 16 chests, 10 forged pieces). Nothing reads them. Harmless to leave; **do not** write a
migration to drop them on launch day, which is risk for no gain.

### 3.6 The Coliseum's chests are a different system
They survived the removal and are the whole of what an arena run pays. They borrow nothing from the Grove's
old chest tiers any more — `COLISEUM_TIERS` is declared locally in `grove-coliseum-plan.js` and
`grove-coliseum-loot.js`.

### 3.6b The City shutters what you have not unlocked — and this path has never run live
`GATING_LIVE` is `false`, so **no account has ever been gated**: every member alive today is exempt and
sees the whole street. The shuttering added 2026-11-04 is therefore **dormant code that switches on for the
first time on launch day**, for brand-new accounts only.

A gated account at town 1 sees 3 doors open (Tavern, General Store, Vault) and **11 shuttered**, each named
with the town and the map that opens it. At town 3 it is 7 and 7; at town 7 everything is open.

**Test it before launch** by creating a real account with `gated_at` set, or by temporarily returning a
fake `gate` — do not assume. It reuses the Grove towns' `is-shuttered` markup, which had a real bug in it
as recently as 2026-11-03 (buildings rendering at their natural 1024px size).

### 3.7 A new quest giver must join five registries
`CHAINS`, the title table, `npcsOnMap`, the board's `coliseum` flag, and the scene's `npcHere` filter. The
scene is the one that fails **silently** — a marshal matched by zone paints a second figure on the same spot.
See [[what-does-this-sit-on-top-of]].

### 3.8 The towns and the Grove share `TownClient`
Grove work has broken the base town twice. Before shipping anything that touches `TownClient.js`, the
`.tw-*` styles or the shared quest card, run **`node scripts/qa-town-npcs.mjs`** (live by default — gating
reads the real allow-list, so a local run proves the component and not the gate).
See [[dont-break-the-base-town]].

### 3.9 Four backdrops had text painted into them
`heronwade`, `hound_run`, `shrike_cliffs` repaired 2026-11-03 without regenerating — the caption sat in a
flat band and was rebuilt from each row's own median. **`sigil_road` is untouched**: its lettering is carved
into a gravestone and reads as a signpost. Luke's call whether that is a defect.

### 3.10 The ladder stops at mythic
Removing chests removed the only route celestial and primordial had into the game. That was a deliberate
call (*"drop the top tiers entirely"*), not an oversight — but it means **the Grove cannot pay elite gear at
all**. If that is wrong, it is a content decision to make before launch, not after.

### 3.11 ⚠️ The onboarding guide has to retire in the SAME deploy as `GATING_LIVE`
Rescued 2026-11-04 from `grove-progression-requirements.md` before deleting it. This is the third thing
that moves on launch day and the only one with no constant to grep for.

Luke: *"we need to retire the onboarding guide, but only once the gate for the Grove opens."* And:
*"instead of having the onboarding guide — which is now kind of not gonna work all that great because it was
meant to be a ramp, but now you don't have access to everything — I'd probably maybe do away with that
entirely."*

`guide-chapters.js` walks a new member through the whole game, chapter by chapter. Under gating most of that
game is locked on day one, so the guide becomes **a list of doors that do not open** — the most discouraging
thing a new account could be handed.

- **Not before.** Until `GATING_LIVE` flips nobody is gated, every door the guide names is open, and it is
  doing its job. Pulling it early deletes a working ramp and puts nothing in its place.
- **⚠️ IT IS A DELETION WITH A PAYOUT ATTACHED.** `src/lib/marketplace/guide.js`, `guide-chapters.js`,
  `/marketplace/guide`, and **`guide_step` / `guide_chapter` mint reasons already wired into the coin
  ledger**. Remove the guide without the reasons and two faucets exist that nothing can reach; remove the
  reasons without checking and members who were mid-guide have a dead balance. **Check both before deleting
  either.**

---

## 3b. The 2026-11-09 dead-feature audit

Eric: *"Also maybe audit the grove we might have left a lot of dead features in there."* He was right. The
2026-11-08 teardown (the bench, parts, quests, the tally, the wishlist) removed the **writers** and
deliberately left the **readers** alone — which was the correct call that day, and is a launch problem now.

Method: for every table and column the teardown orphaned, grep for a writer, then count the live rows.
Everything below is a thing with a consumer and **no faucet**, or a faucet with no consumer.

### ⚠️ 3.12 Two consumable systems are live, visible, and impossible to obtain

Both read fine for the four preview players, who are sitting on legacy stock. Both are **permanently empty
for all 218 members** the moment the Grove opens, and neither says so.

| system | reader, still live | writer | live stock |
|---|---|---|---|
| **Charms** | `grove.js:443` — `UPDATE mkt_grove_charm SET qty = qty - 1` burns one at the door | **none anywhere** | 13 across 2 members |
| **Food / the belt** | `groveBelt`, `armBeltIfEmpty`, the belt on the HUD | **none anywhere** | 1,660 across 4 members |

`armBeltIfEmpty` is the sharp edge. It exists *because* Luke measured that nobody arms the belt by hand, so
it arms the weakest food automatically — and for a new account it will run, find nothing, and return null
forever. The belt is then a permanently empty slot on the screen, and the note above it in `grove.js` still
explains at length why an empty belt is a bug.

**Decide before launch**, and it is a design call, not a cleanup: give the bar a food/charm rung alongside
the tool and chest rungs, or hide the belt and the charm door until something can fill them. Shipping as-is
hands every new member two dead affordances.

### ⚠️ 3.13 A tool is advertised at up to 1.9x what it actually pays — **NO LONGER SHOWN, 2026-11-12**

> **Re-checked 2026-11-12 and the live half is gone.** `toolBonusFor` now has exactly **one** renderer,
> `GroveToolSheet`, and that sheet is **unreachable**: `setToolView` is called in `GroveClient` only to
> reset it to `null` (line 1107) — nothing ever opens it, because every door it had led to the bench. And
> `groveState.toolMeta`, the other half of the complaint, **has no renderer at all** any more; the tool
> shelf moved to the equipment screen's Crafting Gear tab, which reads `groveToolCase` and prints the
> **paid** number.
>
> So the inflated figure is not on a screen a player can reach. **This is no longer a launch blocker** — it
> is dead code (`toolMeta`, `GroveToolSheet`, and `toolLadder`/`toolRecipeFor` in `grove-recipes.js`, which
> also have zero call sites). The DESIGN question below is still unanswered and still Luke's, but it can be
> answered after launch without anybody being lied to in the meantime. ⚠️ **Do not resolve it by deleting
> the band** without reading §3.13's own argument: four preview members already rolled Masterwork.

The finding as first written, 2026-11-09 — it was a live, wrong number on the one screen a player checks
to see whether the Grove was worth it.

- `groveState.toolMeta` (grove.js:378) reports **`toolBonusFor(tier, quality)`** — the tier multiplied by
  the quality band, up to **1.9x** at Masterwork. Its comment asserts this is *"what the tool actually
  gives"*.
- Every one of the **twelve live consumers** (arena, boss, cooking, crafting, delves, delve-floors, farm,
  fishing, mining, pets, jeweller, sailing) reads **`groveToolPct`**, which is `toolBonusPct(tier)` plus the
  act perk and **multiplies by the band nowhere**.

`toolBonusFor` has exactly three call sites and all three are display: `GroveToolSheet`, that `toolMeta`
line, and a comment. So the band has never affected a payout.

Measured on Eric's account (every tool at tier III, so the base is +9%):

| tool | band | Grove shelf says | game pays |
|---|---|---|---|
| Fishing Rod | Masterwork | **+17.1%** | +9% |
| Shovel | Masterwork | **+17.1%** | +9% |
| Sextant / Pickaxe / War Banner | Pristine | **+14.4%** | +9% |
| Hunting Horn | Fine | **+12.2%** | +9% |
| Pet Collar | Rough | +9% | +9% |

**Two ways out and they are not equivalent.** Making `groveToolPct` honour the band is a straight **buff of
up to 90%** to twelve reward systems at once — that is an economy change and wants
[[economy-nerf-measure-daily-total]] treatment. Making the screens stop claiming it takes a number away
from members who already rolled Masterwork. Luke's call; it should not be settled by whoever edits next.

The new crafting-gear tab (§3.17) deliberately prints the **paid** number and shows the band beside it as
its own fact, and it reads `groveToolCase`, which shares `sumToolPct` with the live accessor — so it follows
whichever way this is settled without being edited.

### 3.14 63,865 units of deleted monster parts are still in the table

`mkt_grove_item` holds **161 rows / 63,865 qty across 5 members** of parts that no longer exist as a
concept — `reed_blade` 3,452, `goblin_rivet` 3,380, `bristle_hide` 3,294, and so on. They are invisible
only because `groveState` filters the table **by food identity** (`grove.js:305`) rather than by anything
in the data.

Harmless today and **do not write a migration on launch day** — same reasoning as §3.5. Worth knowing
because the filter is the only thing hiding them: anything that later reads this table without copying that
filter gets 63k units of ghost inventory.

### 3.15 The quest tables are fully orphaned, and §3.3/§3.4 above are now stale

The quest client went on 2026-11-08 (`GroveClient` has four `✂️` markers for it). `mkt_grove_quest` is now
referenced in `src/` **only inside a comment** (`grove.js:530`); the one read is gone. 7 rows / 3 members
remain, 4 with progress, 3 claimed.

So, above in this file:

- **§3.3** (quest progress was never written) describes a fixed bug in a system that no longer has a
  client. Keep the `check:sql` instruction — it is general and it passes — but the quest framing is dead.
- **§3.4** ("decide before launch: credit preview players' lost quest progress") **is answered by the
  teardown.** There is nothing to credit; the feature is gone. It should come off §6.

### ⚠️ 3.16 §4 tells you to run a script that does not exist

`node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-quest-audit.mjs` — **the file is not
in the repo.** It went with the quest teardown. A launch-day checklist whose first command fails is how a
checklist stops being trusted at 2am, so it is struck from §4 below. `qa-town-npcs.mjs` does still exist.

### 3.17 Orphaned columns on `mkt_grove_player`, for the record

Nothing to do — the standing rule here (§3.5, and the `groveEquipEmblem` note) is that dropping a column
loses the record and buys nothing. Listed so the next reader does not have to work out which of 23 columns
still mean something:

`craft_xp` (nothing earns it), `taught` (the bench's gate), `charm_id` / `charm_band` (written per dive,
read per dive — these two ARE live), `plots_built` (no writer), `packs_built` / `banks_built` / `bank_slots`
(the bank went in October). `mkt_grove_craft_log` has no writer and is referenced only in `grove.js`.

### 3.18 What is NOT dead, checked and confirmed live

So the audit cannot be read as "the Grove is hollow":

- **Tools** — the kill bar (`grove-bar.js`, 2026-11-08) is a real faucet. 2 members, 7 fills already.
- **The Coliseum and its chests** — own system, own tiers (§3.6).
- **Statues, emblems, class nodes, the boss, the bar's chest rung** — all have writers and readers.
- `npm run check:grove`, `check:sql`, `check:gates`, `check:css`, `check:chrome`, `check:polls` and
  `lint:undef` all pass as of 2026-11-09.

---

## 4. Checks to run on the day

```
npm run check:grove          every reference resolves, the scene's geometry holds
npm run check:sql            no query is handed a parameter it never uses
npm run check:css            no rule is hiding inside a comment
npm run check:gates          every gated feature's page guards itself
npm run lint:undef           no call to something that does not exist
node scripts/qa-town-npcs.mjs            (needs SHOT_COOKIE)
```

⚠️ `scripts/grove-quest-audit.mjs` **was listed here and does not exist** — it went with the quest teardown
on 2026-11-08. See §3.16. Do not re-add it without re-adding the script.

And load both `/marketplace/grove` and `/marketplace/town` and look at them. Every one of the regressions
above rendered perfectly while being broken.

---

## 5. ⚠️ The design docs are gone — deleted 2026-11-04

Luke: *"I think at this point, the design doc is largely unneeded since we've implemented most of what I
needed it for. And at this point, serves to really just be a risk to regress."*

He is right, and one of them proves it: `grove-towns-design.md` §3c proposed an on-ramp segment for depths
1–24 against a "shipped climb" of `hpPerZone 5.04%`. The live curve is **`hpPerZone 0.065`, `dmgPerZone
0.0519`, with no segment** — the whole blocker section described numbers that no longer exist and a proposal
that was superseded by retuning the curve instead. A doc like that does not sit there inertly; it gets read
and believed.

| deleted | why it was safe |
|---|---|
| `grove-towns-design.md` | built. The one live item in it — the City reversal — is §3.1 here and the `plaza-is-the-city` memory. Its only open question (the Tavern door) is §6 below. |
| `grove-npcs-and-coliseum.md` | built, and both its decisions are now stated in the code that implements them: `grove-coliseum.js` settles kills "by the ordinary Grove path — same zone gate", and `chestsFor` spawns chests for waves cleared on a failed run. |
| `grove-progression-requirements.md` | a roadmap written before the City decision, so its "replace the town" assumptions were already false. Its one live gotcha is §3.11 above. |

**Kept, deliberately:** this file; `grove-maps-remaining.md` (maps 8–12 are undrawn — a work list, not a
plan); `node-map-design.md` (unbuilt, and §11 is where the open **stat ceilings** question lives, cited from
five places in `grove-catalog.js`, `grove-maps.js` and `grove-recipes.js`); `grove-feedback-backlog.md`
(Luke's own words, with what is done and what is not).

---

## 6. Still open

- ~~**3.4** — credit preview players' lost quest progress, or accept it?~~ **Answered by the teardown** —
  the quest client is gone, there is nothing to credit. See §3.15.
- ~~**3.12** — food and charms have no faucet; every new member sees two dead affordances.~~ **Answered by
  deletion, re-checked 2026-11-12.** The belt went on 2026-11-09 (`grove.js:620`, `GroveClient`'s own note)
  and the charm door went with the bench — `charmPick` state survives in `GroveClient` but nothing sets it,
  so neither is on screen. ⚠️ **The difficulty consequence is real and is NOT a UI cut:** nothing heals
  mid-zone from an item any more. Gear `regen` and on-hit healing still work, so there IS healing — it is
  just all passive now. Worth looking at once real players are on map 5+.
- **3.13** — does a tool's quality band pay, or stop being advertised? Still Luke's call, but **no longer a
  blocker**: as of 2026-11-12 the inflated number has no reachable renderer. See §3.13.
- **⚠️ The Coliseum chest still tells you nothing when it opens** — `useColiseum` sets `result`, and
  `col.result` has **zero readers** in `GroveClient` (re-grepped 2026-11-12). A member opens a chest and is
  told nothing about what was in it; it is why the dead-gear bug in item T went unnoticed for so long. A
  result screen is a thing to build — the boss kill card is the obvious model — and it wants Luke's eye.
  This is the largest remaining player-facing hole in the Grove.
- **3.9** — is `sigil_road`'s carved sign a defect?
- **3.10** — does the Grove need an elite-gear route at all?
- The Grove-town **Tavern building** points at `/marketplace/friends`, not the tavern room. Under the City
  model it is probably a City-only building; undecided.
