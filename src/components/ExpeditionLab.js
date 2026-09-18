"use client";

// ── THE EXPEDITION FIXTURE LAB ───────────────────────────────────────────────────────────────────────────────
// Mounts the REAL ExpeditionClient against handcrafted state, with window.fetch stubbed for the two paths it
// talks to. Dev only — the route 404s outside development.
//
// It exists because the states worth looking at cannot be summoned on demand: an expedition costs a CHART,
// which costs a won fleet battle, and the interesting ones (a one-star chart's fat rings, a wild guess landing
// at the far end of the island, the tide running out mid-stride) would each need a different captain. Every
// scene is a URL instead:
//
//   /marketplace/expedition/lab?scene=plot1        a one-star chart — three fat smudges
//   /marketplace/expedition/lab?scene=plot5        a five-star chart — three hairlines
//   /marketplace/expedition/lab?scene=run          the thirty seconds
//   /marketplace/expedition/lab?scene=ashore       walking a good landfall
//   /marketplace/expedition/lab?scene=ashore_bad   a wild guess: beached at the wrong end, thin tide
//   /marketplace/expedition/lab?scene=lowtide      two steps of tide left
//   /marketplace/expedition/lab?scene=summary      ashore; tap "Back to the boat" for the prize ending
//   /marketplace/expedition/lab?scene=summary_missed   the same, with the mark left standing
//   &boat=dinghy|galleon|celestial                 which of the eleven hulls the member sails
//   &chrome=0                                      hide the scene picker, for filming
//
// ⚠️ IT BUILDS ITS STATE THROUGH THE REAL viewOf. A lab that assembles its own lookalike shape is a lab that
// passes while the screen is broken — see [[visual-rigs]]. The fixture here is a ROW, exactly as the database
// would hold it, and expedition-view.js turns it into the screen the same way the API does.
//
// ⚠️ AND IT CANNOT CATCH ANYTHING THAT ONLY BREAKS THROUGH THE DATABASE. That is the rig's known blind spot,
// and it has bitten before: ship battles ran for rounds in a lab while prod died on round two, because the
// saved state version was written in two places. Round-trip persisted shapes separately.

import { useLayoutEffect, useState } from "react";
import ExpeditionClient from "@/components/ExpeditionClient";
import { viewOf } from "@/lib/marketplace/expedition-view.js";
import { chartFace, landfall, plotAccuracy, plotBand } from "@/lib/marketplace/chart-plot.js";
import { islandById, islandCard, prizeFor, ISLANDS } from "@/lib/marketplace/islands.js";
import { RUN_MARKS, escortFor, wardenFor } from "@/lib/marketplace/island-wardens.js";

// A row exactly as mkt_ship_expedition would hold it.
function fixtureRow({ seed = 4242, grade = 3, phase = "plot", accuracy = 0.85, spent = 0, marksDone = true } = {}) {
    const face = chartFace(seed, grade);
    const isle = islandById(face.island) || ISLANDS[0];
    const lf = landfall(face, accuracy, isle.span);
    // The pin that WOULD score this accuracy, walked out along a fixed bearing from the truth so the reveal
    // shows a plausible miss rather than a pin sitting on the answer.
    const miss = (1 - accuracy) * 0.46;
    const plot = { x: Math.max(0, Math.min(1, face.fix.x + miss * 0.8)), y: Math.max(0, Math.min(1, face.fix.y + miss * 0.6)) };
    const escort = escortFor(isle.id, seed);
    const warden = wardenFor(isle.id);
    return {
        id: 1, seed, grade, island: isle.id, phase,
        plot_x: plot.x, plot_y: plot.y, accuracy: plotAccuracy(face, plot),
        span: lf.span, entry: lf.entry, fix_index: lf.fixIndex, tide: lf.tide,
        spent, at_node: lf.entry, taken: [], purse: 0,
        marks: [escort, warden].filter(Boolean).map((f, i) => ({
            at: RUN_MARKS[i] ?? 0.5, foe: f.id, name: f.name, art: f.art, anchorage: Boolean(f.anchorage), done: marksDone,
        })),
        ran_at: new Date(Date.now() - 9000).toISOString(),
    };
}

const SCENES = {
    plot1: { label: "Chart · 1 star", row: () => fixtureRow({ grade: 1, seed: 8811, phase: "plot" }) },
    plot3: { label: "Chart · 3 star", row: () => fixtureRow({ grade: 3, seed: 4242, phase: "plot" }) },
    plot5: { label: "Chart · 5 star", row: () => fixtureRow({ grade: 5, seed: 1207, phase: "plot" }) },
    run: { label: "The run in", row: () => fixtureRow({ grade: 4, seed: 3300, phase: "run", marksDone: false }) },
    ashore: { label: "Ashore · good cut", row: () => fixtureRow({ grade: 4, seed: 3300, phase: "ashore", accuracy: 0.88 }) },
    ashore_bad: { label: "Ashore · wild guess", row: () => fixtureRow({ grade: 2, seed: 777, phase: "ashore", accuracy: 0.04 }) },
    // The tide almost out, so the low-tide chip and the refusal to set off on a walk you cannot pay for are
    // both on screen at once. Neither is reachable in under two minutes of real play.
    lowtide: { label: "Ashore · tide nearly out", row: () => { const r = fixtureRow({ grade: 5, seed: 5150, phase: "ashore", accuracy: 0.9 }); r.spent = r.tide - 3; return r; } },
    none: { label: "No chart", row: () => null },
    holding: { label: "A chart in hand", row: () => null, charts: 2 },
    // ── THE TWO ENDINGS ──────────────────────────────────────────────────────────────────────────────
    // Both mount ASHORE and are driven to the summary by the screen's own "Back to the boat" button, so
    // what gets looked at is the real transition and the real shape the client is handed — not a summary
    // card rendered straight. The difference between them is the one that matters on that card: whether
    // the thing on the mark was taken or walked past.
    summary: { label: "Summary · prize taken", row: () => { const r = fixtureRow({ grade: 5, seed: 5150, phase: "ashore", accuracy: 0.93 }); r.taken = [r.fix_index, r.entry + 1]; r.purse = 1180; return r; } },
    summary_missed: { label: "Summary · mark left", row: () => { const r = fixtureRow({ grade: 1, seed: 8811, phase: "ashore", accuracy: 0.05 }); r.taken = [r.entry + 1]; r.purse = 240; return r; } },
};

// The shape leaveIsland returns. Built from the same pure helpers the server builds it from, so a field
// that moves there stops this lab too rather than letting it keep drawing yesterday's card.
function summaryFor(row) {
    const isle = islandById(row.island) || ISLANDS[0];
    const taken = row.taken || [];
    const gotPrize = taken.includes(Number(row.fix_index));
    return {
        island: islandCard(isle.id),
        purse: Number(row.purse) || 0,
        took: taken.length,
        prize: gotPrize ? prizeFor(isle) : null,
        accuracy: Number(row.accuracy) || 0,
        band: plotBand(Number(row.accuracy) || 0),
    };
}

// A stand-in avatar so the walker on the island is a FIGURE and not the fallback capsule — the real one
// comes off mkt_buyer.avatar_sprite_url and the lab has no session.
const HERO = { art: "/images/lab/wolf_pup-lv5.png", flip: false };

// Three of the eleven forms: the starter, the middle and the top. Enough to see that the hull is the
// member's and that the biggest one still fits the stage.
const BOATS = {
    dinghy: { art: "/images/sailing/boat-tier1-wood.png", name: "Wooden Dinghy", tier: 1 },
    galleon: { art: "/images/sailing/boat-tier5-galleon.png", name: "Gilded Galleon", tier: 5 },
    celestial: { art: "/images/sailing/boat-tier11-celestial.png", name: "Celestial Warship", tier: 11 },
};

export default function ExpeditionLab({ scene = "plot3", chrome = true, boat = "galleon" }) {
    const key = SCENES[scene] ? scene : "plot3";
    const boatKey = BOATS[boat] ? boat : "galleon";

    // ── STUB FETCH, THEN MOUNT — IN THAT ORDER ───────────────────────────────────────────────────────────
    // ExpeditionClient fetches on mount, so the stub has to be installed BEFORE it renders or the first load
    // goes to the real API and 404s. A layout effect runs before paint, and the client is held back behind
    // `ready` until it has — which is also why the stub is not installed during render: mutating window from
    // a render body is the kind of thing that runs twice under StrictMode and leaves a stub stubbing a stub.
    const [ready, setReady] = useState(false);
    useLayoutEffect(() => {
        const real = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const url = String(typeof input === "string" ? input : input?.url || "");
            if (url.includes("/sailing/expedition")) {
                const def = SCENES[key];
                const row = def.row();
                // ⚠️ THE STUB HAS TO READ THE ACTION, NOT JUST THE PATH. Answering every POST with the same
                // GET body meant "Back to the boat" handed back no summary at all, so the last screen of
                // the whole loop was the one screen the lab could not reach — and it is the one carrying
                // the island, the prize and the purse. Everything else still replays the same state.
                const action = (() => { try { return JSON.parse(init?.body || "{}").action; } catch { return null; } })();
                if (action === "leave" && row) {
                    return new Response(JSON.stringify({ ok: true, summary: summaryFor(row), open: false, charts: 0, hero: HERO, boat: BOATS[boatKey] || BOATS.galleon }),
                        { headers: { "Content-Type": "application/json" } });
                }
                const hero = HERO;
                // ⚠️ AND A HULL, because the screen draws the member's own. The real one comes off the five
                // upgrade tracks on mkt_sailing (see shipOf in expedition.js); `?boat=` picks a form here so
                // a dinghy and a Celestial Warship can both be looked at without owning either — the two
                // ends of the range are the ones that break a layout.
                const boat = BOATS[boatKey] || BOATS.galleon;
                return new Response(JSON.stringify(
                    row ? { ok: true, open: true, charts: 1, hero, boat, expedition: viewOf(row) }
                        : { ok: true, open: false, charts: def.charts || 0, hero, boat },
                ), { headers: { "Content-Type": "application/json" } });
            }
            if (url.endsWith("/api/marketplace/sailing")) {
                return new Response(JSON.stringify({ ok: true, combat: { openBattle: null } }),
                    { headers: { "Content-Type": "application/json" } });
            }
            return real(input, init);
        };
        setReady(true);
        return () => { window.fetch = real; };
    }, [key, boatKey]);

    return (
        <div>
            {chrome ? (
                <div className="lab-bar">
                    {Object.entries(SCENES).map(([id, s]) => (
                        <a key={id} className={`lab-pill${id === key ? " on" : ""}`} href={`?scene=${id}&boat=${boatKey}`}>{s.label}</a>
                    ))}
                    {Object.entries(BOATS).map(([id, b]) => (
                        <a key={id} className={`lab-pill is-boat${id === boatKey ? " on" : ""}`} href={`?scene=${key}&boat=${id}`}>{b.name}</a>
                    ))}
                </div>
            ) : null}
            {ready ? <ExpeditionClient key={`${key}:${boatKey}`} /> : null}
            <style jsx>{`
                .lab-bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; }
                .lab-pill { padding: 4px 10px; border-radius: 999px; font-size: 0.76rem; font-weight: 700;
                    background: rgba(0, 0, 0, 0.4); color: #cdbb98; text-decoration: none;
                    border: 1px solid rgba(255, 255, 255, 0.12); }
                .lab-pill.on { background: #d5a445; color: #2a1c06; border-color: #f0cb79; }
                .lab-pill.is-boat { border-style: dashed; }
            `}</style>
        </div>
    );
}
