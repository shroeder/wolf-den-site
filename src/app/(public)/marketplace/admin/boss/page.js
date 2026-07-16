import AdminBossPanel from "@/components/AdminBossPanel";

export const dynamic = "force-dynamic";
export const metadata = {
    title: "Boss Admin | Wolf Den",
    robots: { index: false, follow: false },
};

// Admin-only control panel for the weekly boss (gated by the admin key entered in the panel itself).
export default function BossAdminPage() {
    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>⚔️ Boss control</h1>
                <p className="muted" style={{ marginTop: 0 }}>Create a draft, generate its AI art (retry until it&apos;s cool), set HP + rewards, then release it — which notifies everyone.</p>
            </section>
            <AdminBossPanel />
        </div>
    );
}
