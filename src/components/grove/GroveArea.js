"use client";

import { useCallback, useEffect, useState } from "react";

// ── AN AREA ─────────────────────────────────────────────────────────────────────────────────────────────────
// Luke: "hate the lack of color and lack of sprite paneling and trim ... Sprites in title etc are needed for
// each respective area."
//
// ⚠️ ONE COMPONENT, IN ONE FILE, BECAUSE THE BAG AND THE WORKBENCH ARE DIFFERENT FILES. Writing the board,
// the four corners, the plank name-board and the colour class by hand in each is how two of the eight end up
// half-dressed, and nobody would ever notice: a section that quietly loses its trim still renders fine.
//
// The trim span is not decoration-for-decoration's-sake. The panel's own ::before and ::after are spent on
// the top two corners, and an element has exactly two pseudo-elements, so the bottom two need somewhere to
// hang. Everything else about the look lives in grove-css.js under .gv-sect.

// ── ⚠️ THE OPEN/SHUT STATE OUTLIVES THE PANEL, AND IT HAS TO ────────────────────────────────────────────────
// Luke: "when you're looking at your inventory, you can't collapse things."
//
// Component state alone would have been a worse feature than none: the bag panel unmounts every time you
// open the map or the bench, so a shelf you shut would be open again the next time you looked, and the
// control would read as broken rather than as absent.
const KEY = "gv-sect-shut";

const readShut = () => {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); }
};
const writeShut = (set) => {
    try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode, ignore */ }
};

/** Ask an Area to open itself, wherever it is. Used by "Show me where it went". */
export const OPEN_AREA_EVENT = "grove:open-area";

export default function GroveArea({ id, icon, title, count, children, collapsible = true }) {
    // ⚠️ STARTS OPEN AND READS THE STORE AFTER MOUNT, NEVER DURING RENDER. localStorage does not exist on
    // the server, so reading it in the initial state is a hydration mismatch — React renders one tree on the
    // server and a different one in the browser and patches over the difference silently.
    const [shut, setShut] = useState(false);
    useEffect(() => { setShut(readShut().has(id)); }, [id]);

    const toggle = useCallback(() => {
        setShut((was) => {
            const next = !was;
            const set = readShut();
            if (next) set.add(id); else set.delete(id);
            writeShut(set);
            return next;
        });
    }, [id]);

    // ⚠️ SCROLLING TO A SHUT SHELF SHOWS A PLAYER A CLOSED LID. The craft card's "Show me where it went"
    // sends people to the Tools or the Belt, and if they had collapsed that one earlier the answer to
    // "where did it go" would be a header with nothing under it — the exact confusion the button exists to
    // end. An event rather than a prop because the shelf is three components below the thing that knows.
    useEffect(() => {
        const onOpen = (e) => { if (e.detail === id) { setShut(false); const s = readShut(); s.delete(id); writeShut(s); } };
        window.addEventListener(OPEN_AREA_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_AREA_EVENT, onOpen);
    }, [id]);

    const head = (
        <>
            <img className="gv-sect-ico" src={`/images/grove/${icon}.webp`} alt="" width={38} height={38} />
            {title}
            {count ? <i>{count}</i> : null}
            {collapsible ? <b className="gv-sect-chev" aria-hidden="true" /> : null}
        </>
    );

    return (
        // ⚠️ A REAL DOM id, NOT ONLY THE CLASS. `id` arrived here as decoration — it became `is-tools` on
        // the className and nothing else — so anything trying to scroll a player to an Area found nothing
        // and failed silently. The craft card's "Show me" is the first caller; see goToArea.
        <section id={`area-${id}`} className={`gv-sect is-${id}${shut ? " is-shut" : ""}`}>
            {collapsible ? (
                // ⚠️ A BUTTON, NOT AN onClick ON THE h4. The heading is the control now, so it has to be
                // reachable by keyboard and announce whether it is open — a div that happens to respond to
                // a tap is invisible to anybody not using a mouse.
                <h4><button type="button" className="gv-sect-head" onClick={toggle}
                    aria-expanded={!shut} aria-controls={`area-body-${id}`}>{head}</button></h4>
            ) : <h4>{head}</h4>}
            {/* ⚠️ UNMOUNTED, NOT HIDDEN. These shelves carry hundreds of rows — the whole complaint is that
                the inventory is long — so leaving them in the tree with display:none would keep paying for
                every one of them on every render of the panel. */}
            {shut ? null : <div id={`area-body-${id}`}>{children}</div>}
            <span className="gv-sect-trim" aria-hidden="true" />
        </section>
    );
}
