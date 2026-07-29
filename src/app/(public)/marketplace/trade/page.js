import Link from "next/link";
import { GiCardExchange } from "react-icons/gi";

import TradeInbox from "@/components/TradeInbox";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { listTradeableItems } from "@/lib/marketplace/trade.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your trades | Wolf Den", robots: { index: false, follow: false } };

const RC = { common: "#9aa0a6", rare: "#4aa3ff", epic: "#b061ff", legendary: "#ffb020", mythic: "#33e0a1", ascendant: "#ff7a3c", eternal: "#ff5cc8" };

export default async function TradesPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const items = buyer ? await listTradeableItems(buyer.id, { limit: 120 }).catch(() => []) : [];
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(255,215,94,0.14)", border: "1px solid rgba(255,215,94,0.4)" }} aria-hidden="true">
                        <GiCardExchange size={24} color="#ffd75e" />
                    </span>
                    Trades
                </h1>
                <p className="muted" style={{ marginTop: 0 }}>Accept or decline offers, or browse members&apos; spare gear below and propose a trade for anything you like.</p>
            </section>

            <TradeInbox />

            {items.length ? (
                <section className="card">
                    <h2 style={{ margin: "0 0 2px", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: 8 }}>🔎 Browse gear to trade for</h2>
                    <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.85rem" }}>Gear other members own but aren&apos;t wearing. Tap one to open a trade offer for it.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 9 }}>
                        {items.map((it) => (
                            <Link
                                key={`${it.ownerAlias}:${it.itemId}`}
                                href={`/marketplace/trade/new?to=${encodeURIComponent(it.ownerAlias)}&want=${encodeURIComponent(it.itemId)}`}
                                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textAlign: "center", padding: "11px 7px 9px", borderRadius: 13, textDecoration: "none", color: "#efe2d2", background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))", border: `1px solid ${(RC[it.rarity] || "#9aa0a6")}66` }}
                            >
                                {it.sprite ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={it.sprite} alt="" width={48} height={48} style={{ width: 48, height: 48, objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }} />
                                ) : <span style={{ fontSize: 34, lineHeight: "48px" }}>{it.icon || "🎁"}</span>}
                                <b style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15 }}>{it.name}</b>
                                <span style={{ fontSize: 10, textTransform: "capitalize", color: RC[it.rarity] || "#9aa0a6" }}>{it.rarity}</span>
                                {it.stats ? <span style={{ fontSize: 9.5, color: "#cbd3c2", lineHeight: 1.25 }}>{it.stats}</span> : null}
                                {it.enhanceLevel > 0 ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#8fe39a", lineHeight: 1.2 }}>⚒️ +{it.enhanceLevel} · {it.forgeStats}</span> : null}
                                <span style={{ fontSize: 10, color: "#9aa0a6" }}>@{it.ownerAlias}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
