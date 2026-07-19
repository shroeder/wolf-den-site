import Link from "next/link";

import QuestsClient from "@/components/QuestsClient";
import ViewPing from "@/components/ViewPing";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Daily Quests | The Wolf Den",
    description: "Three fresh daily bounties — complete them for gold and loot. Reset every night.",
    alternates: { canonical: "/marketplace/quests" },
};

// A dedicated home for daily quests so members can always get back to them (also surfaced on the boss page).
export default async function QuestsPage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    return (
        <div className="stack reveal">
            <ViewPing event="view_boss" meta={{ section: "quests" }} />
            <section className="card">
                <h1 style={{ marginTop: 0 }}>📜 Daily Quests</h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    Three fresh bounties every day — complete them for gold and loot. They reset at midnight.
                </p>
                <Link href="/marketplace/boss" className="pill">⚔️ Boss fight</Link>
            </section>
            {buyer ? (
                <QuestsClient />
            ) : (
                <section className="card">
                    <p className="muted" style={{ margin: 0 }}>Sign in to see your daily quests.</p>
                    <Link href="/marketplace/login" className="btn-gold" style={{ marginTop: 10, display: "inline-block" }}>Sign in →</Link>
                </section>
            )}
        </div>
    );
}
