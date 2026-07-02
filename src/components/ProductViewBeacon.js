"use client";

import { useEffect } from "react";

// Fire-once beacon recording that a buyer viewed this product — feeds the Vendor Heat Map demand data.
export default function ProductViewBeacon({ catalogProductId }) {
    useEffect(() => {
        if (!catalogProductId) return;
        const key = `mkt-viewed-${catalogProductId}`;
        try {
            // Only count once per session per product, so a refresh doesn't inflate demand.
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, "1");
        } catch {
            /* sessionStorage unavailable — still send once per mount */
        }
        fetch("/api/marketplace/product-view", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ catalogProductId }),
            keepalive: true,
        }).catch(() => {});
    }, [catalogProductId]);

    return null;
}
