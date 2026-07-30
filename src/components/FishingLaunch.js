"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import useScrollLock from "@/lib/useScrollLock";

// ── First-visit "Fishing is live!" announcement ───────────────────────────────────────────────────────────────
// Fires once per browser for signed-in members, says what fishing is, and drops them straight into it. Built to
// match ForgeAnnounce exactly — same portal, same localStorage marker, same shape — because this is the second
// time we've launched a feature this way and two different announcement patterns would be worse than one.
// Bump SEEN_KEY to re-announce after a big change.
const SEEN_KEY = "wolfden-fishing-announce-v1";

// Portal to <body> so position:fixed is measured against the VIEWPORT, not the hub's animated (transformed)
// container — otherwise a "full-screen" overlay gets trapped inside a tall scroll box.
function Portal({ children }) {
    const [el] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
    useEffect(() => {
        if (!el) return undefined;
        document.body.appendChild(el);
        return () => { document.body.removeChild(el); };
    }, [el]);
    if (!el) return null;
    return createPortal(children, el);
}

export default function FishingLaunch() {
    const [show, setShow] = useState(false);
    useScrollLock(show);

    useEffect(() => {
        let seen = null;
        try { seen = localStorage.getItem(SEEN_KEY); } catch { /* private mode — just don't show it */ }
        if (!seen) setShow(true);
    }, []);

    const dismiss = () => {
        try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
        setShow(false);
    };

    if (!show) return null;
    return (
        <Portal>
            <div className="fishlaunch-wrap" role="dialog" aria-modal="true" aria-label="Fishing is live">
                <button type="button" className="fishlaunch-scrim" aria-label="Close" onClick={dismiss} />
                <div className="fishlaunch">
                    <div className="fishlaunch-art" aria-hidden="true">🎣</div>
                    <h2>Fishing is live</h2>
                    <p>
                        Drop a line over the rail while your boat&apos;s at sea. <b>24 species</b> to find, a personal
                        best for each one, and a Den-wide record board to get your name onto.
                    </p>
                    <ul className="fishlaunch-list">
                        <li><b>10 free casts a day</b> — more once you rig your rod</li>
                        <li>One cast in five hauls up <b>treasure</b> instead of a fish</li>
                        <li>Gear, chests, seeds, and <b>four pets you can&apos;t get anywhere else</b></li>
                    </ul>
                    <a className="fishlaunch-go" href="/marketplace/sailing" onClick={dismiss}>Go fishing 🎣</a>
                    <button type="button" className="fishlaunch-later" onClick={dismiss}>Maybe later</button>
                </div>
            </div>
        </Portal>
    );
}
