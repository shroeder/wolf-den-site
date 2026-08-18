"use client";

import { useState } from "react";

import CookingClient from "@/components/CookingClient";
import FishingScene from "@/components/FishingScene";
import FarmClient from "@/components/FarmClient";
import ConsumablesClient from "@/components/ConsumablesClient";

// ── THE BAIT LAB ─────────────────────────────────────────────────────────────────────────────────────────────
// Two scenes, both mounting the REAL component: `?scene=craft` is the Kitchen, `?scene=use` is the water.
// Nothing below re-implements a screen — the only thing this file supplies is state the components would
// normally have got from a signed-in member who already owns bait.
//
// ⚠️ THE FETCH STUB IS INSTALLED DURING RENDER, NOT IN AN EFFECT. React runs CHILD effects before PARENT
// effects, so a stub armed in this component's useEffect arrives AFTER CookingClient's own first request has
// already gone to the real API — which answers signed-out and shuts the screen. Previously paid for; see the
// note in visual-rig-cdp. Guarded so it installs exactly once.
function armCookStub(sprites) {
    if (typeof window === "undefined" || window.__baitLabArmed) return;
    window.__baitLabArmed = true;
    const real = window.fetch.bind(window);
    window.fetch = async (url, opts) => {
        const u = String(url || "");
        if (!u.includes("/api/marketplace/cooking") || (opts?.method || "GET") !== "POST") return real(url, opts);
        const body = JSON.parse(opts?.body || "{}");
        if (body.action !== "cook") return real(url, opts);
        // A faithful bait cook, shaped exactly as cook() returns it (see the return at the end of cook()).
        // `made` for a bait carries the PANTRY item it produced, not the recipe — that is what you end up
        // holding, and it is what the reveal draws.
        const out = window.__baitLabOut || {};
        return new Response(JSON.stringify({
            ok: true,
            made: {
                kind: "bait", id: out.id, name: out.name,
                desc: `Bait for the water — worth +${(out.tilt || 0).toFixed(1)} rarity on a cast.`,
                rarity: out.rarity, sprite: sprites[out.id] || null,
                tier: out.tier, tierName: out.tierName, tierColor: out.tierColor,
            },
            portions: 2, bumped: false, freeCook: false, xp: 14, quality: 0.94, chain: 3,
            goldPaid: 0, alsoMade: [], grade: "flawless",
            ...(window.__baitLabKitchen || {}),
        }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
}

const TIER_META = { 1: { name: "Simple", color: "#cfd8e3" }, 2: { name: "Hearty", color: "#7ec8ff" },
    3: { name: "Fine", color: "#c9a2ff" }, 4: { name: "Exquisite", color: "#ffd75e" }, 5: { name: "Legendary", color: "#ff9ec4" } };

export default function KitchenLab({ kitchen, baits = [], sprites = {}, farm = null, stash = [] }) {
    const scene = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("scene") || "craft"
        : "craft";

    // Which bait the stubbed cook hands back. Defaults to a mid-tier one so the reveal shows a real rarity
    // colour rather than the plainest possible row.
    const pick = baits.find((b) => b.id === "b_shrimp_skewer") || baits[3] || baits[0] || {};
    if (typeof window !== "undefined") {
        window.__baitLabKitchen = kitchen;
        window.__baitLabOut = { ...pick, tier: 2, tierName: TIER_META[2].name, tierColor: TIER_META[2].color };
    }
    armCookStub(sprites);

    // The fishing state a member with a full bait box would have. Only the keys FishingScene reads.
    const [fishing] = useState(() => ({
        casts: { left: 3, max: 4, used: 1 },
        recharge: { available: true, cost: 400 },
        // `qty`, not `count` — that is the key baitStock() sends and the picker reads. Getting this wrong in a
        // fixture prints "rarity · left" with the number missing, which reads exactly like an app bug.
        // ?n= how many baits the member is holding, so the picker can be judged at 1 and at all 20.
        // Guarded: a useState initializer still runs during SSR, where there is no window.
        baits: baits.slice(0, (typeof window === "undefined"
            ? 7
            : Number(new URLSearchParams(window.location.search).get("n")) || 7)).map((b, i) => ({
            id: b.id, name: b.name, rarity: b.rarity, tilt: b.tilt, blurb: b.blurb || "", sprite: b.sprite,
            qty: [4, 3, 2, 2, 1, 1, 1][i] ?? ((i % 3) + 1),
        })),
    }));

    // ── THE STASH ── ConsumablesClient fetches its own state, so the stub answers the GET. Armed during
    // render for the same reason as the cook stub above.
    if (scene === "stash" && typeof window !== "undefined" && !window.__stashArmed) {
        window.__stashArmed = true;
        const real = window.fetch.bind(window);
        window.fetch = async (url, opts) => {
            if (!String(url || "").includes("/api/marketplace/consumables")) return real(url, opts);
            return new Response(JSON.stringify({ gold: 12500, shop: [], stash, chargedItems: [], active: [] }),
                { status: 200, headers: { "Content-Type": "application/json" } });
        };
    }
    if (scene === "stash") return <ConsumablesClient />;
    if (scene === "feed" && farm) return <FarmClient initial={farm} />;

    if (scene === "use") {
        return (
            <div style={{ minHeight: "100vh", background: "#0b1017" }}>
                <FishingScene
                    fishing={fishing}
                    sky="/images/sailing/sky-goldenhour.png"
                    records={null}
                    gold={12500}
                    onCast={async () => ({ ok: false, error: "lab" })}
                    onLand={async () => ({ ok: true })}
                    onRecharge={async () => ({ ok: true })}
                    onLoadRecords={async () => ({ ok: true, records: [] })}
                    onClose={() => {}}
                />
            </div>
        );
    }
    return <CookingClient initial={kitchen} />;
}
