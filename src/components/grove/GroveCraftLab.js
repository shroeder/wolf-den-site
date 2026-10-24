"use client";

import { useCallback, useState } from "react";

import GroveCraftAct from "@/components/grove/GroveCraftAct.js";
import { GROVE_CSS } from "@/components/grove/grove-css.js";
import { GROVE_RECIPES } from "@/lib/marketplace/grove-recipes.js";
import {
    rackFor, landingFor, bandAt, rattle, oddsForAim, scatterFor, clampAct,
} from "@/lib/marketplace/grove-craft-act.js";

// ── THE CRAFT ACT, ON A BENCH ────────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS EXISTS BECAUSE THE ACT SHIPPED UNVERIFIED. The count-in, the per-stage verdict and the reveal all
// went out compiled and gated and never once watched, because GroveCraftAct mounts only inside GroveBench —
// which needs a real session, real parts and a recipe you can actually afford. "It builds" is not evidence
// that a 3-2-1 lands before the clock or that a verdict clears off the anvil, and those are the only two
// questions worth asking about any of it.
//
// ⚠️ THE SERVER IS STUBBED WITH THE SERVER'S OWN FUNCTIONS. commitCraft here rolls a landing through
// landingFor / bandAt / rattle — the same pure calls grove.js makes at line 1405 — rather than inventing a
// plausible-looking result object. A fixture that fakes the shape is a fixture that keeps passing after the
// shape changes, which is how a bench starts lying to the person reading it.
const FALLBACK = { id: "lab_piece", name: "Thornfield Hoe", kind: "tool", slot: "hoe", tier: 1, parts: {} };

export default function GroveCraftLab({ level = 12, temper = false, seed = 7 }) {
    const [open, setOpen] = useState(true);
    const [last, setLast] = useState(null);

    // A real recipe if one is reachable, so the art and the name are the game's rather than a placeholder.
    const recipe = GROVE_RECIPES.find((r) => r.kind === "tool") || FALLBACK;

    const commitCraft = useCallback(async (act, aim) => {
        const tidy = clampAct(act);
        const spans = rackFor(level, { temper });
        const scatter = scatterFor(tidy);
        const landing = landingFor(aim, scatter, () => {
            // Deterministic, so a filmed run is reproducible frame for frame.
            let x = (seed * 2246822519) >>> 0;
            x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
            return x / 4294967296;
        });
        const band = bandAt(spans, landing);
        const out = {
            ok: true,
            set: { spans, landing, band, aim, scatter, path: rattle(landing, seed),
                odds: oddsForAim(spans, aim, scatter), act: tidy },
        };
        setLast(out.set);
        return out;
    }, [level, temper, seed]);

    return (
        <div style={{ minHeight: "100vh", background: "#0d1410" }}>
            <style>{GROVE_CSS}</style>
            {open ? (
                <GroveCraftAct recipe={recipe} level={level} temper={temper}
                    onCommit={commitCraft} onClose={() => setOpen(false)} />
            ) : (
                <div style={{ color: "#efe7d8", padding: 24, font: "500 15px/1.6 system-ui, sans-serif" }}>
                    <p>Closed. Landed on <b>{last?.band}</b> at {last ? (last.landing * 100).toFixed(1) : "?"}% of the rack.</p>
                    <button type="button" onClick={() => { setLast(null); setOpen(true); }}
                        style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", font: "inherit" }}>
                        Craft again
                    </button>
                </div>
            )}
        </div>
    );
}
