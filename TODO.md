# TODO — picked up from the session of 28–29 October 2026

Everything left open when that session ended. Numbers were read live from production at the end of it, not
recalled; anything marked ⚠️ has a reason it bites that is not obvious from the task name.

**State of the world:** `GATING_LIVE = false`, **0 of 192** accounts carry `gated_at`, the Grove is open to
Luke plus two testers, and packs + vault are public and in use (42 opens). So everything below about towns and
the Grove is invisible to members today — which is why it can be worked on freely, and also why nothing in it
has been pressure-tested by anyone but us.

---

## 1. Finish the towns

The half that isn't art. The other half is done: seven towns have their own centrepiece, their own quest-giver
character and their own buildings (`$1.53` of art, all committed).

### 1.1 The hunts — designed, not built

Each town's quest giver should send you into **that town's map** to kill things. Fenhollow's bog-reader wants
Fen Lurkers drowned; Ashfall's warden wants Cinderhusks put down.

The plumbing is already favourable, which is the main reason to do this rather than something else:

- `GROVE_GEAR` has **132 creature tables** keyed `zoneId|foeId`, so "what lives in map N" is a lookup.
- Grove kills already settle server-side in `settleKills` — progress can tick without new instrumentation.
- `town-quests.js` already exists (the Quartermaster's daily plaza bounties) with a pool/variant/claim shape
  worth extending rather than duplicating.

⚠️ **It is a different family from the Quartermaster's dailies and must not be folded into that pool.** Those
reward playing in the plaza (raids, the tavern, the Well). A hunt rewards leaving it. Same table, same claim
path, separate pool — or the daily rotation will start handing people quests they cannot do from where they
are standing.

⚠️ **And a different family again from the ACT quests** (`acts.js`, 7 acts / 29 rungs). Those are a one-way
ladder about the systems each town unlocks, paying passive perks. Hunts are repeatable and pay loot. Three
quest families now exist; name them clearly in whatever UI shows them or nobody will know which is which.

Also wanted: a **tracker** — what you are hunting, and how far along, visible without walking back to town.

### 1.2 A ground line per town

`GROUND = 72` is one constant in `TownClient.js` for all seven towns. Each biome's painted floor sits at a
different height, so one number cannot be right for all of them — on Ashfall the centrepiece ends up in the
lava channel. Luke: *"some of the placements are not quite right, especially on the lava level."*

⚠️ **The ground plates are fully opaque, so this cannot be measured from alpha.** I tried; every one reports
its floor starting at y=0. It needs a per-town value tuned by eye against `?town=N` in the lab, or a smarter
measure (the row where horizontal colour variance drops is probably the horizon).

### 1.3 Three roster dips — a content call, not a curve one

`npm run check:grove-curve` reports them and deliberately does not fail on them:

| boundary | effect |
|---|---|
| depth 12 → 13 | roster averages **38% easier** (map 1 ends on its brutes, map 2 opens on its swarms) |
| depth 17 → 18 | 30% easier |
| depth 67 → 68 | 34% easier |

Which creatures sit in which zone is Luke's call. The boss curve itself is strictly monotonic and gated.

---

## 2. Two decisions that are Luke's, and block the Grove opening

Everything behind them is built and sitting idle.

1. **Does the town/act gating ship with the Grove?** `GATING_LIVE` turns the seven-town progression on. Off,
   the Grove opens as it is today with every feature available at once. On, new accounts walk the ramp and
   existing accounts keep everything forever (`!buyer?.gated_at → true`).
   ⚠️ `towns.js` says in capitals: **turn it on in the same deploy that opens the Grove, never before.** A new
   account stamped `gated_at` while the Grove is shut is locked out of the farm, the mine, the arena and
   twenty other rooms with no way to unlock any of them — an unplayable account, created silently, one signup
   at a time.
2. **Open the Grove?** One line in `owner.js` moves it from three people to all 192. The floor that blocked
   this is fixed and measured: p25 went from 97 swings and a 20-minute first boss to 3 swings and 47 seconds.

Then, in order: **retire the onboarding guide** (Luke's own note — the acts become the ramp once the gate
opens) and **announce it** (fourteen fixes once went out unannounced and the plaza assumed the feature was
off).

---

## 3. Live and needs a human

### 3.1 The shelf queue — 30 open, 16 are cards owed, oldest 2 days

⚠️ **An unworked `pull` job is a card somebody has already paid for that is still physically on the shelf,
where it can be sold a second time.** This is the risk Luke pinned himself in `docs/vault-shelf-queue.md`.

It now has a screen in the admin app and a daily reminder at clock-in to both phones — but **nothing has been
worked yet**, and the vault change shipped this session (telling members plainly they can collect free in the
shop) will push more people down that path.

### 3.2 First launch of admin app v1.0.714 — untested on a real device

Published to both channels (`full` and `employee`). I cannot drive a handset from here, so the first launch is
the test. Two new screens to check, and the shelf queue has 30 real jobs to try the Done button on.

⚠️ Eric's employee build was **two releases behind** (711 → 714), so he gets more than just this change.

### 3.3 Ledger duplicate bank imports — 61 pairs, ~$11,827

Unchanged and still waiting on Luke's verification. I will not delete financial rows without it.

---

## 4. Pinned, deliberately not started

- **Pack telemetry, the rest of it** — `docs/pack-telemetry-and-member-reports.md`. The per-open feed is BUILT
  (`/api/admin/packs/feed` + the app screen). What remains is the **member dossier** and one thing that is
  genuinely urgent-ish: ⚠️ **pool alpha over time is not recorded anywhere.** `mkt_pack_pool_state` is state,
  not history. Alpha drift is the entire margin risk on the pack ladder, and history that was not written
  cannot be recovered later.
- **Vault shelf queue** — `docs/vault-shelf-queue.md`. Partly overtaken by the queue screen; re-read before
  building more.
- **Maps 8–12 art** — about `$9.30`. Seven built maps is already more content than anyone has finished.
- **Cooking Master ladder is inverted** — `cooking-master-ladder-inverted.md`. Luke, this session: *"pin that
  for way later."* ⚠️ It carries a **public promise in #bugs** to GrayKitsune and Sunflower Jinxx, made
  2026-09-14. Parked, not dropped.
- **Shop product descriptions — DECLINED.** Luke: *"I'm not interested in descriptions."* Recorded so it is not
  raised again. For the record, the finding stands: **0 of 60** Square items have a description, so there is
  nothing to sync; and the "can't scroll on phone" report was not a scroll bug — both pages scroll fine under
  a real wheel event.

---

## 5. Rigs built this session, worth knowing before rebuilding one

- `scripts/why-hidden.mjs` — why an element is not on screen: its box, computed style, every ancestor that
  could hide it, and what is actually painted at its centre. `SHOT_OUT=` makes it take the picture too,
  `SHOT_MOCK=` serves the page's own fetches. ⚠️ It exists because the menu panel "would not photograph" and
  turned out to be perfectly visible — **the rig was the problem**, and nothing else would have told me.
- `/marketplace/town/lab?town=1..7&at=<pct>` — any biome town without gating anyone. ⚠️ `at=` parks the camera:
  the street is ~4,800px and the viewport shows a slice, so a lab that does not say where you are standing
  photographs empty wall. I nearly read that as "the buildings are not rendering".
- `scripts/grove-fit.mjs` — judges a proposed difficulty curve against every real member, in swings.
- `scripts/grove-power.mjs` — the real power distribution. ⚠️ The median member is **35 dps**; the old curve's
  LOW anchor was above the 90th percentile. Re-run it before tuning anything against "a typical player".
- `scripts/grove-floor.mjs` — what day one actually meets, per zone.
- `scripts/gen-town-piece.mjs` — one town's furniture, three at a time, priced, medium only.
- `npm run check:grove-curve` — map one's bosses match the shared curve, nothing is downhill, the floor is
  playable by p25.

---

## 6. Standing rules that cost money or trust when forgotten

- 🛑 **Never generate images at `high`.** Any project, any reason.
- 🛑 **Three images per run, foreground, priced out loud.** Larger is Luke's call.
- 🛑 **An app change is not done until `npm run app:publish` prints a new versionCode** — and publish EVERY
  channel the change touches (`full` AND `-- --flavor employee`). `accounting_app` has **no git remote**, so
  "pushed" can never mean the app shipped. This was missed once this session.
- **Never gate commerce** — shop, credit, mystery bags, vault, rewards track. The Vault standing in all seven
  towns is the one honest exception to "no town shares anything".
