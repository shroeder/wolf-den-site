import BossFightClient from "@/components/BossFightClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Monthly Boss | Wolf Den",
    robots: { index: false },
};

// The monthly community boss event — real, shared, persistent HP.
export default function BossPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>⚔️ Monthly Boss</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    The whole pack chips away at one shared boss. Everyone gets a few swings a day — land hits to earn XP and
                    raffle tickets for the monthly giveaway. Its HP is real and shared: drop in anytime and help finish it off.
                </p>
                <BossFightClient />
            </section>
        </div>
    );
}
