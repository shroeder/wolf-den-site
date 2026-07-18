"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import BossBattleScene from "@/components/BossBattleScene";

// The REAL weekly boss: shared, persistent HP. One big daily manual "ability" swing + passive auto-attacks
// from the whole pack (server-driven). Polls so you watch the community drain it live.
export default function BossFightClient() {
    const [data, setData] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [hit, setHit] = useState(false);
    const [busy, setBusy] = useState(false);
    const [floaters, setFloaters] = useState([]);
    const [burst, setBurst] = useState(null);
    const [victory, setVictory] = useState(null);
    const [xpFlash, setXpFlash] = useState(false);
    const [liveHp, setLiveHp] = useState(null);
    const floatId = useRef(0);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/boss", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setData(d);
        setLoaded(true);
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, 10000);
        return () => clearInterval(t);
    }, [load]);

    // Reconcile the interpolated HP to the server's value on each poll / optimistic attack update.
    useEffect(() => {
        if (data?.boss) setLiveHp(data.boss.hp);
    }, [data?.boss?.hp]);

    // Creep the bar down continuously between polls using the pack's passive auto-DPS, so it never freezes.
    useEffect(() => {
        const dps = data?.boss?.autoDps || 0;
        if (dps <= 0) return undefined;
        const t = setInterval(() => setLiveHp((h) => (h == null ? h : Math.max(0, h - dps))), 1000);
        return () => clearInterval(t);
    }, [data?.boss?.autoDps]);

    function popDamage(amount, crit) {
        const id = floatId.current++;
        setFloaters((f) => [...f, { id, amount, crit, top: 14 + Math.random() * 38, left: 60 + Math.random() * 24 }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 850);
        setHit(true);
        setTimeout(() => setHit(false), 260);
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
            // Dopamine: name the ability, throw the big number.
            setBurst({ ability: res.ability, damage: res.damage, crit: res.crit, proc: res.proc, key: floatId.current++ });
            setTimeout(() => setBurst(null), 1500);
            popDamage(res.damage, res.crit);
            setXpFlash(true);
            setTimeout(() => setXpFlash(false), 1400);
            const divisor = data.boss.ticketDivisor || 100;
            setData((d) => {
                const dmg = (d.you?.dmg || 0) + res.damage;
                return { ...d, boss: { ...d.boss, hp: res.hp, maxHp: res.maxHp }, you: { ...d.you, attacksLeft: res.attacksLeft, dmg, tickets: Math.floor(dmg / divisor) } };
            });
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

    const { boss, roster = [], fighters = [], you } = data;
    const displayHp = liveHp != null ? liveHp : boss.hp;
    const pct = Math.max(0, Math.min(100, (displayHp / boss.maxHp) * 100));

    return (
        <div className="boss2">
            <div className="boss2-title">⚔️ This week&apos;s boss — the whole pack vs. {boss.name}</div>

            <div className="boss-stage-wrap">
                <BossBattleScene boss={{ ...boss, hp: Math.round(displayHp) }} fighters={fighters} defaultSprite={data.defaultSpriteUrl} hit={hit} floaters={floaters} pct={pct} />
                {burst ? (
                    <div className={`boss-burst${burst.crit ? " is-crit" : ""}`} key={burst.key}>
                        {burst.proc ? <div className="boss-burst-proc">⚡ {burst.proc}!</div> : null}
                        <div className="boss-burst-name">{burst.crit ? "💥 " : ""}{burst.ability}{burst.crit ? " 💥" : ""}</div>
                        <div className="boss-burst-dmg">-{burst.damage.toLocaleString()}</div>
                    </div>
                ) : null}
            </div>

            {boss.prize ? (
                <div className="boss-prize">
                    {boss.prize.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="boss-prize-img" src={boss.prize.imageUrl} alt={boss.prize.name} />
                    ) : null}
                    <div className="boss-prize-body">
                        <span className="boss-prize-eyebrow">🎟️ This week&apos;s raffle prize</span>
                        <span className="boss-prize-name">{boss.prize.name}</span>
                        <span className="muted">Every point of damage earns tickets toward the draw — {boss.ticketDivisor} dmg per ticket.</span>
                    </div>
                </div>
            ) : null}
            {boss.rewards ? <div className="boss2-rewards">🎁 {boss.rewards}</div> : null}

            {boss.defeated ? (
                <div className="boss-defeated">
                    <div className="boss-defeated-title">☠️ {boss.name} has been slain!</div>
                    {boss.winner ? (
                        <div className={`boss-winner${boss.winner.you ? " is-you" : ""}`}>
                            {boss.winner.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="boss-winner-av" src={boss.winner.avatarUrl} alt="" />
                            ) : null}
                            <div className="boss-winner-body">
                                <span className="boss-winner-label">🏆 Raffle winner</span>
                                <span className="boss-winner-name">{boss.winner.you ? "🎉 You won!" : boss.winner.name}</span>
                                <span className="muted">
                                    {boss.prize ? `wins ${boss.prize.name} · ` : ""}{boss.winner.tickets} 🎟️ ticket{boss.winner.tickets === 1 ? "" : "s"}
                                </span>
                                {boss.winner.you ? <span className="boss-winner-claim">Come to The Wolf Den to claim your prize!</span> : null}
                            </div>
                        </div>
                    ) : (
                        <p className="muted">The pack brought it down. A new boss will rise soon.</p>
                    )}
                    {you ? <div className="boss2-you"><span className="muted">Your final damage: <strong>{(you.dmg || 0).toLocaleString()}</strong></span><span className="boss2-tix">🎟️ {you.tickets || 0} tickets</span></div> : null}
                </div>
            ) : (
                <div className="boss2-actions">
                    {!you ? (
                        <Link href="/marketplace/login?returnTo=/marketplace/boss" className="btn-gold boss2-attack">Sign in to join the fight</Link>
                    ) : you.attacksLeft > 0 ? (
                        <button type="button" className="btn-gold boss2-attack" onClick={attack} disabled={busy}>
                            {busy ? "Unleashing…" : "⚔️ Unleash your daily strike"}
                        </button>
                    ) : (
                        <div className="boss2-spent">🕒 Strike used — your avatar keeps auto-attacking. Come back tomorrow for another.</div>
                    )}
                    {you ? (
                        <div className="boss2-you">
                            <span className="muted">Your damage: <strong>{(you.dmg || 0).toLocaleString()}</strong></span>
                            <span className="boss2-tix">🎟️ {you.tickets || 0} tickets</span>
                            {xpFlash ? <span className="boss2-xp"> +10 XP!</span> : null}
                        </div>
                    ) : null}
                </div>
            )}

            {roster.length ? (
                <div className="boss2-board">
                    <h3>🛡️ Active heroes</h3>
                    <div className="hero-strip">
                        {roster.slice(0, 12).map((f) => {
                            const inner = (
                                <>
                                    <div className="herochip-av">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={f.avatarUrl} alt="" />
                                        {f.badge ? <span className="herochip-badge" title={f.badge.label}>{f.badge.icon}</span> : null}
                                    </div>
                                    <span className="herochip-name">{f.name}{f.you ? " (you)" : ""}</span>
                                    <span className="herochip-meta">Lv {f.level} · 🎟️ {f.tickets}</span>
                                </>
                            );
                            const cls = `herochip${f.you ? " is-you" : ""}${f.alias ? " is-link" : ""}`;
                            return f.alias ? (
                                <Link key={f.id} href={`/marketplace/u/${f.alias}`} className={cls} title={`Inspect ${f.name}`}>{inner}</Link>
                            ) : (
                                <div key={f.id} className={cls} title={`${f.name} · ${f.dmg.toLocaleString()} dmg`}>{inner}</div>
                            );
                        })}
                    </div>
                    <p className="muted boss2-note">Damage converts to raffle tickets — {boss.ticketDivisor} dmg per 🎟️.</p>
                </div>
            ) : (
                <p className="muted boss2-note">Be the first to strike — the pack is warming up.</p>
            )}

            {victory ? (
                <div className="boss2-victory-overlay">
                    <div className="boss2-victory">
                        <div className="boss2-victory-x">🏆</div>
                        <h3>{victory.name} defeated!</h3>
                        <p className="muted">The pack brought it down. A new challenger will rise soon…</p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
