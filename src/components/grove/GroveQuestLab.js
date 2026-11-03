"use client";

import { useMemo } from "react";

import GroveQuests from "@/components/grove/GroveQuests";
import GroveGiver from "@/components/grove/GroveGiver";
import { GROVE_CSS } from "@/components/grove/grove-css.js";
import { questsFor, GROVE_NPCS, COLISEUM_NPCS, COLISEUM_ZONE } from "@/lib/marketplace/grove-npcs.js";

// ── EVERY BEAT OF A CHAIN, SIDE BY SIDE ─────────────────────────────────────────────────────────────────────
// The arc Luke asked to see: pick up a chain, grind a step, hand it in, get paid, the next step appears,
// and eventually the giver has nothing left to ask.
//
// ⚠️ THE BOARD IS BUILT THE WAY questBoard BUILDS IT, from questsFor — the real resolved chain with its real
// targets, sizes and rewards. Only `progress` and `done` are invented, because those are the two things that
// take a week of play to produce. Hand-writing the steps instead would have made this a drawing of a quest
// board rather than a view of one.
//
// ⚠️ AND THE PANEL IS THE REAL COMPONENT. GroveQuests is mounted here exactly as GroveClient mounts it, so
// what this photographs is what ships. The CLAIM BUTTON STILL POSTS — there is no account behind it in the
// lab, so it will fail; the beat labelled "just claimed" fakes the note, it does not fake the button.
const WHO = "snare";   // four steps, and it uses four different verbs — the best single chain to look at
const MAP = 1;

const BEATS = {
    1: { done: 0, progress: 0, label: "Beat 1 — the chain opens",
         blurb: "Nothing accepted, nothing chosen. The first step is simply live the moment you meet them." },
    2: { done: 0, progress: 0.45, label: "Beat 2 — part-way through step one",
         blurb: "The bar fills as you play. No quest log to open, no step to select — kills count themselves." },
    3: { done: 0, progress: 1, label: "Beat 3 — ready to hand in",
         blurb: "Bar full, CLAIM appears, and the giver's pip in the world turns to a !" },
    4: { done: 1, progress: 0, label: "Beat 4 — handed in, paid",
         blurb: "Gold, xp and — on the last step of a chain — a chest and a Coliseum token." },
    5: { done: 3, progress: 0.6, label: "Beat 5 — deep in the chain",
         blurb: "The next step took over on its own. Three of four done; the last one pays the token." },
    6: { done: 4, progress: 0, label: "Beat 6 — nothing more to ask",
         blurb: "A finished chain STAYS on the board. Dropping it would make the panel feel forgetful." },
    // The two that matter most now: the hand-in happens in front of the person, not on the panel.
    7: { done: 0, progress: 0.4, label: "Beat 7 — you walk up to her, not done yet", giver: true,
         blurb: "Tapping the giver in her zone. She tells you what she asked for and how far you are." },
    8: { done: 0, progress: 1, label: "Beat 8 — handing it in, standing there", giver: true,
         blurb: "Bar full in front of her face. This is the turn-in, and it is the only one there is." },
    // The moment mid-fight. Not a panel at all — it fires over the zone on the settle that moved a step.
    9: { done: 0, progress: 0.58, label: "Beat 9 — a kill moves it, mid-fight", tick: { progress: 7, need: 12 },
         blurb: "The toast over the zone. You never opened anything; a settle moved the step and said so." },
    10: { done: 0, progress: 1, label: "Beat 10 — the kill that finishes it", tick: { progress: 12, need: 12, done: true },
          blurb: "Gold, glow and a pop. This is the one that sends you walking back to her." },
};

export default function GroveQuestLab({ beat = 1 }) {
    const b = BEATS[beat] || BEATS[1];

    const quests = useMemo(() => {
        const rows = [];
        for (const npc of GROVE_NPCS.filter((n) => n.map === MAP)) {
            const chain = questsFor(npc.id);
            const zone = (MAP - 1) * 12 + [2, 6, 9][GROVE_NPCS.filter((n) => n.map === MAP).indexOf(npc)];
            // Only the chain being studied moves; the other two givers sit at a plausible fixed state so the
            // panel is a panel rather than one row on its own.
            const done = npc.id === WHO ? b.done : (npc.id === "alder" ? 1 : 0);
            const cur = chain[done] || null;
            rows.push({
                npc: npc.id, name: npc.name, role: npc.role, map: MAP, zone,
                steps: chain.length, done,
                active: cur ? {
                    id: cur.id, title: cur.title, kind: cur.kind, need: cur.need,
                    // floor, not round: on a one-of step (survive, hunt) a 0.6 fraction ROUNDED UP to
                    // 1/1 and drew a full bar with no Claim beside it, which is a state the game
                    // cannot be in and the rig should not photograph.
                    progress: Math.floor(cur.need * (npc.id === WHO ? b.progress : 0.2)),
                    ready: npc.id === WHO && b.progress >= 1,
                    foe: cur.foe || null, part: cur.part || null,
                    zone: cur.zone || null, wave: cur.wave || null, reward: cur.reward,
                } : null,
            });
        }
        return rows;
    }, [b]);

    const coliseum = useMemo(() => ({
        map: MAP, zone: (MAP - 1) * 12 + COLISEUM_ZONE[MAP],
        keys: beat >= 4 ? 1 : 0, dailyReady: beat < 4, bestWave: beat >= 5 ? 6 : 0,
        marshal: COLISEUM_NPCS.find((n) => n.map === MAP) || null,
    }), [beat]);

    return (
        <div className="ql-wrap">
            {/* ⚠️ THE STYLES SHIP WITH GroveClient, NOT GLOBALLY. GroveQuests mounted without them renders
                raw: the giver's portrait fills the screen because .gql-face is the only thing sizing it.
                Any rig that mounts a Grove component has to bring GROVE_CSS with it, exactly as the real
                screen does. */}
            <style>{GROVE_CSS}</style>
            <header className="ql-head">
                <b>{b.label}</b>
                <p>{b.blurb}</p>
            </header>
            {/* The real panel, mounted exactly as GroveClient mounts it. */}
            <GroveQuests quests={quests} coliseum={coliseum} />
            {/* The in-play toast. Positioned absolutely over the zone in the game; the rig gives it a
                relative parent so it lands in the same place on a still. */}
            {b.tick ? (
                <div className="ql-stage">
                    <div className={`gv-qtick${b.tick.done ? " is-done" : ""}`}>
                        <span className="gv-qtick-top">{b.tick.done ? "Ready to hand in" : "Quest"}</span>
                        <b>Check My Lines</b>
                        <span className="gv-qtick-bar" aria-hidden="true">
                            <i style={{ width: `${(100 * b.tick.progress) / b.tick.need}%` }} />
                        </span>
                        <span className="gv-qtick-num">{b.tick.progress}/{b.tick.need}</span>
                    </div>
                </div>
            ) : null}

            {/* The world dialogue, over the tracker — which is exactly how it sits in the game. */}
            {b.giver ? (
                <GroveGiver
                    npcHere={quests.find((q) => q.npc === WHO)}
                    onClaim={async () => ({ ok: true, token: true })}
                    onClose={() => {}}
                />
            ) : null}
            {beat === 4 ? (
                <p className="ql-fake">
                    Ringmaster Thorn aside &mdash; the hand-in says:
                    <b> &ldquo;The Snarefitter: Sit the Night Out &mdash; paid. A Coliseum token with it.&rdquo;</b>
                </p>
            ) : null}
        </div>
    );
}
