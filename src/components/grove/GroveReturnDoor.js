"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { GROVE_RETURN_EVENT, readGroveReturn } from "@/lib/marketplace/grove-return.js";

// ── THE WAY BACK IN, FROM ANYWHERE ───────────────────────────────────────────────────────────────────────────
// Luke: "if I go to the forge in act 2 town I want to easily go right back to where I was in town. And this
// applies to every feature."
//
// "Every feature" is the whole requirement, and it is why this is ONE component in the marketplace layout
// rather than a back-link added to each of them. There are more than twenty feature pages; a per-page door is
// twenty chances to forget, and the ones that were forgotten would look exactly like the ones that were never
// done — which is the state this is fixing. Mounted once, it is on all of them, including the ones that do
// not exist yet.
//
// ⚠️ IT READS NOTHING FROM THE SERVER, and that is a hard requirement rather than a nicety. A component in a
// layout.js runs on every navigation by every member forever, so `npm run check:chrome` holds anything
// mounted there to at most one endpoint. This needs none: the note in sessionStorage was written by the
// Grove, and the fact that it exists is already proof the member can open the Grove, because nothing else
// writes it. No query, no fetch, no buyer lookup — a breadcrumb must not have a bill.
export default function GroveReturnDoor() {
    const pathname = usePathname();
    const [spot, setSpot] = useState(null);

    // ⚠️ IN AN EFFECT, because sessionStorage does not exist on the server. Reading it during render would
    // make the first client paint disagree with the server's HTML, which React treats as a hydration
    // mismatch and recovers from by throwing the whole subtree away — on every marketplace page.
    useEffect(() => {
        const read = () => setSpot(readGroveReturn());
        read();
        window.addEventListener(GROVE_RETURN_EVENT, read);
        // Another tab moving around the Grove should not retarget this one's door, but the same tab coming
        // back from bfcache should re-read: the note may have been rubbed out while it was away.
        window.addEventListener("pageshow", read);
        return () => {
            window.removeEventListener(GROVE_RETURN_EVENT, read);
            window.removeEventListener("pageshow", read);
        };
    }, [pathname]);

    // Not on the Grove itself — the Grove owns the note there, and a door back to the room you are standing
    // in is noise. GroveClient keeps it current and rubs it out when you leave by the front door.
    if (!spot || pathname?.startsWith("/marketplace/grove")) return null;

    return (
        <a href={spot.href} className="tw-grove-door gv-return-door" aria-label={`Back to ${spot.label}`}>
            {/* The real nav sprite, not a glyph: this is a destination. [[no-icons-or-glyphs-in-the-game]] */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/nav/grove.png" alt="" width={30} height={30} aria-hidden="true" />
            <span>{spot.label}</span>
        </a>
    );
}
