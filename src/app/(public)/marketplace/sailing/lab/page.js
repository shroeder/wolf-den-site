import { notFound } from "next/navigation";

import HighSeasLab from "@/components/HighSeasLab";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { hasOwnerStanding } from "@/lib/marketplace/owner.js";

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
// run lives in the browser, which is why there is no `*-gate.js` beside this file: the page IS the only door,
// because there is nothing else to knock on. Nothing here can reach a member's save.
//
// notFound() rather than a redirect or a "you can't see this": the route simply does not exist for anybody
// else, which is the same shape the Forest and the Brig use while they are being built.
export default async function HighSeasLabPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) notFound();
    const owns = await hasOwnerStanding(buyer.id).catch(() => false);
    if (!owns) notFound();

    return (
        <div className="stack reveal">
            <HighSeasLab />
        </div>
    );
}
