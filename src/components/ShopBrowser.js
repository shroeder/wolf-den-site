"use client";

import Link from "next/link";
import { useState } from "react";

import JustInClient from "@/components/JustInClient";
import ShopInventoryClient from "@/components/ShopInventoryClient";

// Unified shop browse: the FULL INVENTORY is the default view, with a toggle to "Just In" (recent
// arrivals). Folds the old /just-in page into Shop.
//
// ⚠️ ALL INVENTORY LEADS, AND IT IS BOTH FIRST AND SELECTED. Luke's call. Just In answers "what is new
// since I last looked", which is a returning regular's question; somebody arriving at the shop wants to see
// what is for sale. Opening on a 24-hour slice showed a visitor a handful of items and read as a nearly
// empty shop. The two have to agree -- the tab that is selected must also be the one on the left, or the
// highlight reads as a stray second button rather than as the current view.
export default function ShopBrowser({ justInItems = [], categories = [], paymentsEnabled = false }) {
    const hasJustIn = Array.isArray(justInItems) && justInItems.length > 0;
    const hasInventory = Array.isArray(categories) && categories.length > 0;
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
                    🔥 Just In
                </button>
            </div>

            {view === "justin" ? (
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
