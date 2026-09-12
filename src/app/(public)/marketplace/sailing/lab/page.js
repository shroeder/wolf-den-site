import { notFound } from "next/navigation";

import HighSeasLab from "@/components/HighSeasLab";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { highSeasOpenTo } from "@/lib/marketplace/highseas-gate.js";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "High Seas · lab | Wolf Den",
    robots: { index: false, follow: false },
};

// ── THE NEW SAILING LOOP, AS SOMETHING YOU CAN PLAY ──────────────────────────────────────────────────────────
// Luke: "I think we might need to make a completely separate page for this just to test, and it would be owner
// gated, because I'd kinda like to see some of this in action before we go too far."
//
// So it is its own route and it touches nothing. No API, no database, no migration, no doubloons — the whole
// run lives in the browser. There is no API to guard, so the only two doors are this page and the menu entry
// that points at it — and both read the same gate, because a door and a menu on two different rules is how a
// member ends up with an entry that 404s. Nothing here can reach anybody's save.
//
// notFound() rather than a redirect or a "you can't see this": the route simply does not exist for anybody
// else, which is the same shape the Forest and the Brig use while they are being built.
export default async function HighSeasLabPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) notFound();
    // The SAME gate the menu entry reads — see highseas-gate.js. A door and a menu on two different rules is
    // how a member ends up with an entry that 404s, or a page nothing leads to.
    if (!highSeasOpenTo(buyer.id)) notFound();

    return (
        <div className="stack reveal">
            <HighSeasLab />
        </div>
    );
}
