"use client";

import MarketplaceLoginClient from "@/components/MarketplaceLoginClient";

// Logged-OUT landing for /marketplace/sailing. A paid ad drives cold traffic straight here, so instead of a
// 404 we bait the hook: show what the game is, then drop them into account creation that returns them right
// back to sailing. Self-contained inline styles (nautical dark) so it never depends on page-level CSS.
const HOOKS = [
    { img: "/images/sailing/boat-tier10-leviathan.png", title: "Captain your ship", body: "Upgrade from a wooden dinghy to a legendary Leviathan." },
    { img: "/images/sailing/dig-chest.png", title: "Dig for treasure", body: "Excavate buried chests, relics and gold on every voyage." },
    { img: "/images/sailing/enc-kraken.png", title: "Raid & survive", body: "Battle rival ships and sea monsters for loot." },
    { img: "/images/sailing/doubloon.png", title: "Earn real rewards", body: "Level up for store credit, packs and perks at The Wolf Den." },
];

export default function SailingLanding() {
    return (
        <div style={{ minHeight: "100vh", background: "#0b1622", color: "#e8eef5" }}>
            {/* Hero */}
            <div
                style={{
                    position: "relative",
                    backgroundImage: "linear-gradient(180deg, rgba(11,22,34,0.15) 0%, rgba(11,22,34,0.85) 78%, #0b1622 100%), url(/images/sailing/raid-bg-day.png)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    padding: "clamp(48px, 12vw, 120px) 20px clamp(28px, 6vw, 56px)",
                    textAlign: "center",
                }}
            >
                <div style={{ fontSize: "clamp(11px, 2.4vw, 13px)", letterSpacing: "0.18em", textTransform: "uppercase", color: "#8fd0ff", fontWeight: 700 }}>
                    ⛵ The Wolf Den · Free to play
                </div>
                <h1 style={{ fontSize: "clamp(30px, 7vw, 60px)", lineHeight: 1.05, margin: "12px auto 0", maxWidth: 720, fontWeight: 900, textWrap: "balance", textShadow: "0 3px 18px rgba(0,0,0,0.55)" }}>
                    Set sail. Dig for treasure.<br />Plunder rival ships.
                </h1>
                <p style={{ fontSize: "clamp(15px, 3.4vw, 20px)", margin: "16px auto 0", maxWidth: 560, color: "#cdd9e6", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                    Build a character, sail the open sea, and level up for real rewards at Minnesota&apos;s wolf-pack card
                    shop. Create your free account below and your voyage begins.
                </p>
            </div>

            {/* Hooks + signup */}
            <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 20px 64px", display: "grid", gap: 32, gridTemplateColumns: "minmax(0,1fr)" }}>
                <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: -8 }}>
                    {HOOKS.map((h) => (
                        <div key={h.title} style={{ display: "flex", gap: 12, alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(143,208,255,0.14)", borderRadius: 14, padding: 14 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={h.img} alt="" width={52} height={52} style={{ width: 52, height: 52, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }} />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>{h.title}</div>
                                <div style={{ fontSize: 13, color: "#a9b7c6", lineHeight: 1.3 }}>{h.body}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* The account form lands them back on sailing the moment they're in. */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                    <div style={{ width: "100%", maxWidth: 440 }}>
                        <MarketplaceLoginClient redirectTo="/marketplace/sailing" signup />
                    </div>
                </div>
            </div>
        </div>
    );
}
