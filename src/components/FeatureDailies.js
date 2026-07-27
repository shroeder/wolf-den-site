"use client";

import { useCallback, useEffect, useState } from "react";

// A dedicated daily-bounty card for a single feature (farm/sailing) — the same always-present, claimable
// daily-tasks experience as the Forge, themed per feature. Self-contained: fetches + claims its own state.
const THEME = {
    farm: { accent: "#7ed57e", soft: "rgba(126,213,126,0.13)", border: "rgba(126,213,126,0.4)", title: "Today's farm bounties", icon: "🌾" },
    sailing: { accent: "#6fd0ff", soft: "rgba(111,208,255,0.13)", border: "rgba(111,208,255,0.4)", title: "Today's voyage bounties", icon: "⚓" },
};

export default function FeatureDailies({ feature, refreshKey = 0, onClaimable }) {
    const [dailies, setDailies] = useState(null);
    const [busy, setBusy] = useState(null);

    // Report claimable (done-but-unclaimed) count up so a parent can show a tab/nav attention badge.
    useEffect(() => { if (onClaimable) onClaimable((dailies || []).filter((q) => q.done && !q.claimed).length); }, [dailies, onClaimable]);

    // Re-fetch on mount, whenever refreshKey bumps (a mission-progressing action happened), and when the tab
    // regains focus — so a completed bounty flips to "Claim" live, not only after a page refresh.
    useEffect(() => {
        let alive = true;
        const load = () => fetch(`/api/marketplace/feature-daily?feature=${feature}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (alive && d?.dailies) setDailies(d.dailies); })
            .catch(() => {});
        load();
        const onFocus = () => { if (document.visibilityState === "visible") load(); };
        document.addEventListener("visibilitychange", onFocus);
        return () => { alive = false; document.removeEventListener("visibilitychange", onFocus); };
    }, [feature, refreshKey]);

    const claim = useCallback(async (key) => {
        setBusy(key);
        try {
            const r = await fetch("/api/marketplace/feature-daily", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature, key }) }).then((x) => x.json()).catch(() => null);
            if (r?.ok && r.dailies) setDailies(r.dailies);
        } finally { setBusy(null); }
    }, [feature]);

    if (!dailies || !dailies.length) return null;
    const t = THEME[feature] || THEME.farm;
    const allDone = dailies.every((q) => q.claimed);
    return (
        <section className="fd-card" style={{ "--fd-accent": t.accent, "--fd-soft": t.soft, "--fd-border": t.border }}>
            <div className="fd-head"><span className="fd-ico">{t.icon}</span><b>{t.title}</b>{allDone ? <span className="fd-alldone">all done ✓</span> : null}</div>
            {dailies.map((q) => (
                <div key={q.key} className={`fd-row${q.claimed ? " is-claimed" : ""}`}>
                    <div className="fd-body">
                        <b>{q.label}</b>
                        <div className="fd-bar" aria-hidden="true"><span style={{ width: `${Math.round((q.progress / q.need) * 100)}%` }} /></div>
                        <span className="fd-prog">{q.progress}/{q.need} · {q.rewardLabel}</span>
                    </div>
                    {q.claimed ? <span className="fd-tag done">✓ claimed</span>
                        : q.done ? <button type="button" className="fd-claim" disabled={busy === q.key} onClick={() => claim(q.key)}>{busy === q.key ? "…" : "Claim"}</button>
                            : <span className="fd-tag">{q.need - q.progress} to go</span>}
                </div>
            ))}
            <style>{`
                .fd-card { border-radius: 14px; padding: 12px 14px; border: 1px solid var(--fd-border); background: linear-gradient(180deg, var(--fd-soft), rgba(255,255,255,0.015) 55%); }
                .fd-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
                .fd-head b { font-size: 12px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; color: var(--fd-accent); }
                .fd-ico { font-size: 15px; }
                .fd-alldone { margin-left: auto; font-size: 10.5px; font-weight: 800; color: var(--fd-accent); opacity: 0.85; }
                .fd-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.06); }
                .fd-row:first-of-type { border-top: none; }
                .fd-row.is-claimed { opacity: 0.55; }
                .fd-body { flex: 1; min-width: 0; }
                .fd-body b { font-size: 12.5px; font-weight: 700; }
                .fd-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; margin: 5px 0 3px; }
                .fd-bar > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, color-mix(in srgb, var(--fd-accent) 70%, #000), var(--fd-accent)); box-shadow: 0 0 8px -1px var(--fd-accent); transition: width .5s cubic-bezier(.3,1.2,.4,1); }
                .fd-prog { font-size: 10.5px; color: #b6bcc4; }
                .fd-claim { flex: none; padding: 6px 14px; border-radius: 9px; font-weight: 900; font-size: 12px; cursor: pointer; border: none; color: #10241a; background: linear-gradient(180deg, #8fe39a, #4bbf6a); box-shadow: 0 2px 0 #2e7d46; animation: fdPop .4s cubic-bezier(.2,1.3,.3,1) both; }
                .fd-claim:disabled { opacity: 0.7; cursor: default; }
                .fd-tag { flex: none; font-size: 10.5px; color: #9aa2ab; }
                .fd-tag.done { color: var(--fd-accent); font-weight: 800; }
                @keyframes fdPop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </section>
    );
}
