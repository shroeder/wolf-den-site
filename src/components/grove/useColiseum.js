"use client";

import { useCallback, useRef, useState } from "react";

// ── RUNNING A COLISEUM, FROM THE CLIENT'S SIDE ───────────────────────────────────────────────────────────────
// The scene owns the fight; this owns the run around it — spending the key, holding the plan while it plays,
// settling at the bell, and the chests left on the floor afterwards.
//
// ⚠️ THE SETTLE IS SENT ONCE, AND NOT FROM THE SCENE. onRunEnd can fire on the frame the last body dies AND
// on the frame the clock expires, and both are correct — but two settles means two sets of chests for one
// key. The guard is here rather than in the scene because the scene is re-entered on every zone and would
// lose it.
// ── ⚠️ IT CALLS BACK. IT DOES NOT PARK ANSWERS IN STATE ─────────────────────────────────────────────────────
// This used to hold `result`, and three separate things were written into it: the key error, the run summary
// and an opened chest's contents. `col.result` had ZERO readers in GroveClient for the whole life of the
// Coliseum — so a player with no key tapped the gate and nothing happened on screen, the bell rang with no
// score, and an opened chest vanished while its gear landed silently in the bag. The server was correct
// every time; the answers went into a mailbox nobody opened. [[declared-but-never-read]]
//
// A callback cannot fail that way. `onResult` not being passed is visible at the call site, where the
// handler would plainly be missing — state that nobody reads is invisible at every site at once. It also
// takes the routing out of an effect: setState inside an effect body is a cascading render and the lint
// says so, which is the same complaint from the other end.
export function useColiseum({ onChanged, onResult } = {}) {
    const [run, setRun] = useState(null);        // { map, plan } while a run is live
    const [chests, setChests] = useState([]);
    const [busy, setBusy] = useState(false);
    // ── ⚠️ A REF, NOT STATE, AND THE DIFFERENCE IS A CHEST PRINTER ────────────────────────────────────
    // This guard stops one run settling twice. It was `useState`, and state does not update until the next
    // render — so two settles fired in the SAME tick both read `false` and both went through. That is not
    // hypothetical: the leave-early ask settles the run, and GroveClient's `leave()` backstop settles any
    // run still live, and pressing Leave does both one after the other. Measured: two identical settle
    // calls for one key. It happened to pay nothing because the run was under the quarter-wave threshold;
    // at three waves it would have inserted the chests twice.
    //
    // A ref is written synchronously, so the second caller in the same tick sees it.
    const settledRef = useRef(false);

    // ── ⚠️ THE CATCH WAS ON THE WRONG PROMISE, AND IT COST MEMBERS THEIR KEYS ──────────────────────
    // This read `r.json().catch(...)` — which handles a reply that is not JSON, and does nothing at all
    // about the FETCH rejecting. A phone that loses signal mid-request, a 502, a backgrounded tab
    // killing the connection: all of those reject, and the rejection went straight past `start` (which
    // had a `finally` but no `catch`) and past `finish` (which had neither).
    //
    //   Anamarisa, 2026-11-16: "it took my coin but didnt let me play"
    //   Mama G,    2026-11-16: "have to close out and reopen the site to get out"
    //   WyldStallyn, 2026-11-17: "I have also lost 2 coins and all rewards in the grove due to freezing"
    //
    // It leaves no trace anywhere, which is why it survived three rounds of looking: the game loop is
    // fine, nothing throws inside a frame, and an unhandled rejection is not a React error. The only
    // sign was three "Load failed" rows in mkt_client_error.
    //
    // Every failure is a value now. Nothing above this has to know a fetch can reject.
    const post = useCallback(async (body) => {
        try {
            const r = await fetch("/api/marketplace/grove/coliseum", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => null);
            if (j) return j;
            return { ok: false, error: r.ok ? "bad_response" : `http_${r.status}`, offline: !r.ok };
        } catch {
            // The request never got an answer. The server may or may not have acted on it.
            return { ok: false, error: "offline", offline: true };
        }
    }, []);

    // ── ⚠️ THE DAILY KEY LIVES HERE NOW ────────────────────────────────────────────────────────────
    // It used to POST to /api/marketplace/grove/quests, because a finished quest chain was the other way
    // to get one. The chains were deleted on 2026-11-08 and that route went with them, so the daily is
    // the ONLY faucet — which made moving it a correctness job rather than tidying: a marshal still
    // offering a key against a deleted endpoint is a dead button on the only door into the Coliseum.
    //
    // It returns the FRESH STATE, not just ok. The caller has a copy of this map's coliseum card on
    // screen, and without the new keys/dailyReady the button re-offers a key you have already taken and
    // the card still reads none — which is the bug the old call had to fix with a second refresh.
    const takeKey = useCallback(async (map) => {
        const j = await post({ action: "daily", map });
        if (!j?.ok) return { ok: false, error: j?.error || "no_key" };
        const r = await fetch(`/api/marketplace/grove/coliseum?map=${map}`)
            .then((x) => x.json()).catch(() => null);
        onChanged?.();
        return { ok: true, state: r?.state || null };
    }, [post, onChanged]);

    const start = useCallback(async (map) => {
        if (busy || run) return;
        setBusy(true);
        try {
            const j = await post({ action: "start", map });
            if (j?.ok) {
                settledRef.current = false;
                // The ordinal rides along so the settle can be retried without paying twice.
                setRun({ map, plan: j.plan, run: Number(j.run) || 0 });
                onChanged?.();
            } else {
                // ⚠️ THE REFUSAL IS A RESULT TOO, and it is the one that was costing the most: "no_key" is
                // the ordinary state of the gate for most of every day, so the silent version of this made
                // the Coliseum look broken rather than closed.
                onResult?.({
                    error: j?.error === "no_key"
                        ? "You need a key. The marshal hands one out daily."
                        // ⚠️ AND A DEAD CONNECTION SAYS SO, rather than the card sitting there doing
                        // nothing. This was the silent case: the key may well be spent, so the honest
                        // message is to check rather than to promise either way.
                        : j?.offline
                            ? "Could not reach the Coliseum — check your connection and open the marshal again."
                            : (j?.error || "Could not start."),
                });
            }
        } finally {
            setBusy(false);
        }
    }, [busy, run, post, onChanged, onResult]);

    const finish = useCallback(async ({ wavesCleared, cleared }) => {
        if (settledRef.current || !run) return;
        settledRef.current = true;

        // ── ⚠️ RETRIED, AND SAFE TO RETRY ──────────────────────────────────────────────────────────
        // A settle that lost its request used to end the member's evening: the run stayed live for
        // ever because setRun(null) was below an await that never resolved, settledRef was already
        // true so nothing could settle it again, and `busy || run` left the marshal disabled until
        // the page was reloaded. The key was spent and the chests never arrived.
        //
        // Three attempts, backing off, because the usual cause is a few seconds of bad signal.
        // settleRun claims the run's ordinal in its own UPDATE, so a request that actually landed
        // before the connection dropped is recognised on the retry and does not pay twice.
        let j = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            j = await post({ action: "settle", map: run.map, wavesCleared, cleared, run: run.run || 0 });
            if (j?.ok || !j?.offline) break;
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }

        // ⚠️ UNCONDITIONALLY, AND BEFORE ANYTHING ELSE CAN THROW. Whatever happened on the wire, the
        // member is not left standing in an arena they cannot leave.
        setRun(null);
        if (!j?.ok) {
            onResult?.({
                error: j?.offline
                    ? "Your run could not be saved — the connection dropped. Nothing was taken from your record."
                    : (j?.error || "Could not settle the run."),
            });
            onChanged?.();
            return;
        }
        if (j?.ok) {
            // ⚠️ THE CHEST COUNT RIDES ALONG, because the card has to say something TRUE about them.
            // Played for real on 2026-11-12 the card read "The chests you earned are on the sand" after a
            // two-wave run that earned none — chestsFor pays nothing under a quarter of the waves. A
            // reward line that is wrong in the ordinary case is worse than no line.
            onResult?.({
                wavesCleared: j.wavesCleared, totalWaves: j.totalWaves, cleared: j.cleared,
                chests: Array.isArray(j.chests) ? j.chests.length : 0,
            });
            // Fetch the chests back rather than trusting the settle's own list — the ids are what the
            // open needs, and only the server knows them.
            const r = await fetch(`/api/marketplace/grove/coliseum?map=${run.map}`).then((x) => x.json()).catch(() => null);
            setChests(r?.chests || []);
        }
        onChanged?.();
    }, [run, post, onChanged, onResult]);

    const open = useCallback(async (chestId) => {
        // Marked opening immediately: the round trip is long enough that a chest still looking shut is a
        // chest somebody taps again, and the second tap is refused in a way that reads as the first failing.
        setChests((cs) => cs.map((c) => (c.id === chestId ? { ...c, opening: true } : c)));
        const j = await post({ action: "open", chestId });
        setChests((cs) => cs.filter((c) => c.id !== chestId));
        if (j?.ok) { onResult?.({ opened: j }); onChanged?.(); }
        return j;
    }, [post, onChanged, onResult]);

    return { run, chests, busy, start, finish, open, takeKey };
}
