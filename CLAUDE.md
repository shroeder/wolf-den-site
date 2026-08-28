# Working on the Wolf Den site

## Before you cut anything for cost

This repo has been through the same loop more than once: the CPU bill goes up, cuts get made, the cuts break
features, the features get fixed, the bill goes up. The way out is knowing which meter you are moving and which
kind of cut is safe.

### Three meters, moved by different things

| meter | rate | what moves it |
|---|---|---|
| Vercel invocations | $0.60/M | **effectively free.** All 23 crons together are ~30/hour — 1.3¢ a month |
| Vercel **Active CPU** | $0.128/hr | **this is the bill.** Break-even vs an invocation is ~17ms |
| Neon compute | $0.106/CU-hour | wall-clock time the DB is **awake**, not query count |

**Round trips ≈ Active CPU.** `neon()` is the HTTP driver, so every query is its own HTTPS request — a TLS
handshake and a JSON parse, both real CPU. A profile of the arena handler came back 95.7% *idle* with
`configSecureContext` among the live frames: it was not arithmetic, it was 150 handshakes. So the lever that
matters is **queries per request**.

Neon is different: one query or a hundred, the DB is awake for that tick. What moves that meter is the **gap
between wake-ups** against the ~5 minute autosuspend, so a single `*/5` cron pins it awake on its own. As of
2026-08-28 Luke's call is that Neon is fine — don't chase it.

### Two kinds of cut, and only one is safe

**A — narrow what a call does. Safe, and where the money actually is.**
The defect is a caller reaching for the most convenient existing function instead of the narrowest one. That is
good reuse instinct and it bills a fortune: `getFarm` ran 78 round trips so the nav could read two fields;
`petsState({sync:true})` ran 93 so a watcher could read four. Fix with a narrow accessor that **calls the same
rules rather than copying them**, or memoise a question asked repeatedly inside one request — caching the
**in-flight promise**, not the resolved value, because callers inside a `Promise.all` all miss a value cache.
Verify by asserting old and new return **identical** values. Nav 111 round trips → 3, HUD 146 → 65, pets 93 →
12. No regression has ever come from this family.

**B — cut how often something runs. Changes behaviour. This is where every regression came from.**
In each case the thing being cut had a second, undocumented job:

- the casino position POST was also the liveness heartbeat — `casinoOccupants` only returns rows newer than
  90s, so suppressing the redundant write made standing-still players vanish from the room
- `petsState`'s `sync` flag gated the achievement sweep **and** the per-level sprite build, so turning off the
  sweep turned off the art
- a cron's cadence **was** the notification latency — `*/15` → `0,30` on 31 July surfaced as "I'm not getting
  sailing notifications" four weeks later, with the route's own comment still claiming 15 minutes

Family A's excess is visible in the diff. Family B's is visible nowhere.

**So:** exhaust A before touching B. Before cutting a repeated call, don't ask what it *returns* — ask what its
*happening* implies: what expiry, what freshness, what side effect depends on it running at all. Ship a
family-B change with a test that asserts the **behaviour**, not the saving ("a still player still appears in
the room after two minutes"). And check the meter first: invocations cost 1.3¢/month, so slowing something down
usually is not buying anything on the meter you meant to move.

**A cost cut the player can notice is a bug, not a saving.**

## The gates

`npm run` them; they encode bugs that already happened. Notably `check:chrome` (a component mounted in a
`layout.js` bills on every navigation by every member, forever — so it may read at most one endpoint),
`check:polls` (a timer that talks to the server must stop when the tab is hidden, and a timer that POSTs must
compare against what it last sent), and `check:vercel` (Vercel rejects a bad `vercel.json` *before* the build,
so no build log exists to tell you why).
