"use client";

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
export default function GroveArea({ id, icon, title, count, children }) {
    return (
        // ⚠️ A REAL DOM id, NOT ONLY THE CLASS. `id` arrived here as decoration — it became `is-tools` on
        // the className and nothing else — so anything trying to scroll a player to an Area found nothing
        // and failed silently. The craft card's "Show me" is the first caller; see goToArea.
        <section id={`area-${id}`} className={`gv-sect is-${id}`}>
            <h4>
                <img className="gv-sect-ico" src={`/images/grove/${icon}.webp`} alt="" width={38} height={38} />
                {title}
                {count ? <i>{count}</i> : null}
            </h4>
            {children}
            <span className="gv-sect-trim" aria-hidden="true" />
        </section>
    );
}
