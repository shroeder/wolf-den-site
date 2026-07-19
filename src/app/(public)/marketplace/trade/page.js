import TradeInbox from "@/components/TradeInbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your trades | Wolf Den", robots: { index: false, follow: false } };

export default function TradesPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 10, background: "rgba(255,215,94,0.14)", border: "1px solid rgba(255,215,94,0.4)" }} aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffd75e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                    </span>
                    Trades
                </h1>
                <p className="muted" style={{ marginTop: 0 }}>Accept or decline offers from other members. Propose new ones from anyone&apos;s profile.</p>
            </section>
            <TradeInbox />
        </div>
    );
}
