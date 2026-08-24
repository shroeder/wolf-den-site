import { notFound } from "next/navigation";

import FarmClient from "@/components/FarmClient";
import { featuredPackage } from "@/lib/marketplace/packages-server.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { getFarm, resolveFarmOwner } from "@/lib/marketplace/farm.js";
import { isOwner } from "@/lib/marketplace/owner.js";
import ConsumableShelf from "@/components/ConsumableShelf";

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
            <FarmClient key={farm.owner?.id || ownerId} initial={farm} viewingAlias={farm.mine ? null : u} />
            {/* ── WHAT IS IN THE SHED ──────────────────────────────────────────────────────────────────
                Growth Tonics, Harvest Charms, fertilizer, seed packs, whistles — all of them are spent on
                the farm above and all of them lived on a stash screen inside the store. Kaishiern asked for
                this. Only on YOUR farm: on somebody else's it would be offering to spend your things on
                their crops.

                A HARD RELOAD after a use, and deliberately. FarmClient seeds every one of its useState calls
                from `initial` (see the note above about why this page is keyed), so new server data does not
                reach it — and a Growth Tonic that takes 60% off your slowest crop has to move the timer you
                are looking at or it reads as having done nothing. */}
            {farm.mine ? <ConsumableShelf feature="farm" title="In your shed" reloadOnUse /> : null}
        </>
    );
}
