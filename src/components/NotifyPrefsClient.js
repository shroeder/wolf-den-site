"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTIFY_MODES } from "@/lib/marketplace/notify-prefs-meta.js";

// Granular notification settings: one row per notification KIND, with a small switch per channel it can
// actually be delivered on. The catalog comes from the server so the UI can never show a switch that isn't
// enforced — a toggle that does nothing is worse than no toggle at all.
//
// Everything defaults ON, so a member only ever stores explicit opt-outs. Saves immediately (optimistic) and
// rolls back the one switch that failed, since a settings screen with a Save button people forget to press is
// how you end up still emailing someone who tried to turn it off.

// ── NAMED, NOT DRAWN ─────────────────────────────────────────────────────────────────────────────────────────
// These were emoji (🔔 ✉️ 💬), which the Den does not put in its interface. The obvious swap is a react-icons
// glyph — and at the size this label renders, stacked above a 38px switch, a detailed gi bell reads as a grey
// smudge and the whole point of the label is telling two switches apart at a glance.
//
// So it is the WORD. Four characters at 0.58rem is narrower than the switch under it, it is unambiguous at
// any size, and the switch is already the icon-forward half of the control.
const CHANNEL_META = {
    push: { label: "Push" },
    email: { label: "Email" },
    // Not every notification arrives on your phone. A milestone post is delivered by appearing in the plaza,
    // so "shown in chat" is a channel like any other and gets a switch like any other.
    chat: { label: "Chat" },
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
    const [mode, setMode] = useState("all");
    const [busyKey, setBusyKey] = useState(null);
    // Opened by hand, or opened for you when your settings do not add up to one of the three — somebody who
    // has already tuned this by hand must not have their choices hidden behind a fold they did not ask for.
    const [openDetail, setOpenDetail] = useState(false);
    const [err, setErr] = useState(null);

    const apply = useCallback((d) => {
        if (!d?.groups) { setGroups([]); return; }
        setGroups(d.groups);
        setDigest(d.digest !== false);
        setMode(d.mode || "all");
    }, []);

    const load = useCallback(async () => {
        const r = await fetch("/api/marketplace/notify-prefs", { cache: "no-store" }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        apply(d);
        if (d?.mode === "custom") setOpenDetail(true);
    }, [apply]);

    useEffect(() => { load(); }, [load]);

    async function save(prefKey, value, revert) {
        setBusyKey(prefKey);
        setErr(null);
        const r = await fetch("/api/marketplace/notify-prefs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prefs: { [prefKey]: value } }),
        }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setBusyKey(null);
        if (!d) { revert(); setErr("Couldn't save that — try again."); return; }
        // The MODE is re-read from the reply, because one switch is exactly what turns Some into Custom and
        // the header has to say so the moment it happens rather than on the next page load.
        setMode(d.mode || "all");
    }

    // ── PICKING ONE OF THE THREE REWRITES EVERY SWITCH ───────────────────────────────────────────────────
    // Not optimistic, deliberately. A per-switch flip is one boolean and rolling it back is honest; this
    // rewrites the whole matrix, so guessing the result locally means drawing thirty switches that might all
    // be wrong. It is one request and the screen shows it working.
    async function chooseMode(next) {
        if (busyKey || next === mode) return;
        setBusyKey(`mode:${next}`);
        setErr(null);
        const r = await fetch("/api/marketplace/notify-prefs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mode: next }),
        }).catch(() => null);
        const d = r && r.ok ? await r.json().catch(() => null) : null;
        setBusyKey(null);
        if (!d) { setErr("Couldn't save that — try again."); return; }
        apply(d);
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

            {/* ── THE FIRST QUESTION ───────────────────────────────────────────────────────────────────────
                Thirty switches is not wrong — every one is enforced and somebody eventually wants each — it
                is the wrong thing to ask FIRST. How much do you want to hear from us at all has three honest
                answers, and almost everybody's is one of them. The matrix is still here, one tap down, for
                the people whose answer is "it depends". */}
            <div className="notif-modes" role="radiogroup" aria-label="How much should we send you?">
                {NOTIFY_MODES.map((m) => (
                    <button key={m.key} type="button" role="radio" aria-checked={mode === m.key}
                        className={`notif-mode${mode === m.key ? " is-on" : ""}`}
                        disabled={Boolean(busyKey)}
                        onClick={() => chooseMode(m.key)}>
                        <b>{m.label}</b>
                        <em>{m.desc}</em>
                    </button>
                ))}
            </div>
            {/* CUSTOM IS A REAL STATE AND IT IS SAID OUT LOUD. Somebody who has tuned this by hand would
                otherwise open the screen to three unselected buttons and reasonably conclude it had forgotten
                them. It is derived from the switches, so it appears the instant one of them disagrees. */}
            {mode === "custom" ? (
                <p className="notif-custom" role="status">
                    You have picked these by hand. Choosing one of the three above replaces the lot.
                </p>
            ) : null}

            <details className="notif-detail" open={openDetail}
                onToggle={(e) => setOpenDetail(e.currentTarget.open)}>
                <summary>Choose exactly what reaches you</summary>

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
                                        <span className="notif-chan-label">{CHANNEL_META[c.channel]?.label}</span>
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
                            <span className="notif-chan-label">{CHANNEL_META.email.label}</span>
                            <Switch on={digest} busy={busyKey === "email:digest"} onToggle={toggleDigest} ariaLabel="Weekly recap email" />
                        </span>
                    </span>
                </div>
            </div>
            </details>
        </div>
    );
}
