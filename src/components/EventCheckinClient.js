"use client";

import { useEffect, useState } from "react";

// Buyer event-day check-in for +50 XP (once per event). Renders nothing until it knows the state, so it
// stays invisible when there's nothing to offer (e.g. not the event day and not signed in).
export default function EventCheckinClient({ eventId }) {
    const [state, setState] = useState({ loading: true });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        fetch(`/api/marketplace/events/${eventId}/checkin`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => setState({ loading: false, ...d }))
            .catch(() => setState({ loading: false }));
    }, [eventId]);

    async function checkIn() {
        setBusy(true);
        try {
            const r = await fetch(`/api/marketplace/events/${eventId}/checkin`, { method: "POST" });
            const d = await r.json().catch(() => ({}));
            setResult(r.ok && d.ok ? { ok: true, points: d.points, already: d.already } : { ok: false, error: d.error });
        } catch {
            setResult({ ok: false });
        } finally {
            setBusy(false);
        }
    }

    if (state.loading) return null;

    if (result?.ok || state.checkedIn) {
        return (
            <p style={{ color: "#9de5a9", margin: "8px 0 0", fontWeight: 600 }}>
                ✓ Checked in{result?.points ? ` — +${result.points} XP` : ""}!
            </p>
        );
    }

    if (!state.signedIn) {
        return state.eligible ? <p className="muted" style={{ margin: "8px 0 0" }}>Sign in to check in and earn +50 XP.</p> : null;
    }

    if (!state.eligible) {
        return <p className="muted" style={{ margin: "8px 0 0" }}>Check-in opens on the event day.</p>;
    }

    return (
        <button className="button primary" style={{ marginTop: 10 }} onClick={checkIn} disabled={busy}>
            {busy ? "Checking in…" : "Check in (+50 XP)"}
        </button>
    );
}
