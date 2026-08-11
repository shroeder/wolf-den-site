"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// ── YOU FOUND A STONE ────────────────────────────────────────────────────────────────────────────────────────
// Mounted ONCE in the public layout, like <PetLevelUp>, and fired by a custom event from wherever a stone turns
// up. Four systems can drop one — the mine, a dig, a boss kill, a dungeon boss — and the alternative to a
// shared global was four separate celebrations that would drift apart within a month.
//
// This is the piece that was missing entirely: for a while the four servers granted stones perfectly well and
// no client said a word, so the rarest thing in the game arrived in total silence. A drop nobody is told about
// is not a drop.
//
// It is deliberately a small card rather than a full-screen takeover: you are usually mid-dig or mid-descent
// when it lands, and stopping the world for an item you cannot spend yet would be the wrong size of moment.
// The ENSHRINING is the takeover; this is the good news.
const STONE_META = {
    light: { name: "Lightstone", color: "#ffe08a", art: "/images/pets/stone-light.png", line: "Keeps a pet's ability forever, and changes it — differently on every pet." },
    dark: { name: "Darkstone", color: "#b061ff", art: "/images/pets/stone-dark.png", line: "Keeps a pet's ability forever, and changes it — differently on every pet." },
};

const WHERE = {
    mine_seam: "in the seam",
    sail_dig: "buried in the dirt",
    boss_kill: "on the boss",
    delve_boss: "in the rubble",
    quartermaster: "from the Quartermaster",
    armoury: "from the Armoury",
};

export default function PetStoneFound() {
    const [found, setFound] = useState(null);

    useEffect(() => {
        const on = (e) => {
            const d = e?.detail;
            if (!d?.stone || !STONE_META[d.stone]) return;
            setFound(d);
        };
        window.addEventListener("wolfden-stone-found", on);
        return () => window.removeEventListener("wolfden-stone-found", on);
    }, []);

    useEffect(() => {
        if (!found) return undefined;
        try { navigator.vibrate?.([10, 50, 30]); } catch { /* unsupported */ }
        // Long enough to read, short enough not to be in the way of whatever you were doing.
        const t = setTimeout(() => setFound(null), 7000);
        return () => clearTimeout(t);
    }, [found]);

    if (!found || typeof document === "undefined") return null;
    const m = STONE_META[found.stone];

    return createPortal(
        <button type="button" className="pstf" style={{ "--stone": m.color }} onClick={() => setFound(null)}>
            <span className="pstf-glow" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pstf-art" src={m.art} alt="" draggable="false" />
            <span className="pstf-words">
                <i className="pstf-kick">{WHERE[found.source] || "found"}</i>
                <b className="pstf-name">A {m.name}</b>
                <em className="pstf-line">{m.line}</em>
            </span>
        </button>,
        document.body
    );
}

/**
 * Fire the celebration. Every caller passes the object its API already returns, so a surface that starts
 * returning a stone gets the moment for free.
 */
export function dispatchStoneFound(stone) {
    if (!stone?.stone) return;
    try { window.dispatchEvent(new CustomEvent("wolfden-stone-found", { detail: stone })); } catch { /* SSR */ }
}
