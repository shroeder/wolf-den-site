"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    groveTrack, setGroveBoss, setGroveDanger, startGroveMusic, stopGroveMusic,
} from "@/components/grove/grove-music.js";
import { GROVE_ZONES } from "@/lib/marketplace/grove-catalog.js";
import { MAP_ZONES } from "@/lib/marketplace/grove-maps.js";

// ── THE GROVE'S MUSIC, ON A BENCH ────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS IS THE ONLY WAY THE MUSIC CAN BE JUDGED. Eighty-four built zones, a hundred and forty-four designed,
// and hearing one in the game means walking a real account into it — which for anything past the first map
// means grinding to it. A bed is also the one kind of asset that cannot be reviewed in a screenshot and
// cannot be reviewed in five seconds: the whole question is whether it is still bearable after two minutes
// and whether it sounds like the PLACE, and both of those are listening, not looking.
//
// So every zone in the design is one tap away, with what it is made of written next to it — the mode's
// companion interval, the biome kit, the map tint, the depth pressure. "Dorian, moss, depth 2" is most of
// what makes it possible to say which of two zones is wrong.
//
// ⚠️ AND THE DANGER DIALS ARE HERE BECAUSE THEY ARE UNREACHABLE OTHERWISE. The layers that arrive at low
// health and with a boss awake are the half of the bed a reviewer would never hear: being two thirds dead in
// front of a live boss is not a state anybody can produce on demand, and it is exactly the state the music is
// supposed to make you feel. Same argument as the scene lab's "boss" and "loot" fixtures.
//
// Dev only, and the page 404s in every other build — same rule as the Grove, Arena, Casino and Farm labs.

// ⚠️ THE UNBUILT MAPS ARE LISTED TOO. grove-maps.js declares all twelve; GROVE_ZONES stops at MAPS_BUILT
// because a zone with no backdrop is a black screen. Music has no such problem — a bed needs no art — so the
// design can be heard years before it is walked, which is the cheapest possible way to find out that map 10
// sounds like map 4.
const ALL = (() => {
    const built = new Set(GROVE_ZONES.map((z) => z.id));
    const rest = MAP_ZONES.filter((z) => !built.has(z.id));
    return [...GROVE_ZONES.map((z) => ({ ...z, built: true })), ...rest.map((z) => ({ ...z, built: false }))];
})();

const INK = "#efe7d8";
const DIM = "#b9ae99";

const card = {
    background: "rgba(0,0,0,0.42)", border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 10, padding: "10px 12px", color: INK,
};

export default function GroveMusicLab() {
    const [playing, setPlaying] = useState(null);
    const [danger, setDanger] = useState(0);
    const [boss, setBoss] = useState(false);

    useEffect(() => { setGroveDanger(danger); }, [danger]);
    useEffect(() => { setGroveBoss(boss); }, [boss]);
    useEffect(() => () => stopGroveMusic(), []);

    const play = useCallback((z) => {
        if (playing === z.id) { stopGroveMusic(); setPlaying(null); return; }
        startGroveMusic(z);
        setPlaying(z.id);
    }, [playing]);

    const maps = useMemo(() => {
        const by = new Map();
        for (const z of ALL) {
            const k = Number(z.map) || 1;
            if (!by.has(k)) by.set(k, []);
            by.get(k).push(z);
        }
        return [...by.entries()].sort((a, b) => a[0] - b[0]);
    }, []);

    return (
        <main style={{ minHeight: "100vh", background: "#17150f", color: INK, padding: "20px 16px 80px",
            font: "500 15px/1.5 system-ui, sans-serif" }}>
            <h1 style={{ fontSize: "1.3rem", margin: "0 0 4px" }}>The Grove, as sound</h1>
            <p style={{ color: DIM, margin: "0 0 16px", maxWidth: 620 }}>
                One bed per zone, synthesised. The map sets the key and the mode, the biome sets what lives
                there, the depth sets the weight. Nothing here is a file and nothing here is a tune.
            </p>

            {/* The two states a reviewer cannot otherwise reach. */}
            <div style={{ ...card, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap",
                position: "sticky", top: 8, zIndex: 2, backdropFilter: "blur(6px)" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: DIM, minWidth: 92 }}>Danger {Math.round(danger * 100)}%</span>
                    <input type="range" min="0" max="100" value={Math.round(danger * 100)}
                        onChange={(e) => setDanger(Number(e.target.value) / 100)} style={{ width: 180 }} />
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={boss} onChange={(e) => setBoss(e.target.checked)} />
                    <span>Boss awake</span>
                </label>
                <button type="button" onClick={() => { stopGroveMusic(); setPlaying(null); }}
                    style={{ ...card, cursor: "pointer", padding: "6px 14px", font: "inherit", fontWeight: 700 }}>
                    Stop
                </button>
                <span style={{ color: DIM }}>
                    {playing ? `Playing ${groveTrack(ALL.find((z) => z.id === playing))?.zoneName || playing}` : "Silent"}
                </span>
            </div>

            {maps.map(([mapN, zones]) => {
                const head = groveTrack(zones[0]);
                return (
                    <section key={mapN} style={{ marginTop: 22 }}>
                        <h2 style={{ fontSize: "1.05rem", margin: "0 0 2px" }}>
                            {mapN}. {head?.mapName}
                            {zones[0].built ? null : (
                                <span style={{ color: DIM, fontWeight: 500, fontSize: "0.82rem" }}> — not built yet</span>
                            )}
                        </h2>
                        <p style={{ color: DIM, margin: "0 0 10px", fontSize: "0.86rem" }}>
                            {head?.mode} · root {head?.root.toFixed(2)}Hz · drone +{head?.drone} semis
                            {head?.drone === 6 ? " (flat fifth)" : head?.drone === 5 ? " (fourth)" : " (fifth)"}
                            {" · "}bar {head ? (head.barSec).toFixed(2) : "?"}s · tint {head?.tint}
                            {" · "}sour +{head?.sour} while a boss is up
                        </p>
                        <div style={{ display: "grid", gap: 8,
                            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                            {zones.map((z) => {
                                const t = groveTrack(z);
                                const on = playing === z.id;
                                return (
                                    <button key={z.id} type="button" onClick={() => play(z)}
                                        style={{ ...card, textAlign: "left", cursor: "pointer", font: "inherit",
                                            borderColor: on ? "rgba(255,214,120,0.75)" : "rgba(255,255,255,0.16)",
                                            background: on ? "rgba(90,70,20,0.5)" : card.background }}>
                                        <b style={{ display: "block" }}>{on ? "▮ " : "▶ "}{z.name}</b>
                                        <span style={{ color: DIM, fontSize: "0.82rem" }}>
                                            depth {t?.depth} · {t?.biome} · press {t ? t.press.toFixed(2) : "?"}
                                            {" · key "}{t?.shift > 0 ? `+${t.shift}` : t?.shift}
                                            <br />
                                            {t?.kit.join(", ")}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </main>
    );
}
