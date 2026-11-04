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

## 1. The two switches, and why they are one switch

There are exactly two constants that open the Grove, and **they must flip in the same deploy.**

| switch | file | today | what it does |
|---|---|---|---|
| `canPreview("grove")` | `owner.js` | owners + 4 guests | who may enter the Grove at all |
| `GATING_LIVE` | `towns.js` | `false` | whether new signups are stamped `gated_at` |

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
5. **Announce.** See [[announce-every-fix-or-it-is-half-a-fix]] — and the standing carve-out that casino
   rates are never announced.

---

## 3. Gotchas found so far

Each of these was discovered during build and would otherwise be rediscovered at 2am on launch day.

### 3.1 The plaza is the City — Grove towns never replace it
Decided 2026-11-04, reversing the original plan. `/marketplace/town` is always the plaza;
`town.js` has `const town = preview || null`. If anyone ever re-introduces a lookup there, the Den gets
sorted into seven streets **by Grove depth** and global chat, raids and the tavern fragment along with it.
Full reasoning: `docs/grove-towns-design.md` §1b.

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

---

## 4. Checks to run on the day

```
npm run check:grove          every reference resolves, the scene's geometry holds
npm run check:sql            no query is handed a parameter it never uses
npm run check:css            no rule is hiding inside a comment
npm run lint:undef           no call to something that does not exist
node --experimental-loader ./scripts/lib/app-loader.mjs scripts/grove-quest-audit.mjs
node scripts/qa-town-npcs.mjs            (needs SHOT_COOKIE)
```

And load both `/marketplace/grove` and `/marketplace/town` and look at them. Every one of the regressions
above rendered perfectly while being broken.

---

## 5. Still open

- **3.4** — credit preview players' lost quest progress, or accept it?
- **3.9** — is `sigil_road`'s carved sign a defect?
- **3.10** — does the Grove need an elite-gear route at all?
- The Grove-town **Tavern building** points at `/marketplace/friends`, not the tavern room. Under the City
  model it is probably a City-only building; undecided.
