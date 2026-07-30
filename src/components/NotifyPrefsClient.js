"use client";

import { useCallback, useEffect, useState } from "react";

// Granular notification settings: one row per notification KIND, with a small switch per channel it can
// actually be delivered on. The catalog comes from the server so the UI can never show a switch that isn't
// enforced — a toggle that does nothing is worse than no toggle at all.
//
// Everything defaults ON, so a member only ever stores explicit opt-outs. Saves immediately (optimistic) and
// rolls back the one switch that failed, since a settings screen with a Save button people forget to press is
// how you end up still emailing someone who tried to turn it off.

const CHANNEL_META = {
    push: { icon: "🔔", label: "Push" },
    email: { icon: "✉️", label: "Email" },
};

function Switch({ on, busy, onToggle, ariaLabel }) {
    return (
        <button
            type="button"
            className={`notif-switch-btn${on ? " is-on" : ""}`}
            onClick={onToggle}
            disabled={busy}
            aria-pressed={on}
            aria-label={ariaLabel}
        >
            <span className="notif-switch" aria-hidden="true"><span className="notif-knob" /></span>
        </button>
    );
}

export default function NotifyPrefsClient() {
    const [groups, setGroups] = useState(null);
    const [digest, setDigest] = useState(true);
    const [busyKey, setBusyKey] = useState(null);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/notify-prefs", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        if (d?.groups) { setGroups(d.groups); setDigest(d.digest !== false); }
        else setGroups([]);
    }, []);

    useEffect(() => { load(); }, [load]);

    async function save(prefKey, value, revert) {
        setBusyKey(prefKey);
        setErr(null);
        const r = await fetch("/api/marketplace/notify-prefs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prefs: { [prefKey]: value } }),
        }).catch(() => null);
        setBusyKey(null);
        if (!r || !r.ok) { revert(); setErr("Couldn't save that — try again."); }
    }

    function toggle(kindKey, channel, current) {
        const prefKey = `${channel}:${kindKey}`;
        const next = !current;
        // Optimistic: flip locally, then roll this one switch back if the save fails.
        setGroups((gs) => (gs || []).map((g) => ({
            ...g,
            kinds: g.kinds.map((k) => (k.key !== kindKey ? k : {
                ...k,
                channels: k.channels.map((c) => (c.channel === channel ? { ...c, on: next } : c)),
            })),
        })));
        save(prefKey, next, () => setGroups((gs) => (gs || []).map((g) => ({
            ...g,
            kinds: g.kinds.map((k) => (k.key !== kindKey ? k : {
                ...k,
                channels: k.channels.map((c) => (c.channel === channel ? { ...c, on: current } : c)),
            })),
        }))));
    }

    function toggleDigest() {
        const next = !digest;
        setDigest(next);
        save("email:digest", next, () => setDigest(digest));
    }

    if (groups === null) return <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.85rem" }}>Loading your notification settings…</p>;

    return (
        <div className="notif-prefs">
            {err ? <p className="notif-err">{err}</p> : null}

            {groups.map((g) => (
                <div key={g.key} className="notif-group">
                    <div className="notif-group-head">
                        <span className="notif-group-title">{g.label}</span>
                        {g.note ? <span className="notif-group-note">{g.note}</span> : null}
                    </div>
                    {g.kinds.map((k) => (
                        <div key={k.key} className="notif-row">
                            <span className="notif-row-copy">
                                <span className="notif-row-label">{k.label}</span>
                                <span className="notif-row-desc">{k.desc}</span>
                            </span>
                            <span className="notif-row-switches">
                                {k.channels.map((c) => (
                                    <span key={c.channel} className="notif-chan">
                                        <span className="notif-chan-label" title={CHANNEL_META[c.channel]?.label}>{CHANNEL_META[c.channel]?.icon}</span>
                                        <Switch
                                            on={c.on}
                                            busy={busyKey === `${c.channel}:${k.key}`}
                                            onToggle={() => toggle(k.key, c.channel, c.on)}
                                            ariaLabel={`${CHANNEL_META[c.channel]?.label} for ${k.label}`}
                                        />
                                    </span>
                                ))}
                            </span>
                        </div>
                    ))}
                </div>
            ))}

            {/* The recap only ever goes to people push can't reach, so it's framed as the fallback it is. */}
            <div className="notif-group">
                <div className="notif-group-head">
                    <span className="notif-group-title">Catch-up email</span>
                    <span className="notif-group-note">Only sent if push notifications are off and you&apos;ve been away a while — at most once every couple of weeks.</span>
                </div>
                <div className="notif-row">
                    <span className="notif-row-copy">
                        <span className="notif-row-label">Weekly recap</span>
                        <span className="notif-row-desc">A short summary of what you missed</span>
                    </span>
                    <span className="notif-row-switches">
                        <span className="notif-chan">
                            <span className="notif-chan-label">✉️</span>
                            <Switch on={digest} busy={busyKey === "email:digest"} onToggle={toggleDigest} ariaLabel="Weekly recap email" />
                        </span>
                    </span>
                </div>
            </div>
        </div>
    );
}
