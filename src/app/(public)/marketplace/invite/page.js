import Link from "next/link";

import ReferralInvite from "@/components/ReferralInvite";
import ViewPing from "@/components/ViewPing";
import { db } from "@/lib/db";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";
import { REF_REFERRER_GOLD, REF_JOINER_GOLD, getReferralStats } from "@/lib/marketplace/referral.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Invite Friends | The Wolf Den Game",
    robots: { index: false },
};

// First-class invite hub for a logged-in member: the shareable card, the reward breakdown, and the
// member's own invite scorecard (friends joined + gold earned). Logged-out visitors get a sign-in nudge.
export default async function InvitePage() {
    const buyer = await getAuthenticatedBuyer().catch(() => null);

    if (!buyer) {
        return (
            <div className="stack reveal">
                <section className="card" style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 40 }} aria-hidden="true">🎁</div>
                    <h1 style={{ margin: "6px 0 4px" }}>Invite friends, earn gold</h1>
                    <p className="muted" style={{ margin: "0 0 14px" }}>
                        Sign in to grab your personal invite link. When a friend joins through it, you both earn
                        bonus gold + a chest.
                    </p>
                    <Link href="/marketplace/login" className="btn-gold" style={{ display: "inline-block", textDecoration: "none" }}>
                        Sign in to invite
                    </Link>
                </section>
            </div>
        );
    }

    const [aliasRow, stats] = await Promise.all([
        db.queryOne(`SELECT alias FROM mkt_buyer WHERE id = $1`, [buyer.id]).catch(() => null),
        getReferralStats(buyer.id).catch(() => ({ invited: 0, converted: 0, goldEarned: 0 })),
    ]);
    const alias = aliasRow?.alias || null;

    const tiles = [
        { label: "Friends joined", value: stats.converted, icon: "🐺" },
        { label: "Invites pending", value: Math.max(0, stats.invited - stats.converted), icon: "⏳" },
        { label: "Gold earned", value: stats.goldEarned.toLocaleString(), icon: "🪙" },
    ];

    return (
        <div className="stack reveal">
            <ViewPing event="view_invite" />

            <section className="card game-hub-hero">
                <h1 style={{ margin: 0 }}>🎁 Invite friends — earn {REF_REFERRER_GOLD} gold each</h1>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                    Bring your pack into the Den. Every friend who joins with your link and verifies their email
                    pays out for both of you.
                </p>
            </section>

            {alias ? (
                <ReferralInvite alias={alias} referrerGold={REF_REFERRER_GOLD} joinerGold={REF_JOINER_GOLD} />
            ) : (
                <section className="card">
                    <p className="muted" style={{ margin: 0 }}>
                        Set up your public @handle on your{" "}
                        <Link href="/marketplace/profile" className="pill">profile</Link> to unlock your invite link.
                    </p>
                </section>
            )}

            <section className="card">
                <h2 style={{ marginTop: 0 }}>Your invite scorecard</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    {tiles.map((t) => (
                        <div
                            key={t.label}
                            style={{
                                textAlign: "center",
                                padding: "12px 6px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.12)",
                                background: "rgba(255,255,255,0.03)",
                            }}
                        >
                            <div style={{ fontSize: 22 }} aria-hidden="true">{t.icon}</div>
                            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--gold, #ffd75e)" }}>{t.value}</div>
                            <div className="muted" style={{ fontSize: "0.78rem" }}>{t.label}</div>
                        </div>
                    ))}
                </div>
                {stats.invited === 0 ? (
                    <p className="muted" style={{ margin: "12px 0 0", fontSize: "0.9rem" }}>
                        No invites yet — share your link above to get your first {REF_REFERRER_GOLD} gold.
                    </p>
                ) : null}
            </section>

            <section className="card">
                <h2 style={{ marginTop: 0 }}>How the reward works</h2>
                <ul className="muted" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                    <li>Share your invite link with a friend.</li>
                    <li>They create a free account and <strong>verify their email</strong>.</li>
                    <li><strong>You</strong> get {REF_REFERRER_GOLD} gold + an Iron Chest.</li>
                    <li><strong>They</strong> start with {REF_JOINER_GOLD} gold + a Wooden Chest.</li>
                    <li>Rewards pay out automatically — invite as many friends as you like.</li>
                </ul>
            </section>
        </div>
    );
}
