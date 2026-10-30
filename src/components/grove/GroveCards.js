"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    GROVE_EMBLEMS, GROVE_ENEMIES, starLadder, emblemFace, emblemArt,
} from "@/lib/marketplace/grove-catalog.js";
import { GROVE_MAPS } from "@/lib/marketplace/grove-maps.js";

/**
 * ── THE MONSTER CARD SHELF ───────────────────────────────────────────────────────────────────────────────────
 *
 * Luke: "I kind of want it to be like the virtual horizontal scroll that we made for a few other things
 * recently, where the vertical skew would be different maps, and the horizontal skew would be different
 * enemies. And the bosses would just be lumped in with enemies for that map."
 *
 * What it replaces: one vertical grid of 103 cards, split into eight stacked sections. That was honest and it
 * was a wall — you scrolled past roughly forty silhouettes to reach map three, there was no way to jump, and
 * the shelf you were actually working on was wherever you happened to have left the scroll position.
 *
 * ⚠️ THE SAME RIG AS GroveAtlas, DELIBERATELY. The atlas already lays the Grove out exactly this way: a row
 * per map, a snapping horizontal track inside each, the centred card lifted. Reusing its classes means the
 * two screens scroll identically and a fix to the track's padding lands on both. See
 * [[reuse-the-rule-never-restate-it]] — the alternative was a second carousel with its own bugs.
 *
 * ⚠️ AND THE CENTRED CARD IS COMPUTED, NOT CSS. Copied from the atlas with its reasoning intact: :hover is a
 * mouse and :focus-within is a keyboard, and a finger is neither, so a CSS-only version renders every card
 * dimmed on a phone — a carousel where nothing is ever chosen.
 *
 * Bosses sit in their map's row among the wanderers rather than in a shelf of their own, which is what Luke
 * asked for and is also the better read: the row is "everything that lives on map three", and a boss card
 * is visibly the heavier thing on that row rather than a separate collection to go and find.
 */

/**
 * ── ⚠️ THE THEME IS A FRAME, NOT A BACKGROUND ────────────────────────────────────────────────────────────────
 * Luke: "I don't like the transparency... what I want is like high detail, thorny, like bordered area for like
 * the forest area... But then like a just a black or whatever near black color we typically use for the
 * contrast on the cards."
 *
 * A painted scrim behind the cards was a compromise in both directions: light enough to read as a theme and it
 * steals contrast from the cards, dark enough to leave them alone and it is a brown smear. The theme belongs
 * at the EDGE, where it is not competing with anything.
 *
 * ⚠️ ONE SQUARE DRAWING PER BIOME, SLICED BY CSS. Luke: "The border idea probably won't work out unless you
 * get the aspect ratio right." Exactly so -- a row is roughly 374x215 and changes height with its content, so
 * painted frame art at any fixed aspect is stretched the moment it is used. border-image pins the corners and
 * repeats the edges, so one square drawing fits every row at every size and the aspect ratio stops being a
 * thing that can be got wrong.
 *
 * ⚠️ ABSENT IS A VALID STATE. A map with no frame yet renders the plain near-black row, which is also the
 * fallback if the idea does not earn its keep. Nothing here breaks when the file is missing -- and the file
 * list is the ONLY place that knows which exist, so a frame ships by being drawn and named.
 */
/**
 * ── ⚠️ A MAP HAS A NAME AND IT IS NOT "Map 3" ────────────────────────────────────────────────────────────────
 * Luke: "instead of it saying map 1, we need to have like a name for each act, right? Thematically, can't
 * just say map 1." And: "I also feel like the colors of each map text should differ."
 *
 * The names already exist -- GROVE_MAPS has carried them since the maps were generated, and the headings here
 * were printing an index instead. The Ashen Reach is a place; "Map 7" is a row number in a spreadsheet.
 *
 * ⚠️ READ, NOT RE-TYPED. Copying the twelve names into this file would be twelve strings that can drift from
 * the ones the atlas and the map screen show. See [[balance-constants-never-copied]] -- the same rule applies
 * to anything with one true home, not only to numbers.
 */
const MAP_NAME = Object.fromEntries(GROVE_MAPS.map((m) => [m.n, m.name]));

// One hue per map, keyed to what the place IS: forest green, cave stone, fen teal, coast blue, drowned
// indigo, gilded gold, ash ember, storm violet, frost ice, glass pale, rot lime, starfall magenta.
// ⚠️ IT IS THE HEADING ONLY. The cards below carry the RUNG colours (Worn grey through Ascendant pink) and
// those mean something precise; a second colour system running through the same cards would make both
// unreadable. The heading is the one place a map can have its own colour without arguing with anything.
const MAP_TINT = {
    1: "#9fe08a", 2: "#c2a06a", 3: "#6fc5b0", 4: "#8ec8e8", 5: "#7a9ce0", 6: "#ffd75e",
    7: "#f08a5a", 8: "#b58af0", 9: "#a8e4f0", 10: "#d7e8f5", 11: "#b6d44a", 12: "#ff8ec4",
};

const MAP_FRAME = {
    1: "/images/grove/frame-wood.webp",
};

/** Which map a card belongs to — the row it lives on. */
function mapOf(id, meta) {
    if (meta.boss) return Number(meta.map) || 1;
    // A wanderer card has no map field of its own; it belongs to whichever creature drops it.
    const e = Object.values(GROVE_ENEMIES).find((x) => x.emblem === id);
    return Number(e?.map) || 1;
}

export default function GroveCards({ emblems = [], onWear }) {
    const rows = useMemo(() => {
        const by = new Map();
        for (const [id, meta] of Object.entries(GROVE_EMBLEMS)) {
            const m = mapOf(id, meta);
            if (!by.has(m)) by.set(m, []);
            by.get(m).push({ id, meta });
        }
        // Wanderers first within a row, then that map's bosses — the order you meet them, and it keeps the
        // boss cards as the far end of the row rather than scattered through it.
        for (const list of by.values()) {
            list.sort((a, b) => (a.meta.boss ? 1 : 0) - (b.meta.boss ? 1 : 0));
        }
        return [...by.keys()].sort((a, b) => a - b).map((m) => ({ map: m, cards: by.get(m) }));
    }, []);

    const owned = useMemo(() => {
        const o = new Map();
        for (const e of emblems || []) o.set(e.id, e);
        return o;
    }, [emblems]);

    const trackRefs = useRef({});
    const [centred, setCentred] = useState({});

    useEffect(() => {
        const onScroll = (m) => () => {
            const el = trackRefs.current[m];
            if (!el) return;
            const mid = el.scrollLeft + el.clientWidth / 2;
            let best = 0, bestD = Infinity;
            [...el.children].forEach((c, i) => {
                const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
                if (d < bestD) { bestD = d; best = i; }
            });
            setCentred((s) => (s[m] === best ? s : { ...s, [m]: best }));
        };
        const handlers = [];
        for (const r of rows) {
            const el = trackRefs.current[r.map];
            if (!el) continue;
            const h = onScroll(r.map);
            el.addEventListener("scroll", h, { passive: true });
            h();
            handlers.push([el, h]);
        }
        return () => handlers.forEach(([el, h]) => el.removeEventListener("scroll", h));
    }, [rows]);

    // ⚠️ EACH ROW OPENS ON ITS FIRST GAP, not at the start. The same instinct as the atlas opening on the
    // furthest zone reached: a collection screen should land on the work, and on a finished row the work is
    // nothing, so it stays at the start rather than scrolling to the end for no reason.
    useEffect(() => {
        for (const r of rows) {
            const el = trackRefs.current[r.map];
            if (!el) continue;
            const gap = r.cards.findIndex((c) => !(owned.get(c.id)?.count > 0));
            if (gap > 0) {
                const cell = el.children[gap];
                if (cell) el.scrollLeft = Math.max(0, cell.offsetLeft - el.clientWidth / 2 + cell.offsetWidth / 2);
            }
        }
        // Once, on mount — re-running would yank the view back while somebody is reading it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="gv-cards">
            {rows.map((r) => {
                const found = r.cards.filter((c) => owned.get(c.id)?.count > 0).length;
                return (
                    <section key={r.map}
                        className={`ga-row is-themed${MAP_FRAME[r.map] ? " is-framed" : ""}`}
                        style={{
                            "--map": MAP_TINT[r.map] || "#ffd98f",
                            ...(MAP_FRAME[r.map] ? { "--row-frame": `url("${MAP_FRAME[r.map]}")` } : null),
                        }}>
                        {MAP_FRAME[r.map] ? <span className="gv-row-frame" aria-hidden="true" /> : null}
                        <header className="ga-row-head">
                            <b>{MAP_NAME[r.map] || `Map ${r.map}`}</b>
                            <i>{found}/{r.cards.length} found</i>
                        </header>
                        <div className="ga-track" ref={(n) => { trackRefs.current[r.map] = n; }}>
                            {r.cards.map((c, i) => {
                                const row = owned.get(c.id);
                                const count = row?.count || 0;
                                const have = count > 0;
                                const L = starLadder(c.id);
                                let stars = 0;
                                for (const rung of L) if (count >= rung.at) stars = rung.star;
                                const next = L.find((x) => x.at > count) || null;
                                const floor = stars ? L[stars - 1].at : 0;
                                const pct = next ? Math.max(4, Math.round(((count - floor) / (next.at - floor)) * 100)) : 100;
                                const worn = row && row.slot !== null && row.slot !== undefined;
                                const seal = emblemArt(c.id);
                                const face = emblemFace(c.id);
                                return (
                                    <div key={c.id} className={`ga-cell${centred[r.map] === i ? " ga-on" : ""}`}>
                                        <div className={`gv-card${have ? "" : " is-locked"}${worn ? " is-worn" : ""}${stars >= 5 ? " is-high" : ""}${c.meta.boss ? " is-boss" : ""}`}
                                            style={{ "--rung": (stars ? L[stars - 1].color : "#6a6355") }}>
                                            <span className="gv-card-win">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={face} alt="" loading="lazy" />
                                                {have && seal && seal !== face ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img className="gv-card-seal" src={seal} alt="" loading="lazy" />
                                                ) : null}
                                                {/* A boss card says so on its face. It is the heavier thing on
                                                    the row and the row is otherwise undifferentiated. */}
                                                {c.meta.boss ? <em className="gv-card-boss">Boss</em> : null}
                                                {worn ? <em className="gv-card-worn">Worn</em> : null}
                                            </span>
                                            <span className="gv-card-pips">
                                                {[1, 2, 3, 4, 5, 6].map((n) => (
                                                    <i key={n} className={n <= stars ? "on" : ""}
                                                        style={n <= stars ? { color: L[n - 1].color } : undefined}>★</i>
                                                ))}
                                            </span>
                                            <b>{have ? c.meta.name : "· · ·"}</b>
                                            {have && stars ? (
                                                <u>+{c.meta.kind === "pct" ? (c.meta.per * stars).toFixed(1) : c.meta.per * stars}
                                                    {c.meta.kind === "pct" ? "%" : ""}{" "}
                                                    {String(c.meta.stat).replace(/_/g, " ")}</u>
                                            ) : (
                                                <u className="gv-card-none">
                                                    {have ? `${(next?.at || 1) - count} more to wake it` : "not found"}
                                                </u>
                                            )}
                                            <span className="gv-card-bar">{have ? <i style={{ width: `${pct}%` }} /> : null}</span>
                                            <small>{have ? `${count}${next ? ` / ${next.at}` : " · maxed"}` : ""}</small>
                                            {have && !worn ? (
                                                <button type="button" onClick={() => onWear?.(c.id)}>Wear</button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
