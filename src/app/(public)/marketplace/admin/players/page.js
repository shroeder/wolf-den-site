import AdminPlayersPanel from "@/components/AdminPlayersPanel";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Player Roster | Wolf Den",
    robots: { index: false, follow: false },
};

// Admin-only: who plays what (gated by the admin key entered in the panel). Handy for FNM reminders.
export default function AdminPlayersPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>🎮 Player roster</h1>
                <p className="muted" style={{ marginTop: 0 }}>See who plays each game — filter to Magic and copy emails to send Friday Night Magic reminders.</p>
            </section>
            <AdminPlayersPanel />
        </div>
    );
}
