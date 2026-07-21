"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import BossBattleScene from "@/components/BossBattleScene";
import ItemArt from "@/components/ItemArt";

// The REAL weekly boss: shared, persistent HP. One big daily manual "ability" swing + passive auto-attacks
// from the whole pack (server-driven). Polls so you watch the community drain it live.
const RARITY_TXT = { common: "#9aa7b5", rare: "#4aa3ff", epic: "#b76bff", legendary: "#ffb52e", mythic: "#37f5c0", ascendant: "#ff7a3c", eternal: "#ff5cc8" };

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
    const [rewardIdx, setRewardIdx] = useState(0); // which reward item is showing in the rotating drop card
    const floatId = useRef(0);

    // When a boss has more than one reward item, cycle through them every 3s so each gets seen.
    const rewardCount = data?.boss?.rewardItems?.length || 0;
    useEffect(() => {
        if (rewardCount <= 1) { setRewardIdx(0); return undefined; }
        const t = setInterval(() => setRewardIdx((i) => (i + 1) % rewardCount), 3000);
        return () => clearInterval(t);
    }, [rewardCount]);

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
            // Let the site-wide watchers react live: refresh the reward nudge + fire a level-up celebration
            // the instant this hit tips you over, instead of only on the next page load.
            if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-xp-updated"));
            const divisor = data.boss.ticketDivisor || 100;
            setData((d) => {
                const dmg = (d.you?.dmg || 0) + res.damage;
                return { ...d, boss: { ...d.boss, hp: res.hp, maxHp: res.maxHp }, you: { ...d.you, attacksLeft: res.attacksLeft, dmg, tickets: Math.floor(dmg / divisor) } };
            });
            if (res.defeated) {
                const deadBossId = data?.boss?.id;
                setVictory({ name: res.name });
                // The finisher already sees this overlay — ack so the site-wide watcher doesn't repeat it for them.
                if (deadBossId) fetch("/api/marketplace/boss-celebrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bossId: deadBossId }) }).catch(() => {});
                load(); // refresh in the background so the freshly-rotated boss is ready when they close
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
            {you ? (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                    <a href="/marketplace/inventory" style={{ fontWeight: 800, color: "#ffd75e", background: "rgba(255,215,94,0.12)", border: "1px solid rgba(255,215,94,0.38)", borderRadius: 999, padding: "3px 14px", fontSize: "0.9rem", textDecoration: "none" }}>💰 {(you.gold || 0).toLocaleString()} gold · shop →</a>
                </div>
            ) : null}

            <div className="boss-stage-wrap">
                <BossBattleScene boss={{ ...boss, hp: Math.round(displayHp) }} fighters={fighters} defaultSprite={data.defaultSpriteUrl} hit={hit} floaters={floaters} pct={pct} youElement={you?.element} />
                {burst ? (
                    <div className={`boss-burst${burst.crit ? " is-crit" : ""}`} key={burst.key}>
                        {burst.proc ? <div className="boss-burst-proc">⚡ {burst.proc}!</div> : null}
                        <div className="boss-burst-name">{burst.crit ? "💥 " : ""}{burst.ability}{burst.crit ? " 💥" : ""}</div>
                        <div className="boss-burst-dmg">-{burst.damage.toLocaleString()}</div>
                    </div>
                ) : null}
            </div>

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

            <div className="card" style={{ padding: 14 }}>
                <h3 style={{ margin: "0 0 12px" }}>🏆 What you&apos;re fighting for</h3>
                <div style={{ display: "grid", gap: 10 }}>
                    {/* Raffle prize — real-world, ticket lottery */}
                    {boss.prize ? (
                        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 14, border: "1px solid rgba(255,215,94,0.45)", background: "radial-gradient(140% 140% at 0% 0%, rgba(255,215,94,0.18), transparent 62%)" }}>
                            <span style={{ fontSize: "1.9rem", flexShrink: 0 }} aria-hidden="true">🎟️</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#ffd75e", letterSpacing: "0.05em" }}>RAFFLE PRIZE · TICKET LOTTERY</div>
                                <div style={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.25 }}>{boss.prize.name}</div>
                                <div className="muted" style={{ fontSize: "0.76rem" }}>Every point of damage earns a ticket — more tickets, better odds to win.</div>
                            </div>
                            {boss.prize.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={boss.prize.imageUrl} alt={boss.prize.name} style={{ width: 54, height: 54, objectFit: "contain", borderRadius: 10, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
                            ) : <span style={{ fontSize: "2.4rem", flexShrink: 0 }} aria-hidden="true">🎁</span>}
                        </div>
                    ) : null}
                    {/* In-game reward gear — drops to random fighters (top dealers slightly favored). With more
                        than one item we rotate through them (name + art) every 3s so each gets its moment. */}
                    {boss.rewardItems?.length ? (() => {
                        const items = boss.rewardItems;
                        const cur = items[rewardIdx % items.length];
                        return (
                            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}>
                                <span style={{ fontSize: "1.6rem", flexShrink: 0 }} aria-hidden="true">🎁</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#cdbfa6", letterSpacing: "0.05em" }}>{items.length > 1 ? `${items.length} GEAR DROPS` : "GEAR DROP"}</div>
                                    <div key={cur.id} className="boss-reward-rotate" style={{ fontWeight: 800, fontSize: "0.95rem", lineHeight: 1.35 }}>
                                        <span style={{ color: RARITY_TXT[cur.rarity] || "#fff" }}>{cur.name}</span>
                                    </div>
                                    <div className="muted" style={{ fontSize: "0.76rem" }}>Drops to random fighters — top dealers have better odds, but anyone who fights can win.</div>
                                    {items.length > 1 ? (
                                        <div className="boss-reward-dots" aria-hidden="true">
                                            {items.map((it, i) => <span key={it.id} className={i === rewardIdx % items.length ? "is-on" : ""} />)}
                                        </div>
                                    ) : null}
                                </div>
                                <ItemArt key={cur.id} id={cur.id} icon={cur.icon} className="boss-chase-art boss-reward-rotate" />
                            </div>
                        );
                    })() : null}
                    {/* Everyone — chest chance + XP */}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
                        <span style={{ fontSize: "1.5rem", flexShrink: 0 }} aria-hidden="true">🎁</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#cdbfa6", letterSpacing: "0.05em" }}>EVERYONE WHO FIGHTS</div>
                            <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>A shot at a loot chest + XP</div>
                            <div className="muted" style={{ fontSize: "0.76rem" }}>Fight harder for a better chance — and a better chest.</div>
                        </div>
                        <span style={{ fontSize: "2rem", flexShrink: 0 }} aria-hidden="true">⭐</span>
                    </div>
                </div>
            </div>
            {boss.rewards ? <div className="boss2-rewards">🎁 {boss.rewards}</div> : null}

            {roster.length ? (
                <div className="boss2-board">
                    <h3>🛡️ Active heroes</h3>
                    <div className="hero-strip">
                        {roster.map((f) => {
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
                <div className="boss2-victory-overlay" onClick={() => setVictory(null)}>
                    <div className="boss2-vic-confetti" aria-hidden="true">
                        {Array.from({ length: 72 }).map((_, i) => (
                            <span key={i} style={{ left: `${(i * 89) % 100}%`, animationDelay: `${(i % 12) * 0.08}s`, background: ["#ffd75e", "#ff7ad0", "#5ce0c0", "#8fd8ff", "#ff9f1c"][i % 5] }} />
                        ))}
                    </div>
                    <div className="boss2-victory" onClick={(e) => e.stopPropagation()}>
                        <div className="boss2-victory-x">🏆</div>
                        <h3>☠️ {victory.name} slain!</h3>
                        <p className="muted">The whole pack brought it down!</p>
                        {(fighters || []).some((f) => f.spriteUrl) ? (
                            <div className="boss2-vic-heroes">
                                {(fighters || []).filter((f) => f.spriteUrl).slice(0, 10).map((f, i) => (
                                    <span key={f.id || i} className="boss2-vic-hero" style={{ animationDelay: `${(i % 5) * 0.12}s` }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={f.spriteUrl} alt="" style={f.spriteFlip ? { transform: "scaleX(-1)" } : undefined} />
                                    </span>
                                ))}
                            </div>
                        ) : null}
                        <p className="boss2-vic-reward">🎁 You earned a 🎟️ spin token + a shot at loot — check your stash!</p>
                        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                            <Link href="/marketplace/inventory" className="btn-gold">🎒 See your loot</Link>
                            <button type="button" className="pill" onClick={() => setVictory(null)}>A new boss rises →</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
