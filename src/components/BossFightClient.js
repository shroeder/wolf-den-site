"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import AvatarStack from "@/components/AvatarStack";
import BossBattleScene from "@/components/BossBattleScene";

// The REAL monthly boss: shared, persistent HP (from the server), daily-limited attacks, XP per hit,
// contributor ranking + raffle tickets. Polls so you see the community chip away live.
export default function BossFightClient() {
    const [data, setData] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [hit, setHit] = useState(false);
    const [busy, setBusy] = useState(false);
    const [floaters, setFloaters] = useState([]);
    const [victory, setVictory] = useState(null);
    const [xpFlash, setXpFlash] = useState(false);
    const floatId = useRef(0);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/boss", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setData(d);
        setLoaded(true);
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 10000); // watch the community drain it live
        return () => clearInterval(t);
    }, [load]);

    function popDamage(amount, crit) {
        const id = floatId.current++;
        // Pop near the boss (right side of the stage).
        setFloaters((f) => [...f, { id, amount, crit, top: 14 + Math.random() * 38, left: 60 + Math.random() * 24 }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 850);
        setHit(true);
        setTimeout(() => setHit(false), 180);
    }

    async function attack() {
        if (busy || !data?.you || data.you.attacksLeft <= 0) return;
        setBusy(true);
        try {
            const r = await fetch("/api/marketplace/boss/attack", { method: "POST" }).catch(() => null);
            const res = r ? await r.json().catch(() => null) : null;
            if (!res || res.error) {
                if (res?.error === "no_attacks_left") setData((d) => ({ ...d, you: { ...d.you, attacksLeft: 0 } }));
                await load();
                return;
            }
            popDamage(res.damage, res.crit);
            setXpFlash(true);
            setTimeout(() => setXpFlash(false), 1400);
            setData((d) => ({
                ...d,
                boss: { ...d.boss, hp: res.hp, maxHp: res.maxHp },
                you: { ...d.you, attacksLeft: res.attacksLeft, dmg: (d.you?.dmg || 0) + res.damage },
            }));
            if (res.defeated) {
                setVictory({ name: res.name });
                setTimeout(() => { setVictory(null); load(); }, 3200);
            } else {
                load();
            }
        } finally {
            setBusy(false);
        }
    }

    if (!loaded) return <p className="muted">Summoning the boss…</p>;
    if (!data?.boss) return <p className="muted">No active boss right now — check back soon.</p>;

    const { boss, roster = [], you, defaultSpriteUrl } = data;
    const pct = Math.max(0, Math.min(100, Math.round((boss.hp / boss.maxHp) * 100)));

    return (
        <div className="boss2">
            <div className="boss2-title">⚔️ This week&apos;s boss — the whole pack vs. {boss.name}</div>
            <BossBattleScene boss={boss} fighters={roster} defaultSprite={defaultSpriteUrl} hit={hit} floaters={floaters} pct={pct} />
            {boss.rewards ? <div className="boss2-rewards">🎁 {boss.rewards}</div> : null}

            <div className="boss2-actions">
                {!you ? (
                    <Link href="/marketplace/login?returnTo=/marketplace/boss" className="btn-gold boss2-attack">Sign in to join the fight</Link>
                ) : you.attacksLeft > 0 ? (
                    <button type="button" className="btn-gold boss2-attack" onClick={attack} disabled={busy}>
                        {busy ? "Striking…" : `⚔️ Attack · ${you.attacksLeft} left today`}
                    </button>
                ) : (
                    <div className="boss2-spent">🕒 Out of swings — come back tomorrow for more.</div>
                )}
                {you ? (
                    <div className="boss2-you muted">
                        Your damage: <strong>{(you.dmg || 0).toLocaleString()}</strong> · +10 XP per hit
                        {xpFlash ? <span className="boss2-xp"> +10 XP!</span> : null}
                    </div>
                ) : null}
            </div>

            {roster.length ? (
                <div className="boss2-board">
                    <h3>🏆 Top damage</h3>
                    <ol className="boss2-rank">
                        {roster.slice(0, 8).map((f, i) => (
                            <li key={f.id} className={f.you ? "is-you" : ""}>
                                <span className="boss2-rank-n">{i + 1}</span>
                                <AvatarStack avatarUrl={f.avatarUrl} initial={(f.name || "?").slice(0, 1).toUpperCase()} size={32} />
                                <span className="boss2-rank-name">{f.name}</span>
                                <span className="boss2-rank-dmg">{f.dmg.toLocaleString()} dmg</span>
                                <span className="boss2-rank-tix">🎟️ {f.tickets}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="muted boss2-note">Every hit earns raffle tickets for this month&apos;s giveaway — more damage, more tickets.</p>
                </div>
            ) : (
                <p className="muted boss2-note">Be the first to strike — no one has hit this boss yet.</p>
            )}

            {victory ? (
                <div className="boss2-victory-overlay">
                    <div className="boss2-victory">
                        <div className="boss2-victory-x">🏆</div>
                        <h3>{victory.name} defeated!</h3>
                        <p className="muted">You landed the killing blow. A tougher one is already rising…</p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
