"use client";

import { useEffect, useRef, useState } from "react";

// ── THE ATLAS — MAPS DOWN, ZONES ACROSS ──────────────────────────────────────────────────────────────────────
// Luke: "I would like them to work kind of like the new experimental shop with the horizontal vertical scroll,
// where each vertical layer is one of the maps and each horizontal layer is one of the zones. And I'd prefer
// it if the town for each map would be the leftmost one... I'd rather go back to this than the ancient map
// scroll looking, paper scroll looking design, which I just hate."
//
// So: one row per map, scrolled vertically; twelve zones per row, scrolled horizontally; and the row begins
// with its TOWN, because the town is where you arrive before the map and the leftmost card is where the eye
// starts.
//
// ⚠️ IT REUSES THE PACK PICKER'S PATTERN RATHER THAN INVENTING ONE. `.pk-pick-track` in globals.css is a
// CSS scroll-snap carousel that already solved the two things that go wrong here — end cards that can never
// reach the centre (fixed with padding on the track) and "which card is selected" having no CSS expression
// (there is no selector for the child a snap settled on, so the index is computed and a class is set). Same
// shape, same reasons; see the notes on those rules before changing anything here.
//
// ⚠️ AND THE ART ALREADY EXISTS. Every zone ships a backdrop at /images/grove/zone-<id>.webp — 84 of them,
// drawn when the maps were built. This draws the place itself rather than a symbol on parchment, which is
// the whole point of the change, and it costs nothing to make.

/** One card: a zone you can walk into, or the town at the head of the row. */
function Card({ art, name, state, locked, clear, boss, next, onClick, kind }) {
    return (
        <button
            type="button"
            className={`ga-card ga-${kind}${locked ? " is-locked" : ""}${clear ? " is-clear" : ""}`
                + `${boss ? " is-boss" : ""}${next ? " is-next" : ""}`}
            disabled={locked || !onClick}
            onClick={onClick}
            aria-label={`${name}${state ? ` — ${state}` : ""}${next ? ", go here next" : ""}`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art} alt="" draggable={false} />
            <span className="ga-card-plate">
                <em>{name}</em>
                {state ? <u>{state}</u> : null}
            </span>
            {next ? <span className="ga-card-pin" aria-hidden="true">Next</span> : null}
        </button>
    );
}

/**
 * @param {object[]} zones   every zone, each carrying map, mapName, bg, unlocked, kills, toUnlock
 * @param {function} onEnter called with the zone when a card is tapped
 * @param {function} zoneState  (z) => { bossStands, done } — the caller owns that rule, not this view
 * @param {object|null} frontier the one zone to point at
 * @param {object[]} towns   [{ n, id, name }] so each row can open with its town
 */
export default function GroveAtlas({ zones = [], towns = [], onEnter, zoneState, frontier, onTown }) {
    const maps = [...new Set(zones.map((z) => z.map || 1))].sort((a, b) => a - b);
    const rowRefs = useRef({});
    const [centred, setCentred] = useState({});

    // ⚠️ THE CENTRED CARD IS COMPUTED, NOT SELECTED BY CSS. Same reason the pack picker does it: :hover is a
    // mouse and :focus-within is a keyboard, and a finger is neither — rely on those and every card renders
    // dimmed on a phone, which is a carousel where nothing is chosen.
    useEffect(() => {
        const onScroll = (m) => () => {
            const el = rowRefs.current[m];
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
        for (const m of maps) {
            const el = rowRefs.current[m];
            if (!el) continue;
            const h = onScroll(m);
            el.addEventListener("scroll", h, { passive: true });
            h();
            handlers.push([el, h]);
        }
        return () => handlers.forEach(([el, h]) => el.removeEventListener("scroll", h));
    }, [maps.join(",")]);

    // Open each row on the furthest zone the player has actually reached, so the atlas lands where the work
    // is rather than at the start of a map they finished days ago.
    useEffect(() => {
        for (const m of maps) {
            const el = rowRefs.current[m];
            if (!el) continue;
            const rowZones = zones.filter((z) => (z.map || 1) === m);
            const lastOpen = rowZones.filter((z) => z.unlocked).length;
            if (lastOpen > 1) {
                const card = el.children[lastOpen];   // +1 for the town card at the head
                if (card) el.scrollLeft = Math.max(0, card.offsetLeft - el.clientWidth / 2 + card.offsetWidth / 2);
            }
        }
        // Once, on mount — re-running would yank the view back while somebody is reading it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="ga-atlas">
            {maps.map((m) => {
                const rowZones = zones.filter((z) => (z.map || 1) === m);
                const town = towns.find((t) => t.n === m) || null;
                const reached = rowZones.some((z) => z.unlocked);
                return (
                    <section key={m} className={`ga-row${reached ? "" : " is-shut"}`}>
                        <header className="ga-row-head">
                            <b>{rowZones[0]?.mapName || `Map ${m}`}</b>
                            <i>{rowZones.filter((z) => z.unlocked).length}/{rowZones.length}</i>
                        </header>
                        <div className="ga-track" ref={(el) => { rowRefs.current[m] = el; }}>
                            {/* THE TOWN IS THE LEFTMOST CARD. You arrive in it before the map, so it reads
                                first — and it gives the row a fixed, recognisable start to scroll back to. */}
                            {town ? (
                                <Card kind="town" art={`/images/town/ground/${town.id}-fg.webp`}
                                    name={town.name} state="Town" locked={!reached}
                                    onClick={reached && onTown ? () => onTown(town) : null} />
                            ) : null}
                            {rowZones.map((z, i) => {
                                const { bossStands, done } = (zoneState?.(z) || {});
                                const isNext = frontier?.id === z.id;
                                const state = !z.unlocked ? "Locked"
                                    : done ? "Cleared"
                                    : bossStands ? (isNext ? (z.bossDef?.name || "Boss waits") : "Boss alive")
                                    : `${z.kills}/${z.toUnlock}`;
                                const on = centred[m] === i + (town ? 1 : 0);
                                return (
                                    <div key={z.id} className={`ga-cell${on ? " ga-on" : ""}`}>
                                        <Card kind="zone" art={z.bg || z.node} name={z.name} state={state}
                                            locked={!z.unlocked} clear={done} boss={bossStands} next={isNext}
                                            onClick={z.unlocked ? () => onEnter?.(z) : null} />
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
