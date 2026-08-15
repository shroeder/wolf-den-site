import { notFound } from "next/navigation";

import TrophyRoom from "@/components/TrophyRoom";
import { SHELVES } from "@/lib/marketplace/trophy-room.js";

// ── DEV ONLY: THE TROPHY ROOM AGAINST A FIXTURE ──────────────────────────────────────────────────────────────
// Same rule and same reason as the Arena and Compendium labs: this mounts the real component with a hand-built
// payload, so the room and its sheet can be shot at 375x667 and 1280x900 without an authenticated session and
// without a database. Every other build 404s.
//
// The fixture is built by WALKING THE REAL SHELVES, so the strings under test are the real ones — the actual
// track names, the actual descriptions, the actual caps, run through each track's own `fx`. A lab with made-up
// copy tells you the layout survives text you will never ship. The only invented things here are the levels
// and the record values, which is exactly the part that has to vary.
export const dynamic = "force-dynamic";
export const metadata = { title: "Trophy Room Lab", robots: { index: false, follow: false } };

// Deterministic, so two runs of the screenshot rig produce the same picture and a diff means a real change.
const seeded = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h % 1000) / 1000;
};

// Two walls are left deliberately cold — an untouched piece hangs dark with no records, and that state has to
// be looked at too.
const COLD = new Set(["delves", "kitchen"]);

function fixture() {
    const shelves = SHELVES.map((sh, i) => {
        const cold = COLD.has(sh.key);
        const tools = sh.tools.map((t) => {
            const level = cold ? 0 : Math.round(seeded(`${sh.key}${t.name}`) * t.max);
            let now = null;
            try { now = t.fx ? t.fx(level) : null; } catch { now = null; }
            return { name: t.name, icon: t.icon || null, level, max: t.max, desc: t.desc || null, effect: t.effect || null, now };
        });
        const records = cold ? [] : sh.records.map((r, j) => {
            const roll = seeded(`${sh.key}${r.label}`);
            const of = 6 + Math.round(roll * 40);
            // One record per shelf is left thin, one is left at zero, so the "needs 10 to be ranked" and
            // "N ahead of you" branches both render somewhere in the room.
            const thin = j === 2 && r.minSample;
            const rank = thin ? null : 1 + Math.round(roll * (of - 1));
            return {
                label: r.label, kind: r.kind || "count",
                hint: null, // the real hints come off RECORD_HINT server-side; blank here proves the row survives without one
                value: r.kind === "pct" ? 0.4 + roll * 0.55 : Math.round(1 + roll * 4000),
                rank, of,
                note: thin ? `needs ${r.minSample} to be ranked` : null,
                pct: rank && of ? Math.round(((of - rank) / Math.max(1, of - 1)) * 100) : null,
            };
        });
        const built = tools.reduce((n, t) => n + t.level, 0);
        return {
            key: sh.key, name: sh.name, art: sh.art, blurb: sh.blurb,
            what: sh.what || null, href: sh.href || null, cta: sh.cta || null,
            tools, built, buildable: tools.reduce((n, t) => n + t.max, 0),
            // One cold wall nobody has touched, one cold wall plenty of people have — the two branches of the
            // "who am I measured against" line, which read completely differently.
            players: cold ? (sh.key === "delves" ? 0 : 31) : 8 + ((i * 7) % 40),
            best: records.filter((r) => r.rank).sort((a, b) => a.rank - b.rank)[0] || null,
            records, touched: !cold,
        };
    });
    return {
        memberCount: 98, level: 32, rank: "Pack Leader",
        shelves, touched: shelves.filter((s) => s.touched).length, total: shelves.length,
    };
}

export default function TrophyLabPage() {
    if (process.env.NODE_ENV !== "development") notFound();
    return (
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 12 }}>
            <TrophyRoom active initial={fixture()} />
        </main>
    );
}
