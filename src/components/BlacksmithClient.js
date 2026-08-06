"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GiAnvilImpact, GiCrackedShield, GiUpgrade } from "react-icons/gi";

import HowToPlay from "@/components/HowToPlay";
import ItemArt from "@/components/ItemArt";
import ForgeRank from "@/components/ForgeRank";
import { bandTable, GRADE_COLOR } from "@/lib/marketplace/timing.js";
import CoinCta from "@/components/CoinCta";
// ── Permanent credit: the Forge was Alstier1's idea. His actual AI hero sprite is enshrined in the hearth's
// corner as a small medallion; tapping it tells the story. (Hard-coded to his sprite blob on purpose so the
// tribute never breaks if his account/sprite changes — this is a fixed dedication, not live data.)
const FOUNDER = {
    name: "Alstier1",
    sprite: "https://zqwkiqdxm2nnwwst.public.blob.vercel-storage.com/marketplace/sprite/1785069930737-487951.png",
};

// ── The Forge (owner-gated blacksmith). Salvage unequipped gear → tiered parts → combine 5→1 → enhance equipped
// gear via a hammer-&-anvil timing mini-game whose execution drives the stat roll. Juiced to high heaven.

const RARITY_COLOR = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
const rc = (r) => RARITY_COLOR[r] || "#9aa0a6";
// Element display (mirrors boss-weakness.js ELEMENTS) for the reforge reveal.
const ELEMENT_META = {
    fire: { emoji: "🔥", label: "Fire", color: "#ff6b3c" },
    water: { emoji: "💧", label: "Water", color: "#4aa3ff" },
    earth: { emoji: "🌿", label: "Earth", color: "#6ad07a" },
    storm: { emoji: "⚡", label: "Storm", color: "#ffd75e" },
    light: { emoji: "☀️", label: "Light", color: "#fff0a8" },
    shadow: { emoji: "🌑", label: "Shadow", color: "#b061ff" },
};

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

// Grade bands by distance from the target center (0..0.5) — widths and palette from lib/marketplace/timing.js.
// Combo continues ONLY on great+; good & miss reset it.
const BANDS = bandTable({
    pixel: { score: 4, label: "PIXEL PERFECT" },
    perfect: { score: 3, label: "PERFECT" },
    great: { score: 2, label: "GREAT" },
    good: { score: 1, label: "GOOD" },
});
const MISS = { key: "miss", score: 0, label: "MISS", color: GRADE_COLOR.miss };
const gradeFor = (dist, widen = 0) => BANDS.find((b) => dist <= b.max + widen) || MISS;
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
    const [enhanceResult, setEnhanceResult] = useState(null); // the juiced post-enhance reveal
    const [salvaging, setSalvaging] = useState(null); // the item in the salvage preview/confirm/reveal modal
    const [toast, setToast] = useState(null);
    const [reforgeFor, setReforgeFor] = useState(null); // the item whose element you're reforging (opens the picker)
    const [reforgeFx, setReforgeFx] = useState(null);   // the post-reforge reveal { item, elements, dual }
    const [showFounder, setShowFounder] = useState(false); // the Alstier1 credit medallion

    const post = useCallback(async (body, key) => {
        setBusy(key || body.action);
        try {
            const r = await fetch("/api/marketplace/crafting", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            const d = await r.json().catch(() => ({}));
            if (d && (d.parts || d.salvage)) setForge(d);
            return d;
        } finally { setBusy(null); }
    }, []);

    // Runs the actual salvage (called by the confirm modal) and returns the server result so the modal can
    // reveal the loot. Errors surface as a toast; the modal closes itself.
    const doSalvage = useCallback(async (item) => {
        const r = await post({ action: "salvage", itemId: item.id }, `sv-${item.id}`);
        if (!r?.ok && r?.error) setToast(salvageErr(r.error));
        return r;
    }, [post]);

    const doCombine = useCallback(async (tier) => {
        const r = await post({ action: "combine", tier }, `cb-${tier}`);
        if (r?.ok) { (r.doubled ? SFX.pixel : SFX.perfect)(); if (r.doubled) setToast({ kind: "ok", text: "⚗️ Transmuter's Boon — the combine yielded 2!" }); }
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

    // Called by the mini-game with the player's execution → server rolls the stat bump → juiced result modal.
    const applyEnhance = useCallback(async (item, result) => {
        const r = await post({ action: "enhance", itemId: item.id, quality: result.quality, grade: result.grade, combo: result.combo, useScroll: Boolean(item.useScroll) }, `en-${item.id}`);
        setEnhancing(null);
        if (r?.ok) { (r.attune ? SFX.pixel : r.doubled ? SFX.pixel : SFX.win)(); setEnhanceResult({ id: item.id, icon: item.icon, name: item.name, rarity: item.rarity, level: r.level, gained: r.gained, statLines: r.statLines, attune: r.attune, util: r.util, allMaxed: r.allMaxed, scenario: r.scenario, grade: r.grade, xp: r.xp, doubled: r.doubled, quality: result.quality, combo: result.combo, hits: result.hits, score: result.score, maxScore: result.maxScore }); }
        else setToast({ kind: "err", text: enhanceErr(r?.error, r?.need) });
    }, [post]);

    // Elemental reforge — change a piece's affinity for gold; a rare dual-affinity proc keeps the old + adds new.
    const doReforge = useCallback(async (item, element, replace) => {
        const r = await post({ action: "reforge_element", itemId: item.id, element, replace: replace || undefined }, `rf-${item.id}`);
        if (r?.ok) { (r.dual ? SFX.pixel : SFX.great)(); setReforgeFor(null); setReforgeFx({ item, elements: r.elements, dual: r.dual, from: r.from }); }
        else setToast({ kind: "err", text: r?.error === "insufficient_gold" ? `Need ${(r.cost || 0).toLocaleString()} 🪙 to reforge that.` : r?.error === "already_has" ? "It already carries that element." : "Couldn't reforge that." });
    }, [post]);
    // Enchantment Scroll: permanently ADD an affinity (keeps the others — can exceed two).
    const doEnchant = useCallback(async (item, element) => {
        const r = await post({ action: "enchant_element", itemId: item.id, element }, `ec-${item.id}`);
        if (r?.ok) { SFX.pixel(); setReforgeFor(null); setReforgeFx({ item, elements: r.elements, enchant: true, added: r.added }); }
        else setToast({ kind: "err", text: r?.error === "no_scroll" ? "You have no Enchantment Scrolls." : r?.error === "already_has" ? "It already carries that element." : r?.error === "max_elements" ? "That piece can't hold any more affinities." : "Couldn't enchant that." });
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

    if (forbidden) return <div className="stack reveal"><section className="card" style={{ textAlign: "center", padding: 28 }}><h1 style={{ marginTop: 0 }}>🔨 The Forge</h1><p className="muted"><a href="/marketplace/login?returnTo=/marketplace/blacksmith">Sign in</a> to salvage &amp; enhance your gear at the Forge.</p></section></div>;
    if (loading) return <div className="stack reveal"><section className="card" style={{ textAlign: "center", padding: 28 }}><h1 style={{ marginTop: 0 }}>🔨 The Forge</h1><p className="muted">Stoking the hearth…</p></section></div>;

    const parts = forge.parts || [];
    const salvage = forge.salvage || [];
    const enhance = forge.enhance || [];
    const reforge = forge.reforge || { items: [], elements: [], dualChance: 12 };
    const powerScrolls = forge.powerScrolls || 0;
    const enchantScrolls = forge.enchantScrolls || 0;
    const bg = forge.hearthBg && !forge.hearthBg.startsWith("__") ? forge.hearthBg : null;

    // Live status line for the hero scene (mirrors the farm/sailing HUD strips).
    const totalParts = parts.reduce((s, p) => s + (p.count || 0), 0);
    const bestLvl = enhance.reduce((m, it) => Math.max(m, it.level || 0), 0);
    const statusBits = [`${totalParts} part${totalParts === 1 ? "" : "s"} ready`];
    if (bestLvl > 0) statusBits.push(`best forge +${bestLvl}`);
    if (powerScrolls > 0) statusBits.push(`📜 ${powerScrolls} Power Scroll${powerScrolls === 1 ? "" : "s"}`);
    if (enchantScrolls > 0) statusBits.push(`🪄 ${enchantScrolls} Enchant Scroll${enchantScrolls === 1 ? "" : "s"}`);
    if (forge.regalia?.owned) statusBits.push(`${forge.regalia.owned}/${forge.regalia.total} regalia found`);

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
                    </div>
                    <p className="forge-tagline">{statusBits.join(" · ")}</p>
                </div>

                {/* Founder's medallion — Alstier1's hero sprite, permanently enshrined for dreaming up the Forge. */}
                <button type="button" className="forge-founder" onClick={() => setShowFounder(true)} title={`Forged from an idea by ${FOUNDER.name}`} aria-label={`About the Forge — an idea by ${FOUNDER.name}`}>
                    {FOUNDER.sprite ? <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" /> : <span aria-hidden="true">⚒️</span>}
                </button>
            </div>

            {showFounder ? (
                <div className="forge-founder-scrim" role="dialog" aria-modal="true" onClick={() => setShowFounder(false)}>
                    <div className="forge-founder-card" onClick={(e) => e.stopPropagation()}>
                        <div className="forge-founder-hero">
                            {FOUNDER.sprite ? <img src={FOUNDER.sprite} alt={FOUNDER.name} draggable="false" /> : <span style={{ fontSize: 44 }} aria-hidden="true">⚒️</span>}
                        </div>
                        <div className="forge-founder-kicker">⚒️ Founder&apos;s Tribute</div>
                        <h3 className="forge-founder-name">{FOUNDER.name}</h3>
                        <p className="forge-founder-body">The Forge was <b>{FOUNDER.name}&apos;s</b> idea. He dreamed up a place to salvage gear into parts and hammer them into something greater — and here it stands. His hero is enshrined in the hearth as thanks. Every strike of the anvil traces back to him.</p>
                        <button type="button" className="forge-founder-close" onClick={() => setShowFounder(false)}>Back to the hearth</button>
                    </div>
                </div>
            ) : null}

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
                <p className="forge-panel-sub">Salvage gear for parts. Combine <b>{forge.combineCost || 5}</b> of a tier into <b>1</b> of the next, rarer tier — higher tiers enhance stronger gear.</p>
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
                                <button type="button" className="forge-combine" disabled={Boolean(busy)} onClick={() => doCombine(p.tier)} title={`Combine ${forge.combineCost} ${p.name} into 1 ${parts[p.tier]?.name || "next tier"}`}>
                                    {busy === `cb-${p.tier}` ? "…" : (
                                        <>
                                            <span className="forge-combine-n">{forge.combineCost}</span>
                                            <span className="forge-combine-arrow">→</span>
                                            {parts[p.tier]?.sprite
                                                // eslint-disable-next-line @next/next/no-img-element
                                                ? <img className="forge-combine-ico" src={parts[p.tier].sprite} alt="" /> : null}
                                            <span className="forge-combine-next">1 {parts[p.tier]?.name || "next"}</span>
                                        </>
                                    )}
                                </button>
                            ) : p.tier < (forge.maxTier || 5) ? <span className="forge-part-hint">{Math.max(0, (forge.combineCost || 5) - p.count)} more → {parts[p.tier]?.name || "next tier"}</span> : <span className="forge-part-hint">top tier</span>}
                        </div>
                    ))}
                </div>

                {/* Blacksmith's Regalia — the salvaging COLLECTION. Pieces drop from salvaging, and finding one is
                    what pays: the bonus is permanent and the piece is never worn. It used to read "3/5 worn",
                    which is the loadout-swap this set stopped asking for. */}
                {forge.regalia ? (
                    <div className="forge-regalia">
                        <div className="forge-regalia-head">
                            <span className="forge-regalia-title">Blacksmith&apos;s Regalia</span>
                            <span className="forge-regalia-count">{forge.regalia.owned}/{forge.regalia.total} found</span>
                        </div>
                        <p className="forge-regalia-note">Finding a piece is enough — the bonus is permanent, and these are never worn, sold or salvaged.</p>
                        <div className="forge-regalia-row">
                            {forge.regalia.pieces.map((p) => (
                                <div key={p.id} className="forge-regalia-slot">
                                    <span className={`forge-regalia-piece${p.owned ? " is-found" : ""}`} title={p.owned ? "Found" : "Not found yet"}>
                                        {p.sprite ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={p.sprite} alt={p.name} className={p.owned ? "" : "is-locked"} />
                                        ) : <span className="forge-regalia-glyph">?</span>}
                                        {p.owned ? <span className="forge-regalia-badge worn">✓</span> : <span className="forge-regalia-badge lock">🔒</span>}
                                    </span>
                                    <span className="forge-regalia-name">{p.name}</span>
                                </div>
                            ))}
                        </div>
                        <div className="forge-regalia-tiers">
                            {(forge.regalia.tiers || []).map((t) => (
                                <div key={t.need} className={`forge-regalia-tier${t.active ? " is-active" : ""}`}>
                                    <span className="forge-regalia-tierN">{t.need}-pc</span>
                                    <span className="forge-regalia-tierLbl">{t.effect}</span>
                                    {t.active ? <span className="forge-regalia-tierOn">ACTIVE</span> : null}
                                </div>
                            ))}
                        </div>
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
                    <button type="button" className={tab === "attune" ? "on" : ""} onClick={() => setTab("attune")}>
                        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>💠</span>
                        <span className="forge-tab-lbl">Attune</span>
                    </button>
                    <button type="button" className={tab === "upgrades" ? "on" : ""} onClick={() => setTab("upgrades")}>
                        <GiUpgrade aria-hidden="true" />
                        <span className="forge-tab-lbl">Perks</span>
                    </button>
                </div>

                {tab === "enhance" ? (
                    <div className="forge-grid">
                        {enhance.length ? enhance.map((it) => (
                            <button key={it.id} type="button" className={`forge-card is-enhance${it.maxed ? " is-maxed" : (it.affordable || powerScrolls > 0) ? "" : " is-locked"}`} style={{ "--rc": rc(it.rarity) }} disabled={Boolean(busy)}
                                onClick={() => {
                                    if (it.maxed) { setToast({ kind: "err", text: `${it.name} is at PEAK enchantment — it can't be forged any higher.` }); return; }
                                    const scroll = !it.affordable && powerScrolls > 0; // pay with a Power Scroll if you're short on parts
                                    if (!it.affordable && !scroll) { setToast({ kind: "err", text: `Not enough ${parts[it.cost.tier - 1]?.name || "parts"} — you have ${it.have}/${it.cost.qty}. Salvage, combine, or use a 📜 Power Scroll.` }); return; }
                                    ac(); setEnhancing({ ...it, useScroll: scroll });
                                }}>
                                <ItemArt id={it.id} icon={it.icon} className="forge-art" alt={it.name} />
                                <span className="forge-card-name">{it.name}</span>
                                {it.level > 0 ? <span className="forge-card-rankline"><ForgeRank level={it.level} size={22} /></span> : null}
                                <span className="forge-card-stats">{it.stats || "—"}</span>
                                {it.bonus ? <span className="forge-card-bonus">⚒ {it.bonus}</span> : null}
                                {it.util ? <span className="forge-card-attune">🔮 +{it.util.value}{it.util.unit} {it.util.label}{it.util.level > 1 ? ` Lv${it.util.level}` : ""}</span> : null}
                                {!it.affordable && powerScrolls > 0 ? <span className="forge-card-scroll">📜 Use Power Scroll</span> : null}
                                {it.maxed ? <span className="forge-card-cost forge-card-max">✦ PEAK — maxed</span> : (
                                    <span className={`forge-card-cost${it.affordable ? "" : " is-short"}`}>
                                        {parts[it.cost.tier - 1]?.sprite
                                            // eslint-disable-next-line @next/next/no-img-element
                                            ? <img className="forge-cost-ico" src={parts[it.cost.tier - 1].sprite} alt="" /> : null}
                                        {it.have}/{it.cost.qty} {parts[it.cost.tier - 1]?.name || `T${it.cost.tier}`}
                                        {it.affordable ? null : <span className="forge-card-locktag">🔒</span>}
                                    </span>
                                )}
                            </button>
                        )) : <div className="forge-empty">Equip some gear first — enhancement works on what you&apos;re wearing.</div>}
                    </div>
                ) : tab === "salvage" ? (
                    <div className="forge-grid">
                        {salvage.length ? salvage.map((it) => (
                            <button key={it.id} type="button" className="forge-card is-salvage" style={{ "--rc": rc(it.rarity) }} disabled={Boolean(busy)} onClick={() => { ac(); setSalvaging(it); }}>
                                <ItemArt id={it.id} icon={it.icon} className="forge-art" alt={it.name} />
                                <span className="forge-card-name">{it.name}</span>
                                <span className="forge-card-stats" style={{ color: rc(it.rarity) }}>{it.rarity}</span>
                                <span className="forge-card-cost">
                                    {parts[it.salvageTier - 1]?.sprite
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img className="forge-cost-ico" src={parts[it.salvageTier - 1].sprite} alt="" /> : null}
                                    yields {parts[it.salvageTier - 1]?.name || `T${it.salvageTier}`}
                                </span>
                            </button>
                        )) : <div className="forge-empty">Nothing spare to salvage — every item you own is equipped.</div>}
                    </div>
                ) : tab === "attune" ? (
                    <>
                        <p className="forge-panel-sub">Reforge a piece&apos;s <b>elemental affinity</b> to match the boss&apos;s weekly weakness. Small chance ({reforge.dualChance}%) it keeps the old element AND adds the new one — a rare <b>dual-affinity</b> piece that matches two elements.</p>
                        <div className="forge-grid">
                            {reforge.items.length ? reforge.items.map((it) => (
                                <button key={it.id} type="button" className="forge-card is-attune" style={{ "--rc": rc(it.rarity) }} disabled={Boolean(busy)} onClick={() => { ac(); setReforgeFor(it); }}>
                                    <ItemArt id={it.id} icon={it.icon} className="forge-art" alt={it.name} />
                                    <span className="forge-card-name">{it.name}</span>
                                    <span className="forge-card-elems">
                                        {it.elements.length ? it.elements.map((e) => <span key={e.key} className="forge-elem-chip" style={{ color: e.color, borderColor: e.color }}>{e.emoji} {e.label}</span>) : <span className="forge-elem-chip is-neutral">◇ Neutral</span>}
                                    </span>
                                    <span className="forge-card-cost">🪙 {it.cost.toLocaleString()} to reforge</span>
                                </button>
                            )) : <div className="forge-empty">No gear to attune yet — win or buy some pieces first.</div>}
                        </div>
                    </>
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

            {enhancing ? <EnhanceMinigame item={enhancing} parts={parts} steadyHandChance={forge.steadyHandChance || 0} onCancel={() => setEnhancing(null)} onDone={(res) => applyEnhance(enhancing, res)} busy={busy} /> : null}

            {salvaging ? <SalvageModal item={salvaging} parts={parts} odds={forge.salvageOdds || {}} equipped={(forge.enhance || []).find((e) => e.slot === salvaging.slot) || null} onConfirm={() => doSalvage(salvaging)} onClose={() => setSalvaging(null)} /> : null}

            {enhanceResult ? <EnhanceResultModal res={enhanceResult} onClose={() => setEnhanceResult(null)} /> : null}

            {reforgeFor ? <ReforgePicker item={reforgeFor} elements={reforge.elements} dualChance={reforge.dualChance} gold={forge.gold || 0} enchantScrolls={enchantScrolls} busy={busy} onPick={(el, replace) => doReforge(reforgeFor, el, replace)} onEnchant={(el) => doEnchant(reforgeFor, el)} onClose={() => setReforgeFor(null)} /> : null}
            {reforgeFx ? <ReforgeReveal fx={reforgeFx} onClose={() => setReforgeFx(null)} /> : null}

            {toast ? (
                <div className={`forge-toast${toast.kind === "err" ? " is-err" : ""}`} role="status">
                    <span>{toast.text}</span>
                </div>
            ) : null}
        </div>
    );
}

// ── Elemental reforge (gold) OR enchant (scroll, ADDS an affinity, can exceed two) ──────────────────────────
function ReforgePicker({ item, elements, dualChance, gold, enchantScrolls = 0, busy, onPick, onEnchant, onClose }) {
    const [pick, setPick] = useState(null);
    const [mode, setMode] = useState("reforge"); // "reforge" (gold, replaces) | "enchant" (scroll, adds)
    const isDual = (item.elements || []).length >= 2;
    const [replaceKey, setReplaceKey] = useState(isDual ? item.elements[0].key : null);
    const has = new Set((item.elements || []).map((e) => e.key));
    const isEnchant = mode === "enchant";
    const canAfford = gold >= item.cost;
    return (
        <div className="forge-mg-scrim" role="dialog" aria-label="Reforge element" onClick={onClose}>
            <div className="forge-reforge" onClick={(e) => e.stopPropagation()}>
                <div className="forge-reforge-head">
                    <ItemArt id={item.id} icon={item.icon} className="forge-reforge-art" alt={item.name} />
                    <div>
                        <div className="forge-reforge-name">{item.name}</div>
                        <div className="forge-reforge-cur">
                            Now: {item.elements.length ? item.elements.map((e) => <span key={e.key} className="forge-elem-chip" style={{ color: e.color, borderColor: e.color }}>{e.emoji} {e.label}</span>) : <span className="forge-elem-chip is-neutral">◇ Neutral</span>}
                        </div>
                    </div>
                </div>
                {enchantScrolls > 0 ? (
                    <div className="forge-mode-toggle">
                        <button type="button" className={!isEnchant ? "on" : ""} onClick={() => { setMode("reforge"); setPick(null); }}>Reforge · 🪙</button>
                        <button type="button" className={isEnchant ? "on" : ""} onClick={() => { setMode("enchant"); setPick(null); }}>🪄 Enchant · scroll ({enchantScrolls})</button>
                    </div>
                ) : null}
                {isEnchant ? (
                    <div className="forge-reforge-sub">Permanently <b>ADD</b> an affinity (keeps the others — a piece can go past two). Uses one 🪄 Enchantment Scroll.</div>
                ) : isDual ? (
                    <>
                        <div className="forge-reforge-sub">This piece is <b>dual-affinity</b> — pick which element to REPLACE (the other is kept):</div>
                        <div className="forge-elem-grid two">
                            {item.elements.map((e) => (
                                <button key={e.key} type="button" className={`forge-elem-btn${replaceKey === e.key ? " on" : ""}`} style={{ "--ec": e.color }} onClick={() => { setReplaceKey(e.key); if (pick === e.key) setPick(null); }}>
                                    <span className="forge-elem-emoji">{e.emoji}</span>
                                    <span>{e.label}</span>
                                    {replaceKey === e.key ? <span className="forge-elem-has" style={{ color: "#ff9a8f" }}>swap out</span> : <span className="forge-elem-has">keep</span>}
                                </button>
                            ))}
                        </div>
                        <div className="forge-reforge-sub">Change it to:</div>
                    </>
                ) : (
                    <div className="forge-reforge-sub">Pick a new affinity — {dualChance}% chance to keep the current one too (dual!).</div>
                )}
                <div className="forge-elem-grid">
                    {elements.map((e) => {
                        // Enchant: elements it ALREADY has are off-limits. Reforge multi-affinity: every KEPT element
                        // (all current ones except the one you're swapping out) is off-limits.
                        const owned = isEnchant ? has.has(e.key) : isDual ? (has.has(e.key) && e.key !== replaceKey) : has.has(e.key);
                        return (
                            <button key={e.key} type="button" className={`forge-elem-btn${pick === e.key ? " on" : ""}${owned ? " is-owned" : ""}`} style={{ "--ec": e.color }} disabled={owned} onClick={() => setPick(e.key)}>
                                <span className="forge-elem-emoji">{e.emoji}</span>
                                <span>{e.label}</span>
                                {owned ? <span className="forge-elem-has">✓ {isEnchant ? "has" : "kept"}</span> : null}
                            </button>
                        );
                    })}
                </div>
                <div className="forge-reforge-actions">
                    <button type="button" className="forge-reforge-cancel" onClick={onClose}>Cancel</button>
                    {isEnchant ? (
                        <button type="button" className="forge-reforge-go" disabled={!pick || busy} onClick={() => pick && onEnchant(pick)}>🪄 Enchant · adds affinity</button>
                    ) : (
                        <button type="button" className="forge-reforge-go" disabled={!pick || busy || !canAfford} onClick={() => pick && onPick(pick, isDual ? replaceKey : null)}>
                            {canAfford ? `Reforge · 🪙 ${item.cost.toLocaleString()}` : `Need 🪙 ${item.cost.toLocaleString()}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Reforge reveal: the element burst (double burst on a dual proc) ─────────────────────────────────────────
function ReforgeReveal({ fx, onClose }) {
    return (
        <div className="forge-mg-scrim" role="dialog" aria-label="Reforged" onClick={onClose}>
            <div className={`forge-reforge-fx${fx.dual || fx.enchant ? " is-dual" : ""}`} onClick={(e) => e.stopPropagation()}>
                {fx.enchant ? <div className="forge-reforge-badge">🪄 ENCHANTED! 🪄</div> : fx.dual ? <div className="forge-reforge-badge">✨ DUAL AFFINITY! ✨</div> : null}
                <ItemArt id={fx.item.id} icon={fx.item.icon} className="forge-reforge-fxart" alt={fx.item.name} />
                <div className="forge-reforge-fxname">{fx.item.name}</div>
                <div className="forge-reforge-fxels">
                    {(fx.elements || []).map((k) => {
                        const e = ELEMENT_META[k] || { emoji: "◇", label: k, color: "#ccc" };
                        return <span key={k} className="forge-elem-chip big" style={{ color: e.color, borderColor: e.color }}>{e.emoji} {e.label}</span>;
                    })}
                </div>
                <div className="forge-reforge-fxsub">{fx.enchant ? `A new affinity bound in — it now matches ${(fx.elements || []).length} elements.` : fx.dual ? "It now matches BOTH elements — twice the weeks it shines." : "Affinity reforged."}</div>
                <button type="button" className="forge-strike big" onClick={onClose}>Done</button>
            </div>
        </div>
    );
}

const salvageErr = (e) => ({ kind: "err", text: { equipped: "That's equipped — unequip it first.", not_owned: "You don't own that.", bad_item: "Unknown item." }[e] || "Couldn't salvage that." });
const enhanceErr = (e, need) => (e === "not_enough" ? `Not enough parts — need ${need?.qty} of tier ${need?.tier}.` : e === "not_equipped" ? "Equip it first." : e === "maxed" ? "This piece is at peak enchantment — it can't go higher." : "Enhance failed — try again.");

// ── Salvage preview → confirm → loot reveal ─────────────────────────────────────────────────────────────────
// Shows what you MIGHT get (yield range + perk odds) before committing, then reveals what you DID get with juice.
// How a stat reads on screen. Kept in step with STAT_META server-side; anything unknown falls back to its key
// rather than being dropped, so a new stat shows up as ugly instead of invisible.
const STAT_UI = {
    might: { label: "Might", suffix: "" }, fortune: { label: "Fortune", suffix: "" },
    ferocity: { label: "Ferocity", suffix: "" }, crit_chance: { label: "Crit chance", suffix: "%" },
    crit_power: { label: "Crit power", suffix: "%" }, extra_strike: { label: "Extra strike", suffix: "%" },
    xp: { label: "XP", suffix: "%" }, gold: { label: "Gold", suffix: "%" },
    tickets: { label: "Tickets", suffix: "%" }, pet_bond: { label: "Pet bond", suffix: "%" },
    grow_speed: { label: "Grow speed", suffix: "%" }, seed_luck: { label: "Seed luck", suffix: "%" },
};
const statName = (k) => STAT_UI[k]?.label || k.replace(/_/g, " ");
const statSuffix = (k) => STAT_UI[k]?.suffix || "";

// Side-by-side of the piece you're about to melt and whatever is in that slot right now.
//
// The modal used to show the parts yield and nothing else, which is the one number that DOESN'T help you
// decide — you're weighing gear against gear, not gear against dust. Every stat either item touches gets a row,
// so a stat the equipped piece has and this one doesn't still shows as a loss rather than silently missing.
function StatCompare({ item, equipped }) {
    const mine = item?.statMap || {};
    const theirs = equipped?.statMap || {};
    const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])];
    if (!keys.length) return null;
    return (
        <div className="forge-sv-cmp">
            <div className="forge-sv-cmp-head">
                <span />
                <span className="forge-sv-cmp-col">This piece</span>
                <span className="forge-sv-cmp-col">{equipped ? "Equipped" : "Slot empty"}</span>
            </div>
            {keys.map((k) => {
                const a = Number(mine[k] || 0);
                const b = Number(theirs[k] || 0);
                const d = a - b;
                return (
                    <div key={k} className="forge-sv-cmp-row">
                        <span className="forge-sv-cmp-stat">{statName(k)}</span>
                        <span className="forge-sv-cmp-val">{a ? `+${a}${statSuffix(k)}` : "—"}</span>
                        <span className="forge-sv-cmp-val">
                            {b ? `+${b}${statSuffix(k)}` : "—"}
                            {d !== 0 ? <b className={d > 0 ? "up" : "down"}>{d > 0 ? `+${d}` : d}</b> : null}
                        </span>
                    </div>
                );
            })}
            {equipped ? (
                <p className="forge-sv-cmp-note">Green means this piece beats what you have on. You cannot salvage an equipped item, so nothing you&apos;re wearing is at risk.</p>
            ) : (
                <p className="forge-sv-cmp-note">You have nothing equipped in this slot — wearing this would be a straight upgrade.</p>
            )}
        </div>
    );
}

function SalvageModal({ item, parts, odds = {}, equipped = null, onConfirm, onClose }) {
    const [phase, setPhase] = useState("confirm"); // confirm | working | result
    const [result, setResult] = useState(null);
    const tier = parts[item.salvageTier - 1] || {};
    const lo = item.salvageMin || 1;
    const hi = item.salvageMax || 1;

    const doIt = async () => {
        setPhase("working");
        SFX.great();
        const r = await onConfirm();
        if (r?.ok) { setResult(r); setPhase("result"); (r.regaliaDrop ? SFX.pixel : SFX.win)(); }
        else onClose();
    };

    return (
        <div className="forge-mg-scrim" role="dialog" aria-label={`Salvage ${item.name}`} onPointerDown={phase === "result" ? onClose : undefined}>
            <div className="forge-sv" style={{ "--rc": rc(item.rarity) }} onPointerDown={(e) => e.stopPropagation()}>
                {phase !== "result" ? (
                    <>
                        <div className="forge-mg-head">
                            <ItemArt id={item.id} icon={item.icon} className="forge-mg-art" alt={item.name} />
                            <div>
                                <div className="forge-mg-name">Salvage {item.name}?</div>
                                <div className="forge-mg-sub" style={{ color: rc(item.rarity), textTransform: "capitalize" }}>{item.rarity}{item.level > 0 ? ` · forged +${item.level}` : ""}</div>
                            </div>
                            <button type="button" className="forge-mg-x" onClick={onClose} aria-label="Cancel">×</button>
                        </div>
                        {item.level > 0 ? <div className="forge-sv-warn">This is enhanced (+{item.level}) — salvaging destroys the item &amp; its forge bonus, but melts down ~40% of the parts you forged in.</div> : null}
                        <StatCompare item={item} equipped={equipped} />
                        <div className="forge-sv-yield">
                            <span className="forge-sv-yield-label">You&apos;ll get</span>
                            <div className="forge-sv-yield-main">
                                {tier.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="forge-sv-yieldimg" src={tier.sprite} alt="" />
                                ) : null}
                                <b>{lo === hi ? lo : `${lo}–${hi}`}</b> <span>{tier.name || `T${item.salvageTier}`}</span>
                            </div>
                        </div>
                        {(odds.doublePct > 0 || odds.bonusPartPct > 0 || odds.regaliaFlat > 0 || odds.regaliaDropPct > 0) ? (
                            <div className="forge-sv-odds">
                                {odds.doublePct > 0 ? <span>🛠️ {odds.doublePct}% double</span> : null}
                                {odds.bonusPartPct > 0 ? <span>👁️ {odds.bonusPartPct}% bonus part</span> : null}
                                {odds.regaliaFlat > 0 ? <span>+{odds.regaliaFlat} from Regalia</span> : null}
                                {odds.regaliaDropPct > 0 ? <span className="rare">✦ {odds.regaliaDropPct}% Regalia find</span> : null}
                            </div>
                        ) : null}
                        <button type="button" className="forge-strike" disabled={phase === "working"} onPointerDown={(e) => { e.preventDefault(); if (phase !== "working") doIt(); }}>
                            {phase === "working" ? "Salvaging…" : "Salvage it"}
                        </button>
                        <button type="button" className="forge-mg-cancel" onClick={onClose}>Keep it</button>
                    </>
                ) : (
                    <div className="forge-sv-result">
                        <div className="forge-sv-reward">
                            {(parts[result.gained.tier - 1] || tier).sprite ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="forge-sv-rewardimg" src={(parts[result.gained.tier - 1] || tier).sprite} alt="" />
                            ) : null}
                            <div className="forge-sv-plus">+{result.gained.n}</div>
                            <div className="forge-sv-rewardname">{parts[result.gained.tier - 1]?.name || `T${result.gained.tier}`}</div>
                        </div>
                        {result.doubled ? <div className="forge-sv-tag double">✦ DOUBLE PARTS!</div> : null}
                        {result.enhanceBonus > 0 ? <div className="forge-sv-tag bonus">🔨 +{result.enhanceBonus} melted from your +{result.enhLevel} forging</div> : null}
                        {result.bonusTier ? <div className="forge-sv-tag bonus">👁️ +1 {parts[result.bonusTier - 1]?.name || `T${result.bonusTier}`} · Keen Eye</div> : null}
                        {result.regaliaDrop ? <div className="forge-sv-tag regalia">⚒️ Found a Regalia piece — {result.regaliaDrop}!</div> : null}
                        <div className="forge-sv-xp">+{result.xp} XP</div>
                        <button type="button" className="forge-strike big" onClick={onClose}>Nice!</button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── The juiced post-enhance reveal (fires after you Temper the item) ────────────────────────────────────────
function EnhanceResultModal({ res, onClose }) {
    const gradeMeta = { pixel: { label: "PIXEL-PERFECT", color: "#ffd75e" }, perfect: { label: "PERFECT", color: "#8fe3ff" }, great: { label: "GREAT", color: "#8fe39a" }, good: { label: "FORGED", color: "#d7c48a" } }[res.grade] || { label: "FORGED", color: "#d7c48a" };
    // Peak dopamine: first TALLY the mini-game performance — every strike's tier, the best combo, the score — then
    // CONNECT the dots (performance → grade → forge yield) so the player sees exactly how their run drove the
    // result, THEN reveal the forged item + additive stats.
    const acc = Math.round((res.quality || 0) * 100);
    const combo = res.combo || 0;
    const lines = Array.isArray(res.statLines) ? res.statLines : [];
    const gainedPts = lines.reduce((s, l) => s + (l.gained || 0), 0);
    const upgradedCount = lines.filter((l) => (l.gained || 0) > 0).length;
    const addedCount = lines.filter((l) => l.isNew && (l.gained || 0) > 0).length;
    // What the skill tier did, in words (breakpoints 25/50/75/~100% → 1..4 stats forged).
    const scenarioText = gainedPts <= 0 ? "already maxed"
        : `${upgradedCount} stat${upgradedCount === 1 ? "" : "s"} up${addedCount ? ` · ${addedCount} NEW` : ""}`;
    const hits = res.hits || {};
    const TIERS = [
        { key: "pixel", label: "Pixel-perfect", color: "#ffd75e" },
        { key: "perfect", label: "Perfect", color: "#8fe3ff" },
        { key: "great", label: "Great", color: "#8fe39a" },
        { key: "good", label: "Good", color: "#d7c48a" },
        { key: "miss", label: "Miss", color: "#ff8f9a" },
    ].filter((t) => (hits[t.key] || 0) > 0);
    const perfMsg = acc >= 92 ? "Flawless run!" : acc >= 72 ? "Excellent run!" : acc >= 45 ? "Solid run!" : "Rough run —";
    const [phase, setPhase] = useState("tally"); // tally → reveal
    const [accShown, setAccShown] = useState(0);
    useEffect(() => {
        if (phase !== "tally") return undefined;
        let raf = 0; const t0 = performance.now(); const dur = 900;
        const tick = (t) => { const k = Math.min(1, (t - t0) / dur); setAccShown(Math.round(acc * k)); if (k < 1) raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick);
        const adv = setTimeout(() => setPhase("reveal"), 3400); // auto-advance to the reveal (longer — there's more to read)
        return () => { cancelAnimationFrame(raf); clearTimeout(adv); };
    }, [phase, acc]);

    if (phase === "tally") {
        const chainDelay = TIERS.length * 130 + 700;
        return (
            <div className="forge-mg-scrim" role="dialog" aria-label="Forge tally" onPointerDown={() => setPhase("reveal")}>
                <div className="forge-sv forge-er" style={{ "--rc": rc(res.rarity) }} onPointerDown={(e) => e.stopPropagation()}>
                    <div className="forge-sv-result">
                        <div className="forge-er-grade" style={{ color: gradeMeta.color }}>{gradeMeta.label} STRIKE!</div>
                        <div className="forge-tally-title">Your run</div>
                        {/* Every strike's tier — the play-by-play. */}
                        <div className="forge-tally-hits">
                            {TIERS.map((t, i) => (
                                <span key={t.key} className="forge-hit-chip" style={{ color: t.color, borderColor: `${t.color}66`, animationDelay: `${i * 130}ms` }}>
                                    <b>{hits[t.key]}×</b> {t.label}
                                </span>
                            ))}
                        </div>
                        <div className="forge-tally">
                            <div className="forge-tally-row" style={{ animationDelay: `${TIERS.length * 130 + 120}ms` }}><span>⚡ Best combo</span><b style={{ color: "#ffcf7a" }}>×{combo}</b></div>
                            <div className="forge-tally-row" style={{ animationDelay: `${TIERS.length * 130 + 340}ms` }}><span>🎯 Score</span><b style={{ color: "#8fe3ff" }}>{accShown}%</b></div>
                            {res.doubled ? <div className="forge-tally-row" style={{ animationDelay: `${TIERS.length * 130 + 560}ms` }}><span>✦ Master&apos;s Touch</span><b style={{ color: "#ffd75e" }}>DOUBLE!</b></div> : null}
                        </div>
                        {/* Connect the dots: run → grade → yield. */}
                        <div className="forge-tally-chain" style={{ animationDelay: `${chainDelay}ms` }}>
                            <span className="chain-perf">{perfMsg}</span>
                            <span className="chain-step"><b style={{ color: gradeMeta.color }}>{gradeMeta.label}</b> grade</span>
                            <span className="chain-arrow" aria-hidden="true">→</span>
                            <span className="chain-yield">⚒ {scenarioText}</span>
                        </div>
                        <button type="button" className="forge-tally-skip" onClick={() => setPhase("reveal")}>Tap to reveal →</button>
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="forge-mg-scrim" role="dialog" aria-label={`${res.name} enhanced`} onPointerDown={onClose}>
            <div className="forge-sv forge-er" style={{ "--rc": rc(res.rarity) }} onPointerDown={(e) => e.stopPropagation()}>
                <div className="forge-sv-result">
                    <div className="forge-er-grade" style={{ color: gradeMeta.color }}>{gradeMeta.label} STRIKE!</div>
                    {/* Big, glowing item on a burst of light — the star of the reveal. */}
                    <div className="forge-er-stage">
                        <span className="forge-er-rays" aria-hidden="true" />
                        <span className="forge-er-glow" aria-hidden="true" />
                        <ItemArt id={res.id} icon={res.icon} className="forge-er-art" alt={res.name} />
                    </div>
                    <div className="forge-er-name">{res.name}</div>
                    <div className="forge-er-rankrow"><ForgeRank level={res.level} size={30} /></div>
                    {res.doubled ? <div className="forge-sv-tag double">✦ MASTER&apos;S TOUCH — bumped up a tier!</div> : null}
                    {/* Additive stat breakdown: base + forge = total, so it's crystal-clear the bonus STACKS on the item. */}
                    {Array.isArray(res.statLines) && res.statLines.length ? (
                        <div className="forge-er-stats">
                            {res.statLines.map((s) => (
                                <div key={s.key} className={`forge-er-statrow${s.gained ? " up" : ""}`}>
                                    <span className="forge-er-stat-label">{s.icon} {s.label}{s.isNew && s.gained ? <span className="forge-er-newtag">NEW</span> : null}</span>
                                    <span className="forge-er-stat-calc">
                                        <span className="base">{s.base}{s.suffix}</span>
                                        {s.forge > 0 ? <span className="add">+{s.forge}{s.suffix}</span> : null}
                                        <span className="eq">=</span>
                                        <b className="total">{s.base + s.forge}{s.suffix}</b>
                                    </span>
                                </div>
                            ))}
                            <div className="forge-er-note">{res.allMaxed ? "✦ Stats maxed — further forging earns prestige only" : addedCount ? "Your score was high enough to forge a whole new stat onto the item!" : "Higher scores forge more stats — a perfect run can add brand-new ones"}</div>
                        </div>
                    ) : null}
                    {/* RARE ATTUNEMENT — a bonus utility affix rolled onto the piece (or leveled up). The showpiece moment. */}
                    {res.attune ? (
                        <div className="forge-er-attune">
                            <div className="forge-er-attune-badge">🔮 {res.attune.isNew ? "ATTUNED!" : `ATTUNEMENT UP — Lv ${res.attune.level}`}</div>
                            <div className="forge-er-attune-stat">{res.attune.icon} +{res.attune.value}{res.attune.unit} {res.attune.label}</div>
                            <div className="forge-er-attune-blurb">{res.attune.isNew ? "This piece now carries a bonus stat" : "Leveled its bonus stat"} — {res.attune.blurb}</div>
                        </div>
                    ) : res.util ? (
                        <div className="forge-er-hasattune">🔮 Attuned: {res.util.icon} +{res.util.value}{res.util.unit} {res.util.label} (Lv {res.util.level})</div>
                    ) : null}
                    <div className="forge-sv-xp">+{res.xp} XP</div>
                    <button type="button" className="forge-strike big" onClick={onClose}>Forged!</button>
                </div>
            </div>
        </div>
    );
}

// ── The hammer-&-anvil timing mini-game ─────────────────────────────────────────────────────────────────────
function EnhanceMinigame({ item, parts, steadyHandChance = 0, onCancel, onDone, busy }) {
    const [marker, setMarker] = useState(0.5); // 0..1 position on the heat bar
    const [strikeNo, setStrikeNo] = useState(0);
    const [combo, setCombo] = useState(0);
    const [bestCombo, setBestCombo] = useState(0);
    const [score, setScore] = useState(0);
    const [maxScore, setMaxScore] = useState(0);
    const [pop, setPop] = useState(null); // { label, color, k }
    const [shakeXY, setShakeXY] = useState({ x: 0, y: 0 });
    const [sparks, setSparks] = useState([]);
    const [flash, setFlash] = useState(null); // { color, k } full-modal flash on a strong hit
    const [done, setDone] = useState(false);
    const raf = useRef(0);
    const t0 = useRef(0);
    const comboRef = useRef(0);
    const markerRef = useRef(0.5);
    const scoreRef = useRef(0);
    const maxScoreRef = useRef(0);
    const bestComboRef = useRef(0);
    const lastStrikeAt = useRef(0); // debounce accidental double-taps
    const finished = useRef(false);
    const hitsRef = useRef({ pixel: 0, perfect: 0, great: 0, good: 0, miss: 0 }); // per-tier strike counts for the tally
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
        if (done || finished.current) return;
        // Debounce accidental double-taps (fingers land on the button twice) — ignore a 2nd hit within 150ms.
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastStrikeAt.current < 150) return;
        lastStrikeAt.current = now;
        const dist = Math.abs(markerRef.current - 0.5);
        const g = gradeFor(dist);
        // FEEDBACK ON THE STRIKE ITSELF. The SFX map existed but only ever fired on the RESULT — so the
        // minigame you actually play was silent and dead in the hand, and every hammer blow felt identical
        // whether you nailed it or missed by a mile. The hammer should tell you before the tally does.
        try { SFX[g.key]?.(); } catch { /* audio is a bonus */ }
        try {
            navigator.vibrate?.(g.key === "pixel" ? [0, 18, 28, 18, 28, 26]
                : g.key === "perfect" ? [0, 16, 26, 22]
                    : g.key === "great" ? 22
                        : g.key === "miss" ? 9 : 14);
        } catch { /* no haptics */ }
        hitsRef.current[g.key] = (hitsRef.current[g.key] || 0) + 1; // tally this strike's tier
        let keepCombo = g.score >= 2; // Great+ keeps the combo; Good & Miss reset it
        let saved = false;
        if (!keepCombo && steadyHandChance > 0 && Math.random() < steadyHandChance) { keepCombo = true; saved = true; } // Steady Hand: a slip forgiven (chance)
        const curCombo = comboRef.current;
        const mult = 1 + curCombo * 0.2;
        const add = g.score * mult;
        const nextCombo = keepCombo ? curCombo + 1 : 0;
        comboRef.current = nextCombo;
        scoreRef.current += add;
        maxScoreRef.current += 4 * mult;
        bestComboRef.current = Math.max(bestComboRef.current, nextCombo);
        setCombo(nextCombo);
        setBestCombo(bestComboRef.current);
        setScore(scoreRef.current);
        setMaxScore(maxScoreRef.current);
        setPop({ label: saved ? `${g.label} · SAVED` : g.label, color: saved ? "#8fe3ff" : g.color, k: now, combo: nextCombo });
        (saved ? SFX.great : SFX[g.key] || SFX.miss)();
        // juice: bigger spark burst, a shake scaled by grade, and a full-modal flash on strong/combo hits
        const n = g.score >= 3 ? 22 : g.score >= 2 ? 14 : g.score >= 1 ? 7 : 3;
        setSparks(Array.from({ length: n }, (_, i) => ({ id: now + i, a: Math.random() * 360, d: 34 + Math.random() * 78, c: g.color })));
        const mag = g.score >= 3 ? 13 : g.score >= 1 ? 6 : 9;
        setShakeXY({ x: (Math.random() * 2 - 1) * mag, y: (Math.random() * 2 - 1) * mag });
        if (g.score >= 3 || nextCombo >= 3) setFlash({ color: g.color, k: now });
        setTimeout(() => setShakeXY({ x: 0, y: 0 }), 220);
        setTimeout(() => setSparks([]), 620);
        const nextStrike = strikeNo + 1;
        if (nextStrike >= STRIKES) {
            // Finished — auto-temper (no confirm / "Not now" retry). Show the final hit for a beat, then apply.
            finished.current = true;
            setDone(true);
            cancelAnimationFrame(raf.current);
            const q = maxScoreRef.current > 0 ? Math.max(0, Math.min(1, scoreRef.current / maxScoreRef.current)) : 0;
            const hl = q >= 0.92 ? "pixel" : q >= 0.72 ? "perfect" : q >= 0.45 ? "great" : "good";
            setTimeout(() => onDone({ quality: q, grade: hl, combo: bestComboRef.current, hits: { ...hitsRef.current }, score: Math.round(scoreRef.current), maxScore: Math.round(maxScoreRef.current) }), 650);
        } else { t0.current = 0; setStrikeNo(nextStrike); }
    }, [done, strikeNo, steadyHandChance, onDone]);

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
                {flash ? <div className="forge-mg-flash" key={flash.k} style={{ background: `radial-gradient(circle at 50% 46%, ${flash.color}66, transparent 68%)` }} aria-hidden="true" /> : null}
                <div className="forge-mg-head">
                    <ItemArt id={item.id} icon={item.icon} className="forge-mg-art" alt={item.name} />
                    <div>
                        <div className="forge-mg-name">{item.name}{item.level > 0 ? <span style={{ marginLeft: 8, display: "inline-flex", verticalAlign: "middle" }}><ForgeRank level={item.level} size={22} /></span> : null}</div>
                        <div className="forge-mg-sub">{item.stats}</div>
                    </div>
                    {!done ? <button type="button" className="forge-mg-x" onClick={onCancel} aria-label="Cancel">×</button> : null}
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
                            {steadyHandChance > 0 ? <span title="Steady Hand — chance a slip won't break your combo">🛡️ {Math.round(steadyHandChance * 100)}%</span> : null}
                            <span className="forge-dots">{Array.from({ length: STRIKES }).map((_, i) => <i key={i} className={i < strikeNo ? "hit" : i === strikeNo ? "now" : ""} />)}</span>
                        </div>
                        <button type="button" className="forge-strike" onPointerDown={(e) => { e.preventDefault(); strike(); }}>STRIKE!</button>
                        <div className="forge-mg-tip">Tap when the hammer hits the center. Great+ keeps your combo · Good or a miss breaks it.</div>
                    </>
                ) : (
                    // Finished — auto-tempers (no confirm / retry). Shows the final grade for a beat, then the reveal.
                    <div className="forge-mg-result">
                        <div className="forge-result-grade" style={{ color: headline === "pixel" ? "#ffd75e" : headline === "perfect" ? "#8fe3ff" : headline === "great" ? "#8fe39a" : "#d7c48a" }}>
                            {headline === "pixel" ? "PIXEL PERFECT!" : headline === "perfect" ? "PERFECT!" : headline === "great" ? "GREAT!" : "FORGED"}
                        </div>
                        <div className="forge-result-bar"><span style={{ width: `${Math.round(quality * 100)}%` }} /></div>
                        <div className="forge-result-sub">Execution {Math.round(quality * 100)}% · best combo ×{bestCombo}</div>
                        <div className="forge-mg-forging">🔨 Tempering the item…</div>
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
.forge-tagline { margin: 5px 0 0; font-size: 12.5px; font-weight: 600; color: #f0d9bd; text-shadow: 0 1px 4px #000; }
/* ── Founder's medallion (Alstier1) — small hero circle pinned top-right of the hearth ── */
.forge-founder { position: absolute; top: 12px; right: 12px; z-index: 3; width: 46px; height: 46px; border-radius: 50%; padding: 0; cursor: pointer; overflow: hidden;
    background: radial-gradient(circle at 50% 30%, #221610, #0c0704); border: 2px solid rgba(255,160,60,0.35);
    box-shadow: 0 3px 12px rgba(0,0,0,0.55), inset 0 0 8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,150,60,0.15);
    display: grid; place-items: center; transition: transform .18s cubic-bezier(.2,1.4,.35,1), box-shadow .18s, border-color .18s; }
.forge-founder img { width: 112%; height: 112%; object-fit: contain; object-position: center 8%; display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
.forge-founder span { font-size: 22px; }
.forge-founder:hover, .forge-founder:focus-visible { transform: scale(1.12) rotate(-3deg); border-color: rgba(255,190,90,0.7); box-shadow: 0 5px 18px rgba(0,0,0,0.6), 0 0 16px rgba(255,170,70,0.5); outline: none; }
.forge-founder-scrim { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 20px; background: rgba(8,4,2,0.72); backdrop-filter: blur(3px); animation: forgeFounderFade .2s ease both; }
.forge-founder-card { position: relative; max-width: 340px; width: 100%; text-align: center; padding: 22px 22px 18px; border-radius: 18px;
    background: linear-gradient(180deg, #2a180c, #160c06); border: 1px solid rgba(255,150,60,0.4); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 34px rgba(255,140,40,0.28);
    animation: forgeFounderPop .32s cubic-bezier(.2,1.4,.35,1) both; }
.forge-founder-hero { width: 96px; height: 96px; margin: 0 auto 12px; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 28%, #241811, #0b0603); border: 3px solid rgba(255,170,70,0.4); box-shadow: 0 6px 20px rgba(0,0,0,0.55), inset 0 0 14px rgba(0,0,0,0.6), 0 0 20px rgba(255,150,60,0.25); }
.forge-founder-hero img { width: 108%; height: 108%; object-fit: contain; object-position: center 6%; display: block; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.5)); }
.forge-founder-kicker { font-size: 10.5px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; color: #ffb877; }
.forge-founder-name { margin: 3px 0 8px; font-size: 1.35rem; font-weight: 900; color: #ffe0b0; text-shadow: 0 2px 8px rgba(255,120,20,0.5); }
.forge-founder-body { margin: 0 0 16px; font-size: 13px; line-height: 1.55; color: #ecd6bc; }
.forge-founder-body b { color: #ffd08a; }
.forge-founder-close { width: 100%; padding: 10px; border-radius: 11px; border: none; cursor: pointer; font-weight: 900; font-size: 13px; color: #2a1405; background: linear-gradient(180deg, #ffd06a, #ff9a2e); box-shadow: 0 3px 0 #b4611a; }
.forge-founder-close:active { transform: translateY(2px); box-shadow: 0 1px 0 #b4611a; }
@keyframes forgeFounderFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes forgeFounderPop { from { opacity: 0; transform: scale(.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
/* ── Panels below the scene — the game's standard card, with a forge-warm header ── */
.forge-panel { }
.forge-panel-h { margin: 0 0 11px; font-size: 12px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #ffb877; display: flex; align-items: center; gap: 6px; }
.forge-panel-sub { margin: -6px 0 12px; font-size: 11.5px; line-height: 1.35; color: #b9a892; }
.forge-panel-sub b { color: #ffcf7a; }
.forge-parts { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; margin: 0 0 12px; }
.forge-parts:last-child { margin-bottom: 0; }
.forge-part { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 6px; border-radius: 12px; background: rgba(10,6,3,0.55); border: 1px solid color-mix(in srgb, var(--pc) 55%, transparent); }
.forge-ingot { width: 30px; height: 20px; border-radius: 4px; background: linear-gradient(135deg, color-mix(in srgb, var(--pc) 92%, #fff) , var(--pc) 55%, color-mix(in srgb, var(--pc) 60%, #000)); box-shadow: 0 0 12px color-mix(in srgb, var(--pc) 70%, transparent), inset 0 1px 2px rgba(255,255,255,0.5); clip-path: polygon(14% 0, 86% 0, 100% 100%, 0 100%); }
.forge-partimg { width: 52px; height: 52px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.55)) drop-shadow(0 0 9px color-mix(in srgb, var(--pc) 55%, transparent)); }
.forge-part-body { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.forge-part-body b { font-size: 17px; font-weight: 900; color: #fff; }
.forge-part-name { font-size: 9.5px; font-weight: 700; color: color-mix(in srgb, var(--pc) 75%, #fff); text-align: center; }
.forge-combine { margin-top: 3px; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 3px; flex-wrap: wrap; font-size: 10px; font-weight: 800; padding: 4px 6px; border-radius: 8px; cursor: pointer; line-height: 1.15; border: 1px solid color-mix(in srgb, var(--pc) 60%, transparent); background: color-mix(in srgb, var(--pc) 22%, transparent); color: #fff; }
.forge-combine-n { font-weight: 900; }
.forge-combine-arrow { opacity: 0.85; }
.forge-combine-ico { width: 16px; height: 16px; object-fit: contain; }
.forge-combine-next { font-weight: 800; }
.forge-part-hint { font-size: 9px; color: #b9a892; text-align: center; line-height: 1.2; }
/* Segmented control (one grouped pill, not three clashing blocks) — stacked icon over label so all
   three segments always share the width equally and never clip on narrow phones. */
.forge-tabs { display: flex; gap: 3px; margin-bottom: 14px; padding: 4px; border-radius: 14px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); box-shadow: inset 0 1px 3px rgba(0,0,0,0.4); }
.forge-tabs button { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 2px; border-radius: 10px; cursor: pointer; border: none; background: transparent; color: #c8b49b; transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
.forge-tabs button svg { width: 20px; height: 20px; flex: none; opacity: 0.9; }
.forge-tab-lbl { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 800; white-space: nowrap; }
.forge-tab-ct { font-style: normal; font-size: 9px; font-weight: 900; padding: 0 4px; border-radius: 999px; background: rgba(0,0,0,0.25); color: #e8d6c0; }
@media (hover: hover) { .forge-tabs button:not(.on):hover { background: rgba(255,255,255,0.05); color: #f2e0c8; } }
.forge-tabs button.on { background: linear-gradient(180deg, #ff9a3c, #e0631a); color: #2a1000; box-shadow: 0 2px 8px rgba(255,120,20,0.4), inset 0 1px 0 rgba(255,255,255,0.35); }
.forge-tabs button.on svg { opacity: 1; }
.forge-tabs button.on .forge-tab-ct { background: rgba(0,0,0,0.16); color: #2a1000; }
.forge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(134px, 1fr)); gap: 11px; }
.forge-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 14px 9px 11px; border-radius: 14px; cursor: pointer; text-align: center;
    background: linear-gradient(180deg, rgba(34,20,11,0.9), rgba(14,8,4,0.92)); border: 1px solid color-mix(in srgb, var(--rc) 60%, transparent); color: #efe2d2; transition: transform .12s ease, box-shadow .12s ease; }
.forge-card:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.5), 0 0 18px color-mix(in srgb, var(--rc) 35%, transparent); }
.forge-card:disabled { opacity: 0.7; cursor: default; }
/* Bigger item, on a rarity-tinted glow pedestal so it reads at a glance. */
.forge-art { width: 76px; height: 76px; object-fit: contain; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 14px color-mix(in srgb, var(--rc) 55%, transparent)); }
/* ItemArt sizes its inner <img> in em (1.55em) by default, so the box alone doesn't enlarge it — make the image
   FILL its box in the forge card + the result reveal so the item actually reads big. */
.forge-art .item-art-img, .forge-er-art .item-art-img { width: 100% !important; height: 100% !important; }
.forge-card-name { font-size: 14px; font-weight: 900; line-height: 1.15; color: #fff4e2; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
/* Inherent stats the item was BORN with — quiet, so the forged bonus can pop against them. */
.forge-card-stats { font-size: 11px; color: #bda88c; line-height: 1.25; }
/* What the FORGE added — a green pill that clearly stacks ON TOP of the base stats above. */
.forge-card-bonus { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #a6f0b4; font-weight: 900; line-height: 1.2; background: rgba(80,210,120,0.14); border: 1px solid rgba(143,227,154,0.45); border-radius: 10px; padding: 3px 9px; margin-top: 3px; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.forge-card-attune { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #e0c8ff; font-weight: 900; line-height: 1.2; background: rgba(150,90,255,0.16); border: 1px solid rgba(184,120,255,0.5); border-radius: 10px; padding: 3px 9px; margin-top: 3px; text-shadow: 0 1px 3px rgba(0,0,0,0.4); }
.forge-card-cost { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: #b9a892; margin-top: 3px; }
.forge-card.is-maxed { border-color: rgba(255,215,94,0.6); box-shadow: 0 0 0 1px rgba(255,215,94,0.3), 0 0 16px rgba(255,215,94,0.18); }
.forge-card-max { color: #ffd75e; font-weight: 900; }
.forge-cost-ico { width: 16px; height: 16px; object-fit: contain; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.5)); }
.forge-lvl { position: absolute; top: 6px; right: 6px; font-size: 12px; font-weight: 900; color: #2a1000; background: linear-gradient(180deg,#ffd75e,#f3b23a); border-radius: 999px; padding: 1px 7px; box-shadow: 0 2px 6px rgba(0,0,0,0.5); }
.forge-lvl.inline { position: static; margin-left: 6px; }
.forge-card-rankline { display: block; margin: 1px 0 1px; line-height: 1; }
.forge-working { font-size: 10px; color: #ffb877; }
.forge-empty { grid-column: 1/-1; text-align: center; color: #c8b79f; font-size: 13px; padding: 22px; }
/* Attune (elemental reforge) */
.forge-card-elems { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin: 2px 0; }
.forge-elem-chip { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; border: 1px solid currentColor; background: rgba(0,0,0,0.25); white-space: nowrap; }
.forge-elem-chip.is-neutral { color: #9aa0a6; }
.forge-elem-chip.big { font-size: 14px; padding: 4px 12px; }
.forge-reforge { width: min(380px, 94vw); border-radius: 18px; padding: 18px; background: linear-gradient(180deg, rgba(34,22,14,0.99), rgba(18,11,7,0.99)); border: 1px solid rgba(255,196,110,0.4); box-shadow: 0 18px 50px rgba(0,0,0,0.65); }
.forge-reforge-head { display: flex; gap: 12px; align-items: center; }
.forge-reforge-art { width: 56px; height: 56px; }
.forge-reforge-name { font-size: 15px; font-weight: 900; color: #ffe0a0; }
.forge-reforge-cur { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 4px; font-size: 11px; color: #c8b79f; }
.forge-reforge-sub { margin: 12px 0 8px; font-size: 12px; color: #cbb99a; }
.forge-mode-toggle { display: flex; gap: 6px; margin: 10px 0 4px; }
.forge-mode-toggle button { flex: 1; padding: 8px 6px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: #cbb9a0; font-weight: 800; font-size: 11.5px; cursor: pointer; }
.forge-mode-toggle button.on { border-color: rgba(184,120,255,0.6); background: rgba(150,90,255,0.16); color: #e6ccff; }
.forge-card-scroll { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 900; color: #e6ccff; background: rgba(150,90,255,0.16); border: 1px solid rgba(184,120,255,0.45); border-radius: 999px; padding: 2px 7px; margin-top: 3px; }
.forge-elem-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.forge-elem-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px; border-radius: 12px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #e8d6c0; font-size: 11.5px; font-weight: 800; position: relative; }
.forge-elem-btn .forge-elem-emoji { font-size: 22px; }
.forge-elem-btn.on { border-color: var(--ec); box-shadow: 0 0 0 1px var(--ec), 0 0 16px color-mix(in srgb, var(--ec) 55%, transparent); background: color-mix(in srgb, var(--ec) 16%, transparent); }
.forge-elem-btn.is-owned { opacity: 0.45; cursor: default; }
.forge-elem-has { font-size: 8.5px; font-weight: 900; color: #8fe3a1; }
.forge-reforge-actions { display: flex; gap: 8px; margin-top: 14px; }
.forge-reforge-cancel { flex: 0 0 auto; padding: 11px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #d8cbb8; font-weight: 800; font-size: 13px; cursor: pointer; }
.forge-reforge-go { flex: 1 1 auto; padding: 11px 16px; border-radius: 12px; border: none; background: linear-gradient(180deg,#ffe488,#f0a83a); color: #2a1000; font-weight: 900; font-size: 13.5px; cursor: pointer; box-shadow: 0 3px 12px rgba(240,168,58,0.45); }
.forge-reforge-go:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
.forge-reforge-fx { width: min(340px, 92vw); text-align: center; border-radius: 20px; padding: 22px; background: radial-gradient(120% 100% at 50% 0%, rgba(70,40,16,0.98), rgba(16,10,6,0.99)); border: 1px solid rgba(255,196,110,0.5); box-shadow: 0 18px 50px rgba(0,0,0,0.65); display: flex; flex-direction: column; align-items: center; gap: 8px; animation: forgeAttunePop .45s ease both; }
.forge-reforge-fx.is-dual { border-color: rgba(184,120,255,0.7); box-shadow: 0 18px 50px rgba(0,0,0,0.65), 0 0 40px rgba(150,90,255,0.4); }
.forge-reforge-badge { font-size: 14px; font-weight: 900; letter-spacing: 0.05em; color: #e6ccff; text-shadow: 0 0 12px rgba(184,120,255,0.8); }
.forge-reforge-fxart { width: 92px; height: 92px; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.55)); }
.forge-reforge-fxname { font-size: 16px; font-weight: 900; color: #fff; }
.forge-reforge-fxels { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.forge-reforge-fxsub { font-size: 12px; color: #cbb99a; }
.forge-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 10062; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center;
    background: linear-gradient(180deg, rgba(40,22,10,0.98), rgba(22,12,6,0.98)); border: 1px solid #ff9a3c; border-radius: 14px; padding: 12px 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); color: #ffe0b0; max-width: 92vw; animation: forgePop .35s cubic-bezier(.2,1.3,.3,1) both; }
.forge-toast.is-err { border-color: #e05b6a; color: #ffc9ce; }
.forge-toast b { font-size: 15px; color: #ffd75e; }
.forge-toast span { font-size: 12px; }
@keyframes forgePop { from { opacity: 0; transform: translate(-50%, 14px) scale(.9); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
/* Centered pop for normal-flow / grid-centered elements — forgePop's translate(-50%) is ONLY for the left:50% toast. */
@keyframes forgePopC { from { opacity: 0; transform: translateY(14px) scale(.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
/* ── mini-game ── */
.forge-mg-scrim { position: fixed; inset: 0; z-index: 10060; background: radial-gradient(120% 90% at 50% 30%, rgba(60,26,8,0.7), rgba(6,3,1,0.92)); display: grid; place-items: center; padding: 16px; }
.forge-mg { position: relative; overflow: hidden; width: 100%; max-width: 440px; border-radius: 18px; padding: 16px; background: linear-gradient(180deg, #2a180c, #140b06); border: 2px solid color-mix(in srgb, var(--rc) 70%, #ff9a3c); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 30px color-mix(in srgb, var(--rc) 30%, transparent); }
.forge-mg-flash { position: absolute; inset: 0; z-index: 5; pointer-events: none; animation: forgeFlash .45s ease-out forwards; }
@keyframes forgeFlash { 0% { opacity: 0.9; } 100% { opacity: 0; } }
.forge-mg-forging { margin-top: 14px; text-align: center; font-size: 15px; font-weight: 900; color: #ffcf7a; letter-spacing: 0.02em; animation: forgeForging 1s ease-in-out infinite; }
@keyframes forgeForging { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
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
.forge-result-grade { font-size: 1.7rem; font-weight: 900; text-shadow: 0 2px 12px rgba(0,0,0,0.7); animation: forgeGradeIn .4s cubic-bezier(.2,1.4,.3,1) both; }
@keyframes forgeGradeIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: scale(1); } }
.forge-result-bar { height: 12px; border-radius: 999px; background: rgba(0,0,0,0.5); overflow: hidden; margin: 12px 0 6px; border: 1px solid rgba(255,150,60,0.4); }
.forge-result-bar span { display: block; height: 100%; background: linear-gradient(90deg, #f3922a, #ffd75e); box-shadow: 0 0 12px #ffcf7a; transition: width .6s cubic-bezier(.2,1,.3,1); }
.forge-result-sub { font-size: 12px; color: #cdb89f; }
.forge-mg-cancel { display: block; margin: 8px auto 0; background: none; border: none; color: #b9a892; font-size: 12px; cursor: pointer; }
/* ── salvage preview / reveal modal ── */
.forge-sv { width: 100%; max-width: 400px; border-radius: 18px; padding: 16px; background: linear-gradient(180deg, #2a180c, #140b06); border: 2px solid color-mix(in srgb, var(--rc) 70%, #ff9a3c); box-shadow: 0 24px 70px rgba(0,0,0,0.7), 0 0 30px color-mix(in srgb, var(--rc) 30%, transparent); animation: forgePopC .3s cubic-bezier(.2,1.3,.3,1) both; }
.forge-sv-warn { margin: 12px 0 0; font-size: 11px; color: #ffc98a; background: rgba(255,150,60,0.12); border: 1px solid rgba(255,150,60,0.35); border-radius: 9px; padding: 7px 9px; }
.forge-sv-cmp { margin: 12px 0 0; padding: 10px 11px; border-radius: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); }
.forge-sv-cmp-head, .forge-sv-cmp-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px; }
.forge-sv-cmp-head { padding-bottom: 6px; margin-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.forge-sv-cmp-col { font-size: 9.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #b9a892; min-width: 74px; text-align: right; }
.forge-sv-cmp-row { padding: 3px 0; }
.forge-sv-cmp-stat { font-size: 12px; font-weight: 700; color: #d9cdbb; }
.forge-sv-cmp-val { font-size: 12.5px; font-weight: 800; color: #f2ead9; min-width: 74px; text-align: right; }
.forge-sv-cmp-val b { margin-left: 6px; font-size: 11px; font-weight: 900; }
.forge-sv-cmp-val b.up { color: #4ad07f; }
.forge-sv-cmp-val b.down { color: #e0685c; }
.forge-sv-cmp-note { margin: 7px 0 0; font-size: 10.5px; line-height: 1.35; color: #9aa0a6; }
.forge-sv-yield { margin: 12px 0 0; padding: 12px; border-radius: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); text-align: center; }
.forge-sv-yield-label { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #b9a892; }
.forge-sv-yield-main { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 6px; font-size: 14px; color: #efe2d2; }
.forge-sv-yield-main b { font-size: 22px; font-weight: 900; color: #ffd75e; }
.forge-sv-yieldimg { width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); }
.forge-sv-odds { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 10px 0 2px; }
.forge-sv-odds span { font-size: 10.5px; font-weight: 700; color: #cdb89f; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 3px 9px; }
.forge-sv-odds span.rare { color: #ffd75e; border-color: rgba(255,215,94,0.4); background: rgba(255,215,94,0.1); }
.forge-sv .forge-strike { margin-top: 14px; }
.forge-sv-result { text-align: center; padding: 6px 4px 2px; }
.forge-sv-reward { display: inline-flex; flex-direction: column; align-items: center; animation: forgeReveal .5s cubic-bezier(.2,1.5,.35,1) both; }
.forge-sv-rewardimg { width: 92px; height: 92px; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.55)) drop-shadow(0 0 18px color-mix(in srgb, var(--rc) 50%, transparent)); animation: forgeRewardBob 2.4s ease-in-out infinite; }
.forge-sv-plus { font-size: 2.1rem; font-weight: 900; color: #ffd75e; text-shadow: 0 2px 12px rgba(255,150,30,0.6); margin-top: 2px; }
.forge-sv-rewardname { font-size: 13px; font-weight: 800; color: #efe2d2; }
.forge-sv-tag { margin: 8px auto 0; display: inline-block; font-size: 12px; font-weight: 800; padding: 5px 12px; border-radius: 999px; animation: forgePopC .4s cubic-bezier(.2,1.3,.3,1) both; }
.forge-sv-tag.double { color: #2a1000; background: linear-gradient(180deg,#ffe07a,#f3b23a); }
.forge-sv-tag.bonus { color: #8fe3ff; background: rgba(143,227,255,0.14); border: 1px solid rgba(143,227,255,0.4); }
.forge-sv-tag.regalia { color: #ffcf8a; background: rgba(255,180,80,0.16); border: 1px solid rgba(255,180,80,0.5); }
.forge-sv-xp { margin-top: 10px; font-size: 12px; font-weight: 800; color: #8fe3a1; }
@keyframes forgeReveal { 0% { opacity: 0; transform: scale(.4) translateY(10px); } 60% { opacity: 1; } 100% { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes forgeRewardBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
/* ── enhance reveal (big, juicy, self-contained) ── */
.forge-er { overflow: hidden; } /* clip the light rays so the glow never bleeds past the card */
.forge-er-grade { font-size: 1.55rem; font-weight: 900; letter-spacing: 0.02em; text-shadow: 0 2px 12px rgba(0,0,0,0.7); margin-bottom: 2px; animation: forgeGradeIn .4s cubic-bezier(.2,1.4,.3,1) both; }
.forge-er-stage { position: relative; display: grid; place-items: center; width: 100%; height: 184px; margin: 2px 0 4px; }
/* Rays are a smaller, dimmer frame so the ITEM is the star (not a giant starburst around a tiny sprite). */
.forge-er-rays { position: absolute; width: 236px; height: 236px; border-radius: 50%; pointer-events: none;
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--rc) 26%, transparent) 0deg 6deg, transparent 6deg 18deg);
    -webkit-mask-image: radial-gradient(circle, #000 14%, rgba(0,0,0,0.3) 38%, transparent 66%); mask-image: radial-gradient(circle, #000 14%, rgba(0,0,0,0.3) 38%, transparent 66%);
    opacity: 0.5; animation: forgeRaySpin 16s linear infinite; }
.forge-er-glow { position: absolute; width: 216px; height: 216px; border-radius: 50%; pointer-events: none; background: radial-gradient(circle, color-mix(in srgb, var(--rc) 55%, transparent) 0%, transparent 66%); filter: blur(5px); animation: forgeGlowPulse 2.4s ease-in-out infinite; }
.forge-er-art { position: relative; z-index: 1; width: 168px; height: 168px; object-fit: contain; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.6)) drop-shadow(0 0 22px color-mix(in srgb, var(--rc) 70%, transparent)); animation: forgeArtIn .5s cubic-bezier(.2,1.5,.35,1) both, forgeRewardBob 2.6s ease-in-out .5s infinite; }
.forge-er-name { font-size: 1.5rem; font-weight: 900; color: #ffd75e; text-shadow: 0 2px 12px rgba(255,150,30,0.55); line-height: 1.1; }
.forge-er-rankrow { display: flex; justify-content: center; margin-top: 5px; }
.forge-er-stats { margin: 12px 0 2px; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.08); text-align: left; }
.forge-er-statrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; font-size: 13px; }
.forge-er-statrow + .forge-er-statrow { border-top: 1px solid rgba(255,255,255,0.05); }
.forge-er-statrow.up .total { animation: forgeStatPulse .7s ease-out both; }
.forge-er-stat-label { color: #e6d7c2; font-weight: 700; }
.forge-er-stat-calc { display: inline-flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
.forge-er-stat-calc .base { color: #b9a892; }
.forge-er-stat-calc .add { color: #8fe39a; font-weight: 900; }
.forge-er-stat-calc .eq { color: #7c6f5f; }
.forge-er-stat-calc .total { color: #fff6e2; font-weight: 900; font-size: 15px; }
.forge-er-note { margin-top: 8px; font-size: 10.5px; color: #b9a892; text-align: center; font-weight: 600; }
.forge-er-attune { margin-top: 12px; padding: 12px 14px; border-radius: 14px; text-align: center; background: radial-gradient(120% 120% at 50% 0%, rgba(150,90,255,0.28), rgba(60,30,110,0.22)); border: 1px solid rgba(184,120,255,0.55); box-shadow: 0 0 22px rgba(150,90,255,0.35); animation: forgeAttunePop .5s ease both; }
.forge-er-attune-badge { font-size: 12px; font-weight: 900; letter-spacing: 0.06em; color: #e6ccff; }
.forge-er-attune-stat { margin-top: 4px; font-size: 17px; font-weight: 900; color: #fff; text-shadow: 0 0 12px rgba(184,120,255,0.8); }
.forge-er-attune-blurb { margin-top: 3px; font-size: 10.5px; font-weight: 700; color: #cbb9e0; }
.forge-er-hasattune { margin-top: 10px; font-size: 11px; font-weight: 800; color: #cbb9e0; }
@keyframes forgeAttunePop { 0% { transform: scale(0.7); opacity: 0; } 60% { transform: scale(1.06); } 100% { transform: scale(1); opacity: 1; } }
.forge-er-newtag { margin-left: 6px; font-size: 9px; font-weight: 900; letter-spacing: 0.04em; color: #0e2c14; background: #8fe39a; border-radius: 5px; padding: 1px 5px; vertical-align: middle; }
@keyframes forgeRaySpin { to { transform: rotate(360deg); } }
@keyframes forgeGlowPulse { 0%,100% { transform: scale(0.92); opacity: 0.7; } 50% { transform: scale(1.06); opacity: 1; } }
@keyframes forgeArtIn { 0% { opacity: 0; transform: scale(.4) translateY(12px); } 60% { opacity: 1; } 100% { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes forgeStatPulse { 0% { color: #8fe39a; transform: scale(1.28); } 100% { color: #fff6e2; transform: scale(1); } }
/* ── post-forge TALLY (performance → yield, animated up before the reveal) ── */
.forge-tally-title { margin: 8px 0 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #b9a892; }
.forge-tally-hits { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; max-width: 320px; margin: 0 auto; }
.forge-hit-chip { font-size: 12px; font-weight: 700; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; padding: 4px 11px; opacity: 0; animation: forgeTallyPop .4s cubic-bezier(.2,1.5,.3,1) both; }
.forge-hit-chip b { font-weight: 900; font-variant-numeric: tabular-nums; }
.forge-tally-chain { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; margin: 12px auto 2px; max-width: 320px; padding: 10px 12px; border-radius: 12px; background: rgba(255,207,122,0.1); border: 1px solid rgba(255,207,122,0.32); opacity: 0; animation: forgeTallyPop .5s cubic-bezier(.2,1.5,.3,1) both; }
.forge-tally-chain .chain-perf { font-size: 13px; font-weight: 900; color: #ffe6a6; width: 100%; }
.forge-tally-chain .chain-step { font-size: 13px; font-weight: 700; color: #e6d7c2; }
.forge-tally-chain .chain-arrow { color: #ffcf7a; font-weight: 900; }
.forge-tally-chain .chain-yield { font-size: 14px; font-weight: 900; color: #2a1000; background: linear-gradient(180deg,#ffe07a,#f3b23a); border-radius: 999px; padding: 3px 11px; box-shadow: 0 3px 10px rgba(243,178,58,0.4); }
.forge-tally { margin: 12px auto 4px; max-width: 300px; display: flex; flex-direction: column; gap: 7px; }
.forge-tally-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; font-weight: 800; color: #e6d7c2; background: rgba(0,0,0,0.28); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 8px 12px; opacity: 0; animation: forgeTallyIn .42s cubic-bezier(.2,1.4,.3,1) both; }
.forge-tally-row b { font-variant-numeric: tabular-nums; font-size: 16px; font-weight: 900; }
.forge-tally-sum { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 15px; font-weight: 900; color: #2a1000; background: linear-gradient(180deg,#ffe07a,#f3b23a); border-radius: 11px; padding: 9px 13px; opacity: 0; animation: forgeTallyPop .5s cubic-bezier(.2,1.5,.3,1) both; box-shadow: 0 4px 14px rgba(243,178,58,0.4); }
.forge-tally-sum b { font-size: 18px; font-weight: 900; }
.forge-tally-skip { display: block; margin: 12px auto 0; background: none; border: none; color: #b9a892; font-size: 12px; font-weight: 700; cursor: pointer; }
@keyframes forgeTallyIn { 0% { opacity: 0; transform: translateX(-14px); } 100% { opacity: 1; transform: translateX(0); } }
@keyframes forgeTallyPop { 0% { opacity: 0; transform: scale(.6); } 100% { opacity: 1; transform: scale(1); } }
/* ── locked enhance card (can't afford the parts) ── */
.forge-card.is-locked { opacity: 0.82; }
/* Locked cards dim the item but KEEP its rarity glow (re-declare the drop-shadows — filter overrides, not
   appends — so epic/purple pieces still glow when they're locked, just like the affordable rare ones). */
.forge-card.is-locked .forge-art { filter: drop-shadow(0 3px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 12px color-mix(in srgb, var(--rc) 48%, transparent)) grayscale(0.4) brightness(0.88); }
.forge-card-cost.is-short { color: #ff8f9a; font-weight: 800; }
.forge-card-locktag { margin-left: 3px; }
/* ⚠️ TEST-ONLY dev panel — remove before launch */
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
.forge-daily-claim { flex: 0 0 auto; padding: 6px 13px; border-radius: 9px; font-weight: 900; font-size: 12px; cursor: pointer; border: none; color: #2a1000; background: linear-gradient(180deg,#8fe39a,#4bbf6a); box-shadow: 0 2px 0 #2e7d46; animation: forgePopC .4s cubic-bezier(.2,1.3,.3,1) both; }
.forge-daily-tag { flex: 0 0 auto; font-size: 10.5px; color: #b9a892; }
.forge-daily-tag.done { color: #8fe3a1; font-weight: 800; }
/* ── Blacksmith's Regalia (salvaging set) ── */
.forge-regalia { margin: 0; padding: 10px 12px; border-radius: 14px; background: linear-gradient(180deg, rgba(40,24,10,0.6), rgba(14,8,4,0.7)); border: 1px solid rgba(255,180,80,0.3); }
.forge-regalia-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.forge-regalia-title { font-size: 12.5px; font-weight: 900; color: #ffcf8a; letter-spacing: 0.02em; }
.forge-regalia-count { font-size: 10.5px; color: #c8b79f; }
.forge-regalia-note { margin: -4px 0 9px; font-size: 10.5px; line-height: 1.4; color: #a89680; }
.forge-regalia-row { display: flex; gap: 6px; }
.forge-regalia-slot { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.forge-regalia-piece { position: relative; width: 100%; max-width: 54px; aspect-ratio: 1; border-radius: 10px; display: grid; place-items: center; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); overflow: hidden; }
.forge-regalia-piece.is-owned { border-color: rgba(255,215,94,0.55); }
.forge-regalia-piece.is-found { border-color: #ffd75e; box-shadow: 0 0 10px rgba(255,215,94,0.5); background: rgba(255,180,80,0.12); }
.forge-regalia-piece img { width: 82%; height: 82%; object-fit: contain; }
.forge-regalia-piece img.is-locked { filter: grayscale(0.75) brightness(0.5); opacity: 0.6; }
.forge-regalia-glyph { font-size: 20px; font-weight: 900; color: #6a5a48; }
.forge-regalia-badge { position: absolute; bottom: 2px; right: 2px; font-size: 10px; line-height: 1; text-shadow: 0 1px 2px #000; }
.forge-regalia-badge.worn { color: #ffd75e; font-weight: 900; }
.forge-regalia-name { font-size: 8.5px; line-height: 1.12; text-align: center; color: #cbb79c; font-weight: 700; }
.forge-regalia-tiers { display: flex; flex-direction: column; gap: 6px; margin-top: 11px; }
.forge-regalia-tier { display: flex; align-items: center; gap: 8px; padding: 6px 9px; border-radius: 9px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); }
.forge-regalia-tier.is-active { border-color: rgba(143,227,161,0.5); background: rgba(75,191,106,0.12); }
.forge-regalia-tierN { flex: none; font-size: 10px; font-weight: 900; color: #ffcf8a; background: rgba(255,180,80,0.16); border-radius: 999px; padding: 2px 8px; }
.forge-regalia-tier.is-active .forge-regalia-tierN { color: #8fe3a1; background: rgba(143,227,161,0.18); }
.forge-regalia-tierLbl { flex: 1; min-width: 0; font-size: 11px; color: #d8c8b2; }
.forge-regalia-tierOn { flex: none; font-size: 8.5px; font-weight: 900; letter-spacing: 0.06em; color: #8fe3a1; }
`;
