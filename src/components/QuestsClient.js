"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// Daily quests card — 3 rotating bounties with progress bars + claim buttons. Claiming pops a full reward
// celebration (flash, coin burst, gold count-up). Renders nothing until the member has quests.
export default function QuestsClient() {
    const [quests, setQuests] = useState(null);
    const [busy, setBusy] = useState(false);
    const [reward, setReward] = useState(null); // { gold, chest } shown in the celebration
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/quests", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d) setQuests(d.quests || []);
    }, []);
    useEffect(() => { load(); }, [load]);

    async function claim(key) {
        if (busy) return;
        setBusy(true);
        const q = quests?.find((x) => x.key === key);
        const r = await fetch("/api/marketplace/quests", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }),
        }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d?.ok) {
            setReward({ gold: d.gold ?? q?.rewardGold ?? 0, chest: q?.rewardChest || null, bonusXp: d.bonusXp || 0, bonusSpin: Boolean(d.bonusSpin) });
            await load();
        }
        setBusy(false);
    }

    if (!quests || !quests.length) return null;
    const allClaimed = quests.every((q) => q.claimed);
    const readyCount = quests.filter((q) => q.done && !q.claimed).length;

    return (
        <section className="card quests-card">
            <h3 style={{ marginTop: 0 }}>📜 Daily Quests {readyCount ? <span className="quests-ready-badge">{readyCount}</span> : null}</h3>
            <div className="quests-list">
                {quests.map((q) => {
                    const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
                    return (
                        <div key={q.key} className={`quest${q.claimed ? " is-claimed" : ""}${q.done && !q.claimed ? " is-ready" : ""}`}>
                            <div className="quest-main">
                                <div className="quest-label">{q.label}</div>
                                <div className="quest-reward">💰 {q.rewardGold.toLocaleString()}{q.rewardChest ? ` · ${q.rewardChest.emoji} ${q.rewardChest.label}` : ""}</div>
                                <div className="quest-bar"><span style={{ width: `${pct}%` }} /></div>
                                <div className="quest-prog">{Math.min(q.progress, q.target).toLocaleString()} / {q.target.toLocaleString()}</div>
                                {/* Not done yet → a call-to-action link straight to where they complete it. */}
                                {!q.done && q.area ? (
                                    <Link href={q.area} className="quest-cta">{q.cta || "Go"} →</Link>
                                ) : null}
                            </div>
                            {q.claimed ? (
                                <span className="quest-check" aria-label="Claimed">✓</span>
                            ) : q.done ? (
                                <button type="button" className="button gold quest-claim" onClick={() => claim(q.key)} disabled={busy}>Claim</button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {allClaimed ? <p className="muted" style={{ margin: "8px 0 0" }}>All done — fresh quests tomorrow! 🌙</p> : null}

            {mounted && reward ? createPortal(<QuestReward reward={reward} onClose={() => setReward(null)} />, document.body) : null}
        </section>
    );
}

// Full-screen claim celebration: flash → coin burst + gold count-up → a chest if the quest gave one.
function QuestReward({ reward, onClose }) {
    const [shown, setShown] = useState(0);

    // Auto-dismiss after a beat.
    useEffect(() => {
        const t = setTimeout(onClose, 2800);
        return () => clearTimeout(t);
    }, [onClose]);

    // Count the gold up.
    useEffect(() => {
        const goal = reward.gold || 0;
        if (goal <= 0) { setShown(0); return; }
        const start = performance.now();
        let raf;
        const tick = (now) => {
            const p = Math.min(1, (now - start) / 750);
            setShown(Math.round(goal * (1 - Math.pow(1 - p, 2))));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [reward.gold]);

    const coins = useMemo(() => Array.from({ length: 28 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.5;
        const d = 90 + Math.random() * 150;
        return { tx: `${Math.cos(a) * d}px`, ty: `${Math.sin(a) * d - 12}px`, rot: `${Math.random() * 720 - 360}deg`, delay: `${Math.random() * 0.14}s`, sz: `${8 + Math.random() * 9}px` };
    }), []);

    return (
        <div className="quest-cele" onClick={onClose}>
            <div className="quest-cele-flash" />
            <div className="quest-cele-inner" onClick={(e) => e.stopPropagation()}>
                <div className="quest-cele-coins" aria-hidden="true">
                    {coins.map((c, i) => (
                        <span key={i} className="quest-coin" style={{ "--tx": c.tx, "--ty": c.ty, "--rot": c.rot, "--sz": c.sz, animationDelay: c.delay }} />
                    ))}
                </div>
                <div className="quest-cele-badge">✅</div>
                <div className="quest-cele-title">Quest Complete!</div>
                <div className="quest-cele-gold">💰 +{shown.toLocaleString()}</div>
                {reward.chest ? <div className="quest-cele-chest">{reward.chest.emoji} {reward.chest.label}!</div> : null}
                {reward.bonusXp || reward.bonusSpin ? (
                    <div className="quest-cele-chest" style={{ color: "#ffd75e" }}>
                        🎉 All quests cleared!{reward.bonusXp ? ` +${reward.bonusXp} XP` : ""}{reward.bonusSpin ? " · 🎡 free spin" : ""}
                    </div>
                ) : null}
                <button type="button" className="button gold" onClick={onClose}>Nice!</button>
            </div>
        </div>
    );
}
