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

export default function FarmClient({ initial, viewingAlias }) {
    const router = useRouter();
    const [farm, setFarm] = useState(initial);
    const pets = farm.pets || [];
    // Deterministic initial spread (so server & client HTML match — no hydration mismatch); the wander effect
    // takes over on mount and moves everyone to random spots.
    const [pos, setPos] = useState(() => pets.map((_, i) => ({ x: 8 + ((i * 17) % 82), y: 48 + ((i * 11) % 36), flip: i % 2 === 0 })));
    const [floaters, setFloaters] = useState([]);
    const floatId = useRef(0);
    const [busy, setBusy] = useState(null);

    // Wander: every few seconds each pet ambles to a new random spot; CSS transitions animate the stroll, and
    // we flip the sprite to face its direction of travel.
    useEffect(() => {
        if (!pets.length) return undefined;
        const retarget = () =>
            setPos((prev) => prev.map((p) => {
                const nx = rand(5, 90);
                return { x: nx, y: rand(46, 86), flip: nx < p.x };
            }));
        const first = setTimeout(retarget, 350);
        const t = setInterval(retarget, 3600);
        return () => { clearTimeout(first); clearInterval(t); };
    }, [pets.length]);

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

    return (
        <div className="stack reveal">
            <style>{`
                @keyframes farmBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
                @keyframes farmFloat { 0% { opacity: 0; transform: translate(-50%, 0) scale(.8) } 15% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -46px) scale(1.1) } }
                @keyframes farmCloud { from { transform: translateX(0) } to { transform: translateX(40px) } }
                .farm-pet { transition: left 3.4s ease-in-out, top 3.4s ease-in-out; }
                .farm-pet-bob { animation: farmBob 2.4s ease-in-out infinite; }
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

            {/* The pasture */}
            <div
                style={{
                    position: "relative", width: "100%", height: "min(64vh, 560px)", borderRadius: 16, overflow: "hidden",
                    background: "linear-gradient(180deg, #8fd0ff 0%, #bfe6f5 40%, #cdeeda 54%, #86ce69 60%, #63b048 100%)",
                    boxShadow: "inset 0 -30px 60px rgba(0,0,0,0.12)", userSelect: "none",
                }}
            >
                {/* Sun + clouds */}
                <div style={{ position: "absolute", top: 24, right: 40, width: 64, height: 64, borderRadius: "50%", background: "radial-gradient(circle, #fff3b0 0%, #ffd75e 70%, rgba(255,215,94,0) 72%)" }} />
                <div style={{ position: "absolute", top: 40, left: "12%", width: 90, height: 26, borderRadius: 20, background: "rgba(255,255,255,0.85)", filter: "blur(1px)", animation: "farmCloud 9s ease-in-out infinite alternate" }} />
                <div style={{ position: "absolute", top: 74, left: "48%", width: 64, height: 20, borderRadius: 16, background: "rgba(255,255,255,0.7)", filter: "blur(1px)", animation: "farmCloud 12s ease-in-out infinite alternate" }} />
                {/* Fence line at the grass horizon */}
                <div style={{ position: "absolute", top: "58%", left: 0, right: 0, height: 14, background: "repeating-linear-gradient(90deg, #b07a45 0 6px, transparent 6px 34px)", borderTop: "3px solid #8a5c31", opacity: 0.85 }} />

                {pets.length === 0 ? (
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#3a5f2a", fontWeight: 600 }}>
                        No pets yet — collect some and they&apos;ll roam here.
                    </div>
                ) : null}

                {pets.map((pet, i) => {
                    const p = pos[i] || { x: 50, y: 60, flip: false };
                    const canTap = farm.canPet && !pet.petted;
                    return (
                        <button
                            key={pet.id}
                            type="button"
                            onClick={() => petIt(pet, i)}
                            className="farm-pet"
                            title={`${pet.name} · Lv ${pet.level}${pet.petted ? " · petted today" : canTap ? " · tap to pet" : ""}`}
                            style={{
                                position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -100%)",
                                background: "none", border: "none", padding: 0, cursor: canTap ? "pointer" : "default", zIndex: Math.round(p.y),
                            }}
                        >
                            <span className="farm-pet-bob" style={{ display: "block", position: "relative" }}>
                                {/* soft ground shadow */}
                                <span style={{ position: "absolute", left: "50%", bottom: -6, width: 46, height: 12, transform: "translateX(-50%)", background: "radial-gradient(ellipse, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 70%)" }} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={pet.spriteUrl}
                                    alt={pet.name}
                                    width={78}
                                    height={78}
                                    style={{
                                        width: 78, height: 78, objectFit: "contain",
                                        transform: p.flip ? "scaleX(-1)" : "none",
                                        filter: canTap ? "drop-shadow(0 0 6px rgba(255,226,122,0.9))" : "drop-shadow(0 3px 4px rgba(0,0,0,0.35))",
                                    }}
                                />
                                {pet.petted ? <span style={{ position: "absolute", top: -4, right: 2, fontSize: 16 }}>❤️</span> : null}
                            </span>
                            <span style={{ display: "block", textAlign: "center", marginTop: 2, fontSize: 11, fontWeight: 700, color: "#243b16", textShadow: "0 1px 2px rgba(255,255,255,0.6)" }}>
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
