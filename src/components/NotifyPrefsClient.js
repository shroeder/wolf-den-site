"use client";

import { useState } from "react";

// Two email-notification toggles for the profile. Emails only go out when you're offline, so these just
// govern whether we reach you by email when you miss a DM / friend request.
function Toggle({ on, busy, onToggle, label, sub }) {
    return (
        <button type="button" className={`notif-toggle${on ? " is-on" : ""}`} onClick={onToggle} disabled={busy} aria-pressed={on}>
            <span className="notif-toggle-copy">
                <span className="notif-toggle-label">{label}</span>
                <span className="notif-toggle-sub muted">{sub}</span>
            </span>
            <span className="notif-switch" aria-hidden="true"><span className="notif-knob" /></span>
        </button>
    );
}

export default function NotifyPrefsClient({ initialDm = true, initialFriend = true }) {
    const [dm, setDm] = useState(initialDm);
    const [friend, setFriend] = useState(initialFriend);
    const [busy, setBusy] = useState(false);

    async function save(next) {
        setBusy(true);
        try {
            await fetch("/api/marketplace/notify-prefs", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(next),
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="notif-prefs">
            <Toggle
                on={dm}
                busy={busy}
                label="Email me about messages"
                sub="When someone messages you while you're away"
                onToggle={() => { const v = !dm; setDm(v); save({ dm: v }); }}
            />
            <Toggle
                on={friend}
                busy={busy}
                label="Email me about friend requests"
                sub="When someone sends you a request while you're away"
                onToggle={() => { const v = !friend; setFriend(v); save({ friend: v }); }}
            />
        </div>
    );
}
