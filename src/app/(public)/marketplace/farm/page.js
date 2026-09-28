import { notFound } from "next/navigation";

import FarmClient from "@/components/FarmClient";
import { featuredPackage } from "@/lib/marketplace/packages-server.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getFarm, resolveFarmOwner } from "@/lib/marketplace/farm.js";
import { isOwner, canDressUp } from "@/lib/marketplace/owner.js";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Farm | The Wolf Den", robots: { index: false } };

// Every signed-in member has a farm. ?u=<alias> inspects another member's farm (view-only).
export default async function FarmPage({ searchParams }) {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    if (!buyer) notFound();

    const sp = (await searchParams) || {};
    const u = typeof sp.u === "string" ? sp.u : null;
    let ownerId = buyer.id;
    if (u) {
        const o = await resolveFarmOwner(u);
        if (o) ownerId = o.id;
    }
    const farm = await getFarm(ownerId, buyer.id);
    if (!farm) notFound();
    // Owner-debug flag (powers the "Test critter" button) — the GET route sets this, but the initial page render
    // must too, since the client doesn't re-fetch the full farm on mount.
    farm.ownerDebug = !u && isOwner(buyer.id);
    // ── THE OFFER, WHERE THE INTENT IS ───────────────────────────────────────────────────────────────────────
    // The Petting Stand is a FARM decoration, so the farm is where somebody is most likely to want one — they
    // are already arranging the thing it goes in. Own farm only: an advertisement on somebody else's pasture is
    // an advertisement in a place you are visiting as a guest.
    //
    // Null for everybody while a package is unreleased; the owner gets a labelled preview. See packages-server.
    farm.packageOffer = !u ? await featuredPackage(buyer.id, { withArt: true }).catch(() => null) : null;

    // ── THE FARM, WITH THE HALLOWEEN FLAG UP ─────────────────────────────────────────────────────────────
    // Same gate the plaza and the sea use: the member's own `town_halloween` column, behind canDressUp. It is
    // resolved for the VIEWER, not the farm's owner — the flag dresses the world for whoever raised it, and
    // walking onto somebody else's pasture should not undress it.
    //
    // ⚠️ RESOLVED HERE AND HANDED OVER, rather than fetched by the client. FarmClient seeds all of its state
    // from `initial` with useState and does not re-fetch on mount, so a backdrop arriving later would flash
    // the ordinary field first — which is exactly the thing a costume must not do.
    const hw = canDressUp(buyer.id)
        ? await db.queryOne(`SELECT town_halloween FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null)
        : null;
    farm.halloween = Boolean(hw?.town_halloween);
    // The art lives in settings rather than in the source, because it is generated (scripts/gen-farm-haunted)
    // and a redraw has to reach phones without a deploy. Null until it has been drawn, which reads as "no
    // costume" rather than as a broken image.
    farm.halloweenBg = farm.halloween ? await getSetting("farm_bg_haunted", null).catch(() => null) : null;
    // The aquarium's tank. Same reasoning as the haunted field: generated art lives in settings so a redraw
    // reaches phones without a deploy, and resolved here because FarmClient seeds its state once and a
    // backdrop arriving later would flash an empty panel first.
    farm.aquariumBg = await getSetting("farm_bg_aquarium", null).catch(() => null);

    // ── THE KEY IS LOAD-BEARING ──────────────────────────────────────────────────────────────────────────────
    // FarmClient seeds ALL of its state from `initial` with useState, and a <Link> from one farm to another is
    // a client-side transition WITHIN THE SAME ROUTE SEGMENT — so React keeps the component instance alive and
    // every one of those useState calls holds the farm you were already looking at. This page re-rendered with
    // the right data on the server and the screen did not change: tapping a farm in the standings looked like
    // a link to the page you were already on.
    //
    // The neighbour chips never showed it because they are plain <a> tags — a full page load remounts
    // everything. Keying on the OWNER makes the client remount on any route that changes who you are looking
    // at, whichever kind of navigation got you there.
    return (
        <>
            {/* THE SHED USED TO BE RENDERED HERE, after the client, which is the only place a page can put
                anything — so it always landed below every card FarmClient draws, the neighbour strip
                included. Luke: "can we move in your shed above the player list." It lives on the Today tab
                now (see FarmClient), which is where a list of things you spend today belongs anyway. */}
            <FarmClient key={farm.owner?.id || ownerId} initial={farm} viewingAlias={farm.mine ? null : u} />
        </>
    );
}
