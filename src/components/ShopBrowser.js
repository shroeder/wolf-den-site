"use client";

import Link from "next/link";
import { useState } from "react";

import JustInClient from "@/components/JustInClient";
import PreorderDeck from "@/components/shop/PreorderDeck";
import ShopInventoryClient from "@/components/ShopInventoryClient";

// Unified shop browse: the FULL INVENTORY is the default view, with a toggle to "Just In" (recent
// arrivals). Folds the old /just-in page into Shop.
//
// ⚠️ ALL INVENTORY LEADS, AND IT IS BOTH FIRST AND SELECTED. Luke's call. Just In answers "what is new
// since I last looked", which is a returning regular's question; somebody arriving at the shop wants to see
// what is for sale. Opening on a 24-hour slice showed a visitor a handful of items and read as a nearly
// empty shop. The two have to agree -- the tab that is selected must also be the one on the left, or the
// highlight reads as a stray second button rather than as the current view.
// ── ⚠️ AND A THIRD TAB FOR PRE-ORDERS ───────────────────────────────────────────────────────────────────
// Luke: "the shop should have a skew of looking at pre-orders as well from there. And it should have its
// own filter too. Like the pre-orders maybe are just a category."
//
// They are NOT a category, and deliberately so — he wants them filed under Pokemon Sealed and Magic Sealed
// in Square, which is where a cashier and the sales reports expect them. The pre-order flag already lives
// in shop_item_rules.preorder_arrives_on, set from the Restocking screen, and that one column is what
// drives the Square name prefix, the confirmation wording, the arrival emails and this tab. A second copy
// of it as a Square category or custom attribute would be a second thing to keep in step, and the two
// would drift the first time somebody set one and not the other.
//
// The tab only exists while something is on the shelf: a permanent tab onto an empty room is a tab people
// learn not to press, and this shop will spend most of the year with nothing on pre-order.
export default function ShopBrowser({
    justInItems = [],
    categories = [],
    paymentsEnabled = false,
    preorders = [],
}) {
    const hasJustIn = Array.isArray(justInItems) && justInItems.length > 0;
    const hasInventory = Array.isArray(categories) && categories.length > 0;
    const hasPreorders = Array.isArray(preorders) && preorders.length > 0;
    const [view, setView] = useState("all");

    return (
        <>
            <div className="shop-view-toggle" role="tablist" aria-label="Shop view">
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === "all"}
                    className={`shop-view-tab${view === "all" ? " shop-view-tab-active" : ""}`}
                    onClick={() => setView("all")}
                >
                    All inventory
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === "justin"}
                    className={`shop-view-tab${view === "justin" ? " shop-view-tab-active" : ""}`}
                    onClick={() => setView("justin")}
                    disabled={!hasJustIn}
                >
                    {/* The fire emoji is gone. Standing rule: no emoji in the UI -- every destination
                        gets real art or plain type, and a glyph standing in for a treatment is how the
                        gap stays invisible. It also fought the gold underline next to it. */}
                    Just In
                </button>
                {hasPreorders ? (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === "preorders"}
                        className={`shop-view-tab${view === "preorders" ? " shop-view-tab-active" : ""}`}
                        onClick={() => setView("preorders")}
                    >
                        Pre-orders
                        <span className="shop-view-n">{preorders.length}</span>
                    </button>
                ) : null}
            </div>

            {/* NO INTRO PARAGRAPH. The first draft opened with four lines explaining what a pre-order is,
                which on a 390px phone pushed the product itself below the fold -- the exact complaint that
                killed the first version of the dedicated page ("verbose and ghetto"). The banner above
                already says it once and every card repeats the deal under its own button. */}
            {view === "preorders" && hasPreorders ? (
                <PreorderDeck items={preorders} />
            ) : view === "justin" ? (
                hasJustIn ? (
                    <>
                        <div className="just-in-intro">
                            <p className="lead">
                                Freshly scanned onto the shelves this week — new cards, sealed product, and restocks. Grab it
                                before someone else does.
                            </p>
                            <div className="cta-row">
                                <button type="button" className="btn-gold" onClick={() => setView("all")}>
                                    See all inventory →
                                </button>
                                <a className="btn-ghost" href="https://discord.gg/Pad8U2KVsD" target="_blank" rel="noreferrer">
                                    💬 Get drop alerts on Discord
                                </a>
                            </div>
                        </div>
                        <JustInClient items={justInItems} />
                    </>
                ) : (
                    <p className="secondary">
                        Nothing new this week —{" "}
                        <button type="button" className="text-link" onClick={() => setView("all")}>
                            browse all inventory
                        </button>
                        .
                    </p>
                )
            ) : hasInventory ? (
                <ShopInventoryClient categories={categories} paymentsEnabled={paymentsEnabled} />
            ) : (
                <p className="secondary">Inventory is being stocked — check back soon.</p>
            )}
        </>
    );
}
