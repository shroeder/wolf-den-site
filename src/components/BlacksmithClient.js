"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GiAnvilImpact, GiCrackedShield, GiUpgrade } from "react-icons/gi";

import HowToPlay from "@/components/HowToPlay";
import ItemArt from "@/components/ItemArt";
import ForgeRank from "@/components/ForgeRank";
import CoinCta from "@/components/CoinCta";

// ── The Forge (owner-gated blacksmith). Salvage unequipped gear → tiered parts → combine 5→1 → enhance equipped
// gear via a hammer-&-anvil timing mini-game whose execution drives the stat roll. Juiced to high heaven.

const RARITY_COLOR = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const rc = (r) => RARITY_COLOR[r] || "#9aa0a6";

// ── tiny WebAudio SFX (no assets): a forge clang that rings brighter the better the strike ──
let _ac = null;
const ac = () => { if (typeof window === "undefined") return null; try { _ac = _ac || new (window.AudioContext || window.webkitAudioContext)(); if (_ac.state === "suspended") _ac.resume(); return _ac; } catch { return null; } };
function clang(freq = 320, dur = 0.16, type = "triangle", gain = 0.12) {
    const a = ac(); if (!a) return;
    try {
        const o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(gain, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
    } catch { /* ignore */ }
}
const SFX = {
    good: () => clang(300, 0.14, "sine", 0.08),
    great: () => { clang(440, 0.16); },
    perfect: () => { clang(560, 0.18); setTimeout(() => clang(720, 0.14, "sine"), 40); },
    pixel: () => { clang(660, 0.2); setTimeout(() => clang(880, 0.16, "sine"), 45); setTimeout(() => clang(1100, 0.14, "sine"), 95); },
    miss: () => clang(150, 0.22, "sawtooth", 0.09),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => clang(f, 0.2, "sine", 0.1), i * 90)); },
};

// Grade bands by distance from the target center (0..0.5). Combo continues ONLY on great+; good & miss reset it.
const BANDS = [
    { key: "pixel", max: 0.022, score: 4, label: "PIXEL PERFECT", color: "#ffd75e" },
    { key: "perfect", max: 0.055, score: 3, label: "PERFECT", color: "#8fe3ff" },
    { key: "great", max: 0.10, score: 2, label: "GREAT", color: "#8fe39a" },
    { key: "good", max: 0.16, score: 1, label: "GOOD", color: "#d7c48a" },
];
const gradeFor = (dist, widen = 0) => BANDS.find((b) => dist <= b.max + widen) || { key: "miss", score: 0, label: "MISS", color: "#ff8f9a" };
const STRIKES = 6;

const EMPTY_FORGE = { parts: [], salvage: [], enhance: [], upgrades: [], dailies: [], regalia: null, hearthBg: null };

export default function BlacksmithClient({ initial }) {
    // Always keep forge a valid object (never null) so render-time reads like dep arrays don't crash while loading.
    const [forge, setForge] = useState(initial || EMPTY_FORGE);
    const [loading, setLoading] = useState(!initial);
    const [forbidden, setForbidden] = useState(false);
    const [busy, setBusy] = useState(null);
    const [tab, setTab] = useState("enhance");
    const [enhancing, setEnhancing] = useState(null); // the equipped item being enhanced (opens the mini-game)
    const [toast, setToast] = useState(null);
    const [salvageBurst, setSalvageBurst] = useState(null);

    const post = useCallback(async (body, key) => {
        setBusy(key || body.action);
        try {
            const r = await fetch("/api/marketplace/crafting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            const d = await r.json().catch(() => ({}));
            if (d && (d.parts || d.salvage)) setForge(d);
            return d;
        } finally { setBusy(null); }
    }, []);

    const doSalvage = useCallback(async (item) => {
        const r = await post({ action: "salvage", itemId: item.id }, `sv-${item.id}`);
        if (r?.ok) {
            const t = forge.parts?.find((p) => p.tier === r.gained.tier);
            setSalvageBurst({ k: Date.now(), n: r.gained.n, name: t?.name || "parts", color: t?.color || "#ffd75e" });
            SFX.great();
            setTimeout(() => setSalvageBurst(null), 1400);
            if (r.regaliaDrop) { SFX.win(); setToast({ kind: "regalia", text: `⚒️ You forged a Blacksmith's Regalia piece — ${r.regaliaDrop}! Equip it to boost your salvaging.` }); }
        } else if (r?.error) setToast(salvageErr(r.error));
    }, [post, forge.parts]);

    const doCombine = useCallback(async (tier) => {
        const r = await post({ action: "combine", tier }, `cb-${tier}`);
        if (r?.ok) SFX.perfect();
    }, [post]);

    const doUpgrade = useCallback(async (key) => {
        const r = await post({ action: "upgrade", key }, `up-${key}`);
        if (r?.ok) SFX.great();
        else if (r?.error) setToast({ kind: "err", text: r.error === "no_gold" ? "Not enough gold for that upgrade." : "Couldn't buy that." });
    }, [post]);

    const doClaimDaily = useCallback(async (key) => {
        const r = await post({ action: "claim_daily", key }, `dl-${key}`);
        if (r?.ok) SFX.perfect();
    }, [post]);

    // Called by the mini-game with the player's execution → server rolls the stat bump.
    const applyEnhance = useCallback(async (item, result) => {
        const r = await post({ action: "enhance", itemId: item.id, quality: result.quality, grade: result.grade, combo: result.combo }, `en-${item.id}`);
        setEnhancing(null);
        if (r?.ok) { SFX.win(); setToast({ kind: "enhance", name: item.name, level: r.level, gained: r.gained, grade: r.grade, xp: r.xp, doubled: r.doubled }); setTimeout(() => setToast(null), 4200); }
        else setToast({ kind: "err", text: enhanceErr(r?.error, r?.need) });
    }, [post]);

    useEffect(() => { const t = toast && toast.kind !== "enhance" ? setTimeout(() => setToast(null), 2600) : null; return () => t && clearTimeout(t); }, [toast]);

    // When the server couldn't resolve the session (e.g. a bearer-token app session on a full-page nav), fetch
    // the OWNER-GATED forge state from the API — it carries the token and 403s non-owners.
    useEffect(() => {
        if (initial) return undefined;
        let alive = true;
        fetch("/api/marketplace/crafting", { cache: "no-store" })
            .then(async (r) => {
                if (!alive) return;
                if (r.status === 403 || r.status === 401) { setForbidden(true); setLoading(false); return; }
                const d = await r.json().catch(() => null);
                if (d && (d.parts || d.salvage)) setForge(d);
                setLoading(false);
            })
            .catch(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [initial]);

    if (forbidden) return <div className="stack reveal"><section className="card" style={{ textAlign: "center", padding: 28 }}><h1 style={{ marginTop: 0 }}>🔨 The Forge</h1><p className="muted">The Forge is owner-only right now.</p></section></div>;
    if (loading) return <div className="stack reveal"><section className="card" style={{ textAlign: "center", padding: 28 }}><h1 style={{ marginTop: 0 }}>🔨 The Forge</h1><p className="muted">Stoking the hearth…</p></section></div>;

    const parts = forge.parts || [];
    const salvage = forge.salvage || [];
    const enhance = forge.enhance || [];
    const bg = forge.hearthBg && !forge.hearthBg.startsWith("__") ? forge.hearthBg : null;

    // Live status line for the hero scene (mirrors the farm/sailing HUD strips).
    const totalParts = parts.reduce((s, p) => s + (p.count || 0), 0);
    const bestLvl = enhance.reduce((m, it) => Math.max(m, it.level || 0), 0);
    const statusBits = [`${totalParts} part${totalParts === 1 ? "" : "s"} ready`];
    if (bestLvl > 0) statusBits.push(`best forge +${bestLvl}`);
    if (forge.regalia?.equipped) statusBits.push(`${forge.regalia.equipped}/${forge.regalia.total} regalia worn`);

    return (
        <div className="stack reveal forge">
            <style>{FORGE_CSS}</style>

            <HowToPlay
                id="forge"
                emoji="🔥"
                title="the Forge"
                accent="#ff9a3c"
                tagline="Salvage spare gear into parts, then hammer them into your equipped gear to make it stronger."
                steps={[
                    "Salvage gear you're not using — each piece breaks into forge parts (rarer gear → higher-tier parts).",
                    "Combine 5 parts of a tier into 1 of the next tier.",
                    "Enhance an equipped item: time your hammer strikes on the anvil — Great, Perfect & Pixel-Perfect keep your combo and roll bigger stat gains.",
                    "Better timing = better roll + more XP. Enhance as many times as you like; the part cost climbs slowly.",
                ]}
            />

            {/* The hearth — an immersive scene, like the farm's pasture and sailing's open sea. */}
            <div className="forge-scene" style={bg ? { backgroundImage: `linear-gradient(180deg, rgba(20,10,4,0.15), rgba(20,10,4,0.82)), url(${bg})` } : undefined}>
                <div className="forge-emberlayer" aria-hidden="true">{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ left: `${(i * 7 + 4) % 100}%`, animationDelay: `${(i * 0.7) % 5}s`, animationDuration: `${4 + (i % 5)}s` }} />)}</div>
                <div className="forge-scene-inner">
                    <div className="forge-head">
                        <h1 className="forge-title">The Forge</h1>
                        <span className="forge-owner">owner</span>
                    </div>
                    <p className="forge-tagline">{statusBits.join(" · ")}</p>
                </div>
                {salvageBurst ? (
                    <div className="forge-burst" key={salvageBurst.k} style={{ "--pc": salvageBurst.color }}>
                        <span>+{salvageBurst.n}</span> {salvageBurst.name}
                    </div>
                ) : null}
            </div>

            {/* Daily forge tasks. */}
            {(forge.dailies || []).length ? (
                <section className="card forge-panel">
                    <h3 className="forge-panel-h">🔥 Today&apos;s forge tasks</h3>
                    <div className="forge-dailies">
                        {(forge.dailies || []).map((q) => (
                            <div key={q.key} className={`forge-daily${q.done ? " is-done" : ""}${q.claimed ? " is-claimed" : ""}`}>
                                <div className="forge-daily-body">
                                    <b>{q.label}</b>
                                    <div className="forge-daily-bar"><span style={{ width: `${Math.round((q.progress / q.need) * 100)}%` }} /></div>
                                    <span className="forge-daily-prog">{q.progress}/{q.need} · {q.rewardLabel}</span>
                                </div>
                                {q.claimed ? <span className="forge-daily-tag done">✓ claimed</span>
                                    : q.done ? <button type="button" className="forge-daily-claim" disabled={Boolean(busy)} onClick={() => doClaimDaily(q.key)}>{busy === `dl-${q.key}` ? "…" : "Claim"}</button>
                                        : <span className="forge-daily-tag">{q.need - q.progress} to go</span>}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* Materials — tiered parts + the Blacksmith's Regalia set. */}
            <section className="card forge-panel">
                <h3 className="forge-panel-h">⛓️ Forge materials</h3>
                <div className="forge-parts">
                    {parts.map((p) => (
                        <div key={p.tier} className="forge-part" style={{ "--pc": p.color }}>
                            {p.sprite
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img className="forge-partimg" src={p.sprite} alt={p.name} />
                                : <span className="forge-ingot" aria-hidden="true" />}
                            <span className="forge-part-body">
                                <b>{p.count}</b>
                                <span className="forge-part-name">{p.name}</span>
                            </span>
                            {p.canCombine ? (
                                <button type="button" className="forge-combine" disabled={Boolean(busy)} onClick={() => doCombine(p.tier)} title={`Combine ${forge.combineCost} → 1 ${parts[p.tier]?.name || "next tier"}`}>
                                    {busy === `cb-${p.tier}` ? "…" : `Combine ${forge.combineCost}→1`}
                                </button>
                            ) : p.tier < (forge.maxTier || 5) ? <span className="forge-part-hint">{Math.max(0, (forge.combineCost || 5) - p.count)} to combine</span> : <span className="forge-part-hint">top tier</span>}
                        </div>
                    ))}
                </div>

                {/* Blacksmith's Regalia — the salvaging set (pieces drop from salvaging; wearing them boosts output). */}
                {forge.regalia ? (
                    <div className="forge-regalia">
                        <div className="forge-regalia-head">
                            <span className="forge-regalia-title">Blacksmith&apos;s Regalia</span>
                            <span className="forge-regalia-count">{forge.regalia.equipped}/{forge.regalia.total} worn · {forge.regalia.owned}/{forge.regalia.total} found</span>
                        </div>
                        <div className="forge-regalia-row">
                            {forge.regalia.pieces.map((p) => (
                                <span key={p.id} className={`forge-regalia-piece${p.equipped ? " is-equipped" : p.owned ? " is-owned" : ""}`} title={`${p.name}${p.equipped ? " — worn" : p.owned ? " — owned (equip it!)" : " — not forged yet"}`}>
                                    {p.owned && p.sprite ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={p.sprite} alt={p.name} />
                                    ) : <span className="forge-regalia-glyph">{p.owned ? "★" : "?"}</span>}
                                </span>
                            ))}
                        </div>
                        <div className="forge-regalia-bonus" style={{ color: forge.regalia.bonus.tier > 0 ? "#8fe3a1" : "#b9a892" }}>{forge.regalia.bonus.label}</div>
                    </div>
                ) : null}
            </section>

            {/* Actions — enhance / salvage / perks. */}
            <section className="card forge-panel">
                <div className="forge-tabs">
                    <button type="button" className={tab === "enhance" ? "on" : ""} onClick={() => setTab("enhance")}>
                        <GiAnvilImpact aria-hidden="true" />
                        <span className="forge-tab-lbl">Enhance<em className="forge-tab-ct">{enhance.length}</em></span>
                    </button>
                    <button type="button" className={tab === "salvage" ? "on" : ""} onClick={() => setTab("salvage")}>
                        <GiCrackedShield aria-hidden="true" />
                        <span className="forge-tab-lbl">Salvage<em className="forge-tab-ct">{salvage.length}</em></span>
                    </button>
                    <button type="button" className={tab === "upgrades" ? "on" : ""} onClick={() => setTab("upgrades")}>
                        <GiUpgrade aria-hidden="true" />
                        <span className="forge-tab-lbl">Perks</span>
                    </button>
                </div>

                {tab === "enhance" ? (
                    <div className="forge-grid">
                        {enhance.length ? enhance.map((it) => (
                            <button key={it.id} type="button" className="forge-card is-enhance" style={{ "--rc": rc(it.rarity) }} disabled={Boolean(busy)} onClick={() => { ac(); setEnhancing(it); }}>
                                {it.level > 0 ? <span className="forge-cardrank"><ForgeRank level={it.level} size={30} /></span> : null}
                                <ItemArt id={it.id} icon={it.icon} className="forge-art" alt={it.name} />
                                <span className="forge-card-name">{it.name}</span>
                                <span className="forge-card-stats">{it.stats || "—"}</span>
                                {it.bonus ? <span className="forge-card-bonus">forged: {it.bonus}</span> : null}
                                <span className="forge-card-cost">
                                    {parts[it.cost.tier - 1]?.sprite
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img className="forge-cost-ico" src={parts[it.cost.tier - 1].sprite} alt="" /> : null}
                                    {it.cost.qty} × {parts[it.cost.tier - 1]?.name || `T${it.cost.tier}`}
                                </span>
                            </button>
                        )) : <div className="forge-empty">Equip some gear first — enhancement works on what you&apos;re wearing.</div>}
                    </div>
                ) : tab === "salvage" ? (
                    <div className="forge-grid">
                        {salvage.length ? salvage.map((it) => (
                            <button key={it.id} type="button" className="forge-card is-salvage" style={{ "--rc": rc(it.rarity) }} disabled={Boolean(busy)} onClick={() => doSalvage(it)}>
                                <ItemArt id={it.id} icon={it.icon} className="forge-art" alt={it.name} />
                                <span className="forge-card-name">{it.name}</span>
                                <span className="forge-card-stats" style={{ color: rc(it.rarity) }}>{it.rarity}</span>
                                <span className="forge-card-cost">
                                    {parts[it.salvageTier - 1]?.sprite
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img className="forge-cost-ico" src={parts[it.salvageTier - 1].sprite} alt="" /> : null}
                                    yields {parts[it.salvageTier - 1]?.name || `T${it.salvageTier}`}
                                </span>
                                {busy === `sv-${it.id}` ? <span className="forge-working">forging…</span> : null}
                            </button>
                        )) : <div className="forge-empty">Nothing spare to salvage — every item you own is equipped.</div>}
                    </div>
                ) : (
                    <>
                        <div className="sail-upgrades is-forge">
                            {(forge.upgrades || []).map((u) => {
                                const affordable = u.cost != null && (forge.gold || 0) >= u.cost;
                                return (
                                    <div className={`sail-upg${u.cost == null ? " is-maxed" : ""}`} key={u.key}>
                                        <div className="sail-upg-top">
                                            <span className="sail-upg-title"><span className="sail-upg-ico">{u.emoji}</span>{u.name}</span>
                                            <span className="muted sail-upg-lv">Lv {u.level}/{u.max}</span>
                                        </div>
                                        <div className="sail-upg-bar" aria-hidden="true"><span style={{ width: `${u.max ? Math.min(100, (u.level / u.max) * 100) : 0}%` }} /></div>
                                        <p className="muted sail-upg-desc">{u.desc}</p>
                                        {u.eff ? (
                                            <div className="sail-upg-effect">
                                                <span>{u.eff.label}</span>
                                                <b>{u.eff.now}{u.cost == null ? "" : <> → <span className="sail-upg-next">{u.eff.next}</span></>}</b>
                                            </div>
                                        ) : null}
                                        {u.cost == null ? <button type="button" className="pill" disabled>✓ Maxed</button>
                                            : !affordable ? <CoinCta price={u.cost} have={forge.gold || 0} className="sail-upg-cta" />
                                                : <button type="button" className="btn-ghost sail-upg-buy" disabled={Boolean(busy)} onClick={() => doUpgrade(u.key)}>{busy === `up-${u.key}` ? "…" : `🪙 ${u.cost.toLocaleString()}`}</button>}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="forge-gold">🪙 {(forge.gold || 0).toLocaleString()} gold on hand</div>
                    </>
                )}
            </section>

            {enhancing ? <EnhanceMinigame item={enhancing} parts={parts} steadyHand={forge.steadyHand || 0} onCancel={() => setEnhancing(null)} onDone={(res) => applyEnhance(enhancing, res)} busy={busy} /> : null}

            {toast ? (
                <div className={`forge-toast${toast.kind === "err" ? " is-err" : ""}`} role="status">
                    {toast.kind === "enhance" ? (
                        <>
                            <b>{toast.name} → +{toast.level}!</b>
                            {toast.doubled ? <span style={{ color: "#ffd75e", fontWeight: 800 }}>✦ MASTER&apos;S TOUCH — double gains!</span> : null}
                            <span>{toast.grade === "pixel" ? "PIXEL-PERFECT strike" : toast.grade === "perfect" ? "Perfect strike" : "Forged"} · {toast.gained} · +{toast.xp} XP</span>
                        </>
                    ) : <span>{toast.text}</span>}
                </div>
            ) : null}
        </div>
    );
}

const salvageErr = (e) => ({ kind: "err", text: { equipped: "That's equipped — unequip it first.", not_owned: "You don't own that.", bad_item: "Unknown item." }[e] || "Couldn't salvage that." });
const enhanceErr = (e, need) => (e === "not_enough" ? `Not enough parts — need ${need?.qty} of tier ${need?.tier}.` : e === "not_equipped" ? "Equip it first." : "Enhance failed — try again.");

// ── The hammer-&-anvil timing mini-game ─────────────────────────────────────────────────────────────────────
function EnhanceMinigame({ item, parts, steadyHand = 0, onCancel, onDone, busy }) {
    const [marker, setMarker] = useState(0.5); // 0..1 position on the heat bar
    const [strikeNo, setStrikeNo] = useState(0);
    const [saves, setSaves] = useState(steadyHand); // Steady Hand: slips that won't break the combo
    const savesRef = useRef(steadyHand);
    const [combo, setCombo] = useState(0);
    const [bestCombo, setBestCombo] = useState(0);
    const [score, setScore] = useState(0);
    const [maxScore, setMaxScore] = useState(0);
    const [pop, setPop] = useState(null); // { label, color, k }
    const [shakeXY, setShakeXY] = useState({ x: 0, y: 0 });
    const [sparks, setSparks] = useState([]);
    const [done, setDone] = useState(false);
    const raf = useRef(0);
    const t0 = useRef(0);
    const comboRef = useRef(0);
    const markerRef = useRef(0.5);
    const cost = item.cost;

    // Marker oscillation (triangle wave) — speeds up each strike for rising tension.
    useEffect(() => {
        if (done) return undefined;
        const period = Math.max(0.85, 1.7 - strikeNo * 0.13); // seconds per full sweep
        const loop = (ts) => {
            if (!t0.current) t0.current = ts;
            const phase = (((ts - t0.current) / 1000) % period) / period; // 0..1
            const pos = phase < 0.5 ? phase * 2 : 2 - phase * 2; // 0→1→0 triangle
            markerRef.current = pos; setMarker(pos);
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf.current);
    }, [strikeNo, done]);

    const strike = useCallback(() => {
        if (done) return;
        const dist = Math.abs(markerRef.current - 0.5);
        const g = gradeFor(dist, steadyHand * 0.015); // Steady Hand widens the timing bands
        let keepCombo = g.score >= 2; // Great+ keeps the combo; Good & Miss reset it
        let saved = false;
        if (!keepCombo && savesRef.current > 0) { keepCombo = true; saved = true; savesRef.current -= 1; setSaves(savesRef.current); } // a slip forgiven
        const curCombo = comboRef.current;
        const mult = 1 + curCombo * 0.2;
        const add = g.score * mult;
        const nextCombo = keepCombo ? curCombo + 1 : 0;
        comboRef.current = nextCombo;
        setCombo(nextCombo);
        setBestCombo((b) => Math.max(b, nextCombo));
        setScore((s) => s + add);
        setMaxScore((m) => m + 4 * mult);
        setPop({ label: saved ? `${g.label} · SAVED` : g.label, color: saved ? "#8fe3ff" : g.color, k: Date.now(), combo: nextCombo });
        (saved ? SFX.great : SFX[g.key] || SFX.miss)();
        // juice: spark burst + a shake scaled by grade
        const n = g.score >= 3 ? 14 : g.score >= 2 ? 9 : g.score >= 1 ? 5 : 2;
        setSparks(Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, a: Math.random() * 360, d: 30 + Math.random() * 60, c: g.color })));
        const mag = g.score >= 3 ? 10 : g.score >= 1 ? 5 : 8;
        setShakeXY({ x: (Math.random() * 2 - 1) * mag, y: (Math.random() * 2 - 1) * mag });
        setTimeout(() => setShakeXY({ x: 0, y: 0 }), 220);
        setTimeout(() => setSparks([]), 600);
        const nextStrike = strikeNo + 1;
        if (nextStrike >= STRIKES) { setDone(true); cancelAnimationFrame(raf.current); }
        else { t0.current = 0; setStrikeNo(nextStrike); }
    }, [done, strikeNo, steadyHand]);

    // keyboard: space/enter to strike
    useEffect(() => {
        const h = (e) => { if ((e.key === " " || e.key === "Enter") && !done) { e.preventDefault(); strike(); } };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [strike, done]);

    const quality = maxScore > 0 ? Math.max(0, Math.min(1, score / maxScore)) : 0;
    const headline = quality >= 0.92 ? "pixel" : quality >= 0.72 ? "perfect" : quality >= 0.45 ? "great" : "good";

    return (
        <div className="forge-mg-scrim" role="dialog" aria-label={`Enhance ${item.name}`}>
            <div className="forge-mg" style={{ "--rc": rc(item.rarity), transform: shakeXY.x || shakeXY.y ? `translate(${shakeXY.x}px, ${shakeXY.y}px)` : undefined }}>
                <div className="forge-mg-head">
                    <ItemArt id={item.id} icon={item.icon} className="forge-mg-art" alt={item.name} />
                    <div>
                        <div className="forge-mg-name">{item.name}{item.level > 0 ? <span style={{ marginLeft: 8, display: "inline-flex", verticalAlign: "middle" }}><ForgeRank level={item.level} size={22} /></span> : null}</div>
                        <div className="forge-mg-sub">{item.stats}</div>
                    </div>
                    <button type="button" className="forge-mg-x" onClick={onCancel} aria-label="Cancel">×</button>
                </div>

                {!done ? (
                    <>
                        <div className="forge-mg-cost">Cost: 🔩 {cost.qty} × {parts[cost.tier - 1]?.name || `T${cost.tier}`} · strike <b>{strikeNo + 1}</b>/{STRIKES}</div>
                        {/* the anvil heat bar */}
                        <div className="forge-anvil" onPointerDown={(e) => { e.preventDefault(); strike(); }}>
                            <div className="forge-bar">
                                <span className="forge-band good" /><span className="forge-band great" /><span className="forge-band perfect" /><span className="forge-band pixel" />
                                <span className="forge-marker" style={{ left: `${marker * 100}%` }} />
                                {sparks.map((s) => <span key={s.id} className="forge-spark" style={{ left: `${marker * 100}%`, "--a": `${s.a}deg`, "--d": `${s.d}px`, background: s.c }} />)}
                                {pop ? <span key={pop.k} className="forge-pop" style={{ color: pop.color }}>{pop.label}{pop.combo > 1 ? <em> ×{pop.combo}</em> : null}</span> : null}
                            </div>
                            <div className="forge-hammer" style={{ left: `${marker * 100}%` }} aria-hidden="true">⚒️</div>
                        </div>
                        <div className="forge-mg-meta">
                            <span>Combo <b style={{ color: combo > 1 ? "#ffd75e" : undefined }}>{combo}</b></span>
                            {steadyHand > 0 ? <span title="Steady Hand — slips forgiven">🛡️ {saves}</span> : null}
                            <span className="forge-dots">{Array.from({ length: STRIKES }).map((_, i) => <i key={i} className={i < strikeNo ? "hit" : i === strikeNo ? "now" : ""} />)}</span>
                        </div>
                        <button type="button" className="forge-strike" onPointerDown={(e) => { e.preventDefault(); strike(); }}>STRIKE!</button>
                        <div className="forge-mg-tip">Tap when the hammer hits the center. Great+ keeps your combo · Good or a miss breaks it.</div>
                    </>
                ) : (
                    <div className="forge-mg-result">
                        <div className="forge-result-grade" style={{ color: headline === "pixel" ? "#ffd75e" : headline === "perfect" ? "#8fe3ff" : headline === "great" ? "#8fe39a" : "#d7c48a" }}>
                            {headline === "pixel" ? "PIXEL PERFECT!" : headline === "perfect" ? "PERFECT!" : headline === "great" ? "GREAT!" : "FORGED"}
                        </div>
                        <div className="forge-result-bar"><span style={{ width: `${Math.round(quality * 100)}%` }} /></div>
                        <div className="forge-result-sub">Execution {Math.round(quality * 100)}% · best combo ×{bestCombo}</div>
                        <button type="button" className="forge-strike big" disabled={Boolean(busy)} onClick={() => onDone({ quality, grade: headline, combo: bestCombo })}>
                            {busy ? "Forging…" : "🔨 Temper the item"}
                        </button>
                        <button type="button" className="forge-mg-cancel" onClick={onCancel}>Not now</button>
                    </div>
                )}
            </div>
        </div>
    );
}

const FORGE_CSS = `
/* ── The hearth scene — an immersive banner (like the farm pasture / sailing sea) ── */
.forge-scene { position: relative; border-radius: 16px; overflow: hidden; height: min(34vh, 260px); min-height: 168px;
    display: flex; flex-direction: column; justify-content: flex-end;
    background: radial-gradient(120% 90% at 50% 0%, #3a2312, #1a0f07 70%); background-size: cover; background-position: center;
    box-shadow: inset 0 -40px 70px rgba(0,0,0,0.6), 0 10px 30px rgba(0,0,0,0.4); border: 1px solid rgba(255,150,60,0.28); }
.forge-emberlayer { position: absolute; inset: 0; pointer-events: none; z-index: 1; overflow: hidden; }
.forge-emberlayer span { position: absolute; bottom: -10px; width: 4px; height: 4px; border-radius: 50%; background: radial-gradient(circle, #ffcf7a, #ff7a1a 60%, transparent); opacity: 0; animation: forgeEmber linear infinite; }
@keyframes forgeEmber { 0% { transform: translateY(0) scale(1); opacity: 0; } 12% { opacity: 0.9; } 100% { transform: translateY(-320px) scale(0.4); opacity: 0; } }
.forge-scene-inner { position: relative; z-index: 2; padding: 16px; }
.forge-head { display: flex; align-items: center; gap: 10px; }
.forge-title { margin: 0; font-size: 1.7rem; font-weight: 900; color: #ffe0b0; text-shadow: 0 2px 10px rgba(255,120,20,0.55), 0 1px 3px #000; letter-spacing: 0.02em; }
.forge-owner { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ffb877; background: rgba(255,140,60,0.16); border: 1px solid rgba(255,140,60,0.5); border-radius: 999px; padding: 2px 8px; }
.forge-tagline { margin: 5px 0 0; font-size: 12.5px; font-weight: 600; color: #f0d9bd; text-shadow: 0 1px 4px #000; }
/* ── Panels below the scene — the game's standard card, with a forge-warm header ── */
.forge-panel { }
.forge-panel-h { margin: 0 0 11px; font-size: 12px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #ffb877; display: flex; align-items: center; gap: 6px; }
.forge-parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; margin: 0 0 12px; }
.forge-parts:last-child { margin-bottom: 0; }
.forge-part { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 6px; border-radius: 12px; background: rgba(10,6,3,0.55); border: 1px solid color-mix(in srgb, var(--pc) 55%, transparent); }
.forge-ingot { width: 30px; height: 20px; border-radius: 4px; background: linear-gradient(135deg, color-mix(in srgb, var(--pc) 92%, #fff) , var(--pc) 55%, color-mix(in srgb, var(--pc) 60%, #000)); box-shadow: 0 0 12px color-mix(in srgb, var(--pc) 70%, transparent), inset 0 1px 2px rgba(255,255,255,0.5); clip-path: polygon(14% 0, 86% 0, 100% 100%, 0 100%); }
.forge-partimg { width: 52px; height: 52px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55)) drop-shadow(0 0 9px color-mix(in srgb, var(--pc) 55%, transparent)); }
.forge-part-body { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.forge-part-body b { font-size: 17px; font-weight: 900; color: #fff; }
.forge-part-name { font-size: 9.5px; font-weight: 700; color: color-mix(in srgb, var(--pc) 75%, #fff); text-align: center; }
.forge-combine { margin-top: 2px; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 8px; cursor: pointer; border: 1px solid color-mix(in srgb, var(--pc) 60%, transparent); background: color-mix(in srgb, var(--pc) 22%, transparent); color: #fff; }
.forge-part-hint { font-size: 9px; color: #b9a892; }
/* Segmented control (one grouped pill, not three clashing blocks) — stacked icon over label so all
   three segments always share the width equally and never clip on narrow phones. */
.forge-tabs { display: flex; gap: 5px; margin-bottom: 14px; padding: 5px; border-radius: 14px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); box-shadow: inset 0 1px 3px rgba(0,0,0,0.4); }
.forge-tabs button { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 4px; border-radius: 10px; cursor: pointer; border: none; background: transparent; color: #c8b49b; transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
.forge-tabs button svg { width: 20px; height: 20px; flex: none; opacity: 0.9; }
.forge-tab-lbl { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 800; white-space: nowrap; }
.forge-tab-ct { font-style: normal; font-size: 10px; font-weight: 900; padding: 0 6px; border-radius: 999px; background: rgba(0,0,0,0.25); color: #e8d6c0; }
@media (hover: hover) { .forge-tabs button:not(.on):hover { background: rgba(255,255,255,0.05); color: #f2e0c8; } }
.forge-tabs button.on { background: linear-gradient(180deg, #ff9a3c, #e0631a); color: #2a1000; box-shadow: 0 2px 8px rgba(255,120,20,0.4), inset 0 1px 0 rgba(255,255,255,0.35); }
.forge-tabs button.on svg { opacity: 1; }
.forge-tabs button.on .forge-tab-ct { background: rgba(0,0,0,0.16); color: #2a1000; }
.forge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
.forge-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 12px 8px 10px; border-radius: 14px; cursor: pointer; text-align: center;
    background: linear-gradient(180deg, rgba(30,18,10,0.85), rgba(14,8,4,0.9)); border: 1px solid color-mix(in srgb, var(--rc) 55%, transparent); color: #efe2d2; transition: transform .12s ease, box-shadow .12s ease; }
.forge-card:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.5), 0 0 18px color-mix(in srgb, var(--rc) 35%, transparent); }
.forge-card:disabled { opacity: 0.7; cursor: default; }
.forge-art { width: 52px; height: 52px; object-fit: contain; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.5)); }
.forge-card-name { font-size: 12px; font-weight: 800; line-height: 1.15; }
.forge-card-stats { font-size: 10.5px; color: #c8b79f; text-transform: capitalize; }
.forge-card-bonus { font-size: 10px; color: #ffcf7a; font-weight: 700; }
.forge-card-cost { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: #b9a892; margin-top: 3px; }
.forge-cost-ico { width: 16px; height: 16px; object-fit: contain; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5)); }
.forge-lvl { position: absolute; top: 6px; right: 6px; font-size: 12px; font-weight: 900; color: #2a1000; background: linear-gradient(180deg,#ffd75e,#f3b23a); border-radius: 999px; padding: 1px 7px; box-shadow: 0 2px 6px rgba(0,0,0,0.5); }
.forge-lvl.inline { position: static; margin-left: 6px; }
.forge-cardrank { position: absolute; top: 6px; right: 6px; z-index: 2; }
.forge-working { font-size: 10px; color: #ffb877; }
.forge-empty { grid-column: 1/-1; text-align: center; color: #c8b79f; font-size: 13px; padding: 22px; }
.forge-burst { position: absolute; left: 50%; top: 40%; transform: translateX(-50%); z-index: 8; font-weight: 900; font-size: 1.4rem; color: #fff; text-shadow: 0 2px 10px color-mix(in srgb, var(--pc) 80%, #000); animation: forgeBurst 1.3s ease-out forwards; pointer-events: none; }
.forge-burst span { color: var(--pc); }
@keyframes forgeBurst { 0% { opacity: 0; transform: translate(-50%, 12px) scale(0.6); } 18% { opacity: 1; transform: translate(-50%, 0) scale(1.15); } 70% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -40px) scale(1); } }
.forge-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 10062; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center;
    background: linear-gradient(180deg, rgba(40,22,10,0.98), rgba(22,12,6,0.98)); border: 1px solid #ff9a3c; border-radius: 14px; padding: 12px 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); color: #ffe0b0; max-width: 92vw; animation: forgePop .35s cubic-bezier(.2,1.3,.3,1) both; }
.forge-toast.is-err { border-color: #e05b6a; color: #ffc9ce; }
.forge-toast b { font-size: 15px; color: #ffd75e; }
.forge-toast span { font-size: 12px; }
@keyframes forgePop { from { opacity: 0; transform: translate(-50%, 14px) scale(.9); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
/* ── mini-game ── */
.forge-mg-scrim { position: fixed; inset: 0; z-index: 10060; background: radial-gradient(120% 90% at 50% 30%, rgba(60,26,8,0.7), rgba(6,3,1,0.92)); display: grid; place-items: center; padding: 16px; }
.forge-mg { width: 100%; max-width: 440px; border-radius: 18px; padding: 16px; background: linear-gradient(180deg, #2a180c, #140b06); border: 2px solid color-mix(in srgb, var(--rc) 70%, #ff9a3c); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 30px color-mix(in srgb, var(--rc) 30%, transparent); }
.forge-mg-head { display: flex; align-items: center; gap: 10px; }
.forge-mg-art { width: 46px; height: 46px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.6)); }
.forge-mg-name { font-weight: 900; font-size: 15px; color: #ffe0b0; }
.forge-mg-sub { font-size: 11px; color: #c8b79f; }
.forge-mg-x { margin-left: auto; background: none; border: none; color: #e8d6c0; font-size: 22px; cursor: pointer; opacity: 0.7; }
.forge-mg-cost { font-size: 11.5px; color: #cdb89f; margin: 8px 0 4px; }
.forge-anvil { position: relative; padding: 26px 0 10px; cursor: pointer; user-select: none; touch-action: manipulation; }
.forge-bar { position: relative; height: 26px; border-radius: 999px; overflow: visible; background: #0c0704; border: 1px solid rgba(255,150,60,0.4); box-shadow: inset 0 2px 8px rgba(0,0,0,0.7); }
.forge-band { position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); border-radius: 999px; }
.forge-band.good { width: 32%; background: rgba(215,196,138,0.22); }
.forge-band.great { width: 20%; background: rgba(143,227,154,0.28); }
.forge-band.perfect { width: 11%; background: rgba(143,227,255,0.32); }
.forge-band.pixel { width: 4.4%; background: rgba(255,215,94,0.55); box-shadow: 0 0 14px rgba(255,215,94,0.7); }
.forge-marker { position: absolute; top: -4px; bottom: -4px; width: 4px; transform: translateX(-50%); background: linear-gradient(180deg, #fff, #ffcf7a); border-radius: 3px; box-shadow: 0 0 12px #ffcf7a, 0 0 4px #fff; }
.forge-hammer { position: absolute; top: 0; transform: translateX(-50%); font-size: 22px; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6)); pointer-events: none; }
.forge-spark { position: absolute; top: 50%; width: 4px; height: 4px; border-radius: 50%; transform: translate(-50%, -50%); animation: forgeSpark .55s ease-out forwards; pointer-events: none; }
@keyframes forgeSpark { 0% { opacity: 1; transform: translate(-50%,-50%) rotate(var(--a)) translateY(0); } 100% { opacity: 0; transform: translate(-50%,-50%) rotate(var(--a)) translateY(calc(var(--d) * -1)); } }
.forge-pop { position: absolute; left: 50%; top: -22px; transform: translateX(-50%); font-weight: 900; font-size: 15px; white-space: nowrap; text-shadow: 0 2px 6px rgba(0,0,0,0.8); animation: forgePopUp .6s ease-out forwards; pointer-events: none; }
.forge-pop em { font-style: normal; color: #ffd75e; }
@keyframes forgePopUp { 0% { opacity: 0; transform: translate(-50%, 6px) scale(.7); } 20% { opacity: 1; transform: translate(-50%, 0) scale(1.15); } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -14px) scale(1); } }
.forge-mg-meta { display: flex; align-items: center; justify-content: space-between; margin: 8px 2px; font-size: 13px; color: #e8d6c0; }
.forge-mg-meta b { font-weight: 900; }
.forge-dots { display: inline-flex; gap: 5px; }
.forge-dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.16); }
.forge-dots i.hit { background: #ff9a3c; }
.forge-dots i.now { background: #ffd75e; box-shadow: 0 0 8px #ffd75e; }
.forge-strike { width: 100%; margin-top: 6px; padding: 14px; border: none; border-radius: 13px; font-weight: 900; font-size: 17px; letter-spacing: 0.04em; cursor: pointer; color: #2a1000; background: linear-gradient(180deg, #ffd75e, #f3922a); box-shadow: 0 4px 0 #a8500f, 0 8px 20px rgba(255,120,20,0.4); }
.forge-strike:active { transform: translateY(3px); box-shadow: 0 1px 0 #a8500f; }
.forge-strike.big { margin-top: 12px; }
.forge-mg-tip { font-size: 10.5px; color: #b9a892; text-align: center; margin-top: 8px; }
.forge-mg-result { text-align: center; padding: 12px 4px 4px; }
.forge-result-grade { font-size: 1.7rem; font-weight: 900; text-shadow: 0 2px 12px rgba(0,0,0,0.7); animation: forgePop .4s cubic-bezier(.2,1.4,.3,1) both; }
.forge-result-bar { height: 12px; border-radius: 999px; background: rgba(0,0,0,0.5); overflow: hidden; margin: 12px 0 6px; border: 1px solid rgba(255,150,60,0.4); }
.forge-result-bar span { display: block; height: 100%; background: linear-gradient(90deg, #f3922a, #ffd75e); box-shadow: 0 0 12px #ffcf7a; transition: width .6s cubic-bezier(.2,1,.3,1); }
.forge-result-sub { font-size: 12px; color: #cdb89f; }
.forge-mg-cancel { display: block; margin: 8px auto 0; background: none; border: none; color: #b9a892; font-size: 12px; cursor: pointer; }
/* ── perks / upgrades (uses the shared .sail-upgrades pattern; only the gold line is bespoke) ── */
.forge-gold { text-align: right; font-size: 12px; font-weight: 800; color: #ffd75e; margin-top: 10px; }
/* ── daily forge tasks ── */
.forge-dailies { margin: 0; }
.forge-daily { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid rgba(255,255,255,0.06); }
.forge-daily:first-of-type { border-top: none; }
.forge-daily.is-claimed { opacity: 0.55; }
.forge-daily-body { flex: 1; min-width: 0; }
.forge-daily-body b { font-size: 12.5px; color: #efe2d2; font-weight: 700; }
.forge-daily-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; margin: 4px 0 3px; }
.forge-daily-bar span { display: block; height: 100%; background: linear-gradient(90deg, #f3922a, #ffd75e); border-radius: 999px; transition: width .4s ease; }
.forge-daily-prog { font-size: 10.5px; color: #c8b79f; }
.forge-daily-claim { flex: 0 0 auto; padding: 6px 13px; border-radius: 9px; font-weight: 900; font-size: 12px; cursor: pointer; border: none; color: #2a1000; background: linear-gradient(180deg,#8fe39a,#4bbf6a); box-shadow: 0 2px 0 #2e7d46; animation: forgePop .4s cubic-bezier(.2,1.3,.3,1) both; }
.forge-daily-tag { flex: 0 0 auto; font-size: 10.5px; color: #b9a892; }
.forge-daily-tag.done { color: #8fe3a1; font-weight: 800; }
/* ── Blacksmith's Regalia (salvaging set) ── */
.forge-regalia { margin: 0; padding: 10px 12px; border-radius: 14px; background: linear-gradient(180deg, rgba(40,24,10,0.6), rgba(14,8,4,0.7)); border: 1px solid rgba(255,180,80,0.3); }
.forge-regalia-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.forge-regalia-title { font-size: 12.5px; font-weight: 900; color: #ffcf8a; letter-spacing: 0.02em; }
.forge-regalia-count { font-size: 10.5px; color: #c8b79f; }
.forge-regalia-row { display: flex; gap: 8px; }
.forge-regalia-piece { width: 46px; height: 46px; border-radius: 10px; display: grid; place-items: center; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); overflow: hidden; }
.forge-regalia-piece.is-owned { border-color: rgba(255,215,94,0.55); }
.forge-regalia-piece.is-equipped { border-color: #ffd75e; box-shadow: 0 0 10px rgba(255,215,94,0.5); background: rgba(255,180,80,0.12); }
.forge-regalia-piece img { width: 40px; height: 40px; object-fit: contain; }
.forge-regalia-glyph { font-size: 20px; font-weight: 900; color: #6a5a48; }
.forge-regalia-bonus { font-size: 11px; font-weight: 700; margin-top: 8px; }
`;
