"use client";
// TEMPORARY FIXTURE — deleted in the same session, never committed.
// ?n=0..4 how many in the irons · ?open=N which one · ?hit=bluff|offer|wait · ?spent=1 · ?deck=0
import { useEffect, useState } from "react";
import Brig from "@/components/Brig";

const MEN = [
    { id: 1, rank: 20, stars: 3, art: "fleet_boss_ash", name: "Commodore Ash", ship: "Commodore Ash",
      tell: "He gave his rank before his name, and gave neither twice.", will: 3, nerve: 5,
      tried: [{ tactic: "bluff", outcome: "crack" }, { tactic: "offer", outcome: "harden" }], status: "held", ransom: 360 },
    { id: 2, rank: 34, stars: 5, art: "fleet_undertow", name: "Undertow Vane", ship: "The Undertow",
      tell: "He is very calm for a man in a cell.", will: 6, nerve: 8, tried: [], status: "held", ransom: 1000 },
    { id: 3, rank: 11, stars: 2, art: "fleet_ghost", name: "Dowry Kell", ship: "Kraken's Dowry",
      tell: "He asked, before anything else, what the arrangement was.", will: 2, nerve: 0,
      tried: [{ tactic: "bluff", outcome: "read" }, { tactic: "wait", outcome: "crack" }, { tactic: "wait", outcome: "harden" }],
      status: "spent", ransom: 160 },
    { id: 4, rank: 37, stars: 5, art: "fleet_regret", name: "Cartographer Regret", ship: "Cartographer's Regret",
      tell: "He would not come down until his people were off first.", will: 6, nerve: 7,
      tried: [{ tactic: "bluff", outcome: "harden" }], status: "held", ransom: 1000 },
];

export default function P() {
    const [on, setOn] = useState(false);
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const n = q.has("n") ? Number(q.get("n")) : 3;
        const brig = {
            berths: 4, piecesNeeded: 3, canConfront: n > 1, room: 4 - n,
            offers: q.get("deck") === "0" ? [] : [{ id: 90, rank: 40, stars: 5, art: "fleet_boss_harbour",
                name: "The Last Harbour", ship: "The Last Harbour", cost: 1000 }],
            captives: MEN.slice(0, n),
            confessions: q.get("conf") === "0" ? [] : [
                { id: 11, stars: 1, name: "Hollis Tide", ship: "x", art: "fleet_corvette" },
                { id: 12, stars: 4, name: "Marigold Ames", ship: "y", art: "fleet_marigold" }],
            charts: q.get("chart") === "0" ? [] : [{ id: 21, grade: 9, band: "bearing" }],
        };
        const real = window.fetch;
        window.fetch = async (u, o) => {
            if (String(u).includes("/sailing/brig")) {
                if (o?.method === "POST") {
                    const b = JSON.parse(o.body || "{}");
                    const who = brig.captives.find((c) => c.id === b.id) || MEN[1];
                    if (b.tactic === "wait") return new Response(JSON.stringify({ ok: true, outcome: "crack", broke: true,
                        said: "He does not mind the dark — but he minds that nobody has come for him. Left long enough, that is the thing that says it out loud.",
                        captive: { ...who, broke: "He says it flatly, to the floor, and asks that it be written down that he was made to." },
                        confession: { id: 13 }, brig }), { status: 200 });
                    const harden = b.tactic === "offer";
                    return new Response(JSON.stringify({ ok: true, outcome: harden ? "harden" : "crack",
                        said: harden ? "You have told him exactly what you think he is. He lets that sit there, and gives you nothing to go with it."
                                     : "“That,” he says, “is a number.” And then he is talking.",
                        captive: { ...who, nerve: harden ? who.nerve - 2 : who.nerve - 1, will: harden ? who.will : who.will - 1,
                            tried: [...who.tried, { tactic: b.tactic, outcome: harden ? "harden" : "crack" }] },
                        brig }), { status: 200 });
                }
                return new Response(JSON.stringify(brig), { status: 200 });
            }
            return real(u, o);
        };
        setOn(true);
        return () => { window.fetch = real; };
    }, []);
    useEffect(() => {
        if (!on) return;
        const q = new URLSearchParams(window.location.search);
        if (!q.has("open")) return;
        const i = Number(q.get("open")) || 0;
        const t = setTimeout(() => {
            document.querySelectorAll(".brg-man")[i]?.click();
            const hit = q.get("hit");
            if (hit) setTimeout(() => {
                const want = { bluff: 0, offer: 1, confront: 2, wait: 3 }[hit] ?? 0;
                document.querySelectorAll(".brg-plate")[want]?.click();
            }, 520);
        }, 460);
        return () => clearTimeout(t);
    }, [on]);
    if (!on) return null;
    return (
        <div style={{ background: "#0b0906", minHeight: "100vh", padding: 12 }}>
            <div style={{ maxWidth: 620, margin: "0 auto", border: "1px solid #262019", borderRadius: 14, padding: 12, background: "#121009" }}>
                <Brig />
            </div>
        </div>
    );
}
