import BossFightClient from "@/components/BossFightClient";
import { getLeaderboard } from "@/lib/marketplace/profile.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Boss Fight (preview) | Wolf Den",
    robots: { index: false },
};

// Prototype of the monthly boss event: the store's avatars gang up on a boss, idle-game style.
export default async function BossPage() {
    const members = await getLeaderboard(12).catch(() => []);
    const roster = members.map((m) => ({ name: m.displayLabel, avatarUrl: m.avatarUrl, level: m.level }));

    return (
        <div className="stack reveal">
            <section className="card">
                <h1 style={{ marginTop: 0 }}>⚔️ Boss Fight <span className="muted" style={{ fontSize: "0.6em" }}>· preview</span></h1>
                <p className="muted" style={{ marginTop: 0 }}>
                    A rough prototype of the monthly event: the whole pack&apos;s avatars pile onto a boss, its HP drains, and
                    everyone who lands a hit earns raffle tickets. This is the &quot;token&quot; style — avatars lunge and hit as
                    a unit (not full-body fighters).
                </p>
                <BossFightClient roster={roster} members={roster} />
            </section>
        </div>
    );
}
