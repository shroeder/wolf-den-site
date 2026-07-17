import TradeInbox from "@/components/TradeInbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your trades | Wolf Den", robots: { index: false, follow: false } };

export default function TradesPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🔄 Trades</h1>
                <p className="muted" style={{ marginTop: 0 }}>Accept or decline offers from other members. Propose new ones from anyone&apos;s profile.</p>
            </section>
            <TradeInbox />
        </div>
    );
}
