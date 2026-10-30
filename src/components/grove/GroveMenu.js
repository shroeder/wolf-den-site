"use client";

import { useEffect, useRef } from "react";

/**
 * ── THE GROVE'S MENU ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Luke: "I don't like the floating buttons, lets make a true families menu for the grove, maybe it slides out
 * from the left."
 *
 * What it replaces: six sprite circles floating over the bottom of the scene and a second row of the same six
 * floating over the hub. They had three problems that a row of buttons cannot solve.
 *
 *  · They were a FLAT LIST pretending to be navigation. Map, Backpack, Gear, Workbench, Quests and Cards are
 *    not six peers — two are about where to go, three are about what you are carrying, one is about what you
 *    make. Six identical circles say none of that, so every one of them has to be learned individually, and a
 *    seventh destination would have meant a seventh circle and a harder row.
 *  · They had no room for a WORD. At 46px a sprite is the whole button, so the only way to find out what the
 *    anvil opens is to press it. The badge counts the workbench and the bag grew are the proof: both are
 *    attempts to say something in a space with nowhere to say it.
 *  · In the zone they sat across the bottom of the frame, which is where the creatures are. The existing fix
 *    was to fade them out mid-swing and switch off their pointer events, which is a real fix for a real
 *    collision and also an admission that the controls are standing somewhere they should not be.
 *
 * So: one handle at the left edge, and a drawer of named rows grouped into families. The handle is a single
 * small target instead of six large ones, it sits up the side rather than across the fight, and a new
 * destination is a new ROW in an existing family rather than more furniture on the screen.
 *
 * ⚠️ LEFT, NOT RIGHT, AND THAT IS NOT A COIN FLIP. The right-hand side of a zone already carries Leave and the
 * full-screen toggle, and the right edge is where a right thumb rests — which is exactly why the dock avoided
 * it. A drawer is different from a dock: it is opened deliberately, read, and dismissed, so it wants the side
 * the thumb is NOT already resting on, or every stray touch while fighting opens it.
 *
 * Shared by the hub and the zone on purpose. They are the same destinations and a player should not learn two
 * menus for them; what differs is the footer (the zone has a sound switch) and which rows carry a badge.
 */
export default function GroveMenu({
    open, onOpen, onClose, families, current = null, onPick, footer = null,
    handleRef = null, label = "The Grove",
}) {
    const panelRef = useRef(null);

    // ⚠️ ESCAPE CLOSES IT, because a drawer that can only be dismissed by hitting a 40px scrim edge is a
    // drawer that traps a desktop player. The zone keeps its own keyboard handling for movement; this
    // listens only while the drawer is open, so it cannot eat a key during a fight.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Focus lands inside the drawer when it opens, so a keyboard or screen-reader player is actually IN the
    // thing that just appeared rather than still back on the handle behind a scrim.
    useEffect(() => {
        if (open) panelRef.current?.focus();
    }, [open]);

    return (
        <>
            {/* The handle. One target, left edge, vertically centred where a thumb can reach it without
                crossing the middle of the frame. Carries the total badge count so the menu can say "there
                is something to do in here" while shut -- which the old dock could only do by putting a
                number on whichever circle it belonged to. */}
            <button type="button" ref={handleRef} className={`gv-mmenu-handle${open ? " is-open" : ""}`}
                aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => (open ? onClose?.() : onOpen?.())}>
                <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                {!open && families.some((f) => f.rows.some((r) => r.badge)) ? (
                    <b className="gv-mmenu-dot" aria-hidden="true" />
                ) : null}
            </button>

            {/* ⚠️ THE SCRIM IS A BUTTON, NOT A DIV WITH AN onClick. A tap outside a drawer is the most
                common way anyone closes one, and making it a real control is what gets it a focus ring and
                a keyboard route for free. */}
            {open ? (
                <button type="button" className="gv-mmenu-scrim" aria-label="Close menu"
                    onPointerDown={(e) => e.stopPropagation()} onClick={() => onClose?.()} />
            ) : null}

            <nav className={`gv-mmenu${open ? " is-open" : ""}`} aria-label={label}
                aria-hidden={open ? undefined : true}
                ref={panelRef} tabIndex={-1}
                onPointerDown={(e) => e.stopPropagation()}>
                <header>The Grove</header>
                <div className="gv-mmenu-scroll">
                    {families.map((fam) => (
                        <section key={fam.title}>
                            {/* ⚠️ THE FAMILY NAME IS A VERB, not a category noun. "Go", "Carry", "Make" say
                                what you came to the menu to DO; "Navigation", "Inventory", "Crafting" are
                                names for the code rather than for the player. */}
                            <h3>{fam.title}</h3>
                            {fam.rows.map((r) => (
                                <button key={r.k} type="button"
                                    className={current === r.k ? "is-on" : undefined}
                                    aria-current={current === r.k ? "page" : undefined}
                                    onClick={() => { onPick?.(r.k); onClose?.(); }}>
                                    {/* ⚠️ A SOCKET, NOT A BARE IMAGE. The sprite sits in a recessed
                                        plate lit in the family's hue -- the same read as a gear slot
                                        or a card window, which is what makes the menu look like it
                                        came out of the same game as the things it opens. */}
                                    <span className="gv-mmenu-sock">
                                        <img src={r.art} alt="" draggable={false} />
                                    </span>
                                    <span>
                                        <b>{r.label}</b>
                                        {/* The line the old circles had nowhere to put. It is the
                                            destination's own state -- what is ready, how full it is --
                                            so the menu answers "is it worth opening" before you open it. */}
                                        {r.note ? <small>{r.note}</small> : null}
                                    </span>
                                    {r.badge ? <em>{r.badge}</em> : null}
                                </button>
                            ))}
                        </section>
                    ))}
                </div>
                {footer ? <footer>{footer}</footer> : null}
            </nav>
        </>
    );
}
