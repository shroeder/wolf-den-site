"use client";

import { useState } from "react";

import SkillPanel from "@/components/arena/SkillPanel";
import { CLASSES } from "@/lib/marketplace/arena-classes.js";
import { SKILLS, skillPointsSpent, skillsForClass } from "@/lib/marketplace/arena-skills.js";

// ── DEV ONLY: THE SKILL PANEL, ALL THREE CLASSES, EVERY STATE ────────────────────────────────────────────────
// The panel's states are all BEHIND a point balance — locked needs zero points, ready needs one, and the node
// list only exists once a skill is owned. So on a real account you can look at exactly one of them at a time,
// and only by spending gold to get back to the others. That is the same reason the tree lab exists.
//
// Three panels, one per class, each with its own point purse and its own allocation, and the buttons really
// work: take a skill, take its nodes, watch the stat line move. Nothing here talks to the server.

// A starting allocation per class, chosen to show the three states side by side rather than three empty rows:
// one skill owned and partly specced, one owned bare, one still locked.
const seedFor = (classId) => {
    const [a, b] = skillsForClass(classId);
    return { [a.id]: a.nodes.slice(0, 2).map((n) => n.id), [b.id]: [] };
};

function ClassBench({ c }) {
    const [taken, setTaken] = useState(() => seedFor(c.id));
    const [purse, setPurse] = useState(4);

    const take = (id) => {
        if (purse < 1 || taken[id]) return;
        setTaken((t) => ({ ...t, [id]: [] }));
        setPurse((p) => p - 1);
    };
    const node = (skillId, nodeId) => {
        if (purse < 1) return;
        setTaken((t) => {
            const cur = t[skillId];
            if (!Array.isArray(cur) || cur.includes(nodeId)) return t;
            return { ...t, [skillId]: [...cur, nodeId] };
        });
        setPurse((p) => p - 1);
    };
    const reset = () => { setTaken(seedFor(c.id)); setPurse(4); };
    const all = () => {
        const full = {};
        for (const s of skillsForClass(c.id)) full[s.id] = s.nodes.map((n) => n.id);
        setTaken(full);
        setPurse(0);
    };
    const none = () => { setTaken({}); setPurse(0); };

    const spent = skillPointsSpent(taken);
    return (
        <section className="spl-bench">
            <header className="spl-bar" style={{ "--c": c.color }}>
                <b>{c.name}</b>
                <span>{spent} spent</span>
                <div className="spl-btns">
                    <button type="button" onClick={() => setPurse((p) => p + 1)}>+1 pt</button>
                    <button type="button" onClick={all}>All</button>
                    <button type="button" onClick={none}>None</button>
                    <button type="button" onClick={reset}>Reset</button>
                </div>
            </header>
            <SkillPanel
                classId={c.id}
                taken={taken}
                points={purse}
                treeSpent={spent * 3 + 1}
                colour={c.color}
                onTake={take}
                onNode={node}
            />
        </section>
    );
}

export default function SkillPanelLab() {
    return (
        <main className="spl">
            <h1 className="spl-h1">Skill Panel &mdash; all three classes</h1>
            <p className="spl-note">
                {SKILLS.length} skills, {SKILLS[0].nodes.length} nodes each, read live out of
                {" "}<code>arena-skills.js</code>. Buttons work; nothing is saved.
            </p>
            <div className="spl-grid">
                {CLASSES.map((c) => <ClassBench key={c.id} c={c} />)}
            </div>
            <style jsx global>{`
                body { background: #0b0910; }
                .spl { max-width: 1240px; margin: 0 auto; padding: 14px 12px 60px;
                    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #dfe4ea; }
                .spl-h1 { font-size: 1.25rem; font-weight: 900; margin: 0 0 4px; color: #eef1f5; }
                .spl-note { margin: 0 0 18px; font-size: 12px; color: #8b93a0; }
                .spl-note code { color: #b9c2cc; }
                .spl-grid { display: grid; gap: 26px; }
                @media (min-width: 1000px) { .spl-grid { grid-template-columns: repeat(3, 1fr); align-items: start; } }
                .spl-bench { display: grid; gap: 10px; }
                .spl-bar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
                    padding: 7px 10px; border-radius: 11px;
                    background: rgba(255,255,255,.04); border-left: 3px solid var(--c); }
                .spl-bar b { font-size: 12px; font-weight: 900; color: var(--c); letter-spacing: .04em;
                    text-transform: uppercase; }
                .spl-bar > span { font-size: 10.5px; color: #8b93a0; }
                .spl-btns { margin-left: auto; display: flex; gap: 4px; }
                .spl-btns button { padding: 4px 8px; border-radius: 7px; cursor: pointer; font-size: 10px;
                    font-weight: 700; background: rgba(255,255,255,.07);
                    border: 1px solid rgba(255,255,255,.13); color: #c6ced7; }
            `}</style>
        </main>
    );
}
