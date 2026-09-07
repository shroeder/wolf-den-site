"use client";

// ── THE WAY OUT, AND IT IS THE SAME WAY OUT EVERYWHERE ───────────────────────────────────────────────────
// Luke, on the table screen: "reinvent the red button i hate it."
//
// It was a drawn scarlet ribbon (return-ribbon.png) pinned to the bottom-LEFT corner of four different
// screens, and everything about it was wrong once you looked:
//
//   · THE COLOUR IS NOT IN THIS GAME. Every other surface here is stone, brass, ember and cream. A saturated
//     pillar-box red appears nowhere else — not on a card, not on a plate, not in the art — so the one thing
//     on screen shouting for attention was the thing you press LAST.
//   · IT SAT ON TOP OF THE CONTENT. Fixed in a corner over a scrolling column, it covered a card in the
//     cabinet, the best score on the table, and part of the shop's brazier, depending where you had scrolled.
//   · IT RAN OFF THE EDGE. Pinned at left:0 with a fixed width, on a narrow phone the ribbon's own tail was
//     cut by the screen — visible in the photograph he sent.
//   · AND IT WAS THE LOUDEST THING ON A QUIET SCREEN, which inverts the hierarchy: the stone plate is the
//     thing you came to press, and leaving is the thing you do when you are finished.
//
// The replacement is not another button. It is the FOOT the map already had and the other four screens did
// not — a band across the bottom holding the way out on the left and, when there is one, a hint on the right.
// A band cannot cover anything (the screen pads itself above it), cannot run off an edge (it is the width of
// the screen), and reads as part of the room rather than as a sticker on it.
export default function CardFoot({ label = "Leave", onClick, hint = null, busy = false }) {
    return (
        <div className="cfoot">
            <button type="button" className="cfoot-go" onClick={onClick} disabled={busy}>
                <span aria-hidden="true">&lsaquo;</span> {label}
            </button>
            {hint ? <span className="cfoot-hint">{hint}</span> : null}

            <style jsx global>{`
                /* Fixed, because on a screen that scrolls the way out must not scroll away with it — the
                   shop's Move on was two shelves and a brazier below the fold before this. */
                .cfoot { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
                    display: flex; align-items: center; justify-content: space-between; gap: 10px;
                    padding: 9px 14px calc(9px + env(safe-area-inset-bottom));
                    background: linear-gradient(180deg, rgba(10,12,17,0) 0%, rgba(10,12,17,0.86) 34%,
                        rgba(10,12,17,0.96) 100%);
                    border-top: 1px solid rgba(226,199,143,0.14); }
                /* Brass on stone, and it lights when touched. The chevron says BACK without an icon —
                   see the note in the Den's rules about arrow glyphs. */
                .cfoot-go { padding: 6px 4px; border: 0; background: none; cursor: pointer;
                    font-family: var(--cf-card-font, inherit); font-size: 14.5px; letter-spacing: 0.05em;
                    color: #d9c49a; transition: color 120ms ease-out; }
                .cfoot-go:hover:not(:disabled), .cfoot-go:focus-visible { color: #ffe6c2; }
                .cfoot-go:disabled { opacity: 0.45; cursor: default; }
                .cfoot-hint { font-family: var(--cf-card-font, inherit); font-size: 10px;
                    letter-spacing: 0.09em; text-transform: uppercase; color: #7d7364; }
            `}</style>
        </div>
    );
}
