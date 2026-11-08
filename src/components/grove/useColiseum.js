"use client";

import { useCallback, useState } from "react";

// ── RUNNING A COLISEUM, FROM THE CLIENT'S SIDE ───────────────────────────────────────────────────────────────
// The scene owns the fight; this owns the run around it — spending the key, holding the plan while it plays,
// settling at the bell, and the chests left on the floor afterwards.
//
// ⚠️ THE SETTLE IS SENT ONCE, AND NOT FROM THE SCENE. onRunEnd can fire on the frame the last body dies AND
// on the frame the clock expires, and both are correct — but two settles means two sets of chests for one
// key. The guard is here rather than in the scene because the scene is re-entered on every zone and would
// lose it.
export function useColiseum({ onChanged } = {}) {
    const [run, setRun] = useState(null);        // { map, plan } while a run is live
    const [chests, setChests] = useState([]);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [settled, setSettled] = useState(false);

    const post = useCallback(async (body) => {
        const r = await fetch("/api/marketplace/grove/coliseum", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        return r.json().catch(() => ({ ok: false, error: "bad_response" }));
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
        setResult(null);
        try {
            const j = await post({ action: "start", map });
            if (j?.ok) {
                setSettled(false);
                setRun({ map, plan: j.plan });
                onChanged?.();
            } else {
                setResult({ error: j?.error === "no_key" ? "You need a key. The marshal hands one out daily." : (j?.error || "Could not start.") });
            }
        } finally {
            setBusy(false);
        }
    }, [busy, run, post, onChanged]);

    const finish = useCallback(async ({ wavesCleared, cleared }) => {
        if (settled || !run) return;
        setSettled(true);
        const j = await post({ action: "settle", map: run.map, wavesCleared, cleared });
        setRun(null);
        if (j?.ok) {
            setResult({ wavesCleared: j.wavesCleared, totalWaves: j.totalWaves, cleared: j.cleared });
            // Fetch the chests back rather than trusting the settle's own list — the ids are what the
            // open needs, and only the server knows them.
            const r = await fetch(`/api/marketplace/grove/coliseum?map=${run.map}`).then((x) => x.json()).catch(() => null);
            setChests(r?.chests || []);
        }
        onChanged?.();
    }, [settled, run, post, onChanged]);

    const open = useCallback(async (chestId) => {
        // Marked opening immediately: the round trip is long enough that a chest still looking shut is a
        // chest somebody taps again, and the second tap is refused in a way that reads as the first failing.
        setChests((cs) => cs.map((c) => (c.id === chestId ? { ...c, opening: true } : c)));
        const j = await post({ action: "open", chestId });
        setChests((cs) => cs.filter((c) => c.id !== chestId));
        if (j?.ok) { setResult({ opened: j }); onChanged?.(); }
        return j;
    }, [post, onChanged]);

    return { run, chests, busy, result, start, finish, open, takeKey, clearResult: () => setResult(null) };
}
