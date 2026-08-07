"use client";

import { useState } from "react";

import Leaderboard from "@/components/Leaderboard";

// ── THE BOARDS ───────────────────────────────────────────────────────────────────────────────────────────────
// Whose boat is biggest, and who has dug the most out of the sand. Two tabs rather than two stacked lists: they
// are different competitions and nobody reads both at once.
//
// Rows, ranks and the pinned "where you placed" line are all the shared Leaderboard — the styling lives in
// globals.css. This file used to carry its own <style jsx> with the row markup in a separate Row() function,
// which meant not one of those rules ever applied: the rows rendered as raw text and the boat <img>, with its
// width rule dead, painted at full size. Nothing here re-invents that.

const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// The gap to the rung above — the number that makes somebody want to climb, rather than just close the tab.
function chase(tab, mine, rows) {
    if (!mine || mine.place <= 1) return null;
    const above = rows.find((r) => r.place === mine.place - 1);
    if (!above) return null;
    if (tab === "fleet") {
        const d = (above.level || 0) - (mine.level || 0);
        return d > 0 ? `${d} more boat level${d === 1 ? "" : "s"} to catch ${ordinal(above.place)}` : null;
    }
    if (tab === "battle") {
        const d = (above.depth || 0) - (mine.depth || 0);
        return d > 0 ? `${d} more rank${d === 1 ? "" : "s"} down the fleet to catch ${ordinal(above.place)}` : null;
    }
    const d = (above.points || 0) - (mine.points || 0);
    return d > 0 ? `${d} more chest point${d === 1 ? "" : "s"} to catch ${ordinal(above.place)}` : null;
}

const toRow = (tab) => (r) => {
    if (tab === "fleet") {
        return { place: r.place, who: r.who, avatar: r.avatar, art: r.art, you: r.you,
            sub: r.form || null, value: `Lv ${r.level}`, unit: `${r.voyages} voyage${r.voyages === 1 ? "" : "s"}` };
    }
    if (tab === "battle") {
        // The rung, and the ship that is on the bottom because of them — a number plus the name it cost.
        return { place: r.place, who: r.who, avatar: r.avatar, you: r.you,
            sub: r.ship ? `sank ${r.ship}` : null,
            value: `Rank ${r.depth}`, unit: `${r.wins} win${r.wins === 1 ? "" : "s"}` };
    }
    return { place: r.place, who: r.who, avatar: r.avatar, you: r.you,
        value: (r.points || 0).toLocaleString(), unit: `pts · ${r.forged} chest${r.forged === 1 ? "" : "s"}` };
};

export default function SailingBoards({ boards, mePlace, totals = null }) {
    const [tab, setTab] = useState("fleet");
    const rows = boards?.[tab] || [];
    const mine = mePlace?.[tab] || null;   // set only when the viewer placed outside the visible top

    const map = toRow(tab);
    return (
        <section className="card">
            <div className="sbd-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "fleet"} className={tab === "fleet" ? "is-on" : ""} onClick={() => setTab("fleet")}>
                    The Fleet
                </button>
                <button type="button" role="tab" aria-selected={tab === "dig"} className={tab === "dig" ? "is-on" : ""} onClick={() => setTab("dig")}>
                    Excavation
                </button>
                {boards?.battle?.length ? (
                    <button type="button" role="tab" aria-selected={tab === "battle"} className={tab === "battle" ? "is-on" : ""} onClick={() => setTab("battle")}>
                        Ship battles
                    </button>
                ) : null}
            </div>

            <p className="sbd-blurb">
                {tab === "fleet"
                    ? "Ranked by boat level — every upgrade across all five tracks. Voyages break a tie."
                    : tab === "battle"
                    ? "How deep into the pirate fleet you have fought. Rank 15 is Admiral Vane. Wins break a tie, so the captain who fought their way down out-ranks the one who squeaked past."
                    : "Ranked by chest points. A chest is worth more the rarer it is, so a shelf of wooden chests doesn't out-rank a haul of mythics."}
            </p>

            <Leaderboard
                rows={rows.map(map)}
                mine={mine ? { ...map(mine), toNext: chase(tab, mine, rows) } : null}
                total={totals?.[tab] || null}
                unitPlural={tab === "fleet" ? "captains" : tab === "battle" ? "captains" : "diggers"}
                empty={tab === "fleet" ? "Nobody has set sail yet."
                    : tab === "battle" ? "Nobody has sunk a pirate yet."
                    : "Nobody has forged a chest yet — go dig one up."}
            />

        </section>
    );
}
