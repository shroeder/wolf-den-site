"use client";

import { useState } from "react";

// ── MINE KIT ─────────────────────────────────────────────────────────────────────────────────────────────────
// The pieces every mining tab needs. Each tab used to carry its own copy of the image fallback, the rarity
// palette and the tool panel, which is how "Fanged Helm" ended up truncated in one place and not another.

export const money = (n) => Number(n || 0).toLocaleString();

// NO EMOJI. They are the OS's artwork, not ours, and they render differently on every device — in the middle
// of hand-painted game art they read as borrowed. Everything here is either a generated sprite or a Gi glyph.
export const KIND_ART = {
    gold: "/images/mining/icon-coins.png",
    chest: "/images/mining/icon-chest.png",
    gear: "/images/mining/icon-gear.png",
    consumable: "/images/mining/icon-potion.png",
};

export const PART_NAME = { 1: "Cinder Scrap", 2: "Iron Filings", 3: "Tempered Steel", 4: "Mythril Dust", 5: "Emberheart Shard" };

// The same rarity language the chest opener uses, so a Legendary out of the rock reads exactly like a
// Legendary out of a chest — one game, one vocabulary.
export const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
export const RARITY_LABEL = { common: "COMMON", rare: "RARE", epic: "EPIC", legendary: "LEGENDARY", mythic: "MYTHIC", ascendant: "ASCENDANT", eternal: "ETERNAL" };
const STAT_SHORT = { might: "Might", crit_chance: "Crit", crit_power: "Crit Dmg", ferocity: "Ferocity", fortune: "Fortune", extra_strike: "Extra Strike" };
export const statLine = (stats) => Object.entries(stats || {}).map(([k, v]) => `+${v} ${STAT_SHORT[k] || k}`).join(" · ");

// ── SOUND ────────────────────────────────────────────────────────────────────────────────────────────────────
let _ac = null;
const ac = () => {
    if (typeof window === "undefined") return null;
    try {
        _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
        if (_ac.state === "suspended") _ac.resume();
        return _ac;
    } catch { return null; }
};
export function clink(strength = 1) {
    const a = ac(); if (!a) return;
    try {
        const o = a.createOscillator(), g = a.createGain();
        o.type = "square"; o.frequency.setValueAtTime(220 + 520 * strength, a.currentTime);
        o.frequency.exponentialRampToValueAtTime(90, a.currentTime + 0.16);
        g.gain.setValueAtTime(0.09 * strength + 0.03, a.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.2);
        o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.22);
    } catch { /* audio is a bonus */ }
}

// ── ATOMS ────────────────────────────────────────────────────────────────────────────────────────────────────
export const Img = ({ src, alt = "", className, fallback }) => {
    const [bad, setBad] = useState(false);
    if (bad || !src) return <span className={className} aria-hidden="true">{fallback}</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt={alt} draggable="false" onError={() => setBad(true)} />;
};

export const KindIcon = ({ kind, art, className }) => (
    <Img src={art || KIND_ART[kind] || KIND_ART.gold} className={className} fallback="" />
);

// One upgrade card, in the house style the boat and the forge already use — accent stripe, level bar, and a
// "what it does now → next" row.
export function UpgCard({ t, gold, busy, onBuy }) {
    return (
        <div className={`sail-upg${t.maxed ? " is-maxed" : ""}`}>
            <div className="sail-upg-top">
                <span className="sail-upg-title"><span className="sail-upg-ico"><Img src={t.icon} className="mine-upg-ico" fallback="" /></span>{t.name}</span>
                <span className="muted sail-upg-lv">Lv {t.level}/{t.max}</span>
            </div>
            <div className="sail-upg-bar" aria-hidden="true"><span style={{ width: `${t.max ? Math.min(100, (t.level / t.max) * 100) : 0}%` }} /></div>
            <p className="muted sail-upg-desc">{t.desc}</p>
            <div className="sail-upg-effect">
                <span>{t.effect || "Effect"}</span>
                <b>{t.now}{t.maxed ? "" : <> → <span className="sail-upg-next">{t.next}</span></>}</b>
            </div>
            {t.maxed
                ? <button className="pill" disabled>Maxed</button>
                : <button className="btn-ghost sail-upg-buy" disabled={busy || (gold ?? 0) < t.cost} onClick={onBuy}><Img src="/images/mining/icon-coins.png" className="mine-btn-ico" fallback="" /> {Number(t.cost).toLocaleString()}</button>}
        </div>
    );
}

// THE TOOL PANEL — your lantern, your pickaxe, your furnace. All three tabs show the same thing about a
// different tool: the sprite you've earned, what the next one is called, how close you are, and the levers
// that get you there. It was written out three times; the wording drifted between them.
export function ToolPanel({ tool, levels, tracks, gold, busy, onBuy, artClass = "", trackClass = "", maxedNote }) {
    return (
        <div className="mine-panel">
            <div className="mine-pickhead">
                <div className={`mine-pickart${artClass ? ` ${artClass}` : ""}`}>
                    <Img src={tool?.sprite} className="mine-pickart-img" fallback="" />
                </div>
                <div className="mine-pickbody">
                    <b>{tool?.name}</b>
                    {tool?.nextName
                        ? <em>{tool.nextName} at {tool.nextAt} upgrades · you have {levels ?? 0}</em>
                        : <em>{maxedNote}</em>}
                    {tool?.nextAt ? (
                        <span className="mine-pickbar"><span style={{ width: `${Math.min(100, ((levels ?? 0) / tool.nextAt) * 100)}%` }} /></span>
                    ) : null}
                </div>
            </div>
            <div className={`sail-upgrades${trackClass ? ` ${trackClass}` : ""}`} style={{ marginTop: 12 }}>
                {(tracks || []).map((t) => <UpgCard key={t.key} t={t} gold={gold} busy={busy} onBuy={() => onBuy(t.key)} />)}
            </div>
        </div>
    );
}
