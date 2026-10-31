import { redirect } from "next/navigation";

import PackOpenClient from "@/components/packs/PackOpenClient";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { packPoolSummary, resumePendingOpen } from "@/lib/marketplace/packs.js";
import { cheapestOpenPackCents } from "@/lib/marketplace/pack-pools.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { vaultOpenFor } from "@/lib/marketplace/vault-gate.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Virtual Rips | The Wolf Den", robots: { index: false } };

// ── A ROOM THAT IS NOTHING BUT THE RIP ──────────────────────────────────────────────────────────────────────
// Luke, watching people use it: "The mystery bag screen — it's not apparent that you can rip packs. Everybody
// just skips the top thing that lets... that's the entry point for opening them. I think we have competing
// screens right now... maybe we leave mystery packs alone entirely. And instead, we make a new page, a new
// menu item that's like virtual rips or something. And that screen has, it's just the pack rip UI right
// there. So you can't miss it at all."
//
// ⚠️ /mystery-bags IS NOT TOUCHED, AND UNIFYING THE TWO WOULD BE THE WRONG MOVE. That page is the Live Chase
// Board — the shop-facing screen that lists what is in the physical packs on the shelf — and the opener was
// bolted to the top of it. Two different jobs on one screen is why one of them gets scrolled past. This page
// does the second job and nothing else; the board keeps doing the first.
//
// ⚠️ SAME SERVER CALLS, SAME COMPONENT. Four reads, exactly the ones /mystery-bags already makes for the
// opener, handed to the same PackOpenClient. A second implementation of "what can this member open and what
// can they pay with" would be a second set of answers to drift apart.
export default async function VirtualRipsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    // ⚠️ THE SAME GATE THE OPENER ALREADY HAD, not a new one. A page whose whole body is a gated feature has
    // nothing to render for somebody outside the gate, so it sends them to the board instead of drawing an
    // empty room — see [[feature-gates-come-in-pairs]] for why the door and the thing behind it must agree.
    if (!buyer || !vaultOpenFor(buyer.id)) redirect("/mystery-bags");

    const [pool, balanceCents, pending, fromCents] = await Promise.all([
        packPoolSummary().catch(() => null),
        getStoreCredit(buyer.id).catch(() => 0),
        resumePendingOpen(buyer.id).catch(() => null),
        cheapestOpenPackCents().catch(() => null),
    ]);
    if (!pool) redirect("/mystery-bags");

    return (
        <div className="rip-room">
            {/* startOpen: no launch strip. On /mystery-bags that strip is the entry point people scroll
                past; here there is nothing to scroll past it to. */}
            <PackOpenClient initial={{ pool, balanceCents, pending, fromCents }} startOpen />
        </div>
    );
}
