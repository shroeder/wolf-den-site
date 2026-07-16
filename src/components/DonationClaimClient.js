"use client";

import { useEffect, useRef, useState } from "react";

const ERROR_COPY = {
    already_yours: "You've already claimed this donation. 🎉",
    already_claimed: "This donation was already claimed on another account.",
    expired: "This donation code has expired — ask staff to pull it up again.",
    not_found: "This code isn't valid.",
    invalid: "This code isn't valid.",
    unauthorized: "Please sign in to claim your donation rewards.",
};

export default function DonationClaimClient({ token, claim }) {
    const [state, setState] = useState({ status: "loading" });
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        if (!claim) return setState({ status: "error", error: "not_found" });
        if (claim.expired) return setState({ status: "error", error: "expired" });

        (async () => {
            try {
                const res = await fetch("/api/marketplace/donation-claim", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.ok) return setState({ status: "success", xp: data.xp, newBadges: data.newBadges || [] });
                setState({ status: "error", error: data.error || "invalid" });
            } catch {
                setState({ status: "error", error: "invalid" });
            }
        })();
    }, [token, claim]);

    if (state.status === "loading") {
        return (
            <div className="stack" style={{ textAlign: "center", gap: 8 }}>
                <div style={{ fontSize: "2rem" }}>🎁</div>
                <p className="muted">Thanking you for your donation…</p>
            </div>
        );
    }

    if (state.status === "success") {
        return (
            <div className="stack" style={{ textAlign: "center", gap: 12 }}>
                <div style={{ fontSize: "2.5rem" }}>💗</div>
                <h2 style={{ margin: 0 }}>{state.xp > 0 ? `+${state.xp} XP` : "Thank you!"}</h2>
                <p className="muted" style={{ margin: 0 }}>Thank you for supporting The Wolf Den — that&apos;s on your account. 🐺</p>
                {state.newBadges?.length ? (
                    <div className="stack" style={{ gap: 6 }}>
                        <p style={{ margin: 0, fontWeight: 700, color: "#ffd75e" }}>🏅 Badge{state.newBadges.length > 1 ? "s" : ""} unlocked!</p>
                        <div className="user-badges" style={{ justifyContent: "center" }}>
                            {state.newBadges.map((b) => (
                                <span key={b.slug} className="user-badge" title={b.label}>{b.icon} {b.label}</span>
                            ))}
                        </div>
                    </div>
                ) : null}
                <a className="btn" href="/marketplace/track">See your rewards track</a>
            </div>
        );
    }

    return (
        <div className="stack" style={{ textAlign: "center", gap: 10 }}>
            <div style={{ fontSize: "2rem" }}>🐺</div>
            <p style={{ margin: 0 }}>{ERROR_COPY[state.error] || "We couldn't claim this donation."}</p>
            <a className="btn" href="/marketplace/profile">Go to your profile</a>
        </div>
    );
}
