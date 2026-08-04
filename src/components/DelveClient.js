"use client";

import { useCallback, useRef, useState } from "react";

import DelveRun from "@/components/delves/DelveRun";
import DelveHall from "@/components/delves/DelveHall";
import DelveWrap from "@/components/delves/DelveWrap";

// ── DUNGEON DELVES ───────────────────────────────────────────────────────────────────────────────────────────
// Two screens and a card. The HALL is the dungeon picker plus your upgrades; the RUN is the floor you are
// standing on; the WRAP is what you walked out with. One state object from the server drives all three, and
// every action is a POST that returns the whole state back — the same shape the mine and the docks use, so
// there is never a local copy of the run to drift out of sync with the server's.
export default function DelveClient({ initial }) {
    const [state, setState] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const [finished, setFinished] = useState(null); // the end-of-run card, kept until dismissed
    const busyRef = useRef(false);

    const act = useCallback(async (action, extra = {}) => {
        // A ref, not the busy state — two taps in the same tick both see the stale state value, and a delve
        // action that fires twice is a floor resolved twice.
        if (busyRef.current) return null;
        busyRef.current = true;
        setBusy(true);
        setMsg(null);
        try {
            const r = await fetch("/api/marketplace/delves", {
                method: "POST", credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...extra }),
            });
            const d = await r.json().catch(() => null);
            if (!d) { setMsg("Something went wrong down there. Try again."); return null; }
            if (d.error) setMsg(ERRORS[d.error] || "That didn't work.");
            // Any reply carrying `unlocked` is a full state; anything else is an error shape that must not
            // replace what the screen is rendering from.
            if (d.unlocked) setState(d);
            if (d.finished) setFinished(d.finished);
            return d;
        } catch {
            setMsg("Lost the connection. Your progress is saved.");
            return null;
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, []);

    const dismiss = useCallback(async () => { setFinished(null); await act("dismiss"); }, [act]);

    const run = state.run && !state.run.over ? state.run : null;

    return (
        <section className="card delve-wrap">
            <div className="delve-top">
                <span className="delve-title">Dungeon Delves</span>
                <span className="delve-sub">owner preview · level {state.level}</span>
            </div>
            {msg ? <div className="delve-msg">{msg}</div> : null}

            {run
                ? <DelveRun run={run} busy={busy} onAct={act} />
                : <DelveHall state={state} busy={busy} onAct={act} />}

            {finished ? <DelveWrap finished={finished} onClose={dismiss} /> : null}

            <style jsx global>{`
                .delve-wrap { position: relative; }
                .delve-top { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
                .delve-title { font-size: 1.15rem; font-weight: 900; color: #d9c2ff; }
                .delve-sub { font-size: 0.78rem; color: #9aa2ab; }
                .delve-msg { margin-bottom: 10px; padding: 9px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 700;
                    color: #ffd7dc; background: rgba(255,110,130,0.14); border: 1px solid rgba(255,110,130,0.4); }

                /* ── shared atoms ───────────────────────────────────────────────────────────────────────── */
                .dlv-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
                    padding: 13px 16px; border-radius: 13px; border: 0; cursor: pointer;
                    font-size: 0.95rem; font-weight: 900; letter-spacing: 0.03em; color: #1a1030;
                    background: linear-gradient(180deg, #e6d4ff, #b98cff); box-shadow: 0 4px 0 rgba(0,0,0,0.35); }
                .dlv-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
                .dlv-btn:disabled { opacity: 0.5; cursor: default; transform: none; }
                .dlv-btn.is-ghost { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.16); color: #cdd3d8; box-shadow: none; }
                .dlv-btn.is-danger { background: linear-gradient(180deg, #ffb0b8, #ff6f7d); color: #330d12; }
                .dlv-ico { width: 22px; height: 22px; object-fit: contain; }
            `}</style>
        </section>
    );
}

const ERRORS = {
    locked: "Delves aren't open yet.",
    level_locked: "You aren't deep enough into the Den for that one yet.",
    already_today: "You've already run that dungeon today. Back tomorrow.",
    run_in_progress: "You're already in a dungeon — finish it first.",
    no_potions: "No potions left.",
    already_full: "You're at full health.",
    not_enough_gold: "You can't afford that.",
    maxed: "Already fully upgraded.",
    no_run: "That run is over.",
};
