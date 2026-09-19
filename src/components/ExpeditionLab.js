"use client";

// ── THE EXPEDITION FIXTURE LAB ───────────────────────────────────────────────────────────────────────────────
// Mounts the REAL ExpeditionClient against handcrafted rows, with window.fetch stubbed for the two paths it
// talks to. Dev only — the route 404s outside development.
//
// It exists because the states worth looking at cannot be summoned on demand: a journey costs one of three
// sailings a day, and the interesting beats (a one-star glass whose windows are barn doors, a wild landfall at
// the wrong end of an island, the tide two steps from out) each need a different captain. Every beat is a URL:
//
//   /marketplace/expedition/lab?scene=harbour      the page before any of it
//   /marketplace/expedition/lab?scene=hunt         out looking, a sail on the horizon
//   /marketplace/expedition/lab?scene=hunt_close    the same, with her nearly alongside
//   /marketplace/expedition/lab?scene=spoils       the beat: her captain, his chart, what it buys
//   /marketplace/expedition/lab?scene=glass1       the glass, one star — the widest windows in the game
//   /marketplace/expedition/lab?scene=glass5       the glass, five stars — every mark a slot
//   /marketplace/expedition/lab?scene=course       the beat: where you are going and why
//   /marketplace/expedition/lab?scene=run          the sail in
//   /marketplace/expedition/lab?scene=run_enc      the sail in with an encounter closing
//   /marketplace/expedition/lab?scene=landing      alongside; the step-ashore button
//   /marketplace/expedition/lab?scene=ashore       walking a good landfall
//   /marketplace/expedition/lab?scene=ashore_bad   a wild guess: beached at the wrong end, thin tide
//   /marketplace/expedition/lab?scene=lowtide      two steps of tide left
//   /marketplace/expedition/lab?scene=summary      ashore; tap "To the boat" for the ending
//   &boat=dinghy|galleon|celestial                 which of the eleven hulls the member sails
//   &chrome=0                                      hide the scene picker, for filming
//
// ⚠️ IT BUILDS ITS STATE THROUGH THE REAL viewOf. A lab that assembles its own lookalike shape is a lab that
// passes while the screen is broken — see [[visual-rigs]]. The fixture here is a ROW, exactly as the database
// would hold it, and expedition-view.js turns it into the screen the same way the API does.
//
// ⚠️ AND IT CANNOT CATCH ANYTHING THAT ONLY BREAKS THROUGH THE DATABASE. That is the rig's known blind spot,
// and it has bitten before: ship battles ran for rounds in a lab while prod died on round two.

import { useLayoutEffect, useState } from "react";

import ExpeditionClient from "@/components/ExpeditionClient";
import { viewOf } from "@/lib/marketplace/expedition-view.js";
import { bearingAccuracy, bearingFace, chartFace, landfall, plotBand } from "@/lib/marketplace/chart-plot.js";
import { islandById, islandCard, prizeFor, ISLANDS } from "@/lib/marketplace/islands.js";
import { RUN_MARKS, escortFor, wardenFor } from "@/lib/marketplace/island-wardens.js";
import { HUNT_MS, huntCaptain, huntFoe } from "@/lib/marketplace/hunt.js";

// A row exactly as mkt_ship_expedition would hold it.
function fixtureRow({
    seed = 4242, grade = 3, phase = "plot", accuracy = 0.85, spent = 0, marksDone = true,
    rank = 11, legAgo = null, taken = [],
} = {}) {
    const face = chartFace(seed, grade);
    const isle = islandById(face.island) || ISLANDS[0];
    const bface = bearingFace(seed, grade);
    // Bearings that WOULD score this accuracy, walked off true by a fixed amount, so the course beat shows a
    // plausible mixed hand rather than three identical marks.
    const bearings = bface.marks.map((m, i) => m.at + (1 - accuracy) * m.window * (i === 1 ? 1.6 : 0.7));
    const acc = phase === "bearings" ? 0 : bearingAccuracy(bface, bearings);
    const lf = landfall(face, acc, isle.span);
    const escort = escortFor(isle.id, seed);
    const warden = wardenFor(isle.id);
    const ms = phase === "hunt" ? HUNT_MS : 30000;
    return {
        id: 1, seed, grade, island: isle.id, phase,
        plot_x: 0.5, plot_y: 0.5, accuracy: acc,
        span: lf.span, entry: lf.entry, fix_index: lf.fixIndex, tide: lf.tide,
        spent, at_node: lf.entry, taken, purse: 0,
        marks: [escort, warden].filter(Boolean).map((f, i) => ({
            at: RUN_MARKS[i] ?? 0.5, foe: f.id, name: f.name, art: f.art,
            anchorage: Boolean(f.anchorage), done: marksDone,
        })),
        journey: { rank, foe: huntFoe(rank), captain: huntCaptain(rank), huntMs: HUNT_MS, bearings },
        ran_at: new Date(Date.now() - (legAgo == null ? ms * 0.45 : legAgo)).toISOString(),
    };
}

const SCENES = {
    harbour: { label: "Harbour", row: () => null, sailings: 3 },
    // Out of sailings but still holding an old chart — the one state where the second button is the only
    // thing on the screen that can be pressed, and therefore the one worth a scene of its own.
    spent: { label: "Harbour · none left", row: () => null, sailings: 0, charts: 2 },
    hunt: { label: "Hunt", row: () => fixtureRow({ phase: "hunt", rank: 11, legAgo: HUNT_MS * 0.3 }) },
    hunt_close: { label: "Hunt · alongside", row: () => fixtureRow({ phase: "hunt", rank: 27, legAgo: HUNT_MS * 0.86 }) },
    spoils: { label: "Beat · the captain", row: () => fixtureRow({ phase: "spoils", rank: 27, grade: 4 }) },
    // The other way that fight can go. Kept beside the capture beat because they are the same moment and
    // the whole point of the card is that it reads cold where that one reads warm.
    lost: { label: "Beat · she beat you", row: () => fixtureRow({ phase: "lost", rank: 27 }), sailings: 1 },
    lost_last: { label: "Beat · beaten, none left", row: () => fixtureRow({ phase: "lost", rank: 34 }), sailings: 0 },
    glass1: { label: "Glass · 1 star", row: () => fixtureRow({ phase: "bearings", grade: 1, seed: 8811, rank: 3 }) },
    glass5: { label: "Glass · 5 stars", row: () => fixtureRow({ phase: "bearings", grade: 5, seed: 1207, rank: 37 }) },
    course: { label: "Beat · the course", row: () => fixtureRow({ phase: "course", grade: 4, seed: 3300, accuracy: 0.82 }) },
    run: { label: "The run in", row: () => fixtureRow({ phase: "run", grade: 4, seed: 3300, marksDone: true, legAgo: 30000 * 0.5 }) },
    run_enc: { label: "Run · a sail closing", row: () => fixtureRow({ phase: "run", grade: 4, seed: 3300, marksDone: false, legAgo: 30000 * 0.3 }) },
    landing: { label: "Landing", row: () => fixtureRow({ phase: "landing", grade: 4, seed: 3300, legAgo: 30000 }) },
    ashore: { label: "Ashore · good cut", row: () => fixtureRow({ phase: "ashore", grade: 4, seed: 3300, accuracy: 0.88 }) },
    ashore_bad: { label: "Ashore · wild guess", row: () => fixtureRow({ phase: "ashore", grade: 2, seed: 777, accuracy: 0.04 }) },
    lowtide: { label: "Ashore · tide nearly out", row: () => { const r = fixtureRow({ phase: "ashore", grade: 5, seed: 5150, accuracy: 0.9 }); r.spent = r.tide - 3; return r; } },
    summary: { label: "The ending", row: () => { const r = fixtureRow({ phase: "ashore", grade: 5, seed: 5150, accuracy: 0.93 }); r.taken = [r.fix_index, r.entry + 1]; r.purse = 1180; return r; } },
};

// The shape leaveIsland returns. Built from the same pure helpers the server builds it from, so a field that
// moves there stops this lab too rather than letting it keep drawing yesterday's card.
function summaryFor(row) {
    const isle = islandById(row.island) || ISLANDS[0];
    const taken = row.taken || [];
    const gotPrize = taken.includes(Number(row.fix_index));
    return {
        island: islandCard(isle.id), purse: Number(row.purse) || 0, took: taken.length,
        prize: gotPrize ? prizeFor(isle) : null,
        accuracy: Number(row.accuracy) || 0, band: plotBand(Number(row.accuracy) || 0),
    };
}

// A stand-in avatar so the walker on the island is a FIGURE and not the fallback capsule — the real one comes
// off mkt_buyer.avatar_sprite_url and the lab has no session.
const HERO = { art: "/images/lab/wolf_pup-lv5.png", flip: false };

// Three of the eleven forms: the starter, the middle and the top. Enough to see that the hull is the member's
// own and that the biggest one still fits every scene.
const BOATS = {
    dinghy: { art: "/images/sailing/boat-tier1-wood.png", name: "Wooden Dinghy", tier: 1 },
    galleon: { art: "/images/sailing/boat-tier5-galleon.png", name: "Gilded Galleon", tier: 5 },
    celestial: { art: "/images/sailing/boat-tier11-celestial.png", name: "Celestial Warship", tier: 11 },
};

export default function ExpeditionLab({ scene = "hunt", chrome = true, boat = "galleon" }) {
    const key = SCENES[scene] ? scene : "hunt";
    const boatKey = BOATS[boat] ? boat : "galleon";

    // ── STUB FETCH, THEN MOUNT — IN THAT ORDER ───────────────────────────────────────────────────────────
    // ExpeditionClient fetches on mount, so the stub has to be installed BEFORE it renders or the first load
    // goes to the real API and 404s. A layout effect runs before paint, and the client is held back behind
    // `ready` until it has — which is also why the stub is not installed during render: mutating window from
    // a render body runs twice under StrictMode and leaves a stub stubbing a stub.
    const [ready, setReady] = useState(false);
    useLayoutEffect(() => {
        const real = window.fetch.bind(window);
        window.fetch = async (input, init) => {
            const url = String(typeof input === "string" ? input : input?.url || "");
            if (url.includes("/sailing/expedition")) {
                const def = SCENES[key];
                const row = def.row();
                // ⚠️ THE STUB READS THE ACTION. Answering every POST with the same GET body meant every
                // button on the journey was inert here and the last screen of the loop could not be reached
                // at all. Each action that ADVANCES a beat returns the row at its next phase, so the lab
                // walks the real track rather than holding one frame of it.
                const body = (() => { try { return JSON.parse(init?.body || "{}"); } catch { return {}; } })();
                const action = body.action || null;
                const bag = { ok: true, charts: def.charts ?? 0, hero: HERO, boat: BOATS[boatKey] || BOATS.galleon, sailings: def.sailings ?? 2, perDay: 3 };
                if (action === "leave" && row) {
                    return json({ ...bag, summary: summaryFor(row), open: false });
                }
                // ⚠️ SET SAIL AND ENGAGE ARE IN HERE TOO, SO THE WHOLE TRACK CAN BE WALKED. Without them the
                // lab could only ever show a beat you had picked off the URL bar — the harbour's own button
                // did nothing, and the hunt could not hand over to the beat after it because the fight it
                // opens needs a battle the lab has no server for. `engage` skips straight to the spoils,
                // which is the one join in the journey this rig cannot honestly reproduce; everything else
                // below moves through the same phases the server writes.
                if (action === "set_sail") {
                    return json({ ...bag, open: true, sailings: (bag.sailings || 1) - 1, expedition: viewOf(fixtureRow({ phase: "hunt", rank: 11, legAgo: 200 })) });
                }
                if (action === "engage") {
                    return json({ ...bag, open: true, expedition: viewOf(fixtureRow({ phase: "spoils", rank: 11, grade: 2 })) });
                }
                if (row && action && action !== "mark") {
                    const next = { read_spoils: "bearings", bearings: "course", course: "run", alongside: "landing", ashore: "ashore" }[action];
                    if (next) {
                        const moved = { ...row, phase: next, ran_at: new Date().toISOString() };
                        // ⚠️ THE BEARINGS YOU ACTUALLY TOOK HAVE TO REACH THE COURSE BEAT. The stub used to
                        // hand back the fixture's own canned reading, so however well you played the glass
                        // the next screen said "A wild guess" — which reads as the minigame not being
                        // wired up at all. It scores the posted numbers with the same two functions the
                        // server scores them with, so the lab tells the truth about your own hand.
                        if (action === "bearings") {
                            const bface = bearingFace(Number(row.seed), Number(row.grade));
                            const acc = bearingAccuracy(bface, body.taken);
                            const lf = landfall(chartFace(Number(row.seed), Number(row.grade)), acc, islandById(row.island).span);
                            Object.assign(moved, {
                                accuracy: acc, span: lf.span, entry: lf.entry, fix_index: lf.fixIndex, tide: lf.tide,
                                journey: { ...row.journey, bearings: body.taken },
                            });
                        }
                        return json({ ...bag, open: true, expedition: viewOf(moved) });
                    }
                }
                return json(row ? { ...bag, open: true, expedition: viewOf(row) } : { ...bag, open: false });
            }
            if (url.endsWith("/api/marketplace/sailing")) {
                return json({ ok: true, combat: { openBattle: null } });
            }
            return real(input, init);
        };
        // The ORDER is the whole point: the stub must be installed before the client's own mount effect
        // fires, and `ready` is the gate that holds it back until it has. The rule cannot see that, and the
        // cascading render it warns about is one extra paint in a dev-only lab.
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
                .lab-bar { position: relative; z-index: 900; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; }
                .lab-pill { padding: 4px 10px; border-radius: 999px; font-size: 0.76rem; font-weight: 700;
                    background: rgba(0, 0, 0, 0.4); color: #cdbb98; text-decoration: none;
                    border: 1px solid rgba(255, 255, 255, 0.12); }
                .lab-pill.on { background: #d5a445; color: #2a1c06; border-color: #f0cb79; }
                .lab-pill.is-boat { border-style: dashed; }
            `}</style>
        </div>
    );
}

const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
