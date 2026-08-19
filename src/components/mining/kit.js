"use client";

import { useState } from "react";

import { PART_TIERS } from "@/lib/marketplace/forge-parts.js";

// ── MINE KIT ─────────────────────────────────────────────────────────────────────────────────────────────────
// The pieces every mining tab needs. Each tab used to carry its own copy of the image fallback, the rarity
// palette and the tool panel, which is how "Fanged Helm" ended up truncated in one place and not another.

export const money = (n) => Number(n || 0).toLocaleString();

// NO EMOJI. They are the OS's artwork, not ours, and they render differently on every device — in the middle
// of hand-painted game art they read as borrowed. Everything here is either a generated sprite or a Gi glyph.
export const KIND_ART = {
    gold: "/images/ui/coin.png",
    chest: "/images/ui/chest.png",
    gear: "/images/ui/gear.png",
    consumable: "/images/ui/potion.png",
    // The mine is the only place jewels come from, so its screens have to be able to draw one. Reusing the
    // painted gemstone already drawn for the Trove badge stat rather than commissioning a second one.
    gem: "/images/bonus/trove.png",
    seed: "/images/ui/seed.png",
};

// The forge parts the mine feeds. These names were HAND-TYPED here, a second copy of a catalog that already
// existed — and because the copy carried only the names, every mining screen announced "2× Iron Filings" as
// bare text while the painted Iron Filings sprite sat unused in the forge catalog. Sourced from it now, so a
// part looks the same coming out of the furnace as it does sitting in the Forge.
export const PART_NAME = Object.fromEntries(PART_TIERS.map((p) => [p.tier, p.name]));
export const PART_SPRITE = Object.fromEntries(PART_TIERS.map((p) => [p.tier, p.sprite]));
export const PART_COLOR = Object.fromEntries(PART_TIERS.map((p) => [p.tier, p.color]));

// The same rarity language the chest opener uses, so a Legendary out of the rock reads exactly like a
import { describeStats } from "@/lib/marketplace/items.js";

// Legendary out of a chest — one game, one vocabulary.
export const RARITY_COLOR = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };
export const RARITY_LABEL = { common: "COMMON", rare: "RARE", epic: "EPIC", legendary: "LEGENDARY", mythic: "MYTHIC", ascendant: "ASCENDANT", eternal: "ETERNAL" };
// One vocabulary for stats too — the local six-stat map here printed `+9 base_damage` for anything newer.
export const statLine = (stats) => describeStats(stats);

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

// THE POUR LANDING — the sound the result screen deserved and never had. It was a single `clink()` keyed off
// a band name ("hot") that stopped existing when the smelt moved onto the shared timing bands, so most pours
// fell through to the quietest zap in the file.
//
// A quench is steam and then metal: a burst of filtered noise for the hiss, then a short rising arpeggio whose
// length and brightness scale with how well you poured. A spilled pour gets the hiss and one flat low note —
// it should sound like a shrug.
export function quench(band = "good") {
    const a = ac(); if (!a) return;
    try {
        const t = a.currentTime;
        // ── the hiss: white noise through a lowpass that closes as the steam dies ──
        const secs = 0.5;
        const buf = a.createBuffer(1, Math.floor(a.sampleRate * secs), a.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
        const src = a.createBufferSource(); src.buffer = buf;
        const lp = a.createBiquadFilter(); lp.type = "lowpass";
        lp.frequency.setValueAtTime(5200, t);
        lp.frequency.exponentialRampToValueAtTime(420, t + secs);
        const hg = a.createGain();
        hg.gain.setValueAtTime(0.16, t);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + secs);
        src.connect(lp); lp.connect(hg); hg.connect(a.destination);
        src.start(t); src.stop(t + secs);

        // ── the metal: how good it was, as notes ──
        const NOTES = {
            pixel: [523, 659, 784, 1047, 1319],
            perfect: [523, 659, 784, 1047],
            great: [523, 659, 784],
            good: [440, 587],
            miss: [175],
        };
        (NOTES[band] || NOTES.good).forEach((freq, i) => {
            const at = t + 0.14 + i * 0.085;
            const o = a.createOscillator(), g = a.createGain();
            o.type = band === "miss" ? "sawtooth" : "triangle";
            o.frequency.setValueAtTime(freq, at);
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(band === "miss" ? 0.09 : 0.17, at + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
            o.connect(g); g.connect(a.destination);
            o.start(at); o.stop(at + 0.36);
        });
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
                : <button className="btn-ghost sail-upg-buy" disabled={busy || (gold ?? 0) < t.cost} onClick={onBuy}><Img src="/images/ui/coin.png" className="mine-btn-ico" fallback="" /> {Number(t.cost).toLocaleString()}</button>}
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
