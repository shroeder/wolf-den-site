import { GiCardExchange } from "react-icons/gi";

import TradeInbox from "@/components/TradeInbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your trades | Wolf Den", robots: { index: false, follow: false } };

export default function TradesPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(255,215,94,0.14)", border: "1px solid rgba(255,215,94,0.4)" }} aria-hidden="true">
                        <GiCardExchange size={24} color="#ffd75e" />
                    </span>
                    Trades
                </h1>
                <p className="muted" style={{ marginTop: 0 }}>Accept or decline offers from other members. Propose new ones from anyone&apos;s profile.</p>
            </section>
            <TradeInbox />
        </div>
    );
}
