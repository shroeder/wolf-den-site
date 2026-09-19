"use client";

// ── THE JOURNEY, END TO END ──────────────────────────────────────────────────────────────────────────────────
// Luke's shape, in his words: *"you set sail, and then you encounter a ship like you normally would during an
// NPC raid, and then you fight them, and then there's a whole beat dedicated to you understanding what you got
// from the captain and why. Then we have this mini game where you decode the map... and then when you finish
// that, it needs to clearly, at a whole beat, elaborate on what exactly happened and why... then it's set and
// automatically you set sail and begin your journey towards the island... a couple random encounters... and
// then you come up on the island, you should see it come up in the background, and then you kind of swing
// around and you go to the island. It should show your boat docking on the island, and then your character
// hopping off, so it's seamless."*
//
// Seven beats on one track, and the thing that makes it a track rather than seven screens is that it is ONE
// full-screen stage that never unmounts. The page behind it is not a page you come back to between steps.
//
//   hunt      out looking, on the real ocean scene, with a sail growing on the horizon
//   (battle)  the ship battle that already exists
//   spoils    a whole beat: the man, his stars, what he gave up and what that buys
//   bearings  the glass: three bearings to take, and the chart knitting as they land
//   course    a whole beat: where you are going, how well you read him, and what is there
//   run       the sail in, encounters you can SEE coming, the island growing behind them
//   landing   coming alongside — the boat docks and you step off
//   ashore    the walk
//
// ⚠️ THE SEA IS THE REAL SEA. Every water beat here is <SailingSea>, the same component the helm draws. The
// thing that used to be here was a 220px strip with a boat glyph lerped across it on an inline `left:%`, and
// Luke's reaction to it is the reason that component exists at all.
//
// ⚠️ TWO ENDPOINTS, DELIBERATELY. Everything about the journey goes to /sailing/expedition; the volleys go to
// /sailing, because that is where a battle already lives and a fight resumed after a reload has to come back
// through the same door whatever opened it.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ShipBattleScene from "@/components/ShipBattleScene";
import SailingSea from "@/components/SailingSea";
import IslandWalk from "@/components/IslandWalk";
import Bearings from "@/components/expedition/Bearings";
import { CourseBeat, LandfallBeat, LostBeat, SpoilsBeat } from "@/components/expedition/Beat";
import Exp from "@/lib/marketplace/expedition-audio.js";

const EXP = "/api/marketplace/sailing/expedition";
const SAIL = "/api/marketplace/sailing";

const CHART_ART = "/images/islands/chrome/chart.png";
const DOUBLOON = "/images/sailing/doubloon.png";
const ART_V = "1";
const v = (p) => (p ? `${p}${p.includes("?") ? "&" : "?"}v=${ART_V}` : null);

/** The stage. One fixed, full-screen surface that outlives every beat drawn on it. */
function Stage({ children }) {
    const [el] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
    useEffect(() => {
        if (!el) return undefined;
        document.body.appendChild(el);
        // ⚠️ GIVE THE SCROLL BACK. A screen that takes the lock and only releases it down a happy path leaves
        // the whole site frozen behind it. See [[visual-rigs]].
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.removeChild(el); document.body.style.overflow = prev; };
    }, [el]);
    if (!el) return null;
    return createPortal(<div className="jx">{children}</div>, el);
}

export default function ExpeditionClient() {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    const [battle, setBattle] = useState(null);
    const [summary, setSummary] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const rafRef = useRef(0);
    const stepRef = useRef(false);
    const retryRef = useRef(0);
    const view = state?.expedition || null;
    const phase = view?.phase || null;

    const post = useCallback(async (action, body = {}) => {
        setBusy(true);
        try {
            const r = await fetch(EXP, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, ...body }),
            });
            const d = await r.json().catch(() => null);
            if (d?.ok) setState(d);
            return d;
        } finally { setBusy(false); }
    }, []);

    const load = useCallback(async () => {
        const r = await fetch(EXP, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (d) setState(d);
        return d;
    }, []);

    // A fight left open by a reload has to be handed back, or it is a saved battle nobody can reach.
    const resumeBattle = useCallback(async () => {
        const r = await fetch(SAIL, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        const open = d?.combat?.openBattle;
        if (open) setBattle(open);
        return open;
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            const d = await load();
            if (!alive) return;
            // ── ARRIVED WITH THE DECISION ALREADY MADE ───────────────────────────────────────────────
            // The helm's own "Set sail" sends ?go=1. Answering the same question twice is the thing Luke
            // hit ("irrelevant screen, I already hit set sail"), so the sailing starts here instead of
            // drawing a harbour that asks again.
            //
            // GUARDED THREE WAYS, because this SPENDS one of three daily attempts: only when the flag is
            // present, only when nothing is already under way, and only when there is an attempt left.
            // The flag is stripped with replaceState BEFORE the request goes out, so a reload — or the
            // back button — cannot spend a second one.
            const go = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("go") === "1";
            if (go) {
                const url = new URL(window.location.href);
                url.searchParams.delete("go");
                window.history.replaceState(null, "", url.toString());
                if (!d?.open && Number(d?.sailings) > 0) {
                    Exp.unlock();
                    await post("set_sail");
                    if (!alive) return;
                }
            }
            await resumeBattle();
        })();
        return () => { alive = false; };
    }, [load, post, resumeBattle]);

    // ── THE TWO CLOCKS ───────────────────────────────────────────────────────────────────────────────────
    // The hunt and the run are both "a stretch of sea with a thing at the end of it", and both are animated
    // off the SERVER's stamp plus the gap since — so locking the phone mid-sail and coming back lands you
    // where the clock really is rather than where the animation left off.
    const leg = phase === "hunt" ? view?.hunt : (phase === "run" || phase === "landing") ? view?.run : null;
    useEffect(() => {
        if (!leg || battle) return undefined;
        const total = leg.ms || 30000;
        const base = leg.elapsed || 0;
        const t0 = performance.now();
        const tick = () => {
            rafRef.current = requestAnimationFrame(tick);
            setElapsed(Math.min(total, base + (performance.now() - t0)));
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [leg, battle]);

    // ── ARRIVING SOMEWHERE ───────────────────────────────────────────────────────────────────────────────
    // One effect for every "the clock got there, tell the server" on the whole journey, because they are the
    // same question asked of the same clock and splitting them raced.
    //
    // ⚠️ A REFUSAL BACKS OFF. The server's clock is the one that counts and it can disagree with ours by a
    // frame; our animation runs off performance.now(), so a phone a second fast would ask, be refused, and
    // ask again on the very next frame — sixty requests a second, the single most expensive shape this
    // codebase can produce (CLAUDE.md).
    useEffect(() => {
        if (battle || stepRef.current || busy) return;
        if (Date.now() < retryRef.current) return;
        const total = leg?.ms || 0;
        const done = total > 0 && elapsed >= total;

        // ⚠️ THE BACK-OFF ARMS ON ANYTHING THAT IS NOT PROGRESS, NOT ONLY ON `ok:false`.
        //
        // The first cut armed it only when the server said `ok:false`, and there are three other ways to get
        // nothing back — and one of them is reachable by tapping a button:
        //
        //   · TAP "LEAVE" IN A FIGHT. The battle stays saved on mkt_sailing, so `engage`/`mark` answer
        //     "already fighting" — `ok:true`, no `fight`. No back-off armed, the state object is new, the
        //     effect's dependency changed, and it fires again on the next round trip. Forever. Six Neon
        //     round trips a go, in a hidden tab, with the player looking at an empty sea and no way back in
        //     short of a page reload. That is the single most expensive shape this codebase can produce.
        //   · A 500. `internalError` returns `{error, requestId}` with NO `ok` key, so `ok === false` is false.
        //   · A network failure, which REJECTS — the old `try` had no `catch`, so it did not arm anything.
        //
        // So: catch everything, arm unless the answer was forward progress, and — the actual fix for the
        // first one — always go and look for an open battle, because "I could not do that" and "you are
        // already in a fight" are the same answer from here.
        const go = async (fn) => {
            stepRef.current = true;
            try {
                const d = await fn();
                if (!d?.moved) retryRef.current = Date.now() + 900;
                if (!d?.moved) await resumeBattle();
            } catch {
                retryRef.current = Date.now() + 2000;
            } finally { stepRef.current = false; }
        };

        if (phase === "hunt" && done) {
            go(async () => {
                const d = await post("engage");
                if (d?.fight) { await resumeBattle(); return { moved: true }; }
                return { moved: false };
            });
        } else if (phase === "run") {
            const marks = view?.run?.marks || [];
            const due = marks.findIndex((m) => !m.done && elapsed >= total * m.at);
            if (due >= 0) {
                go(async () => {
                    const d = await post("mark", { k: due });
                    if (d?.fight) { await resumeBattle(); return { moved: true }; }
                    // The mark resolved without a fight (it was already done) — that IS progress.
                    return { moved: (d?.expedition?.run?.marks || [])[due]?.done === true };
                });
            } else if (done && marks.every((m) => m.done)) {
                go(async () => {
                    const d = await post("alongside");
                    return { moved: d?.expedition?.phase === "landing" };
                });
            }
        }
    }, [battle, busy, elapsed, leg, phase, post, resumeBattle, view?.run?.marks]);

    // Sounds that belong to a beat arriving rather than to a tap.
    useEffect(() => {
        if (!phase) return;
        if (phase === "hunt") Exp.setSail();
        if (phase === "landing") Exp.landSighted();
    }, [phase]);

    // How far along the current leg we are, 0..1. Declared before the effects that read it rather than beside
    // the render values, because a hook cannot reach a const declared below it.
    const p = leg?.ms ? Math.max(0, Math.min(1, elapsed / leg.ms)) : 0;

    // ── THE HUNT, OUT LOUD ───────────────────────────────────────────────────────────────────────────────
    // ⚠️ KEYED OFF A BAND, NOT OFF THE CLOCK. `p` changes sixty times a second, so anything that fires on a
    // comparison against it fires sixty times a second — the audio equivalent of the request storm the
    // effect above exists to prevent. The leg is cut into coarse bands and a ref remembers the last one
    // spoken, so each band gets one voice however many frames it spans.
    const saidRef = useRef("");
    useEffect(() => {
        if (battle || !leg) { saidRef.current = ""; return; }
        const band = phase === "hunt"
            ? (p > 0.82 ? "h3" : p > 0.5 ? "h2" : p > 0.22 ? "h1" : "")
            : (p > 0.9 ? "r3" : p > 0.55 ? "r2" : p > 0.2 ? "r1" : "");
        if (!band || band === saidRef.current) return;
        saidRef.current = band;
        if (band === "h1") Exp.sighted();
        else if (band === "h2") Exp.closing(0.5);
        else if (band === "h3") Exp.closing(1);
        else Exp.swell(p);
    }, [battle, leg, p, phase]);

    const volley = async (aim) => {
        Exp.broadside();
        const r = await fetch(SAIL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "battle_volley", aim }),
        });
        const d = await r.json().catch(() => null);
        if (d?.battle) setBattle(d.battle);
    };
    const reckoning = async () => {
        const r = await fetch(SAIL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "battle_reckoning" }),
        });
        const d = await r.json().catch(() => null);
        if (d?.battle) setBattle(d.battle);
    };

    const boat = state?.boat || null;
    const hero = state?.hero || null;
    const sky = view?.sky || "/images/sailing/sky-goldenhour.png";

    // ── THE PAGE, WHEN NOTHING IS UNDERWAY ───────────────────────────────────────────────────────────────
    if (!state) return <div className="ex-wrap"><p className="ex-quiet">Looking at the water…</p></div>;

    // The ending stays on the stage, so the journey does not hand you back to a page to finish.
    if (summary) {
        return (
            <Stage>
                <LandfallBeat summary={summary} onDone={() => { setSummary(null); load(); }} />
                <Style />
            </Stage>
        );
    }

    if (!state.open) {
        return <Harbour state={state} busy={busy}
            onSail={() => post("set_sail")} onOpenChart={() => post("open")} />;
    }

    // ── THE STAGE ────────────────────────────────────────────────────────────────────────────────────────
    return (
        <Stage>
            {/* THE SEA. Drawn for every water beat, and the SAME element across all of them — so the horizon
                does not restart between the hunt, the run and the landing. */}
            {(phase === "hunt" || phase === "run" || phase === "landing") ? (
                <SailingSea
                    sky={sky} boat={boat} hero={hero ? { art: hero.art, flip: hero.flip } : null}
                    sailing={phase !== "landing" || p < 1}
                    className={`jx-sea${phase === "landing" ? " is-landing" : ""}`}
                    banner={phase === "landing" ? "LAND HO!" : null}
                    cheer={phase === "landing"}
                    approach={approachFor(phase, view, p)}>
                    <Rail phase={phase} view={view} p={p} busy={busy}
                        onResume={resumeBattle}
                        onAshore={async () => { Exp.ashore(); const d = await post("ashore"); if (d?.ok) Exp.dock(); }} />
                </SailingSea>
            ) : null}

            {/* The row is left OPEN on a loss (see huntFinished) precisely so this can be shown; its button is
                what finally ends it. Without the branch the phase would render nothing at all — a live row
                with no screen, which is the stuck state this journey has hit before. */}
            {phase === "lost" ? (
                <LostBeat lost={view.lost} sailings={state?.sailings} perDay={state?.perDay} busy={busy}
                    onDone={async () => { await post("leave"); load(); }} />
            ) : null}

            {phase === "spoils" ? (
                <SpoilsBeat spoils={view.spoils} busy={busy} onNext={() => post("read_spoils")} />
            ) : null}

            {phase === "bearings" ? (
                <Bearings view={view} sky={sky} busy={busy} onCommit={(taken) => post("bearings", { taken })} />
            ) : null}

            {phase === "course" ? (
                <CourseBeat view={view} busy={busy} onNext={() => post("course")} />
            ) : null}

            {phase === "ashore" ? (
                <IslandWalk view={view} hero={state.hero} boat={boat} busy={busy}
                    // ⚠️ A WARDEN ANSWERS WITH A FIGHT, NOT A REWARD. Walking onto one opens a real ship
                    // battle on the server; without handing the client over to it the member would stand on
                    // the node with a saved battle they cannot reach — the same shape as the reload case
                    // resumeBattle exists for. Every other node still answers with loot and falls through.
                    onTake={async (x) => {
                        const d = await post("take", x);
                        if (d?.fight) await resumeBattle();
                        return d;
                    }}
                    onLeave={async () => { const d = await post("leave"); if (d?.summary) setSummary(d.summary); }} />
            ) : null}

            {battle ? (
                <div className="jx-battle">
                    <ShipBattleScene battle={battle} busy={busy}
                        onVolley={volley} onReckoning={reckoning}
                        onClose={async () => { setBattle(null); await load(); }} />
                </div>
            ) : null}
            <Style />
        </Stage>
    );
}

// ── WHAT IS COMING OVER THE HORIZON ──────────────────────────────────────────────────────────────────────────
// The hunt closes on a ship; the run closes on an island, with the next unfought encounter cutting across it.
// Both are the same `approach` prop on the same scene — the thing the sea could never do before.
function approachFor(phase, view, p) {
    if (phase === "hunt") {
        const foe = view?.hunt?.foe;
        if (!foe?.art) return null;
        // ⚠️ SHE ARRIVES EARLY AND THEN LOOMS. A linear closing spends most of the leg as a speck and the
        // last second as a ship, which reads as a jump cut. Squaring it puts her in view at a quarter of the
        // way in and gives the rest of the leg to the thing getting bigger.
        return { kind: "ship", art: foe.art, at: p, name: p > 0.45 ? foe.name : "A sail" };
    }
    if (phase === "run" || phase === "landing") {
        const marks = view?.run?.marks || [];
        const next = marks.find((m) => !m.done);
        // An encounter you can see coming: it grows over the stretch of run leading up to its own mark.
        if (next && p < next.at) {
            const lead = 0.26;
            const from = Math.max(0, next.at - lead);
            if (p > from) return { kind: "ship", art: next.art, at: (p - from) / (next.at - from), name: next.name };
        }
        const isle = view?.island;
        if (!isle?.art) return null;
        // The island itself, from the moment the first mark is behind you.
        return { kind: "island", art: isle.art, at: Math.max(0, Math.min(1, (p - 0.3) / 0.7)), name: p > 0.62 ? isle.name : null };
    }
    return null;
}

// ── THE RAIL ─────────────────────────────────────────────────────────────────────────────────────────────────
// What is drawn over the sea: where you are on this leg, and — at the end of the landing — the one button that
// puts your feet on the sand.
function Rail({ phase, view, p, busy, onAshore, onResume }) {
    const marks = view?.run?.marks || [];
    // ⚠️ A FIGHT YOU WALKED OUT OF HAS TO HAVE A DOOR BACK IN. ShipBattleScene's own "Leave — this fight
    // will be waiting for you" button drops you back onto the sea, and until this existed the sea had
    // nothing on it that said so: the journey looked becalmed and the only way back was a page reload. The
    // helm has carried this affordance for its own battles all along; the expedition simply never grew one.
    const [waiting, setWaiting] = useState(false);
    useEffect(() => {
        let alive = true;
        const look = async () => {
            const r = await fetch(SAIL, { cache: "no-store" }).catch(() => null);
            const d = await r?.json().catch(() => null);
            if (alive) setWaiting(Boolean(d?.combat?.openBattle));
        };
        look();
        return () => { alive = false; };
    }, [phase]);
    return (
        <>
            <div className="jx-rail">
                <span className="jx-rail-fill" style={{ width: `${p * 100}%` }} />
                {marks.filter((m) => m.done).map((m, i) => (
                    <span key={i} className="jx-rail-mark" style={{ left: `${m.at * 100}%` }} title={m.name} />
                ))}
            </div>
            <p className="jx-say">
                {phase === "hunt" ? (p < 0.35 ? "Out looking for a sail." : p < 0.8 ? "There — a sail, and she has not seen us." : "Beat to quarters.")
                    : phase === "landing" ? "She is alongside."
                        : p < 0.35 ? "Making for the island." : p < 0.85 ? "Holding the course." : "Coming up on it."}
            </p>
            {waiting ? (
                <button className="jx-go is-fight" disabled={busy} onClick={async () => { setWaiting(false); await onResume?.(); }}>
                    Back to the fight
                </button>
            ) : phase === "landing" ? (
                <button className="jx-go" disabled={busy} onClick={onAshore}>Step ashore</button>
            ) : null}
        </>
    );
}

// ── THE HARBOUR ──────────────────────────────────────────────────────────────────────────────────────────────
// Not a beat — a page. The one place in the loop you are not already on the water, and the only screen that
// says what a sailing costs you.
function Harbour({ state, busy, onSail, onOpenChart }) {
    const left = Number(state?.sailings) || 0;
    const per = Number(state?.perDay) || 3;
    return (
        <div className="ex-wrap">
            <div className="ex-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ex-chart" src={v(CHART_ART)} alt="" draggable="false" />
                <h2 className="ex-h">Put to sea</h2>
                <p className="ex-quiet">
                    Find a ship worth taking, take her captain, and make him say where something is.
                    There is no waiting in it — the whole run is yours now.
                </p>
                <div className="ex-tally">
                    <span className={left > 0 ? "" : "ex-missed"}><b>{left}</b> of {per} sailings left today</span>
                </div>
                <button className="ex-go" disabled={busy || left <= 0} onClick={() => { Exp.unlock(); onSail(); }}>
                    {left > 0 ? "Set sail" : "No sailings left today"}
                </button>
                {/* ⚠️ AND A WAY TO SPEND THEM. A member who beat a fleet ship under the old rules still has
                    rows in mkt_ship_chart, and the route still carries the action to open one — but nothing
                    called it, so the copy here said "they will keep" about charts that were in fact stranded
                    forever. Kept as a SECOND button rather than folded into Set sail, because opening one
                    skips the hunt: it is a different journey and it costs a chart instead of a sailing. */}
                {state?.charts > 0 ? (
                    <>
                        <button className="ex-go is-second" disabled={busy} onClick={() => { Exp.unlock(); onOpenChart(); }}>
                            Open a chart you already hold
                        </button>
                        <p className="ex-note">
                            {state.charts === 1 ? "One chart" : `${state.charts} charts`} taken off a captain the
                            old way. Opening one skips the hunt and goes straight to the glass.
                        </p>
                    </>
                ) : null}
            </div>
            <PageStyle />
        </div>
    );
}

function Style() {
    return (
        <style jsx global>{`
            .jx { position: fixed; inset: 0; z-index: 800; overflow: hidden;
                height: 100vh; height: 100dvh; width: 100vw; background: #06101a; }
            /* ⚠️ THE SEA FILLS THE STAGE. The shared scene is sized for a panel in a page — it carries its own
               aspect ratio and corner radius at the helm, which is right there and wrong here. This is the
               only place it is overridden, and it is overridden by the CALLER rather than by adding a mode to
               the component, so the helm cannot be changed by accident from here. */
            .jx .sail-sea.jx-sea { position: absolute; inset: 0; width: 100%; height: 100%;
                max-height: none; border-radius: 0; aspect-ratio: auto; }
            /* ⚠️ THE HULL RIDES HIGHER HERE, AND IT IS NOT A TASTE CALL. At the helm the scene is a 260-400px
               panel and the boat is meant to fill the bottom of it. On a 780px stage the same rule puts the
               hull under the progress rail and the line of narration, and the negative bottom offset it
               takes while underway then slices the stern off the phone. Lifted clear of the furniture, and a shade
               smaller so the horizon has room to be a horizon. */
            .jx .jx-sea .sail-boat { bottom: 11%; }
            .jx .jx-sea .sail-boat.is-underway { bottom: 9%; }
            /* ⚠️ THE HULL LIFTS FOR THE LANDING, BECAUSE THAT IS WHEN A BUTTON APPEARS UNDER IT. "Step
               ashore" was laid across 28% of the boat and 43% of the member's own avatar — the one frame
               where you are meant to be looking at your ship arriving, with the CTA sitting on top of it. */
            .jx .jx-sea.is-landing .sail-boat, .jx .jx-sea.is-landing .sail-boat.is-underway { bottom: 26%; }
            .jx .jx-sea .sail-boat-img { width: clamp(150px, 42vw, 260px); }
            .jx .jx-sea .sail-hero { height: clamp(46px, 13vw, 88px); }
            .jx .jx-sea .sail-pet { height: clamp(34px, 9vw, 58px); }
            /* ⚠️ AND THE LIGHT COLUMN LOSES ITS EDGES. The sea's reflection layer is a 24%-wide white block
               on screen blend mode; on a small panel under a sunset it reads as glare on the water, and
               full-screen under a NIGHT sky it reads as exactly what it is — a grey rectangle floating in
               the middle of the sea. Caught by shooting the hunt. Wider, softer, and faded at both sides so
               it has no edge to notice. */
            .jx .jx-sea .sail-reflection { width: 62%; height: 44%; filter: blur(22px); opacity: 0.5;
                -webkit-mask-image: radial-gradient(ellipse at 50% 30%, #000 18%, transparent 72%);
                mask-image: radial-gradient(ellipse at 50% 30%, #000 18%, transparent 72%); }
            .jx-battle { position: absolute; inset: 0; z-index: 40; overflow-y: auto; background: #06101a; }

            /* Capped and centred: full-bleed it became a 2532x6 hairline on a desktop, which is the journey's
               only progress signal rendered imperceptible exactly where there was most room for it. */
            .jx-rail { position: absolute; left: 50%; transform: translateX(-50%);
                width: calc(100% - 28px); max-width: 900px;
                bottom: calc(58px + env(safe-area-inset-bottom));
                height: 8px; border-radius: 999px; background: rgba(0,0,0,0.5); overflow: hidden; z-index: 12; }
            .jx-rail-fill { position: absolute; left: 0; top: 0; bottom: 0;
                background: linear-gradient(90deg, #8d6a23, #f0cb79); transition: width 120ms linear; }
            .jx-rail-mark { position: absolute; top: -4px; width: 3px; height: 14px; margin-left: -1.5px;
                border-radius: 2px; background: #d8323c; }
            .jx-say { position: absolute; left: 0; right: 0; bottom: calc(26px + env(safe-area-inset-bottom));
                margin: 0; text-align: center; z-index: 12; pointer-events: none;
                font-size: clamp(0.78rem, 3.3vw, 0.92rem); font-weight: 700; color: #e9dcbb;
                text-shadow: 0 2px 10px rgba(0,0,0,0.9); }
            .jx-go { position: absolute; left: 50%; bottom: calc(76px + env(safe-area-inset-bottom));
                transform: translateX(-50%); z-index: 14; width: min(78vw, 18rem);
                padding: 13px 18px; border-radius: 12px; border: 0; cursor: pointer;
                font-size: 1rem; font-weight: 800; color: #2a1c06;
                background: linear-gradient(180deg, #f0cb79, #d5a445);
                box-shadow: 0 3px 0 #8d6a23, 0 8px 22px rgba(0,0,0,0.55);
                animation: jxGo 520ms cubic-bezier(.2,1.3,.4,1) both; }
            @keyframes jxGo { from { opacity: 0; transform: translateX(-50%) translateY(14px); } }
            .jx-go.is-fight { background: linear-gradient(180deg, #ff9d7a, #d8503c); color: #21100b;
                box-shadow: 0 3px 0 #8d2a1c, 0 8px 22px rgba(0,0,0,0.55); }
        `}</style>
    );
}

function PageStyle() {
    return (
        <style jsx global>{`
            .ex-wrap { display: flex; flex-direction: column; gap: 14px; max-width: 620px; margin: 0 auto; padding: 14px; }
            .ex-card { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
                padding: 22px 18px; border-radius: 14px;
                background: linear-gradient(180deg, rgba(32, 26, 16, 0.92), rgba(18, 15, 10, 0.94));
                border: 1px solid rgba(232, 192, 105, 0.22); }
            .ex-chart { width: 78px; height: 78px; object-fit: contain;
                filter: drop-shadow(0 4px 8px rgba(0,0,0,0.55)); }
            .ex-h { margin: 0; font-size: 1.3rem; color: #f2e4c6; }
            .ex-quiet { margin: 0; color: #b9a986; font-size: 0.88rem; line-height: 1.45; max-width: 32rem; }
            .ex-note { margin: 0; color: #8f8367; font-size: 0.76rem; line-height: 1.4; max-width: 30rem; }
            .ex-band { margin: 0; text-align: center; color: #e8c069; font-size: 0.88rem; font-weight: 700; }
            .ex-tally { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; color: #cdbb98; font-size: 0.88rem; }
            .ex-tally b { color: #f2e4c6; }
            .ex-coin { width: 15px; height: 15px; object-fit: contain; vertical-align: -3px; margin-right: 4px; }
            .ex-prize { color: #7fe0a8; }
            .ex-missed { color: #9a8f78; font-style: italic; }
            .ex-go { display: inline-flex; align-items: center; gap: 8px; justify-content: center;
                padding: 13px 20px; border-radius: 10px; border: 0; cursor: pointer;
                font-size: 1rem; font-weight: 700; color: #2a1c06;
                background: linear-gradient(180deg, #f0cb79, #d5a445);
                box-shadow: 0 3px 0 #8d6a23, 0 6px 16px rgba(0, 0, 0, 0.4); }
            .ex-go:disabled { opacity: 0.6; cursor: default; }
            .ex-go.is-second { background: rgba(0, 0, 0, 0.4); color: #e9dcbb; font-weight: 700;
                border: 1px solid rgba(232, 192, 105, 0.4); box-shadow: none; }
            .ex-card.is-banner { padding-top: 0; overflow: hidden; }
            .ex-banner { align-self: stretch; height: 116px; margin: 0 -18px 4px;
                background-size: cover; background-position: center 62%; background-color: #16222b;
                -webkit-mask-image: linear-gradient(180deg, #000 52%, rgba(0, 0, 0, 0) 100%);
                mask-image: linear-gradient(180deg, #000 52%, rgba(0, 0, 0, 0) 100%); }
            .ex-prizeart { margin: -66px 0 -6px; }
            .ex-prizeart img { display: block; width: 92px; height: 92px; object-fit: contain;
                filter: drop-shadow(0 5px 10px rgba(0, 0, 0, 0.7)); }
            .ex-prizeart.is-missed img { filter: grayscale(0.85) brightness(0.72) drop-shadow(0 5px 10px rgba(0, 0, 0, 0.7));
                opacity: 0.66; }
        `}</style>
    );
}
