import { NextResponse } from "next/server";

import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { packPoolSummary, resumePendingOpen } from "@/lib/marketplace/packs.js";
import { getStoreCredit } from "@/lib/marketplace/store-credit.js";
import { vaultSummary } from "@/lib/marketplace/vault.js";
import { shelfPacksOpenFor, vaultOpenFor } from "@/lib/marketplace/vault-gate.js";
import { beatsPriceBp, poolByKey, poolStates, shelfPoolCards } from "@/lib/marketplace/pack-pools.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = (body, init = {}) =>
    NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

// Door 4 of 9 (docs/virtual-packs-and-the-card-vault.md §16.2). The pool itself is PUBLIC — /mystery-bags has
// listed it card by card for months and this feature does not take that away. What is gated is the ability to
// open one online, so a signed-out or un-invited reader gets the board and nothing about the button.
export async function GET(request) {
    return withRequestLogging(request, "GET /api/marketplace/packs", async ({ internalError }) => {
        try {
            const buyer = await getAuthenticatedBuyer().catch(() => null);
            if (!buyer || !vaultOpenFor(buyer.id)) {
                return noStore({ error: "Not found." }, { status: 404 });
            }

            // ⚠️ THE PICKER'S POOLS ARE FETCHED ONLY FOR SOMEBODY WHO MAY SEE THEM. A shelf pool is
            //    owner-gated; listing them to everybody and refusing the tap is the ownerOnly landmine —
            //    leaky one way, dead the other. shelfPacksOpenFor is asked once, here.
            const [pool, balanceCents, pending, shelf, vault] = await Promise.all([
                packPoolSummary(),
                getStoreCredit(buyer.id),
                resumePendingOpen(buyer.id),
                shelfPacksOpenFor(buyer.id) ? poolStates() : Promise.resolve([]),
                // For the vault CTA. One aggregate — it rides the existing Promise.all rather than
                // adding a round trip to a screen that already does four.
                vaultSummary(buyer.id),
            ]);

            // The carousel (§9): the bags first because they are the house product, then every shelf pool
            // the member may open. A CLOSED pool is still listed — it says "back soon" rather than
            // vanishing, so a member who saw it yesterday is not left wondering what they imagined.
            const pools = [
                {
                    key: "bags", brand: "Wolf Den Mystery Bag", priceCents: pool.priceCents,
                    art: poolByKey("bags")?.art || null,
                    units: pool.remaining, open: pool.remaining > 0 && pool.priceTrusted !== false,
                    closedReason: pool.remaining > 0 ? null : "empty",
                    maxCents: pool.cards?.[0]?.valueCents ?? 0,
                    medianCents: null,
                    cards: pool.cards || [],
                },
                ...(await Promise.all(shelf.map(async (p) => ({
                    key: p.key, brand: p.brand, priceCents: p.priceCents, units: p.units, art: p.art,
                    open: p.open, closedReason: p.closedReason,
                    maxCents: p.maxCents, medianCents: p.medianCents,
                    // ⚠️ EACH POOL CARRIES ITS OWN CONTENTS. The sheet used to read one global card list
                    //    because there was one pool; with a carousel that would show the BAGS' cards under a
                    //    Pokémon pack — the one screen on this feature whose entire job is being accurate
                    //    about what you are buying.
                    // ⚠️ A CLOSED POOL STILL LISTS ITS CONTENTS. The first cut withheld them, so the sheet
                    //    said "Yu-Gi-Oh Singles — 51 inside" over an empty list. Nothing about why a pool is
                    //    resting is secret, and a member who can see the fifty-one cards can see for
                    //    themselves that the pack is worth coming back for.
                    cards: await shelfPoolCards(poolByKey(p.key)),
                    // §9.2 — the real figure, one tap in behind "what's inside", never on the carousel face.
                    beatsBp: await beatsPriceBp(poolByKey(p.key), p.priceCents),
                })))),
            ];

            return noStore({
                open: true,
                pool,
                pools,
                balanceCents,
                canOpen: pool.remaining > 0 && balanceCents >= pool.priceCents,
                shortfallCents: Math.max(0, pool.priceCents - balanceCents),
                // An open the member walked away from mid-reveal. The card is already theirs and already paid
                // for; the only thing outstanding is which of the two buttons they press.
                pending,
                vault,
            });
        } catch (error) {
            return internalError(error, { event: "packs.list.failure" });
        }
    });
}
