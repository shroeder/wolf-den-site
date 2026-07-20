import Link from "next/link";

import { getBossRecap } from "@/lib/marketplace/boss.js";
import { getAuthenticatedBuyer } from "@/lib/marketplace/buyer-session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
    title: "Boss Recap | Wolf Den",
    robots: { index: false },
};

// Final battle stats for a defeated boss. The live boss page auto-rotates to the next boss the moment one
// dies, so the "see final stats" CTAs (gift popup / push / Discord / email) link HERE with the boss id to
// give a real recap: total damage, the raffle winner, your battle, and the damage leaderboard.
export default async function BossRecapPage({ params }) {
    const { id } = await params;
    const buyer = await getAuthenticatedBuyer().catch(() => null);
    const recap = await getBossRecap(id, buyer?.id || null).catch(() => null);

    if (!recap) {
        return (
            <div className="stack reveal">
                <section className="card"><p className="muted" style={{ marginTop: 0 }}>That boss recap isn&apos;t available.</p><Link href="/marketplace/boss" className="btn-gold">⚔️ To the boss →</Link></section>
            </div>
        );
    }

    const { boss, totalDamage, fighters, leaderboard, winner, mine } = recap;

    return (
        <div className="stack reveal">
            <section className="card boss-recap-hero">
                <div className="boss-recap-slain">☠️ SLAIN</div>
                {boss.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={boss.imageUrl} alt={boss.name} className="boss-recap-img" />
                ) : null}
                <h1 style={{ margin: "6px 0 0" }}>{boss.name}</h1>
                <p className="muted" style={{ margin: "2px 0 0" }}>
                    Brought down by the whole pack{boss.defeatedAt ? ` · ${new Date(boss.defeatedAt).toLocaleDateString()}` : ""}
                    {boss.weakness ? <> · was weak to {boss.weakness.emoji} {boss.weakness.label}</> : null}
                </p>
                <div className="boss-recap-stats">
                    <div><span className="brs-num">{totalDamage.toLocaleString()}</span><span className="brs-lbl">total damage</span></div>
                    <div><span className="brs-num">{fighters}</span><span className="brs-lbl">fighters</span></div>
                    <div><span className="brs-num">{(boss.maxHp || 0).toLocaleString()}</span><span className="brs-lbl">HP crushed</span></div>
                </div>
            </section>

            {winner ? (
                <section className="card boss-recap-winner">
                    <h3 style={{ marginTop: 0 }}>🎟️ Raffle winner</h3>
                    <div className="brw-row">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={winner.avatarUrl} alt="" className="brw-av" />
                        <div>
                            <div className="brw-name">{winner.you ? "🎉 You won!" : winner.name}</div>
                            <div className="muted">{winner.tickets.toLocaleString()} tickets{boss.prize ? ` · wins ${boss.prize.name}` : ""}</div>
                        </div>
                    </div>
                    {winner.you && boss.prize ? <p className="boss-recap-claim">Come to The Wolf Den to claim your prize!</p> : null}
                </section>
            ) : null}

            {mine ? (
                <section className="card">
                    <h3 style={{ marginTop: 0 }}>🗡️ Your battle</h3>
                    <div className="boss-recap-mine">
                        <span>Rank <strong>#{mine.rank}</strong></span>
                        <span><strong>{mine.dmg.toLocaleString()}</strong> dmg</span>
                        <span>🎟️ <strong>{mine.tickets.toLocaleString()}</strong></span>
                        <span><strong>{mine.hits}</strong> strikes</span>
                    </div>
                    <p className="muted" style={{ fontSize: "0.8rem", margin: "8px 0 0" }}>🎁 Everyone who fought earned a spin token + a shot at loot — check your stash.</p>
                </section>
            ) : null}

            <section className="card">
                <h3 style={{ marginTop: 0 }}>🏆 Damage leaderboard</h3>
                <div className="boss-recap-lb">
                    {leaderboard.map((f) => (
                        <div key={f.rank} className={`brlb-row${f.you ? " is-you" : ""}`}>
                            <span className="brlb-rank">{f.rank === 1 ? "🥇" : f.rank === 2 ? "🥈" : f.rank === 3 ? "🥉" : `#${f.rank}`}</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.avatarUrl} alt="" className="brlb-av" />
                            <span className="brlb-name">{f.name}{f.you ? " (you)" : ""} <span className="muted">Lv {f.level}</span></span>
                            <span className="brlb-dmg">{f.dmg.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="card" style={{ textAlign: "center" }}>
                <Link href="/marketplace/boss" className="btn-gold">⚔️ Fight the next boss →</Link>
            </section>
        </div>
    );
}
