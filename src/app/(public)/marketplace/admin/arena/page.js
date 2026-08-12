import AdminArenaTelemetry from "@/components/AdminArenaTelemetry";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Arena Telemetry | Wolf Den",
    robots: { index: false, follow: false },
};

// Read-only fight data, gated by the same admin key the boss panel uses. It exists because three balance
// decisions in one afternoon were made off a screenshot and a hand-built model, and one of them was wrong.
export default function ArenaTelemetryPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>Arena telemetry</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    What every fight was actually made of. Red numbers are the ones worth looking at: a room
                    nobody loses, a rung nobody beats, a matchup that is not a fight.
                </p>
            </section>
            <AdminArenaTelemetry />
        </div>
    );
}
