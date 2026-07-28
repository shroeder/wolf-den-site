"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── THE WOLF DEN TOWN (walkable social plaza) ─────────────────────────────────────────────────────────────
// Your hero sprite walks the square (tap where you want to go); other recently-active members appear as their
// own hero sprites with a live status, idle-wandering so it feels alive. Buildings ring the plaza and fast-
// travel into each game system. Movement is smooth via CSS transitions (no canvas / websockets) — poll + tween.

// Canonical sprite art faces RIGHT; scaleX(-1) faces left. `flip` = the art's backwards-correction. To face the
// travel direction: mirror when (flip XOR movingLeft) — same convention as the farm.
const spriteTransform = (flip, facing) => ((Boolean(flip) !== (facing === -1)) ? "scaleX(-1)" : "none");
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function Avatar({ a, isYou }) {
    // Walk speed: transition duration scales with distance so everyone moves at a steady pace.
    const dur = clamp((a.moveDist || 0) * 0.06, 0.4, 2.4);
    return (
        <div
            className={`tw-av${isYou ? " is-you" : ""}`}
            style={{ left: `${a.x}%`, top: `${a.y}%`, zIndex: Math.round(a.y) + (isYou ? 100 : 0), transition: `left ${dur}s linear, top ${dur}s linear` }}
        >
            <div className="tw-bubble">{a.status || (isYou ? "🐺 you" : "🐺 around town")}</div>
            <div className={`tw-sprite${a.moving ? " is-walking" : ""}`}>
                {a.sprite ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.sprite} alt={a.name} draggable={false} style={{ transform: spriteTransform(a.flip, a.facing) }} />
                ) : (
                    <span className="tw-sprite-fallback" style={{ transform: spriteTransform(a.flip, a.facing) }}>🐺</span>
                )}
                {a.wave ? <span className="tw-wave">👋</span> : null}
            </div>
            <div className="tw-name">{isYou ? "You" : a.name}</div>
        </div>
    );
}

export default function TownClient({ initial }) {
    const [state, setState] = useState(initial || null);
    const [me, setMe] = useState(() => ({ x: initial?.you?.x ?? 50, y: initial?.you?.y ?? 76, facing: initial?.you?.facing ?? 1, moving: false, moveDist: 0, wave: false }));
    const [others, setOthers] = useState({}); // id -> live client position/state
    const sceneRef = useRef(null);
    const moveTimer = useRef(null);

    // Poll the server for the roster + statuses; reconcile into `others` (keep ambient positions client-side).
    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/town", { cache: "no-store" }).catch(() => null);
        const d = r?.ok ? await r.json().catch(() => null) : null;
        if (!d) return;
        setState(d);
        setOthers((prev) => {
            const next = {};
            for (const p of d.players || []) {
                const cur = prev[p.id];
                const home = { x: p.x, y: p.y };
                if (p.walking) {
                    // Real mover — snap toward server position.
                    next[p.id] = { ...p, home, x: p.x, y: p.y, facing: p.facing, moving: cur ? dist(cur, p) > 1 : false, moveDist: cur ? dist(cur, p) : 0 };
                } else if (cur) {
                    // Ambient — keep the client-wandered position, refresh status/roster.
                    next[p.id] = { ...cur, ...p, home, x: cur.x, y: cur.y, facing: cur.facing };
                } else {
                    next[p.id] = { ...p, home, moving: false, moveDist: 0 };
                }
            }
            return next;
        });
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 2500);
        return () => clearInterval(t);
    }, [load]);

    // Ambient wander: nudge idle players around their home slot so the plaza feels alive.
    useEffect(() => {
        const t = setInterval(() => {
            setOthers((prev) => {
                const next = { ...prev };
                for (const [id, p] of Object.entries(prev)) {
                    if (p.walking) continue;
                    if (Math.random() < 0.45) {
                        const nx = clamp((p.home?.x ?? p.x) + (Math.random() - 0.5) * 16, 6, 94);
                        const ny = clamp((p.home?.y ?? p.y) + (Math.random() - 0.5) * 10, 58, 92);
                        next[id] = { ...p, x: nx, y: ny, facing: nx < p.x ? -1 : 1, moving: true, moveDist: dist(p, { x: nx, y: ny }) };
                    } else if (p.moving) {
                        next[id] = { ...p, moving: false };
                    }
                }
                return next;
            });
        }, 2600);
        return () => clearInterval(t);
    }, []);

    // Tap the ground to walk there.
    const walkTo = useCallback((clientX, clientY) => {
        const el = sceneRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = clamp(((clientX - rect.left) / rect.width) * 100, 3, 97);
        const y = clamp(((clientY - rect.top) / rect.height) * 100, 52, 93);
        setMe((m) => {
            const facing = x < m.x ? -1 : 1;
            const d = dist(m, { x, y });
            // Persist position (throttled) so future participants see where you are.
            clearTimeout(moveTimer.current);
            moveTimer.current = setTimeout(() => {
                fetch("/api/marketplace/town", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ x, y, facing }) }).catch(() => {});
            }, 250);
            return { ...m, x, y, facing, moving: true, moveDist: d };
        });
    }, []);

    const onSceneClick = useCallback((e) => {
        if (e.target.closest(".tw-building") || e.target.closest(".tw-av")) return; // let doors/avatars handle their own taps
        walkTo(e.clientX, e.clientY);
    }, [walkTo]);

    const wave = useCallback(() => {
        setMe((m) => ({ ...m, wave: true }));
        setTimeout(() => setMe((m) => ({ ...m, wave: false })), 1600);
    }, []);

    const you = state?.you;
    const buildings = state?.buildings || [];
    const otherList = useMemo(() => Object.values(others), [others]);

    if (state && state.owner === false) {
        return <section className="card"><p className="muted" style={{ margin: 0 }}>🏘️ The Wolf Den Town is still being built — check back soon.</p></section>;
    }

    return (
        <div className="stack reveal">
            <section className="card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h1 style={{ margin: 0, fontSize: "1.25rem" }}>🏘️ Wolf Den Town</h1>
                    <span className="tw-online">🟢 {state?.onlineCount ?? 1} around</span>
                    <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "#c58b3a", fontWeight: 800 }}>OWNER PREVIEW</span>
                </div>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>Tap the ground to walk. Tap a building to head there. You&apos;re seeing real members who are online right now.</p>
            </section>

            <div ref={sceneRef} className="tw-scene" onClick={onSceneClick} role="presentation">
                <div className="tw-sky" aria-hidden="true" />
                <div className="tw-ground" aria-hidden="true" />
                {/* Buildings */}
                {buildings.map((b) => (
                    <Link key={b.id} href={b.href} className="tw-building" style={{ left: `${b.x}%`, top: `${b.y}%`, zIndex: Math.round(b.y) }} onClick={(e) => e.stopPropagation()}>
                        <span className="tw-building-roof" aria-hidden="true" />
                        <span className="tw-building-emoji">{b.emoji}</span>
                        <span className="tw-building-label">{b.label}</span>
                    </Link>
                ))}
                {/* Other players */}
                {otherList.map((p) => <Avatar key={p.id} a={p} isYou={false} />)}
                {/* You */}
                {you ? <Avatar a={{ ...me, name: "You", sprite: you.sprite, flip: you.flip, status: "🐺 you" }} isYou /> : null}
            </div>

            <section className="card" style={{ padding: "10px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="tw-emote" onClick={wave}>👋 Wave</button>
                <span className="muted" style={{ fontSize: "0.78rem" }}>Others render where they&apos;re last active; once the town ships they&apos;ll walk it with you.</span>
            </section>

            <style>{TOWN_CSS}</style>
        </div>
    );
}

const TOWN_CSS = `
.tw-scene { position: relative; width: 100%; height: min(64vh, 520px); border-radius: 18px; overflow: hidden; cursor: pointer;
    box-shadow: inset 0 -30px 60px rgba(0,0,0,0.28), 0 10px 30px rgba(0,0,0,0.35); user-select: none; -webkit-user-select: none; }
.tw-sky { position: absolute; inset: 0 0 42% 0; background: linear-gradient(180deg, #2a2140 0%, #3b2d55 40%, #6b4d7a 78%, #a56b6b 100%); }
.tw-ground { position: absolute; inset: 46% 0 0 0; background:
    radial-gradient(120% 80% at 50% -10%, rgba(255,190,120,0.12), transparent 60%),
    repeating-linear-gradient(90deg, #55402c 0 38px, #5c4630 38px 76px),
    linear-gradient(180deg, #6a5138, #4a381f); box-shadow: inset 0 8px 24px rgba(0,0,0,0.35); }
.tw-online { font-size: 0.72rem; font-weight: 800; color: #8fe39a; background: rgba(143,227,154,0.12); border: 1px solid rgba(143,227,154,0.35); border-radius: 999px; padding: 2px 9px; }

.tw-building { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; text-decoration: none;
    padding: 8px 12px 9px; border-radius: 12px; background: linear-gradient(180deg, rgba(40,28,58,0.92), rgba(26,18,40,0.94)); border: 1px solid rgba(255,215,110,0.4);
    box-shadow: 0 8px 20px rgba(0,0,0,0.45); transition: transform .12s ease, box-shadow .12s ease; color: #ffe9b0; }
.tw-building:hover { transform: translate(-50%, -50%) translateY(-3px); box-shadow: 0 12px 26px rgba(0,0,0,0.55), 0 0 22px rgba(255,215,110,0.35); }
.tw-building-roof { position: absolute; top: -9px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 22px solid transparent; border-right: 22px solid transparent; border-bottom: 12px solid rgba(255,140,60,0.85); }
.tw-building-emoji { font-size: 26px; line-height: 1; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5)); }
.tw-building-label { font-size: 10.5px; font-weight: 800; white-space: nowrap; }

.tw-av { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.tw-sprite { position: relative; width: 58px; height: 58px; display: grid; place-items: center; }
.tw-sprite img { width: 58px; height: 58px; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5)); }
.tw-sprite-fallback { font-size: 40px; }
.tw-sprite.is-walking { animation: twBob .5s ease-in-out infinite; transform-origin: bottom center; }
@keyframes twBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.tw-av.is-you .tw-sprite::after { content: ""; position: absolute; bottom: -3px; left: 50%; transform: translateX(-50%); width: 40px; height: 8px; border-radius: 50%; background: radial-gradient(ellipse, rgba(255,215,110,0.5), transparent 70%); }
.tw-name { font-size: 10px; font-weight: 800; color: #f2ead9; background: rgba(20,14,30,0.7); border-radius: 6px; padding: 0 6px; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.tw-av.is-you .tw-name { color: #2a1a06; background: linear-gradient(180deg,#ffe488,#f3b23a); }
.tw-bubble { font-size: 10px; font-weight: 700; color: #eadfff; background: rgba(30,20,48,0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 999px; padding: 2px 8px; margin-bottom: 3px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.tw-wave { position: absolute; top: -6px; right: -8px; font-size: 20px; animation: twWave .5s ease-in-out infinite; }
@keyframes twWave { 0%,100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }

.tw-emote { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,215,110,0.5); background: linear-gradient(180deg, rgba(44,34,64,0.96), rgba(28,22,42,0.96)); color: #ffe9b0; font-weight: 800; font-size: 13px; cursor: pointer; }
.tw-emote:active { transform: translateY(1px); }
`;
