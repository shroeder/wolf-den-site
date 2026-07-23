"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Owner-only Farm: your owned pets wander a little pasture. On your own farm you can pet each one once a day
// for a small XP bump; you can also look up another member and watch their pets roam (view-only).
const RARITY_RING = {
    common: "#9aa0a6", rare: "#4aa3d4", epic: "#a855f7", legendary: "#f59e0b",
    mythic: "#ff5cc8", ascendant: "#ff7a3c", eternal: "#22e0c8",
};
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function FarmClient({ initial, viewingAlias }) {
    const router = useRouter();
    const [farm, setFarm] = useState(initial);
    const pets = farm.pets || [];
    // Each pet gets a "home" slot spread evenly across the (wide, scrollable) field and wanders around it.
    // Deterministic init so server & client HTML match (no hydration mismatch); the scheduler takes over on mount.
    const homeX = useCallback((i) => (pets.length ? ((i + 0.5) / pets.length) * 100 : 50), [pets.length]);
    const [pos, setPos] = useState(() => pets.map((_, i) => ({
        x: pets.length ? ((i + 0.5) / pets.length) * 100 : 50,
        y: 80 + ((i * 7) % 12), // low on the grass
        flip: i % 2 === 1,
        dur: 2, // seconds for the current stroll (varies per move → different speeds)
        moving: false,
        hopMs: 420 + ((i * 53) % 220), // this pet's personal hop cadence (stable)
    })));
    const [floaters, setFloaters] = useState([]);
    const floatId = useRef(0);
    const [busy, setBusy] = useState(null);

    // INDEPENDENT wander: every pet runs its OWN loop — random start delay, random stroll distance around its
    // home slot, random duration (speed), then a random pause before the next hop. So they never move/stop in
    // lockstep. While moving they bounce (hop); when idle they do a slow bob.
    useEffect(() => {
        if (!pets.length) return undefined;
        const timers = [];
        const push = (t) => timers.push(t);
        const step = (i) => {
            const nx = clamp(homeX(i) + rand(-8, 8), 1, 99);
            const ny = 78 + rand(0, 14); // stay low on the grass — never drift high
            const dur = rand(1.3, 3.8); // different speeds each hop
            setPos((prev) => {
                if (!prev[i]) return prev;
                const next = prev.slice();
                next[i] = { ...prev[i], x: nx, y: ny, flip: nx < prev[i].x, dur, moving: true };
                return next;
            });
            push(setTimeout(() => {
                setPos((prev) => {
                    if (!prev[i]) return prev;
                    const next = prev.slice();
                    next[i] = { ...prev[i], moving: false };
                    return next;
                });
                push(setTimeout(() => step(i), rand(500, 3000))); // idle pause, then wander again
            }, dur * 1000));
        };
        pets.forEach((_, i) => push(setTimeout(() => step(i), rand(150, 1800)))); // staggered starts
        return () => timers.forEach(clearTimeout);
    }, [pets.length, homeX]);

    const addFloater = useCallback((i, text, color) => {
        const id = ++floatId.current;
        const at = pos[i] || { x: 50, y: 60 };
        setFloaters((f) => [...f, { id, x: at.x, y: at.y, text, color }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1300);
    }, [pos]);

    const petIt = useCallback(async (pet, i) => {
        if (!farm.canPet || pet.petted || busy) return;
        setBusy(pet.id);
        addFloater(i, "❤️");
        const r = await fetch("/api/marketplace/farm", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "pet", petId: pet.id }),
        }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        setBusy(null);
        if (r?.ok) {
            addFloater(i, `+${r.xpGained} XP`, "#ffe27a");
            setFarm((f) => ({ ...f, pets: f.pets.map((p) => (p.id === pet.id ? { ...p, petted: true, level: r.level } : p)) }));
        } else {
            // already petted today (or the request failed) — mark it petted so the glow/affordance updates
            setFarm((f) => ({ ...f, pets: f.pets.map((p) => (p.id === pet.id ? { ...p, petted: true } : p)) }));
        }
    }, [farm.canPet, busy, addFloater]);

    const pettableLeft = farm.canPet ? pets.filter((p) => !p.petted).length : 0;
    // Wider pasture as you own more pets → they spread out and the field scrolls sideways.
    const fieldW = Math.max(100, pets.length * 13);

    return (
        <div className="stack reveal">
            <style>{`
                @keyframes farmBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
                @keyframes farmHop { 0% { transform: translateY(0) scaleY(1) } 25% { transform: translateY(-13px) scaleY(1.05) } 55% { transform: translateY(0) scaleY(0.92) } 70% { transform: translateY(-4px) } 100% { transform: translateY(0) scaleY(1) } }
                @keyframes farmFloat { 0% { opacity: 0; transform: translate(-50%, 0) scale(.8) } 15% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -46px) scale(1.1) } }
                @keyframes farmCloud { from { transform: translateX(0) } to { transform: translateX(40px) } }
                .farm-hop { animation-name: farmHop; animation-timing-function: ease-in-out; animation-iteration-count: infinite; transform-origin: bottom center; }
                .farm-idle { animation: farmBob 2.8s ease-in-out infinite; transform-origin: bottom center; }
                .farm-scroll { scrollbar-width: thin; }
            `}</style>

            <section className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ margin: 0 }}>🌾 {farm.mine ? "Your Farm" : `${farm.owner.name}'s Farm`}</h1>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                        {pets.length} pet{pets.length === 1 ? "" : "s"} roaming
                        {farm.canPet ? ` · tap a pet to pet it (+${farm.petXp} XP, once/day)` : " · view-only"}
                        {farm.canPet && pettableLeft > 0 ? ` · ${pettableLeft} left to pet today` : farm.canPet ? " · all petted today ❤️" : ""}
                    </p>
                </div>
                <div style={{ marginLeft: "auto" }}>
                    {!farm.mine ? (
                        <button type="button" className="btn" onClick={() => router.push("/marketplace/farm")}>← My farm</button>
                    ) : null}
                </div>
            </section>

            <FarmInspect current={viewingAlias} />

            {/* The pasture — scrolls sideways when there are lots of pets */}
            <div className="farm-scroll" style={{ width: "100%", overflowX: "auto", overflowY: "hidden", borderRadius: 16 }}>
                <div
                    style={{
                        position: "relative", width: `${fieldW}%`, minWidth: "100%", height: "min(52vh, 420px)",
                        background: "linear-gradient(180deg, #8fd0ff 0%, #bfe6f5 40%, #cdeeda 54%, #86ce69 60%, #63b048 100%)",
                        boxShadow: "inset 0 -30px 60px rgba(0,0,0,0.12)", userSelect: "none",
                    }}
                >
                    {/* Sun + clouds (kept near the start so they're visible before you scroll) */}
                    <div style={{ position: "absolute", top: 20, left: 28, width: 60, height: 60, borderRadius: "50%", background: "radial-gradient(circle, #fff3b0 0%, #ffd75e 70%, rgba(255,215,94,0) 72%)" }} />
                    <div style={{ position: "absolute", top: 34, left: "22%", width: 84, height: 24, borderRadius: 20, background: "rgba(255,255,255,0.85)", filter: "blur(1px)", animation: "farmCloud 9s ease-in-out infinite alternate" }} />
                    <div style={{ position: "absolute", top: 62, left: "58%", width: 60, height: 18, borderRadius: 16, background: "rgba(255,255,255,0.7)", filter: "blur(1px)", animation: "farmCloud 12s ease-in-out infinite alternate" }} />
                    {/* Fence at the grass horizon — posts + two rails */}
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 40, opacity: 0.92 }}>
                        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, #8a5c31 0 5px, transparent 5px 42px)" }} />
                        <div style={{ position: "absolute", left: 0, right: 0, top: 8, height: 6, background: "#b07a45" }} />
                        <div style={{ position: "absolute", left: 0, right: 0, top: 26, height: 6, background: "#b07a45" }} />
                    </div>

                    {pets.length === 0 ? (
                        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#3a5f2a", fontWeight: 600 }}>
                            No pets yet — collect some and they&apos;ll roam here.
                        </div>
                    ) : null}

                    {pets.map((pet, i) => {
                        const p = pos[i] || { x: 50, y: 82, flip: false, dur: 2, moving: false, hopMs: 500 };
                        const canTap = farm.canPet && !pet.petted;
                        return (
                            <button
                                key={pet.id}
                                type="button"
                                onClick={() => petIt(pet, i)}
                                title={`${pet.name} · Lv ${pet.level}${pet.petted ? " · petted today" : canTap ? " · tap to pet" : ""}`}
                                style={{
                                    position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -100%)",
                                    transition: `left ${p.dur}s linear, top ${p.dur}s linear`,
                                    background: "none", border: "none", padding: 0, cursor: canTap ? "pointer" : "default", zIndex: Math.round(p.y),
                                }}
                            >
                                <span
                                    className={p.moving ? "farm-hop" : "farm-idle"}
                                    style={{ display: "block", position: "relative", animationDuration: p.moving ? `${p.hopMs}ms` : undefined }}
                                >
                                    {/* soft ground shadow */}
                                    <span style={{ position: "absolute", left: "50%", bottom: -5, width: 36, height: 10, transform: "translateX(-50%)", background: "radial-gradient(ellipse, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 70%)" }} />
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={pet.spriteUrl}
                                        alt={pet.name}
                                        width={58}
                                        height={58}
                                        style={{
                                            width: 58, height: 58, objectFit: "contain",
                                            transform: p.flip ? "scaleX(-1)" : "none",
                                            filter: canTap ? "drop-shadow(0 0 5px rgba(255,226,122,0.9))" : "drop-shadow(0 3px 4px rgba(0,0,0,0.35))",
                                        }}
                                    />
                                    {pet.petted ? <span style={{ position: "absolute", top: -4, right: 0, fontSize: 13 }}>❤️</span> : null}
                                </span>
                                <span style={{ display: "block", textAlign: "center", marginTop: 1, fontSize: 10, fontWeight: 700, color: "#243b16", textShadow: "0 1px 2px rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>
                                    {pet.name} <span style={{ color: RARITY_RING[pet.rarity] || "#243b16" }}>·L{pet.level}</span>
                                </span>
                            </button>
                        );
                    })}

                    {/* XP / heart floaters */}
                    {floaters.map((f) => (
                        <span key={f.id} style={{ position: "absolute", left: `${f.x}%`, top: `${f.y}%`, transform: "translate(-50%, -120%)", fontWeight: 800, fontSize: 15, color: f.color || "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)", pointerEvents: "none", animation: "farmFloat 1.3s ease-out forwards", zIndex: 9999 }}>
                            {f.text}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Owner tool: type a member's @alias (live search) to walk over and watch their farm.
function FarmInspect({ current }) {
    const router = useRouter();
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const term = q.trim().replace(/^@/, "");
        const t = setTimeout(async () => {
            if (term.length < 2) { setResults([]); return; }
            const r = await fetch(`/api/marketplace/members?q=${encodeURIComponent(term)}`, { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
            setResults((r?.members || []).filter((m) => m.alias).slice(0, 8));
        }, 250);
        return () => clearTimeout(t);
    }, [q]);

    return (
        <section className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>🔎 Visit another farm</strong>
                <span className="muted" style={{ fontSize: 12 }}>Owner-only</span>
            </div>
            <div style={{ position: "relative", marginTop: 8 }}>
                <input
                    type="text"
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                    placeholder="Search a member by @alias or name…"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(128,128,128,0.4)", background: "transparent", color: "inherit" }}
                />
                {open && results.length ? (
                    <div style={{ position: "absolute", zIndex: 50, left: 0, right: 0, marginTop: 4, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(128,128,128,0.35)", background: "var(--card-bg, #17181c)" }}>
                        {results.map((m) => (
                            <button
                                key={m.id || m.alias}
                                type="button"
                                onClick={() => { setOpen(false); setQ(""); router.push(`/marketplace/farm?u=${encodeURIComponent(m.alias)}`); }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                            >
                                {m.displayLabel || m.alias} <span className="muted">@{m.alias}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            {current ? <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>Viewing @{current}&apos;s farm.</p> : null}
        </section>
    );
}
