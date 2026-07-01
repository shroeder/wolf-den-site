import { NextResponse } from "next/server";

import { createSellOffer } from "@/lib/marketplace/sell-offers.js";
import { createSellInquiry, isValidEmail } from "@/lib/sell-inquiries.js";
import { withRequestLogging } from "@/lib/server-logger";

export const runtime = "nodejs";

const priceFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Build a readable one-per-line summary from the picked catalog cards + free-text notes.
function buildItemsSummary(cards, notes) {
    const lines = (Array.isArray(cards) ? cards : []).map((c) => {
        const parts = [c.name];
        if (c.setName) parts.push(`— ${c.setName}`);
        if (c.number) parts.push(`#${c.number}`);
        if (c.marketPrice != null) parts.push(`(mkt ${priceFmt.format(Number(c.marketPrice))})`);
        return parts.filter(Boolean).join(" ");
    });
    const notesText = notes ? String(notes).trim() : "";
    return [lines.join("\n"), notesText].filter(Boolean).join("\n\n");
}

// Normalize the picked cards to a compact structured shape for items_json.
function normalizeCards(cards) {
    if (!Array.isArray(cards)) return [];
    return cards.slice(0, 100).map((c) => ({
        catalogProductId: c.catalogProductId ? String(c.catalogProductId) : null,
        name: String(c.name || "").slice(0, 300),
        setName: c.setName ? String(c.setName).slice(0, 200) : null,
        number: c.number ? String(c.number).slice(0, 40) : null,
        imageUrl: c.imageUrl || null,
        marketPrice: c.marketPrice != null ? Number(c.marketPrice) : null,
    }));
}

// Unified "sell your cards" submission: routes to the store (sell/consign) or the vendor marketplace.
export async function POST(request) {
    return withRequestLogging(request, "POST /api/sell", async ({ logger, internalError }) => {
        try {
            const body = await request.json().catch(() => null);

            if (!body || !isValidEmail(body.email)) {
                return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
            }

            const cards = normalizeCards(body.cards);
            const items = buildItemsSummary(cards, body.notes);

            if (!items.trim()) {
                return NextResponse.json({ error: "Add at least one card or describe what you have." }, { status: 400 });
            }

            const destination = ["sell", "consign", "vendors"].includes(body.destination) ? body.destination : "sell";

            try {
                if (destination === "vendors") {
                    await createSellOffer({
                        name: body.name,
                        email: body.email,
                        phone: body.phone,
                        items,
                        askingPrice: body.askingPrice,
                        itemsJson: cards,
                    });
                } else {
                    await createSellInquiry({
                        kind: destination,
                        name: body.name,
                        email: body.email,
                        phone: body.phone,
                        items,
                        message: body.notes,
                        itemsJson: cards,
                    });
                }

                logger.info("sell.submitted", { destination, cardCount: cards.length });
                return NextResponse.json({ ok: true, destination });
            } catch (validationError) {
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }
        } catch (error) {
            return internalError(error, { event: "sell.submit.failure" });
        }
    });
}
