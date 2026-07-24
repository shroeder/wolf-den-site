"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import AvatarStack from "@/components/AvatarStack";
import BossBattleScene, { AURA_COL, BORDER_COL } from "@/components/BossBattleScene";
import BossFinalBlow from "@/components/BossFinalBlow";
import ItemArt from "@/components/ItemArt";
import useScrollLock from "@/lib/useScrollLock";
import { backgroundClass } from "@/lib/marketplace/backgrounds.js";

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
    const [cheerToast, setCheerToast] = useState(null);
    const [rewardIdx, setRewardIdx] = useState(0); // which reward item is showing in the rotating drop card
    const floatId = useRef(0);
    useScrollLock(Boolean(victory)); // lock bg scroll behind the victory overlay

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

    function popDamage(amount, crit, cheer = false) {
        const id = floatId.current++;
        setFloaters((f) => [...f, { id, amount, crit, cheer, top: 14 + Math.random() * 38, left: 60 + Math.random() * 24 }]);
        setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 850);
        setHit(true);
        setTimeout(() => setHit(false), 260);
    }

    // A bright crowd cheer: an ascending triad over a short applause-like noise swell (no asset files).
    function cheerSound() {
        if (typeof window === "undefined") return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const now = ctx.currentTime;
            [523, 659, 784, 1047].forEach((freq, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = "triangle"; o.frequency.value = freq;
                const t = now + i * 0.07;
                g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
                o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.34);
            });
            const dur = 0.5;
            const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
            const ch = buf.getChannelData(0);
            for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 1.4);
            const src = ctx.createBufferSource(); src.buffer = buf;
            const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.7;
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(0.0001, now); ng.gain.linearRampToValueAtTime(0.09, now + 0.08); ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
            src.connect(bp); bp.connect(ng); ng.connect(ctx.destination); src.start(now); src.stop(now + dur);
            setTimeout(() => ctx.close().catch(() => {}), 900);
        } catch { /* audio blocked — no-op */ }
    }

    async function cheer(target) {
        if (!target || !data?.you || (data.you.cheersLeft ?? 0) <= 0) return;
        cheerSound();
        setData((d) => ({ ...d, you: { ...d.you, cheersLeft: Math.max(0, (d.you.cheersLeft || 0) - 1) } })); // optimistic
        const r = await fetch("/api/marketplace/boss/cheer", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetId: target.id }),
        }).catch(() => null);
        const res = r ? await r.json().catch(() => null) : null;
        if (!res || res.error) { await load(); return; }
        popDamage(res.damage, false, true);
        setData((d) => ({ ...d, boss: { ...d.boss, hp: res.hp, maxHp: res.maxHp }, you: { ...d.you, cheersLeft: res.left } }));
        if (typeof window !== "undefined") window.dispatchEvent(new Event("wolfden-xp-updated"));
        setCheerToast({
            key: floatId.current++, targetName: res.targetName, xp: res.xp, gold: res.gold,
            petXp: res.petXp, fragment: res.fragment, selfDamage: res.selfDamage, badges: res.newBadges || [],
        });
        setTimeout(() => setCheerToast(null), 2800);
        if (res.defeated) {
            const deadBossId = data?.boss?.id;
            setVictory({ name: res.name });
            if (deadBossId) fetch("/api/marketplace/boss-celebrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bossId: deadBossId }) }).catch(() => {});
        }
        load();
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
                const tickets = Math.floor(dmg / divisor);
                // Reflect the new total in the Hall of Heroes immediately: bump your chip, re-sort by damage,
                // and recompute the medal ranks so your position jumps right away (load() then reconciles).
                const roster = (d.roster || [])
                    .map((f) => (f.you ? { ...f, dmg, tickets } : f))
                    .sort((a, b) => (b.dmg || 0) - (a.dmg || 0))
                    .map((f, i) => ({ ...f, dmgRank: i < 3 ? i + 1 : null }));
                return { ...d, boss: { ...d.boss, hp: res.hp, maxHp: res.maxHp }, roster, you: { ...d.you, attacksLeft: res.attacksLeft, dmg, tickets } };
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
    // The final-blow MVP = the pack's top damage dealer. Built from whichever source carries the richest data
    // (fighters have battle sprites; roster has avatars) so the cinematic shows a real name + real damage.
    const mvpSrc = [...(fighters || []), ...(roster || [])].reduce((best, f) => (!best || (f?.dmg || 0) > (best.dmg || 0) ? f : best), null);
    const topMvp = mvpSrc ? {
        name: mvpSrc.name,
        dmg: mvpSrc.dmg || 0,
        spriteUrl: mvpSrc.spriteUrl || null,
        spriteFlip: mvpSrc.spriteFlip || false,
        avatarUrl: mvpSrc.avatarUrl || null,
        you: Boolean(mvpSrc.you),
    } : null;
    const killMvp = boss.defeated ? topMvp : null;

    return (
        <div className="boss2">
            <div className="boss2-title">⚔️ This week&apos;s boss — the whole pack vs. {boss.name}</div>

            <div className="boss-stage-wrap">
                <BossBattleScene boss={{ ...boss, hp: Math.round(displayHp) }} fighters={fighters} defaultSprite={data.defaultSpriteUrl} hit={hit} floaters={floaters} pct={pct} youElement={you?.element} canCheer={Boolean(you) && !boss.defeated} cheersLeft={you?.cheersLeft ?? 0} onCheer={cheer} />
                {cheerToast ? (
                    <div className="cheer-toast" key={cheerToast.key}>
                        <div className="cheer-toast-main">📣 You cheered {cheerToast.targetName}!</div>
                        <div className="cheer-toast-rewards">
                            +{cheerToast.xp} XP · +{cheerToast.gold} 🪙
                            {cheerToast.petXp ? ` · 🐾 +${cheerToast.petXp}` : ""}
                            {cheerToast.selfDamage ? ` · ⚔️ ${cheerToast.selfDamage}` : ""}
                            {cheerToast.fragment ? " · 🧩 fragment!" : ""}
                        </div>
                        {cheerToast.badges?.length ? cheerToast.badges.map((b) => (
                            <div key={b.slug} className="cheer-toast-badge">🏅 {b.icon} {b.label} unlocked!</div>
                        )) : null}
                    </div>
                ) : null}
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
                    {killMvp ? (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                            <BossFinalBlow mvp={killMvp} boss={{ name: boss.name, imageUrl: boss.imageUrl }} />
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="boss2-actions">
                    {!you ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
                            <div className="muted" style={{ textAlign: "center", maxWidth: 340 }}>Land the finishing blow, earn XP &amp; real store rewards at The Wolf Den — free to play.</div>
                            <Link href="/marketplace/login?returnTo=/marketplace/boss&signup=1" className="btn-gold boss2-attack">⚔️ Create a free account to strike</Link>
                            <Link href="/marketplace/login?returnTo=/marketplace/boss" style={{ fontSize: "0.85rem", textDecoration: "underline", opacity: 0.85 }}>Already have an account? Sign in</Link>
                        </div>
                    ) : you.attacksLeft > 0 ? (
                        <button type="button" className="btn-gold boss2-attack" onClick={attack} disabled={busy}>
                            {busy ? "Unleashing…" : "⚔️ Unleash your daily strike"}
                        </button>
                    ) : (
                        <div className="boss2-spent">🕒 Strike used — your avatar keeps auto-attacking. Come back tomorrow for another.</div>
                    )}
                    {you ? (
                        <>
                            <div className="boss2-you">
                                <span className="muted">Your damage: <strong>{(you.dmg || 0).toLocaleString()}</strong></span>
                                <span className="boss2-tix">🎟️ {you.tickets || 0} tickets</span>
                                {xpFlash ? <span className="boss2-xp"> +10 XP!</span> : null}
                            </div>
                            {you.autoPerHour ? (
                                <div className="boss2-auto" title="Your passive auto-damage — dealt to the boss 24/7 from your gear + pet (+ element match). Upgrade gear/pets to raise it.">
                                    ⚔️ Your DPS: <strong>{you.autoPerHour.toLocaleString()}/hr</strong> · <strong>{(you.autoPerHour * 24).toLocaleString()}/day</strong> <span className="muted">passive, gear + pet</span>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                    {you && (you.cheersLeft ?? 0) > 0 ? (
                        <div className="boss2-cheerhint">📣 Tap <b>Cheer</b> on the hero on stage — bonus damage for them, XP + coin for you. <b>{you.cheersLeft}</b> left today.</div>
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
                    <h3>🏆 Hall of Heroes</h3>
                    <div className="hero-strip">
                        {roster.map((f) => {
                            // Each member's signature color tints their chip; the avatar carries their equipped
                            // border ring + aura + cosmetic effects (via AvatarStack), and their profile
                            // background dresses the card — so the mini cards read as uniquely theirs.
                            const glow = AURA_COL[f.aura] || BORDER_COL[f.border] || null;
                            const inner = (
                                <>
                                    <div className="herochip-av">
                                        <AvatarStack avatarUrl={f.avatarUrl} border={f.border || "none"} cosmetics={f.avatarCosmetics} size={48} initial={(f.name || "?").slice(0, 1).toUpperCase()} />
                                        {f.badge ? <span className="herochip-badge" title={f.badge.label}>{f.badge.icon}</span> : null}
                                        {f.dmgRank ? <span className={`herochip-rank rank-${f.dmgRank}`} title={`#${f.dmgRank} damage dealer`} aria-label={`Number ${f.dmgRank} damage`}>{["🥇", "🥈", "🥉"][f.dmgRank - 1]}</span> : null}
                                    </div>
                                    <span className="herochip-name">{f.name}{f.you ? " (you)" : ""}</span>
                                    <span className="herochip-dps" title="Total damage dealt">⚔️ {(f.dmg || 0).toLocaleString()} <span className="herochip-dps-unit">dmg</span></span>
                                    <span className="herochip-meta">Lv {f.level} · 🎟️ {f.tickets}</span>
                                </>
                            );
                            const cls = `herochip${f.you ? " is-you" : ""}${f.alias ? " is-link" : ""}${f.background ? ` has-bg ${backgroundClass(f.background)}` : ""}${glow ? " has-glow" : ""}`;
                            const style = glow ? { "--glow": glow } : undefined;
                            return f.alias ? (
                                <Link key={f.id} href={`/marketplace/u/${f.alias}`} className={cls} style={style} title={`Inspect ${f.name}`}>{inner}</Link>
                            ) : (
                                <div key={f.id} className={cls} style={style} title={`${f.name} · ${f.dmg.toLocaleString()} dmg`}>{inner}</div>
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
                            {topMvp ? <BossFinalBlow mvp={topMvp} boss={{ name: victory.name || boss.name, imageUrl: boss.imageUrl }} /> : null}
                            <Link href="/marketplace/inventory" className="btn-gold">🎒 See your loot</Link>
                            <button type="button" className="pill" onClick={() => setVictory(null)}>A new boss rises →</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
